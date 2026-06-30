import type {
  RuntimeEvidenceRef,
  StateLedgerEntry,
} from "@omniagent-plus/core-contracts";

import type { AuditLedger } from "./audit-ledger.js";
import { DEFAULT_MAX_EVIDENCE_EXCERPT_BYTES } from "./schema.js";

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /sk-[A-Za-z0-9]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{12,}/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /(OPENAI|ANTHROPIC|GOOGLE|AZURE)_[A-Z0-9_]*KEY=/,
] as const;

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
    const record: RuntimeEvidenceRef = {
      kind: input.kind,
      label: input.label,
      path: input.path,
      excerpt: input.excerpt,
    };
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

    const excerptBytes = Buffer.byteLength(input.excerpt, "utf8");
    if (excerptBytes > this.maxExcerptBytes) {
      throw new Error(
        `Evidence excerpt exceeds ${this.maxExcerptBytes} bytes (${excerptBytes} bytes).`,
      );
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(input.excerpt)) {
        throw new Error("Secret-bearing evidence cannot be persisted.");
      }
    }

    if (/(^|\n)(HOME|PATH|PWD|OPENAI_API_KEY|ANTHROPIC_API_KEY)=/m.test(input.excerpt)) {
      throw new Error("Environment dumps cannot be persisted.");
    }
  }
}
