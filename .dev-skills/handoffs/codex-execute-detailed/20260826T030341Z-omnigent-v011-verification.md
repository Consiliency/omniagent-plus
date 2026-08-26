# Omnigent v0.11 accommodation verification

summary: PASS - official Omnigent v0.11.0 is frozen at tagged authority, transport 0.6.0 is packable and dry-run publishable, and no package was published.

## Run context

- Plan: `plans/detailed-omnigent-v0-11-accommodation-20260826-015846.md`
- Branch: `codex/implement-omnigent-v0-11`
- Implementation commit: `ddab5cd`
- Base plan commit: `99f9af1`
- Upstream authority: Omnigent `v0.11.0` at
  `496b7b13f6af3ed5330b957df408fc91290b6307`
- Target package: `@consiliency/omnigent-transport@0.6.0`
- Publication boundary: dry-run only; npm remains at `0.5.0`

## Verification

- PASS: live GitHub latest-release and exact-tag SHA preflight.
- PASS: live PyPI version and Python `>=3.12` requirement preflight.
- PASS: npm latest is `0.5.0` and exact `0.6.0` returns `E404`.
- PASS: `node scripts/check-omnigent-openapi-delta.mjs v0.10.0 v0.11.0`
  proved 100 operations, 72 paths, 143 schemas, 54 events, exact additions and
  changes, no removals, and the load-bearing required/property sets.
- PASS: isolated v0.11 CLI `--version`, root help, server help, and host help.
- PASS: focused transport suite - 7 files and 150 tests.
- PASS: `pnpm test` - 100 files passed, 344 tests passed, and one credentialed
  live-smoke test intentionally skipped.
- PASS: `pnpm typecheck` across the workspace.
- PASS: `pnpm lint` with zero warnings.
- PASS: `pnpm build` across all public/private workspace projects.
- PASS: `pnpm --filter @consiliency/omnigent-transport test:pack`.
- PASS: `NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport`.
- PASS: `git diff --check`.

The dry-run tarball was `@consiliency/omnigent-transport@0.6.0`, 82 files,
91.7 kB packed and 519.1 kB unpacked. It includes emitted declarations and the
current v0.11 plus historical v0.10/v0.9 fixtures. No npm publication, tag,
release, merge, or deployment occurred.

## Panel reconciliation

The first exact-head review of `Consiliency/omniagent-plus#16` delivered four
usable independent seats, including Fable through the Claude subscription TUI
adapter. Grok, Fable, and Gemini agreed. Sol disagreed after reproducing an
authority-boundary defect: an otherwise metadata-only v0.11 event carrying an
extra `response_id` could enter generic SSE correlation and mutate a provisional
turn identity and active session state.

The parser now strips response identity, alias, and fallback-turn correlation
from `session.permission_mode` and `session.title`. Regression evidence injects
a forged response identity and proves the raw events remain unattributed while
the provider leaves the turn handle, active turn, session state, timestamp, and
shared fence unchanged. The targeted parser/provider suite passed 103 tests,
then the full verification sequence above passed again. A final exact-head
advisor-board review remained required after this reconciliation commit.

The second exact-head review also delivered four usable independent seats,
including Fable. Grok, Fable, and Gemini agreed; Sol reproduced two related
pre-allocation failure gaps. A nested id-less `response.failed` could use a
non-schema top-level `response_id` as authority, and a legacy normalized shape
could bypass the nested `status === "failed"` gate. The parser now accepts the
legacy normalized shape only when no nested response object exists and strips
all explicit response identity from a status-valid nested pre-allocation
failure. Parser tests prove forged identity remains unattributed and malformed
status-bearing shapes fail closed. A provider-level test now proves one
provisional turn receives the typed failure while two provisional turns remain
unattributed without handle mutation. The targeted suite passed 129 tests, then
the full verification sequence passed with 344 tests. A final exact-head board
review is required after this second reconciliation commit.

The third exact-head review delivered three usable independent seats. Grok and
Gemini agreed; Fable's canonical Claude TUI adapter stalled through both bounded
attempts and ended `DEGRADED`. Sol reproduced two remaining generic identifier
channels: metadata carrying `item.id` could seed mapper deduplication, and a
pre-allocation failure carrying `call_id` could replace its synthetic event ID.
The normalizer now synthesizes event identity and strips item, message, tool,
action, and elicitation identifiers for passive metadata and nested
pre-allocation failures. The mapper returns immediately for the two metadata
types before touching dedupe state. Regression evidence proves forged metadata
cannot suppress a later legitimate output item and forged failure identifiers
cannot replace synthetic identity. The targeted suite passed 129 tests and the
full verification sequence passed again with 344 tests. A final exact-head board
review is required after this third reconciliation commit, with Fable retried
through the same canonical TUI adapter.

The fourth exact-head review again delivered three usable independent seats;
Grok and Gemini agreed, while Fable's two canonical TUI attempts ended
`DEGRADED`. Sol reproduced a legacy-gate bypass where present-but-non-object
`response` values (`[]`, `null`, or a string) were collapsed to absence. Those
frames could then satisfy legacy fields and restore forged response authority.
The legacy fallback now requires the raw `response` member to be absent, and all
three malformed present shapes fail closed in parser regression evidence. The
targeted suite passed 129 tests and the full verification sequence passed again
with 344 tests. A fresh exact-head board remains required, including a usable
Fable verdict through the canonical TUI adapter.

## Acceptance reduction

- PASS: live and checked-in authority identify v0.11.0 at the exact tag commit.
- PASS: exactly 54 event literals include only the two v0.11 additions.
- PASS: permission/title events are validated metadata-only no-ops, including
  with a forged response identity, active provisional turn, and fence state.
- PASS: status-bearing id-less failures preserve typed terminal behavior,
  synthetic event identity, strict status gating, and conservative attribution
  even when a forged explicit response identity is present.
- PASS: background-task detail is availability-preserving on HTTP and SSE.
- PASS: v0.10/v0.9 fixtures and loaders remain exported and tested.
- PASS: no typed/public permission, approval, lease, lock, routing,
  child-create, harness-override, schedule-control, or policy capability was
  added.
- PASS: only the still-unpublished transport 0.6.0 changelog entry changed;
  sibling versions and the publish workflow are unchanged.
- PASS: full suite, build, pack, and dry-run publication gates passed.
- PENDING: final exact-head advisor-board review of the reconciliation commit.

## Dirty path classification

All implementation and evidence paths are plan-owned. Generated `dist` output
and installed dependencies are ignored. There were no pre-existing unrelated
paths and no non-plan output.

## Documentation delta

`doc_delta_decision=docs_updated`: authority, transport, lifecycle,
coordination, readiness, live-smoke, fixture, and release documentation now
describe v0.11 and its explicit non-authority boundaries.
