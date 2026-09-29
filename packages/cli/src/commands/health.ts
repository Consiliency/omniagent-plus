import { getStateLedgerPaths, readStoreManifest } from "@omniagent-plus/state-ledger";

import type { ParsedCliRequest } from "../args.js";
import { healthResultSchema, type CliContext } from "../types.js";

export async function runHealthCommand(
  request: ParsedCliRequest,
  context: CliContext,
) {
  const paths = getStateLedgerPaths(request.stateRoot);
  const manifest = await readStoreManifest(request.stateRoot);

  return healthResultSchema.parse({
    schema: "cli.health.result.v0.1",
    interfaceFreezeGate: "IF-0-CLI-11",
    redactionPosture: "metadata_only",
    releaseSurfaceDecision: "no_doc_delta",
    defaultProfilesDir: context.profilesDir,
    defaultStateRoot: request.stateRoot,
    stateStorePresent: manifest !== undefined,
    stateLedgerPaths: {
      rootDir: paths.rootDir,
      ledgerPath: paths.ledgerPath,
      manifestPath: paths.manifestPath,
      coordinationDir: paths.coordinationDir,
    },
    commands: context.availableCommands.map((entry) => entry.key),
  });
}
