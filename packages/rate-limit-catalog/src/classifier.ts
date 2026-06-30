import type { LimitClassification } from "@omniagent-plus/core-contracts";

import {
  buildClassification,
  matchBaseClassification,
  sanitizeSignal,
} from "./rules.js";
import type { ClassifierInput } from "./types.js";

export function classifyLimitSignal(input: ClassifierInput): LimitClassification {
  const signal = sanitizeSignal(input);
  const match = matchBaseClassification(signal);
  return buildClassification(input, signal, match);
}
