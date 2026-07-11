export const transportInterfaceFreezeGate = "IF-0-TRANSPORT-4";

export { OmnigentCapabilityStore } from "./capability-store.js";
export {
  probeOmnigentCapabilities,
  snapshotFromHealth,
} from "./capability-probe.js";
export {
  createCliProvider,
  createCommandBackedCliTransport,
  OmnigentCliProvider,
} from "./cli-client.js";
export {
  mapCapabilityGap,
  mapCliFailure,
  mapDisconnectedBackend,
  mapHttpFailure,
  mapProcessFailure,
} from "./failure-mapper.js";
export { OmnigentHttpError } from "./http-client.js";
export {
  createHttpProvider,
  OmnigentHttpProvider,
} from "./http-provider.js";
export {
  createHybridProvider,
  OmnigentHybridProvider,
} from "./hybrid-provider.js";
export { OmnigentProcessManager } from "./process-manager.js";

export type { OmnigentCapabilityProbeOptions } from "./capability-probe.js";
export type {
  OmnigentCapabilityLedger,
  OmnigentCapabilityRecord,
} from "./capability-store.js";
export type { OmnigentCliProviderOptions } from "./cli-client.js";
export type { FailureMappingResult } from "./failure-mapper.js";
export type { OmnigentHybridProviderOptions } from "./hybrid-provider.js";
export type {
  ManagedOmnigentProcess,
  OmnigentManagedProcessStatus,
  OmnigentProcessManagerOptions,
} from "./process-manager.js";
export type {
  OmnigentCliCommandResult,
  OmnigentCliCommandRunner,
  OmnigentHttpClientOptions,
  OmnigentServerStatus,
} from "./types.js";
