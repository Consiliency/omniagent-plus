"""Operator-approved one-seat diagnostic; does not change installed runtime files."""
import hashlib
import json
import os
import tempfile
import time
from dataclasses import asdict
from pathlib import Path

import phase_loop_runtime.panel_invoker as native
from phase_loop_runtime.advisor_board.schema import Board, Seat

os.umask(0o077)
root = Path(__file__).resolve().parents[4]
run = root / ".phase-loop/guard-fable-bounded-retry-20260914-r2"
run.mkdir(exist_ok=False)
prior = json.loads((root / "plans/evidence/v2/reviews/GUARD-plan-round7.json").read_text())
inputs = prior["input_sha256"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert all(digest(root / path) == expected for path, expected in inputs.items())
runtime_path = Path(native.__file__)
runtime_hash = digest(runtime_path)
tempfile.tempdir = tempfile.mkdtemp(prefix="guard-fable-bounded-")
observations = []
original_threshold = native._broker_claude_stall_threshold
original_profile = native._BROKER_CLAUDE_STALL_PROFILE


def diagnostic_threshold(prompt, deadline_s):
    assert len(prompt.encode()) == 54686
    assert hashlib.sha256(prompt.encode()).hexdigest() == "8968d8b1b582d16415476909603a7eab2bad050205823bcdbe7b43c1b0c76516"
    assert deadline_s == 1200
    return 900.0


board = Board("guard-fable-bounded-retry", "review-followup", (
    Seat("claude-fable-5-1", "max", harness="claude", lens="correctness"),
))
native._broker_claude_stall_threshold = diagnostic_threshold
native._BROKER_CLAUDE_STALL_PROFILE = "operator_approved_diagnostic_quiet900_max1200_v1"
start = time.monotonic()
try:
    result = native.invoke_board(
        board, "", repo_dir=root, stream_dir=run,
        artifact_ref=str(root / ".phase-loop/guard-plan-round7/review-bundle.md"),
        brief_ref=str(root / ".phase-loop/guard-plan-round7/review-instructions.md"),
        timeouts_by_leg={"claude": 1200},
        review_policy=native.ReviewLandingPolicy(required_seats=("fable",), requires_president=False),
    )
finally:
    native._broker_claude_stall_threshold = original_threshold
    native._BROKER_CLAUDE_STALL_PROFILE = original_profile
report = {
    "schema": "guard-review-followup.v1",
    "authority": "User 2026-09-14: Approved for bound fable retry",
    "input_sha256": inputs,
    "inputs_unchanged": all(digest(root / path) == expected for path, expected in inputs.items()),
    "installed_runtime_sha256": runtime_hash,
    "installed_runtime_files_changed": digest(runtime_path) != runtime_hash,
    "profile": "diagnostic_only_quiet900_max1200",
    "elapsed_s": time.monotonic() - start,
    "board": asdict(board), "observations": observations,
    "other_seats_restarted": False,
    "acceptance": "One seat only; no production liveness, phase or publication acceptance",
    "result": {**asdict(result), "legs": [
        {**asdict(leg), "harden_isolation_evidence": leg.harden_isolation_evidence}
        for leg in result.legs
    ]},
}
(run / "result.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"result_path": str(run / "result.json"), "observations": observations,
                  "legs": [{"leg": leg.leg, "status": leg.status, "text_bytes": len(leg.text.encode())}
                           for leg in result.legs]}), flush=True)
