import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AppendOnlyStore,
  AuditLedger,
  getStateLedgerPaths,
  replayUiControlSnapshot,
  replayUiControlSnapshotFromStateRoot,
} from "./index.js";

interface HardeningFixture {
  readonly secretProbe: string;
  readonly session: {
    readonly createdAt: string;
    readonly id: string;
    readonly title: string;
    readonly updatedAt: string;
  };
  readonly truncatedTail: string;
  readonly unsafeExcerpt: string;
}

function readFixture(): HardeningFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/recovery/state-ledger-replay.json", import.meta.url),
      "utf8",
    ),
  ) as HardeningFixture;
}

describe("hardening replay", () => {
  it("ignores an interrupted trailing write instead of replaying partial secret-bearing evidence", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "state-ledger-hardening-"));
    const ledger = await AuditLedger.open({ rootDir });
    await ledger.appendSession({
      id: fixture.session.id,
      runtime: "omnigent",
      targetHarness: "codex",
      title: fixture.session.title,
      state: "idle",
      createdAt: fixture.session.createdAt,
      updatedAt: fixture.session.updatedAt,
    });

    const paths = getStateLedgerPaths(rootDir);
    await writeFile(paths.ledgerPath, fixture.truncatedTail, {
      encoding: "utf8",
      flag: "a",
    });

    const reopened = await AppendOnlyStore.open({ rootDir });
    const snapshot = await replayUiControlSnapshotFromStateRoot(rootDir);

    expect(await reopened.listRecords()).toHaveLength(1);
    expect(snapshot.sessions.map((session) => session.sessionId)).toEqual([
      fixture.session.id,
    ]);
    expect(snapshot.evidenceRefs).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain(fixture.secretProbe);
  });

  it("fails closed when replay would expose raw secret-like evidence", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-hardening-redaction-")),
    });

    await ledger.appendSession({
      id: fixture.session.id,
      runtime: "omnigent",
      targetHarness: "codex",
      title: fixture.session.title,
      state: "idle",
      createdAt: fixture.session.createdAt,
      updatedAt: fixture.session.updatedAt,
    });
    await ledger.appendEvidenceRef(
      {
        kind: "log",
        label: "unsafe evidence",
        excerpt: fixture.unsafeExcerpt,
      },
      {
        sessionId: fixture.session.id,
      },
    );

    await expect(replayUiControlSnapshot(ledger)).rejects.toThrow(
      /environment dump/,
    );
  });
});
