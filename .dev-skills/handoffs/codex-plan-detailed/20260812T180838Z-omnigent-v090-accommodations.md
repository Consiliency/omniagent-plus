---
from: codex-plan-detailed
timestamp: 2026-08-12T18:08:38Z
repo: Consiliency/omniagent-plus
repo_root: /mnt/workspace/worktrees/omniagent-plus-plan-omnigent-v0-9-accommodations
branch: codex/plan-omnigent-v0-9-accommodations
branch_slug: codex-plan-omnigent-v0-9-accommodations
commit: faf84b749f21c3c6e03e67ec6f267880ba0a5431
run_id: 20260812T180838Z-omnigent-v090-accommodations
artifact: plans/detailed-omnigent-v0-9-accommodations-20260812-180838.md
---

# Handoff: Omnigent v0.9.0 accommodations

## Outcome

Created and panel-amended an execution-ready detailed plan for official
Omnigent v0.9.0. Authority evidence, official request/response/SSE repair,
CLI/hybrid compatibility, tests, and the transport-only 0.5.0 version change
land in one atomic PR. Publication remains separately authorized after merge and
exact-head packed gates.

## Frozen authority

- Official release: v0.9.0, published 2026-08-11
- Tag commit: cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2
- PyPI: omnigent 0.9.0, Python >=3.12
- Direct v0.7-to-v0.9 delta: 97 operations, unchanged path/schema sets, 52
  unchanged stream events, six additively changed schemas
- Published transport baseline: @consiliency/omnigent-transport@0.4.1
- Planned transport release: 0.5.0

## Load-bearing decisions

- Keep `omnigent server --background` canonical. The old start spelling is a
  hidden deprecated v0.9 alias, not an absent command and not production input.
- Do not add smart-routing, child-creation, harness-override, approval, lease,
  lock, or XG-1 authority.
- Repair official session create/send, pagination, epoch timestamps, child
  summaries, persisted ConversationItem history, tagged SSE normalization, and
  reconnect ordering before publishing 0.5.0.
- Keep exactly 52 live stream event literals and the neutral vocabulary. Treat
  child `session.created` as child metadata, not parent-session creation.
- Preserve the legacy `{id,event}` CLI history mapper separately from the new
  HTTP ConversationItem mapper; retain hybrid delegation behavior.
- Treat send acknowledgements as `{queued,item_id?,pending_id?}` and use only a
  clearly provisional local turn identity until official response evidence
  arrives.
- Treat upstream main and its post-v0.9 sub-agent bundle-root security fix as
  non-authoritative operational risk. If a newer stable release exists at
  execution preflight, stop and amend.

## Verification posture

No tests, builds, formatters, or generators were run because this was a
planning-only run. The plan contains one targeted atomic-PR command set plus one
machine-checkable automation suite.

## Advisor-board amendment

The first board pass found the invalid two-PR intermediate state, tagged SSE
shape mismatch, incomplete pagination, unsafe null-active history inference,
and lazy stream opening. The second pass confirmed those fixes and found two
remaining integration gaps: shared CLI history mapping and send-turn wire/ack
handling. Both are now explicit plan contracts. The second pass delivered Grok
and Sol dissent; Fable was degraded by a Claude session limit and Gemini was
empty, so neither was counted as approval.

The third pass delivered Grok and Fable `AGREE`, Sol `DISAGREE`, and an empty
Gemini seat. Sol's plan-level blockers were amended: persisted history never
infers successful completion, `native_tool` is typed metadata-only, and the
HTTP-202 policy-denial ack becomes a cached typed failure rather than an active
turn. Sol's implementation-not-yet-present note is expected for this planning
artifact and remains an execution acceptance gate.

Current plan SHA-256:
`468102e2eaf61580ef0e32e4705d9ef9d4e2edca5b84624a900e7cf2da182e9e`.

The focused final resubmission delivered Grok and Fable `AGREE`. Sol's sole
remaining `DISAGREE` was that the implementation and exact-head receipts do not
yet exist; that is expected for a pre-implementation plan and remains an
unchecked execution gate. Gemini returned `EMPTY`. The board result is usable,
with no remaining plan-level blocker; implementation readiness is not merge or
release approval.

## Worktree state

The planning worktree started clean at origin/main
`faf84b749f21c3c6e03e67ec6f267880ba0a5431`. Plan-owned artifacts are the plan,
this handoff, the latest handoff pointer, the advisor-board review record, the
manifest entry, and the required planner reflection.

The primary checkout's untracked `mcp_server.log` predated this run. It is not
an artifact of this plan and must not be committed during implementation.
