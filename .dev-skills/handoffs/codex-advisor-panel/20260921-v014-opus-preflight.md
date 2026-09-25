---
from: codex-advisor-panel
timestamp: 2026-09-21T22:02:00Z
repo: omniagent-plus
repo_root: /mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912
branch: codex/v2-guard-20260912
branch_slug: codex-v2-guard-20260912
commit: 160a770c5daf86ef384f9643e844ff47d68b4cea
run_id: 20260921-v014-opus-preflight
artifact: plans/detailed-omnigent-v0-14-accommodation-20260921-1133.md
next_skill: codex-advisor-panel
next_command: Check agent-harness#940 / agent-harness#944 for qualified Gemini support; preserve Opus substitution and whole-board policy
---

# Opus Panel Preflight

The user explicitly authorizes Opus instead of Fable because Fable credit is
exhausted. Apply this to the v0.14 plan panel, not to an already-completed vote.
Requested seats: Opus 5/max correctness, Grok 4.6/max adversarial,
GPT-6 Astra/max red-team, Gemini 3.8 Flash/high alternative-approach.
All remain subscription/homebrew; Claude stays on native self-PTY from this host.

Plan hash unchanged:
17da104104c8b788c7136a96c2426a8fa26696773bf60ba2a3a8ed11a055296d.

The installed runtime is now 0.7.15 at direct_url commit
dc47379d6ebc51f7dc2b2536a930be7271d4b4df; panel_invoker SHA256
8e0307f5bbcdb59b382d011228ff05a9491b90cfbc136d039d1846944e9ec6e2.
It matches the startup-qualified module hash reported on agent-harness#926.
That issue now records two successful synthetic startup receipts; they are
not this plan's review approval. No runtime installation was made here.

Pure whole-board resolve_review_monitoring_policy preflight returned
review_monitoring_unsupported_route:gemini. Opus model/effort route resolves.
Zero provider calls, zero auth probes, zero review rounds; invoke_board was
not called. This is a capability refusal, not a failed reviewer verdict.
No inferred waiver of the user's healthy-review monitoring requirement.

Current follow-up: agent-harness#940; repair PR agent-harness#944 remains OPEN.
The new v0.7.16 release notes also exclude Gemini/default-four-vendor heartbeat
support. The issue's three-provider bootstrap exception applies only to the
Gemini repair itself and is NOT permission for this consumer to drop a seat.

Evidence: plans/evidence/omnigent-v0-14-panel-preflight-20260921.json.
Do not spend other seats or switch to bounded deadlines while recording the
same board/policy. When Gemini is qualified, recheck exact route/model/effort
and small file-pointer delivery before dispatch. Reader qualification is not
established by this policy probe. Preserve the old GUARD Fable session untouched.

No panel review or reconciliation was completed; no source changes, tests,
commit, push, merge or publication. New evidence/handoff remain local.

```yaml
automation:
  status: blocked
  human_required: false
  blocker_class: reviewer_transport_incomplete
  blocker_summary: Gemini heartbeat-only route unsupported; Opus substitution recorded
  execution_authorized: false
  review_status: refused_before_dispatch
  next_skill: codex-advisor-panel
  next_command: Check agent-harness#940 and agent-harness#944 for qualified support before dispatch
  produced_if_gates: []
```
