"""Linux-only custody supervisor for GUARD-owned test commands."""

import ctypes
import errno
import fcntl
import json
import os
import resource
import select
import signal
import sys
import tempfile
import time


VERSION = 1
MAX_FRAME = 65536
WALL = 0x40000000
SUBREAPER_SET = 36
SUBREAPER_GET = 37
CONTROL = 3
STATUS = 4
TAIL_NS = 2_500_000_000
TERM_NS = 500_000_000
NATURAL_NS = 250_000_000
libc = ctypes.CDLL(None, use_errno=True)


class CustodyError(Exception):
    pass


def prctl(option, pointer):
    if libc.prctl(option, pointer, 0, 0, 0) != 0:
        raise CustodyError("subreaper capability denied")


def capability_probe():
    if sys.platform != "linux" or not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        raise CustodyError("Linux pidfd custody unavailable")
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    prctl(SUBREAPER_SET, 1)
    value = ctypes.c_int()
    prctl(SUBREAPER_GET, ctypes.byref(value))
    if value.value != 1:
        raise CustodyError("subreaper readback failed")
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)
    finally:
        os.close(fd)
    children_file = f"/proc/self/task/{os.getpid()}/children"
    with open(children_file, encoding="ascii") as handle:
        handle.read()
    pid = os.fork()
    if pid == 0:
        os._exit(0)
    waited, status = os.waitpid(pid, WALL)
    if waited != pid or not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
        raise CustodyError("__WALL child probe failed")
    return {"subreaper": True, "pidfd": True, "children": True, "wall": True}


def frame_bytes(nonce, seq, kind, **fields):
    data = json.dumps({"v": VERSION, "nonce": nonce, "seq": seq, "type": kind, **fields}, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    if len(data) > MAX_FRAME:
        raise CustodyError("protocol frame too large")
    return data


def write_frame(nonce, seq, kind, deadline_ns, **fields):
    data = frame_bytes(nonce, seq, kind, **fields)
    offset = 0
    while offset < len(data):
        try:
            offset += os.write(STATUS, data[offset:])
        except BlockingIOError:
            remaining = (deadline_ns - time.monotonic_ns()) / 1_000_000_000
            if remaining <= 0:
                raise CustodyError("status channel deadline")
            select.select([], [STATUS], [], min(remaining, 0.01))
        except BrokenPipeError as error:
            raise CustodyError("status channel closed") from error


def proc_identity(pid):
    try:
        with open(f"/proc/{pid}/stat", encoding="ascii") as handle:
            fields = handle.read().rsplit(") ", 1)[1].split()
        return int(fields[1]), fields[19], fields[0]
    except (FileNotFoundError, ProcessLookupError):
        return None


def direct_children():
    result = set()
    for task in os.listdir("/proc/self/task"):
        with open(f"/proc/self/task/{task}/children", encoding="ascii") as handle:
            result.update(int(value) for value in handle.read().split())
    return result


def verified_pidfd(pid):
    before = proc_identity(pid)
    if before is None or before[0] != os.getpid():
        raise CustodyError("child identity unavailable")
    fd = os.pidfd_open(pid)
    try:
        after = proc_identity(pid)
        with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as handle:
            pid_line = next((line for line in handle if line.startswith("Pid:")), "")
        if after is None or after[:2] != before[:2] or pid_line.split() != ["Pid:", str(pid)]:
            raise CustodyError("pidfd child identity mismatch")
        return fd, before[1]
    except BaseException:
        os.close(fd)
        raise


def reset_payload_signals():
    signal.pthread_sigmask(signal.SIG_SETMASK, [])
    for number in signal.valid_signals():
        if number not in (signal.SIGKILL, signal.SIGSTOP):
            try:
                signal.signal(number, signal.SIG_DFL)
            except (OSError, ValueError):
                pass


def launch(admit, payload_out, payload_err):
    error_read, error_write = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
    pid = os.fork()
    if pid == 0:
        os.close(error_read)
        try:
            os.setsid()
            os.chdir(admit["cwd"])
            os.umask(admit["umask"])
            reset_payload_signals()
            os.dup2(payload_out, 1)
            os.dup2(payload_err, 2)
            for name in os.listdir("/proc/self/fd"):
                fd = int(name)
                if fd > 2 and fd != error_write:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
            os.execvpe(admit["command"], [admit["command"], *admit["argv"]], admit["env"])
        except BaseException as error:
            code = getattr(error, "errno", errno.EINVAL)
            try:
                os.write(error_write, str(code).encode("ascii"))
            except OSError:
                pass
            os._exit(127)
    os.close(error_write)
    return pid, error_read


def validate_admit(frame):
    command = frame.get("command")
    args = frame.get("argv")
    env = frame.get("env")
    if not isinstance(command, str) or not command or not isinstance(args, list) or any(not isinstance(arg, str) for arg in args):
        raise CustodyError("invalid command admission")
    if not isinstance(env, dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in env.items()):
        raise CustodyError("invalid environment admission")
    if not isinstance(frame.get("cwd"), str) or not isinstance(frame.get("umask"), int):
        raise CustodyError("invalid cwd/umask admission")
    if frame.get("stdio") != {"stdin": 0, "stdout": 1, "stderr": 2}:
        raise CustodyError("invalid stdio admission")
    try:
        deadline_ns = int(frame["deadline_ns"])
        shutdown_reservation_ns = int(frame["shutdown_reservation_ns"])
        shutdown_completion_ns = int(frame["shutdown_completion_ns"])
        cleanup_slots = int(frame["cleanup_slots"])
        child_reservation_ns = int(frame["child_reservation_ns"])
    except (KeyError, TypeError, ValueError) as error:
        raise CustodyError("invalid operation deadline") from error
    if (deadline_ns <= time.monotonic_ns() or cleanup_slots < 0 or child_reservation_ns < 0
            or shutdown_reservation_ns != TAIL_NS + cleanup_slots * 17_500_000_000 + child_reservation_ns
            or shutdown_completion_ns != deadline_ns + shutdown_reservation_ns):
        raise CustodyError("admission deadline elapsed")
    return deadline_ns, shutdown_reservation_ns, shutdown_completion_ns


class Supervisor:
    def __init__(self, nonce):
        self.nonce = nonce
        self.in_seq = 0
        self.out_seq = 0
        self.input = b""
        self.payload = None
        self.payload_status = None
        self.spawn_error = None
        self.active = {}
        self.adopted_natural = 0
        self.adopted_signaled = 0
        self.adopted_unresolved = 0
        self.force_killed = 0
        self.drain_start = None
        self.forced = False
        self.deadline_ns = time.monotonic_ns() + 15_000_000_000
        self.end_ns = None
        self.shutdown_reservation_ns = TAIL_NS
        self.shutdown_completion_ns = self.deadline_ns + TAIL_NS
        self.cooperative_deadline_ns = None
        self.error = None
        self.operation_timed_out = False
        self.signal_pending = []
        self.error_read = None
        self.epoch_fd = None
        self.epoch_path = None

    def publish_epoch(self, ceiling_ns):
        if self.epoch_fd is None:
            return
        os.pwrite(self.epoch_fd, f"{ceiling_ns:020d}".encode("ascii"), 0)

    def send(self, kind, **fields):
        write_frame(self.nonce, self.out_seq, kind, self.end_ns or self.cooperative_deadline_ns or self.deadline_ns, **fields)
        self.out_seq += 1

    def on_signal(self, number, _frame):
        self.signal_pending.append(number)

    def register(self, pid):
        if pid in self.active:
            return
        try:
            fd, start = verified_pidfd(pid)
            self.active[pid] = {"fd": fd, "start": start, "signaled": False, "adopted": pid != self.payload, "term": False, "kill": False}
        except (OSError, CustodyError) as error:
            current = proc_identity(pid)
            if current is not None and current[0] == os.getpid() and current[2] not in ("Z", "X"):
                self.active[pid] = {"fd": None, "start": current[1], "signaled": False, "adopted": pid != self.payload, "term": False, "kill": False}
                self.error = "pidfd_identity_unproven"

    def discover(self):
        try:
            for pid in direct_children():
                self.register(pid)
        except (OSError, ValueError):
            self.error = "children_discovery_unproven"

    def reap(self):
        exhausted = False
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG | WALL)
            except ChildProcessError:
                exhausted = True
                break
            if pid == 0:
                break
            entry = self.active.pop(pid, None)
            if entry is not None and entry["fd"] is not None:
                os.close(entry["fd"])
            if pid == self.payload:
                self.payload_status = status
            elif entry is not None and entry["fd"] is None:
                self.adopted_unresolved += 1
            elif entry is not None and entry["signaled"]:
                self.adopted_signaled += 1
            else:
                self.adopted_natural += 1
        return exhausted

    def signal_children(self, number):
        for pid, entry in list(self.active.items()):
            fd = entry["fd"]
            if fd is None:
                continue
            key = "kill" if number == signal.SIGKILL else "term"
            if entry[key]:
                continue
            try:
                signal.pidfd_send_signal(fd, number)
                entry[key] = True
                if number == signal.SIGKILL:
                    self.force_killed += 1
                if entry["adopted"]:
                    entry["signaled"] = True
            except ProcessLookupError:
                pass
            except OSError:
                self.error = self.error or "pidfd_signal_unproven"

    def retain_after_failure(self):
        while True:
            try:
                self.discover()
                exhausted = self.reap()
                self.signal_children(signal.SIGKILL)
                if exhausted and not self.active and not direct_children():
                    return
            except BaseException:
                pass
            time.sleep(0.05)

    def start_drain(self, forced=False):
        if self.drain_start is None:
            self.drain_start = time.monotonic_ns()
            self.end_ns = min(self.drain_start + TAIL_NS, self.shutdown_completion_ns)
            if self.cooperative_deadline_ns is not None:
                self.end_ns = min(self.end_ns, self.cooperative_deadline_ns + TAIL_NS)
            self.forced = forced
            if forced:
                self.signal_children(signal.SIGTERM)
        elif forced and not self.forced:
            self.forced = True
            self.signal_children(signal.SIGTERM)

    def start_cooperative(self, number, requested_end=None):
        if self.payload_status is not None:
            return
        if self.cooperative_deadline_ns is None:
            self.cooperative_deadline_ns = min(self.shutdown_completion_ns - TAIL_NS, time.monotonic_ns() + self.shutdown_reservation_ns - TAIL_NS, requested_end if requested_end is not None else self.shutdown_completion_ns)
            self.publish_epoch(self.cooperative_deadline_ns + TAIL_NS)
            entry = self.active.get(self.payload)
            if entry is not None and entry["fd"] is not None:
                try:
                    signal.pidfd_send_signal(entry["fd"], number)
                except ProcessLookupError:
                    self.start_drain(True)
                except OSError:
                    self.error = self.error or "cooperative_signal_unproven"
                    self.start_drain(True)
            else:
                self.error = self.error or "cooperative_payload_identity_unproven"
                self.start_drain(True)
        elif requested_end is not None:
            self.cooperative_deadline_ns = min(self.cooperative_deadline_ns, requested_end)
            self.publish_epoch(self.cooperative_deadline_ns + TAIL_NS)

    def read_control(self):
        if b"\n" not in self.input:
            if not select.select([CONTROL], [], [], 0)[0]:
                return None
            chunk = os.read(CONTROL, MAX_FRAME)
            if not chunk:
                if self.input:
                    raise CustodyError("truncated control frame")
                if self.payload is None:
                    self.error = "controller_closed_before_admission"
                self.start_drain(True)
                return None
            self.input += chunk
        if len(self.input) > MAX_FRAME:
            raise CustodyError("control frame too large")
        if b"\n" not in self.input:
            return None
        line, self.input = self.input.split(b"\n", 1)
        try:
            frame = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CustodyError("malformed control frame") from error
        if not isinstance(frame, dict) or frame.get("v") != VERSION or frame.get("nonce") != self.nonce or frame.get("seq") != self.in_seq:
            raise CustodyError("control frame identity/sequence mismatch")
        self.in_seq += 1
        return frame

    def handle(self, frame):
        kind = frame.get("type")
        if kind == "ADMIT" and self.payload is None and self.in_seq == 1:
            self.deadline_ns, self.shutdown_reservation_ns, self.shutdown_completion_ns = validate_admit(frame)
            self.epoch_fd, self.epoch_path = tempfile.mkstemp(prefix="guard-epoch-")
            self.publish_epoch(self.shutdown_completion_ns)
            frame["env"].update({
                "GUARD_ADMITTED_OPERATION_NS": str(self.deadline_ns),
                "GUARD_ADMITTED_COMPLETION_NS": str(self.shutdown_completion_ns),
                "GUARD_ADMITTED_CLEANUP_SLOTS": str(frame["cleanup_slots"]),
                "GUARD_ADMITTED_CHILD_RESERVATION_MS": str(int(frame["child_reservation_ns"]) // 1_000_000),
                "GUARD_ADMITTED_EPOCH_FILE": self.epoch_path,
            })
            self.payload, self.error_read = launch(frame, self.payload_out, self.payload_err)
            self.register(self.payload)
        elif kind == "FORWARD" and self.payload is not None:
            named = frame.get("signal")
            if named not in ("SIGINT", "SIGTERM", "SIGHUP"):
                raise CustodyError("invalid forwarded signal")
            try:
                requested_end = int(frame["deadline_ns"])
            except (KeyError, TypeError, ValueError) as error:
                raise CustodyError("invalid cooperative deadline") from error
            self.start_cooperative(getattr(signal, named), requested_end)
        elif kind == "SHUTDOWN":
            if frame.get("epoch") != 1 or frame.get("mode") != "forced":
                raise CustodyError("invalid shutdown epoch")
            try:
                requested_end = int(frame["deadline_ns"])
            except (KeyError, TypeError, ValueError) as error:
                raise CustodyError("invalid shutdown deadline") from error
            self.start_drain(True)
            self.end_ns = min(self.end_ns, requested_end)
        else:
            raise CustodyError("out-of-order control frame")

    def result(self, quiescent):
        unresolved = self.adopted_unresolved + sum(1 for pid, entry in self.active.items() if pid != self.payload and entry["adopted"])
        if self.payload_status is None:
            outcome = {"not_started": self.payload is None}
            if self.payload is not None:
                self.error = self.error or "payload_status_missing"
        elif os.WIFSIGNALED(self.payload_status):
            outcome = {"signal": signal.Signals(os.WTERMSIG(self.payload_status)).name}
        elif os.WIFEXITED(self.payload_status):
            outcome = {"exit_code": os.WEXITSTATUS(self.payload_status)}
        else:
            outcome = {}
            self.error = self.error or "payload_status_invalid"
        if self.error or unresolved:
            quiescent = False
        self.send("WORK_DRAINED", quiescent=quiescent)
        self.send("RESULT", payload_pid=self.payload, outcome=outcome, custody="quiescent" if quiescent else "unproven", error=self.error or ("operation_deadline" if self.operation_timed_out else "payload_spawn_failed" if self.spawn_error else None), adopted_count=self.adopted_natural + self.adopted_signaled + unresolved, adopted_natural_count=self.adopted_natural, adopted_signaled_count=self.adopted_signaled, adopted_unresolved_count=unresolved, force_killed_count=self.force_killed)
        return outcome, quiescent

    def run(self):
        self.payload_out = os.dup(1)
        self.payload_err = os.dup(2)
        null = os.open(os.devnull, os.O_WRONLY)
        os.dup2(null, 1)
        os.dup2(null, 2)
        os.close(null)
        os.set_blocking(CONTROL, False)
        os.set_blocking(STATUS, False)
        for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(number, self.on_signal)
        self.send("READY", capabilities=capability_probe())
        exhausted = False
        while True:
            now = time.monotonic_ns()
            try:
                frame = self.read_control()
                if frame is not None:
                    self.handle(frame)
            except CustodyError as error:
                self.error = str(error)
                self.start_drain(True)
            if self.signal_pending:
                pending = self.signal_pending[:]
                self.signal_pending.clear()
                for number in pending:
                    if self.payload is not None:
                        self.start_cooperative(number)
                    else:
                        self.start_drain(True)
            self.discover()
            exhausted = self.reap()
            if self.error_read is not None:
                try:
                    error_data = os.read(self.error_read, 32)
                    if error_data:
                        self.spawn_error = error_data.decode("ascii", "replace")
                    else:
                        os.close(self.error_read)
                        self.error_read = None
                except BlockingIOError:
                    pass
            if self.payload is None and (self.error or now >= self.deadline_ns):
                self.error = self.error or "admission_deadline"
                break
            if self.payload is not None and self.payload_status is not None and self.drain_start is None:
                self.start_drain(False)
            if self.payload is not None and self.cooperative_deadline_ns is None and now >= self.deadline_ns and self.drain_start is None:
                self.operation_timed_out = True
                self.start_drain(True)
            if self.cooperative_deadline_ns is not None and now >= self.cooperative_deadline_ns:
                self.start_drain(True)
                self.end_ns = min(self.end_ns, self.cooperative_deadline_ns + TAIL_NS, self.shutdown_completion_ns)
            if self.drain_start is not None:
                elapsed = now - self.drain_start
                if self.forced or elapsed >= NATURAL_NS:
                    self.signal_children(signal.SIGTERM)
                if elapsed >= TERM_NS:
                    self.signal_children(signal.SIGKILL)
                if exhausted and not self.active and not direct_children():
                    break
                if now >= self.end_ns:
                    self.error = self.error or "custody_deadline"
                    break
            time.sleep(0.005)
        try:
            outcome, quiescent = self.result(exhausted and not self.active and not direct_children())
        except CustodyError:
            outcome, quiescent = {}, False
        if not quiescent:
            while True:
                self.discover()
                exhausted = self.reap()
                self.signal_children(signal.SIGKILL)
                try:
                    if exhausted and not self.active and not direct_children():
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.05)
            return 125
        if "exit_code" in outcome:
            return outcome["exit_code"]
        if "signal" in outcome:
            number = getattr(signal, outcome["signal"])
            if number not in (signal.SIGKILL, signal.SIGSTOP):
                signal.signal(number, signal.SIG_DFL)
                signal.pthread_sigmask(signal.SIG_UNBLOCK, [number])
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            os.kill(os.getpid(), number)
        return 125


def main():
    if len(sys.argv) != 2 or not sys.argv[1] or len(sys.argv[1]) > 128:
        return 125
    supervisor = Supervisor(sys.argv[1])
    try:
        return supervisor.run()
    except BaseException:
        if supervisor.payload is not None or supervisor.active:
            supervisor.retain_after_failure()
        return 125
    finally:
        if supervisor.epoch_fd is not None:
            os.close(supervisor.epoch_fd)
            os.unlink(supervisor.epoch_path)


if __name__ == "__main__":
    os._exit(main())
