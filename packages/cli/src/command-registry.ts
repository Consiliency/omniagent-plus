import { runHealthCommand } from "./commands/health.js";
import { runSessionsCommand } from "./commands/sessions.js";
import { runControlCommand } from "./commands/control.js";
import { runCoordinationCommand } from "./commands/coordination.js";
import { runIdentitiesCommand } from "./commands/identities.js";
import { runWorktreesCommand } from "./commands/worktrees.js";
import { runClassifyLimitCommand } from "./commands/classify-limit.js";
import { runRouteTaskCommand } from "./commands/route-task.js";
import type { CliCommandRegistration } from "./runtime.js";

export const COMMAND_REGISTRY: readonly CliCommandRegistration[] = [
  {
    key: "health",
    description: "Inspect CLI health, state-root defaults, and command registration.",
    handle: runHealthCommand,
  },
  {
    key: "sessions list",
    description: "List durable session summaries from the selected state-root.",
    handle: runSessionsCommand,
  },
  {
    key: "sessions show",
    description: "Show one durable session summary without raw transcript output.",
    handle: runSessionsCommand,
  },
  {
    key: "control snapshot",
    description: "Project the UI/control read model from durable state without writing records.",
    handle: runControlCommand,
  },
  {
    key: "identities list",
    description: "List metadata_only identity profiles from the selected profiles dir.",
    handle: runIdentitiesCommand,
  },
  {
    key: "identities preflight",
    description: "Record and report metadata_only identity preflight status.",
    handle: runIdentitiesCommand,
  },
  {
    key: "worktrees list",
    description: "List active worktree leases from durable state.",
    handle: runWorktreesCommand,
  },
  {
    key: "worktrees cleanup",
    description: "Clean up a single lease only when cleanup blocks do not apply.",
    handle: runWorktreesCommand,
  },
  {
    key: "coordination leases list",
    description: "List active off-device coordination leases.",
    handle: runCoordinationCommand,
  },
  {
    key: "coordination leases acquire",
    description: "Acquire a soft or hard coordination lease.",
    handle: runCoordinationCommand,
  },
  {
    key: "coordination leases renew",
    description: "Renew a coordination lease heartbeat.",
    handle: runCoordinationCommand,
  },
  {
    key: "coordination leases release",
    description: "Release a coordination lease.",
    handle: runCoordinationCommand,
  },
  {
    key: "coordination inbox send",
    description: "Append a non-authoritative coordination inbox message.",
    handle: runCoordinationCommand,
  },
  {
    key: "coordination inbox list",
    description: "List non-authoritative coordination inbox messages.",
    handle: runCoordinationCommand,
  },
  {
    key: "classify-limit",
    description: "Classify one limit signal in dry-run or explicit record mode.",
    handle: runClassifyLimitCommand,
  },
  {
    key: "route-task",
    description: "Plan without provider launch. --record persists the decision and, with a coordination scope, may acquire a lease or request yield.",
    handle: runRouteTaskCommand,
  },
];
