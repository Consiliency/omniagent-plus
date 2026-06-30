import { z } from "zod";

import {
  CURRENT_STATE_LEDGER_SCHEMA_VERSION,
  ensureStateLedgerDirectories,
  nowIsoString,
  readJsonFile,
  storeManifestSchema,
  type StoreManifest,
  writeJsonAtomic,
} from "./schema.js";

const legacyStoreManifestSchema = storeManifestSchema
  .omit({ schema: true, recoveredTailTruncations: true, schemaVersion: true })
  .extend({
    schema: z.literal("state_ledger_store_manifest.v0"),
    schemaVersion: z.literal(0),
  });

export interface MigrationResult {
  readonly created: boolean;
  readonly migrated: boolean;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly manifest: StoreManifest;
  readonly steps: string[];
}

function createEmptyManifest(timestamp: string): StoreManifest {
  return {
    schema: "state_ledger_store_manifest.v0.1",
    schemaVersion: CURRENT_STATE_LEDGER_SCHEMA_VERSION,
    recordCount: 0,
    lastSequence: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    recoveredTailTruncations: 0,
  };
}

function migrateLegacyManifest(raw: unknown): MigrationResult {
  const legacy = legacyStoreManifestSchema.parse(raw);
  const timestamp = nowIsoString(legacy.updatedAt ?? legacy.createdAt);
  return {
    created: false,
    migrated: true,
    fromVersion: legacy.schemaVersion,
    toVersion: CURRENT_STATE_LEDGER_SCHEMA_VERSION,
    steps: ["manifest_v0_to_v1"],
    manifest: {
      schema: "state_ledger_store_manifest.v0.1",
      schemaVersion: CURRENT_STATE_LEDGER_SCHEMA_VERSION,
      recordCount: legacy.recordCount,
      lastSequence: legacy.lastSequence,
      createdAt: legacy.createdAt,
      updatedAt: timestamp,
      recoveredTailTruncations: 0,
    },
  };
}

export async function readStoreManifest(
  rootDir: string,
): Promise<StoreManifest | undefined> {
  const paths = await ensureStateLedgerDirectories(rootDir);
  const raw = await readJsonFile<unknown>(paths.manifestPath);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = storeManifestSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  return migrateLegacyManifest(raw).manifest;
}

export async function writeStoreManifest(
  rootDir: string,
  manifest: StoreManifest,
): Promise<void> {
  const paths = await ensureStateLedgerDirectories(rootDir);
  await writeJsonAtomic(paths.manifestPath, manifest);
}

export async function migrateStoreManifest(
  rootDir: string,
): Promise<MigrationResult> {
  const timestamp = nowIsoString();
  const paths = await ensureStateLedgerDirectories(rootDir);
  const raw = await readJsonFile<unknown>(paths.manifestPath);

  if (raw === undefined) {
    const manifest = createEmptyManifest(timestamp);
    await writeJsonAtomic(paths.manifestPath, manifest);
    return {
      created: true,
      migrated: false,
      fromVersion: 0,
      toVersion: CURRENT_STATE_LEDGER_SCHEMA_VERSION,
      manifest,
      steps: ["created_manifest_v1"],
    };
  }

  const current = storeManifestSchema.safeParse(raw);
  if (current.success) {
    return {
      created: false,
      migrated: false,
      fromVersion: current.data.schemaVersion,
      toVersion: current.data.schemaVersion,
      manifest: current.data,
      steps: [],
    };
  }

  const migrated = migrateLegacyManifest(raw);
  await writeJsonAtomic(paths.manifestPath, migrated.manifest);
  return migrated;
}
