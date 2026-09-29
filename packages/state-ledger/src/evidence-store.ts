import { runtimeEvidenceRefSchema, redactUntrustedText } from "@consiliency/runtime-provider";

import type {
  RuntimeEvidenceRef,
  StateLedgerEntry,
} from "@consiliency/runtime-provider";

import type { AuditLedger } from "./audit-ledger.js";
import { DEFAULT_MAX_EVIDENCE_EXCERPT_BYTES } from "./schema.js";

export interface EvidenceInput {
  readonly kind: RuntimeEvidenceRef["kind"];
  readonly label: string;
  readonly sourceType: "artifact_ref" | "redacted_excerpt";
  readonly sourceCategory:
    | "runtime_log"
    | "tool_output"
    | "transcript"
    | "provider_payload"
    | "env_dump"
    | "other";
  readonly excerpt?: string;
  readonly path?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly taskId?: string;
}

export class EvidenceStore {
  private readonly ledger: AuditLedger;

  private readonly maxExcerptBytes: number;

  constructor(
    ledger: AuditLedger,
    maxExcerptBytes = DEFAULT_MAX_EVIDENCE_EXCERPT_BYTES,
  ) {
    this.ledger = ledger;
    this.maxExcerptBytes = maxExcerptBytes;
  }

  async save(
    input: EvidenceInput,
  ): Promise<Extract<StateLedgerEntry, { kind: "evidence_ref" }>> {
    this.assertAllowed(input);
    const record = runtimeEvidenceRefSchema.parse({
      kind: input.kind,
      label: input.label,
      path: input.path,
      excerpt: input.excerpt,
    });
    return this.ledger.appendEvidenceRef(record, {
      sessionId: input.sessionId,
      turnId: input.turnId,
      taskId: input.taskId,
    });
  }

  private assertAllowed(input: EvidenceInput): void {
    if (
      input.sourceCategory === "transcript" ||
      input.sourceCategory === "provider_payload" ||
      input.sourceCategory === "env_dump"
    ) {
      throw new Error(
        `Evidence source category ${input.sourceCategory} is not allowed for durable persistence.`,
      );
    }

    if (input.sourceType === "artifact_ref") {
      if (input.path === undefined || input.path.length === 0) {
        throw new Error("Artifact evidence requires a metadata-only path.");
      }
      if (input.excerpt !== undefined) {
        throw new Error(
          "Artifact evidence must not include raw excerpt content.",
        );
      }
      return;
    }

    if (input.excerpt === undefined || input.excerpt.length === 0) {
      throw new Error("Redacted excerpt evidence requires excerpt content.");
    }

    redactUntrustedText(input.excerpt, { label: "evidence excerpt", maxBytes: this.maxExcerptBytes });
  }
}
