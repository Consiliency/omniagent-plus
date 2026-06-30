import type { LimitClassification } from "@omniagent-plus/core-contracts";

import { classifyLimitSignal } from "./classifier.js";
import { boostConfidence, dedupeNotes } from "./rules.js";
import type { ClassifierInput } from "./types.js";

const providerAliases: Record<string, string> = {
  anthropic: "anthropic-api",
  "anthropic-api": "anthropic-api",
  generic: "generic-openai-compatible",
  "generic-openai-compatible": "generic-openai-compatible",
  google: "google-api",
  "google-api": "google-api",
  minimax: "minimax",
  openai: "openai-api",
  "openai-api": "openai-api",
  zai: "zai",
};

const providerNotes: Record<string, string> = {
  "anthropic-api":
    "Provider-family hint: Anthropic reset and credit-balance signals stay provider scoped.",
  "generic-openai-compatible":
    "Provider-family hint: generic OpenAI-compatible providers reuse request-rate semantics.",
  "google-api":
    "Provider-family hint: Google quota metrics usually arrive as reset-bound RESOURCE_EXHAUSTED failures.",
  minimax:
    "Provider-family hint: MiniMax failures often split balance problems from concurrency pressure.",
  "openai-api":
    "Provider-family hint: OpenAI-style RPM, TPM, and insufficient_quota language is expected.",
  zai:
    "Provider-family hint: ZAI quota responses often carry explicit daily reset semantics.",
};

function normalizeFamily(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const slug = value.trim().toLowerCase().replace(/\s+/g, "-");
  return providerAliases[slug] ?? slug;
}

export function normalizeProviderFamily(provider: string | undefined): string | undefined {
  return normalizeFamily(provider);
}

export function classifyProviderSignal(input: ClassifierInput): LimitClassification {
  const provider = normalizeProviderFamily(input.provider);
  const classification = classifyLimitSignal({
    ...input,
    provider,
  });

  if (!provider || classification.type === "none") {
    return classification;
  }

  const note = providerNotes[provider];
  if (!note) {
    return classification;
  }

  return {
    ...classification,
    confidence: boostConfidence(classification.confidence, 0.05),
    notes: dedupeNotes([...(classification.notes ?? []), note]),
    provider,
  };
}
