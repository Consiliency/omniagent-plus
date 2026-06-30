import { describe, expect, it } from "vitest";

import { checkProcessLiveness, getCurrentHostIdentity } from "./index.js";

describe("process liveness", () => {
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
