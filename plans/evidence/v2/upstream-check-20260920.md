# Omnigent Upstream Check - 2026-09-20

Observed at 22:13 UTC against the official `omnigent-ai/omnigent` repository.
This is compatibility triage, not an upgrade or acceptance result.

## Current State

- Latest GitHub release and PyPI package: **v0.14.0**. GitHub publication was
  2026-09-15T13:06:10Z; PyPI artifacts uploaded at 13:00:15Z and 13:00:19Z,
  neither yanked, Python >=3.12.
- Release commit: `fc89a3ba3c4698a7d742343b443a7b2bdc01120a`.
- Upstream main: `7c1ce512920d05b5e057ea3a6f6c6a1536b55557`, dated
  2026-09-19T23:17:28Z; comparison to the release is 211 ahead / 2 behind.
  Release and main are unchanged from the preceding September 19 check.
- Our supported contract remains v0.12.0 at
  `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`; transport remains 0.7.0.
  This is the HTTP contract authority, not an installed Python dependency.
- Latest main change bounds the server session snapshot runner-status probe
  and adds backoff. This is an unreleased operational fix to monitor, not a
  reason to pin main or assert a new supported wire contract.

Sources: [release](https://github.com/omnigent-ai/omnigent/releases/tag/v0.14.0),
[PyPI metadata](https://pypi.org/pypi/omnigent/json),
[main change](https://github.com/omnigent-ai/omnigent/commit/7c1ce512920d05b5e057ea3a6f6c6a1536b55557),
[comparison](https://github.com/omnigent-ai/omnigent/compare/v0.14.0...main).

## Rechecked Accommodation Work

1. **Confirmed failure classification defect.** Tagged `ErrorData.level` can
   be `info` for recovery notices. Current `history-mapper.ts` treats every
   persisted error item as a terminal failure. A fresh direct source probe
   through vite-node reproduced `runtime.turn.failed`, `terminal: true` from
   one informational notice. The probe asserts the defect exists; exit zero
   is NOT compatibility success. Repair must distinguish informational and
   real errors and test same-turn continuation after a notice.
2. **Replay correlation risk, not a reproduced duplicate.** Tagged
   `MessageData.stream_message_id` links a durable message to its live preview.
   Our mapper does not consume it. Reproduce reconnect, delayed preview and
   repeated-text cases before selecting a repair; preserve duplicate suppression
   without losing legitimate repeated messages.
3. **Explicit passive-event dispositions.** Newly added events are
   `session.btw_sidechat` and `session.codex_approval_mode`. Give each a tested
   map/drop disposition; do not grant operator authority from upstream events.
4. **Remaining contract cases.** Review harness failure sources, unanswered
   elicitation, string compaction-window IDs and repeated progress. Update
   fixtures, readiness claims and the pinned contract only after tests pass.

Sources: [tagged conversation entities](https://github.com/omnigent-ai/omnigent/blob/fc89a3ba3c4698a7d742343b443a7b2bdc01120a/omnigent/entities/conversation.py),
[tagged OpenAPI](https://github.com/omnigent-ai/omnigent/blob/fc89a3ba3c4698a7d742343b443a7b2bdc01120a/openapi.json).

Fresh structured OpenAPI comparison: 101 -> 113 operations, 73 -> 85 paths,
146 -> 159 schemas, 54 -> 56 events; no removals. Fifteen existing schemas
have structural changes after stripping description/title/format annotations.
The existing checked-in delta script remains a v0.11 -> v0.12 gate, not v0.14
evidence. OpenAPI SHA256:

- v0.12: `2fad529777b266e54341cfa41934cb7fe211cad1d787afbacc4d16e6d38b7cdb`
- v0.14: `222c468fe0a269e92aa6faae08ea7081b5144ae227a2bdbc799b3af9077adb9c`

## Disposition

Keep the existing separate v0.14 accommodation recommendation on
[omniagent-plus#19](https://github.com/Consiliency/omniagent-plus/issues/19#issuecomment-5686331303),
with serialized transport ownership linked to
[omniagent-plus#25](https://github.com/Consiliency/omniagent-plus/issues/25).
Do not expand GUARD into transport upgrades or silently fold them into WIRE.
Before operating against or advertising v0.14, build/review the bounded
accommodation plan and pass its behavioral tests. No additional release delta
since the preceding check requires a new roadmap.

No product source, fixture, pin, version, installed Omnigent runtime or release
changed. No live-provider test, full-suite success or v0.14 compatibility is
claimed. Preserve the alpha/local-operator and explicit live-opt-in posture.
