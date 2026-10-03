# Local Operator CLI

Existing command/result schemas, phase literals and exit categories remain.
Default route-task inspects without state initialization, lease acquisition,
inbox sends or provider launch. --record validates preferences before arbitration
and records actual effects. Invalid provider/harness/whole-integer arguments
refuse before effects.

Worktree, fleet lease and inbox lists accept --limit (default100, maximum500)
and --cursor as JSON with timestamp and id strings. Use the last returned
acquiredAt/ID for worktrees, acquired_at/lease_id for fleet, or
created_at/message_id for inbox. Worktree times are UTC milliseconds; fleet/inbox
times are whole-second UTC. Count is page size; operational counts are estimates
from a current snapshot.

Cleanup requires --lease-id, --holder-process-id, --holder-host and
--fencing-token independently supplied by the owner. Supply --holder-session-id
and --holder-turn-id when those identify the owner. Deletion also requires
--managed-root matching provenance captured before acquisition; CLI config
cannot authorize deletion for legacy arbitrary-path leases. Proven absence can
succeed as reconciled=true/deleted=false without a managed root.
deleted=true/releaseIncomplete=true remains a cleanup refusal until durable
ownership release reconciles.

Identity inventory is nonmutating. identities preflight retains its documented
status write. Embedded executeCli callers may inject hostEnv; only names in the
profile allowlist participate. Default preflight receives no ambient host
environment. Output and persistence show names/presence, never values; preflight
does not launch a process.

Supabase failures retain bounded categorical causes, not raw diagnostics.
Missing/blank URL or key is unavailable; invalid URL is validation. Hard refusal
never becomes soft admission. Inbox delivery never transfers ownership.
