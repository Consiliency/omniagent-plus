import type { LimitClassification } from "@omniagent-plus/core-contracts";

import { classifyLimitSignal } from "./classifier.js";
import { boostConfidence, dedupeNotes } from "./rules.js";
import type { ClassifierInput } from "./types.js";

const harnessAliases: Record<string, string> = {
  antigravity: "gemini-antigravity",
  "claude-code": "claude-code",
  claude: "claude-code",
  codex: "codex",
  "gemini-antigravity": "gemini-antigravity",
  opencode: "opencode",
  pi: "pi",
};

const harnessNotes: Record<string, string> = {
  "claude-code":
    "Harness hint: Claude Code limit signals should stay metadata only and reset aware.",
  codex:
    "Harness hint: Codex CLI limit signals often mirror OpenAI RPM or TPM semantics.",
  "gemini-antigravity":
    "Harness hint: Gemini Antigravity emits acceleration pressure before hard caps.",
  opencode:
    "Harness hint: OpenCode overloads should stay distinct from spend and quota failures.",
  pi:
    "Harness hint: Pi harness pressure is usually concurrency or active-session bound.",
};

function normalizeFamily(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const slug = value.trim().toLowerCase().replace(/\s+/g, "-");
  return harnessAliases[slug] ?? slug;
}

export function normalizeHarnessFamily(harness: string | undefined): string | undefined {
  return normalizeFamily(harness);
}

export function classifyHarnessSignal(input: ClassifierInput): LimitClassification {
  const harness = normalizeHarnessFamily(input.harness);
  const classification = classifyLimitSignal({
    ...input,
    harness,
  });

  if (!harness || classification.type === "none") {
    return classification;
  }

  const note = harnessNotes[harness];
  if (!note) {
    return classification;
  }

  return {
    ...classification,
    confidence: boostConfidence(classification.confidence, 0.05),
    harness,
    notes: dedupeNotes([...(classification.notes ?? []), note]),
  };
}
