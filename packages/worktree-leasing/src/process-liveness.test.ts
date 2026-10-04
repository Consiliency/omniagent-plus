import { describe, expect, it, vi } from "vitest";

import { checkProcessLiveness, getCurrentHostIdentity } from "./index.js";

describe("process liveness", () => {
  it.each(["EPERM", "EINVAL"])("does not label %s as a missing process", (code) => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("probe failed"), { code }); });
    try {
      const result = checkProcessLiveness({ processId: 1, holderHost: getCurrentHostIdentity() });
      expect(result.state).toBe(code === "EPERM" ? "alive" : "unknown");
    } finally { kill.mockRestore(); }
  });
  it("distinguishes alive, missing, and different-host holders", () => {
    const currentHost = getCurrentHostIdentity();
    const alive = checkProcessLiveness({
      processId: process.pid,
      holderHost: currentHost,
      currentHost,
    });
    const missing = checkProcessLiveness({
      processId: 999999,
      holderHost: currentHost,
      currentHost,
    });
    const differentHost = checkProcessLiveness({
      processId: process.pid,
      holderHost: "remote-host",
      currentHost,
    });

    expect(alive.state).toBe("alive");
    expect(missing.state).toBe("missing");
    expect(differentHost.state).toBe("different_host");
  });
});
