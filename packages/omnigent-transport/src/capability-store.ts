import type {
  OmnigentCapabilitySnapshot,
  StateLedgerEntry,
} from "@consiliency/runtime-provider";

export type OmnigentCapabilityRecord = Extract<
  StateLedgerEntry,
  { kind: "capability_snapshot" }
>;

export interface OmnigentCapabilityLedger {
  appendCapabilitySnapshot(
    snapshot: OmnigentCapabilitySnapshot,
  ): Promise<OmnigentCapabilityRecord>;
}

export class OmnigentCapabilityStore {
  constructor(private readonly ledger: OmnigentCapabilityLedger) {}

  async append(
    snapshot: OmnigentCapabilitySnapshot,
  ): Promise<OmnigentCapabilityRecord> {
    return this.ledger.appendCapabilitySnapshot(snapshot);
  }
}
