---
from: codex-plan-phase
timestamp: 2026-09-20T22:15:00Z
repo: omniagent-plus
repo_root: /mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912
branch: codex/v2-guard-20260912
branch_slug: codex-v2-guard-20260912
commit: 160a770c5daf86ef384f9643e844ff47d68b4cea
run_id: 20260920-guard-fable-quiet-wait
artifact: plans/phase-plan-v2-GUARD.md
artifact_state: staged
next_skill: codex-advisor-panel
next_command: Diagnose the native startup refusal while preserving the retained session and current policies
next_phase: GUARD
---

# Fable Continuation and Upstream Check

Current plan SHA256:
`0fe1020f36db66c1e99902e89281f2e6dd80676bd3a946aec63ab6a1cef50036`.
Draft omniagent-plus#29 remains at `160a770c5daf86ef384f9643e844ff47d68b4cea`.
The prior plan, reviews and protected primary checkout are preserved.

The continuation reader now accepts the actual native paste wrapper and only a
new-prompt-bound Fable end-turn verdict with the read token. Ten focused tests
pass. Private sources: `.phase-loop/fable_continuation_reader.py` and
`.phase-loop/test_fable_continuation_reader.py`.

The one authorized diagnostic retained native session
`830c917b-23c3-4b8f-b364-57ac8d9f34c9`, frozen files, Fable 5.1/max and Read-only
tools, with a 313-byte prompt and a 1800-second quiet-wait/backstop ceiling.
The initial preflight detected a separately installed runtime change before any
provider launch. Installed 0.7.14 now comes from
`b1fae7063e26fed8864b48b08e145572a65b2d2e`; panel_invoker SHA256:
`9577472844baa4fb073d2a3c76befba03eca49fccb98004be172ab3ae995f33e`.
Its shared launch function and required network-isolation context were retained.
No installed code, trust configuration or security policy was modified.

The adapter returned `claude_tui_workspace_trust_blocked` before prompt delivery.
No transcript bytes were appended, no new model turn or verdict was recovered.
This was a startup refusal, not a thinking timeout. No further retry was started.
The fourth adapter return value (sanitized terminal tail) was not saved; the exact
modal rejection is unknown. Preserve that field in a startup-only diagnosis.
Do not assume a workspace path mismatch, credentials failure or backend death.

Private run: `.phase-loop/fable-file-review-wait-20260920/`.
Use its binding.json session_path for the real retained transcript; the complete
transcript SHA256 remains
`c08571a6b882e9c67b252dcc23588e0cbbae84eae19b857eeda847498eceefb1`,
466080 bytes. The prior prefix, frozen snapshot and source hashes remain intact.
Runtime bytes did not change during this attempt. The process has exited and an
exact-session process probe found no retained-session child.

Public-safe evidence:
`plans/evidence/v2/reviews/GUARD-fable-quiet-wait-20260920.json`.
This is manual diagnostic evidence, NOT a governed board receipt. No new
ownership or IF gate. Complete current-input review/reconciliation and the
kernel-custody implementation/tests remain required before any merge.

Upstream: latest official release and PyPI remain v0.14.0 at fc89a3ba; main
remains 7c1ce512, unchanged from the preceding check. Our contract stays v0.12.0.
A fresh direct source probe reproduced informational persisted errors becoming
terminal failures. Replay stream IDs, passive events and remaining schema cases
still require a separate bounded v0.14 accommodation plan, serialized with
transport ownership (omniagent-plus#19 / omniagent-plus#25), not GUARD scope.
See `plans/evidence/v2/upstream-check-20260920.md`.

No product source/pin/version edits, full-suite or live-provider acceptance,
commit, push, merge, publication or pruning. Local evidence/handoffs are staged;
GitHub comments are status synchronization, not branch synchronization.

```yaml
automation:
  status: blocked
  terminal_status: blocked
  human_required: false
  blocker_class: reviewer_transport_incomplete
  blocker_summary: Retained-session continuation stopped at workspace trust before prompt delivery
  next_skill: codex-advisor-panel
  next_command: Diagnose native TUI startup with sanitized terminal-tail retention; preserve session and policies; no blind review retry
  next_phase: GUARD
  verification_status: reader_tests_pass_startup_refusal_no_review
  artifact_state: staged
  produced_if_gates: []
```
