import { hostname } from "node:os";

import type { ProcessLivenessResult } from "./types.js";

export function getCurrentHostIdentity(): string {
  return process.env.HOSTNAME?.trim() || hostname();
}

export function checkProcessLiveness(options: {
  readonly processId: number;
  readonly holderHost: string;
  readonly currentHost?: string;
}): ProcessLivenessResult {
  const currentHost = options.currentHost ?? getCurrentHostIdentity();
  const sameHost = options.holderHost === currentHost;

  if (!sameHost) {
    return {
      state: "different_host",
      processId: options.processId,
      holderHost: options.holderHost,
      currentHost,
      sameHost,
    };
  }

  try {
    process.kill(options.processId, 0);
    return {
      state: "alive",
      processId: options.processId,
      holderHost: options.holderHost,
      currentHost,
      sameHost,
    };
  } catch (error) {
    const errno = error instanceof Error && "code" in error ? error.code : undefined;
    if (errno === "EPERM") {
      return {
        state: "alive",
        processId: options.processId,
        holderHost: options.holderHost,
        currentHost,
        sameHost,
      };
    }

    return {
      state: "missing",
      processId: options.processId,
      holderHost: options.holderHost,
      currentHost,
      sameHost,
    };
  }
}
