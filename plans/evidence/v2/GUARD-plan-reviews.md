# GUARD Plan Review Reconciliation

## Round 1

Evidence: `reviews/GUARD-plan-round1.json`. Inputs remained unchanged during
review. Grok, Codex and Gemini returned usable PARTIALLY AGREE results.
Fable returned DEGRADED with no content: the native subscription TUI adapter
reported claude_tui_stalled after 408.8 seconds, with no meaningful progress
for 398.2 seconds. The coordinator did not kill or substitute the reviewer.
This is an incomplete panel, not approval. It was not a provider refusal.

| Finding | Disposition |
| --- | --- |
| Current versus historical hashes and pending TRIAGE gate | Preserve historical reviewed hashes; add current candidate hashes and source inventory. The pending state is intentional until the amended candidate passes panel reconciliation. No execution before the manual IF receipt is accepted. TRIAGE.json links to that receipt; no runner state is edited. |
| Third ID-1 edge lacks source evidence in bundle | Include all three identity-isolation source files and the structural checker in resubmission. CASE-HY-6 is an explicit inventory correction. The structural checker validates case membership, not import syntax; GUARD adds syntax enforcement. |
| Verification/publication revision binding | Freeze immutable github.sha checkout in both jobs and compare source SHA, lockfile and public package manifest digests before npm effects; add mismatch falsifiers. |
| Privileged installer inherited by integration | Add explicit guard_client non-superuser login, separate fixture connection, session_user check before SET ROLE and superuser rejection control. SQL function setup is not hosted RLS/RPC evidence. |
| Ineligible reachable database could receive bootstrap writes | Freeze workflow/local-launcher-owned disposable service, loopback host, dedicated database and synthetic credentials; reject ambient production URLs, wrong identity/database and configuration before privileged writes. Require path-entered zero-write negative control. |
| PostgreSQL version and process-suite scope | Pin postgres:17.6-bookworm as isolated test fixture only. Existing process suites receive timeout/readiness/cleanup changes only, not DATA/COORD behavioral changes. |
| Missing service or migration must fail | Retained explicit negative controls and full real gate; no skip flag, mocked-only acceptance or credentialed production service. |
| Readiness wording and fixture consistency | SL-1 owns documentation, fixture and matching tests together; combined acceptance checks the same candidate. |
| Owned later-phase work | Keep blocked-query controls, stale-registration metadata semantics, SL-2/3 cross-track closure, recovery actor provenance and license decision in their existing phase/issue owners. None is closed by this plan. |
| Mechanical plan validation | Correct lane index syntax and Execution Notes heading. Validator now parses three disjoint serial lanes; heuristic interface/docs/release warnings are not dispatch authority. |

## Decision After Round 1

Material plan corrections require resubmission. Neither TRIAGE manual
acceptance nor GUARD implementation has been accepted by a completed panel.
Historical round-9 references describe merged bytes only, not this amended
candidate. Final receipt status/IF values and panel-result references will be
recording-only updates after exact-input review and reconciliation; they
cannot be truthfully set to accepted before the review completes.

## Round 2

Evidence: `reviews/GUARD-plan-round2.json`, unchanged inputs throughout review.
Gemini returned AGREE; Grok and Codex returned PARTIALLY AGREE. Fable again
returned no usable content: claude_tui_stalled after 273.3 seconds with
257.2 seconds since meaningful progress. The smaller bundle used by-reference
source context; reviewers could not inspect it through their actual route.
This does not establish a provider refusal or lack of subscription access.
Read-only auth metadata confirms loggedIn=true, authMethod=claude.ai and a
Max subscription. No credentials, account identity or token values retained.
No live reviewer was stopped by the coordinator and no model was substituted.

| Finding | Current correction / disposition |
| --- | --- |
| Source-only publication binding insufficient | Plan now requires verified tarballs with digest/name/version/source-input manifest, transfer by same-run artifact identity, no publish-job rebuild/repack, and tampered-artifact falsifier. Added exact script ownership. GUARD establishes transfer integrity; PREP still owns distribution correctness. |
| Integration cases might be absent from full suite | Explicit full-root collection, admitted client connection, required integration execution accounting and omitted/skipped-DB negative control. Focused successes cannot substitute. |
| Source evidence only by reference | Receipt now includes verbatim import statement, line and file hash for each of the three imports. Resubmission must stage source text directly where reviewers cannot use local tools. |
| Missing receipt hash / proposed self hash | Added amended TRIAGE.json digest. Each external panel result hashes the exact closeout receipt input; embedding the receipt's own full-file digest is impossible and is rejected in favor of this external binding. Recording updates remain distinctly attributed. |
| Default test caller / inherited installer environment | Freeze guard_client as default, strip inherited DATABASE_URL, never export installer credentials under it, confine SET ROLE service_role to the function-existence probe; COORD owns its caller-role selection. |
| Ownership / timeout ambiguity | Pin helper paths to guard-process/guard-postgres/guard-stages, local launcher to prepare-test-postgres.mjs, reusable workflow to verify.yml. Specify job20min/connect5s/statement10s/readiness30s/process15s and hung-child250ms/escalation500ms/post-escalation2s limits. Only test-owned resources are cleaned. |
| Signal cleanup / changed tsconfig aliases | Plan requires fixture failure and signal cleanup, and AST escape controls. Implementation must include alias/dynamic/re-export negatives. SIGKILL cannot guarantee traps; retained instances are labeled disposable, not silently claimed cleaned. |
| Baseline lacks command/cwd/skip identity | TRIAGE receipt now records the unchanged-product baseline, exact reproduction order, observed scheduling distinction, JSON digest and the single live-provider skip. This remains separate from GUARD SQL/behavior acceptance. |
| OIDC/detached checkout live proof | Same existing GitHub Actions trusted-publish route is retained. GUARD validates immutable artifacts and workflow wiring without publishing; actual OIDC exchange/registry receipt belongs to SHIP. A dry-run cannot claim that external success. |

## Gate After Round 2

The final amended plan has not been resubmitted or approved. The required
Fable seat failed twice through its specified adapter despite authenticated
subscription access. The coordinator requested explicit approval for temporary
Opus through the same TUI route; no approval has been received or inferred.
Preserve both incomplete panels. Resume with an available approved Claude
reviewer, fresh four-agent review of current bytes, and reconciliation before
GUARD implementation or merge. Agent-harness#831 is not this product blocker.

## Round 3 - Fable Capture Succeeded

Evidence: `reviews/GUARD-plan-round3.json` and
`reviews/GUARD-plan-round3-observation.json`. The reviewed GUARD plan digest
is `792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66`.
Every supplied artifact remained unchanged through review. All four adapters
returned OK with PARTIALLY AGREE text. Fable used claude-fable-5-1 at max
effort through the unchanged first-party subscription self-PTY route.

The user authorized retaining review output before cleanup and rerunning
Fable. A read-only observer watched only this run's private scratch namespace,
required a unique prompt marker, and retained assistant text, not thinking,
user prompts, credentials or raw session records. The final observed session
identity/path hashes match native broker evidence. Its 304085-byte transcript
digest exactly matches the cleanup digest:
`c44f9c9e48207b127b9513e559e868e75b755539f36176f08a26a14cb73fef87`.
The captured assistant text also exactly matches the native 6521-byte review.
Native cleanup and provider quiescence both passed. The coordinator neither
killed nor nudged a provider and did not change the runtime or replace Fable.
The initial prompt-only silence therefore did not establish a failed run.

Grok reports that its framed input was truncated. Its native OK status means
delivery completed, not that the entire candidate was reviewed. Do not count
that leg as complete plan coverage. Fable, Codex and Gemini inspected the
three inline source files. Current findings are reconciled below as accepted
follow-up constraints or clarified scope; they are not yet implemented or
incorporated into a newly reviewed plan.

| Finding | Reconciliation and next owner |
| --- | --- |
| Fable seat unavailable / Opus request | Cleared for this run. Keep Fable; no replacement decision or external harness fix is needed to resume planning. Preserve both earlier failures as history. |
| Grok incomplete input | Unresolved review coverage. Use a bounded source-grounded bundle, explicit section/end markers and acknowledged complete coverage on resubmission. Do not infer delivery completeness from adapter OK or hashes of sent bytes. |
| Exactly three relative edges | Confirmed the literal target scan below and unchanged TRIAGE plan digest. This is inventory evidence, not the future recursive AST boundary checker. Include the scan in the amended receipt. |
| Acceptance receipt mutates after review | Accept. Record before/after digests externally and an exact allowlist of recording-only field changes; do not embed an impossible self hash or use recording edits to smuggle material changes. Parent owns the receipt and manual gate decisions. |
| Ambient libpq/Supabase configuration | Accept for SL-0. Clear connection/service/pgpass/options variables and ambient Supabase configuration for installer and test children, use complete fixture connection parameters, and test hostile ambient settings with zero unauthorized writes. |
| SET ROLE leaks through reused connections | Accept for SL-0. Use a dedicated probe connection that closes on every path, or guaranteed RESET ROLE plus identity assertion before reuse. COORD does not inherit probe privileges. |
| Mutable PostgreSQL tag | Accept for SL-0 plan amendment: verify and record one registry manifest digest, used by both local launcher and workflow. No digest is invented in this review record. |
| Transport smoke repacks | Confirmed by reading scripts/smoke-packed-omnigent-transport.mjs. It unconditionally invokes pnpm pack and is absent from SL-0 ownership. Amend ownership and define a retained-tarball input mode, preserving standalone smoke behavior and existing assertions. The gate must smoke-test the retained transport tarball. |
| Publish interface and dry run | Accept for SL-0. Preserve the current package-directory dry-run interface; define verified-tarball publication separately and exercise same-run download/digest checks in a no-id-token hosted dry run. Actual OIDC/registry proof remains SHIP. |
| SQL-dependent collection | Accept clarification before execution. Explicitly identify which focused controls require the fixture; non-DB pnpm test excludes those suites by selector, not runtime skips. Full verify requires their actual execution. |
| Merge route unnamed | Accept parent closeout clarification. Name GitHub PR merge of the exact accepted head with required CI and panel evidence; no direct push to main or invented FABPUB success. Existing ambiguous external effects still require reconciliation. |
| Type-query/triple-slash escapes | Accept SL-0 negative controls alongside import/re-export/dynamic/path-alias controls. Baseline only the three exact imports; PREP owns their removal. |
| Signal/null-status failure and process groups | Accept SL-0 controls. Fail signal-terminated stages and spawn isolated, explicitly owned groups before group cleanup. Never signal reviewer or unrelated groups. |
| Workflow secrets and integration setting | Accept SL-0 topology controls: no inherited secrets in verification, no production credentials, and integration-required configuration set by the gate rather than ambient input. |
| Checker depends on phase-loop CLI entrypoint | Clarify, do not add a product dependency or silently skip validation. The existing --inventory-only form passes without phase-loop. Default structural+roadmap validation remains an operator planning check, separate from the hosted product gate. |
| Public package enumeration | Accept explicit names in SL-0: @consiliency/runtime-provider, @consiliency/pipeline-provider-adapter, @consiliency/omnigent-transport, preserving their existing publish order. |
| SQL receipt/migration prerequisite proof | Accept parent/SL-0 planning follow-up: name a metadata-only receipt path, inspect migrations and query input handling, specify fixture-only prerequisites, and retain unchanged migration bytes. Never claim RLS/RPC proof from setup. |
| Planned controls are not execution proof | Already required. GUARD acceptance waits for actual positive/falsifier/full-gate and hosted evidence; TRIAGE acceptance does not close runtime audit issues. |

### Fresh Source Checks

Command run from this branch:

```sh
rg -n -F '../../omnigent-transport/src/types.js' packages --glob '*.ts' --glob '!**/dist/**' --glob '!**/node_modules/**'
```

Complete output:

```text
packages/identity-isolation/src/process-profile.ts:2:import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";
packages/identity-isolation/src/omnigent-isolation-policy.ts:2:import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";
packages/identity-isolation/src/types.ts:11:import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";
```

The unchanged TRIAGE plan SHA-256 remains
`69484fbac85b4d574463e7bf264fe942d44b8e4a225dd0dce92dc0c9e176cfee`.
Both default and --inventory-only TRIAGE structural checks passed again,
including 55 findings, 28 N/Q cases, four cross-cutting cases and six negative
controls. Default validation also accepted eight roadmap phases, with the
existing agent-harness#819 import warning; no FAB closeout success is claimed.

### Decision After Round 3

Fable review availability is no longer the blocker. This is successful
review-text recovery and useful four-vendor feedback, not an accepted plan
panel. Amend the existing plan/receipt for the accepted constraints, then
obtain exact-current-input review with complete Grok coverage and reconcile
before accepting TRIAGE manually or implementing GUARD. The plan, roadmap,
TRIAGE acceptance receipt and historical runner state remain unchanged by
this evidence-only update. No implementation, merge or release occurred.

## Grok Targeted Follow-up

The maintainer explicitly requested the follow-up after the prior Grok
session had ended. Evidence: `reviews/GUARD-grok-followup.json`, with the
exact staged `reviews/GUARD-grok-followup-bundle.md` and
`reviews/GUARD-grok-followup-brief.md`. This was one fresh Grok 4.6 subscription
seat through the unchanged brokered runtime, not a restart of the four-agent
panel. No other reviewer was invoked and prior results remain unchanged.

The 25476-byte bundle contained ten bounded sections: command freeze; the
complete SL-1-through-EOF plan tail; manual roadmap amendment; complete pending
closeout receipt; explicitly labelled historical-state JSON projection;
ID-1/HY-6 matrix rows; three source import excerpts; and complete checker.
Each section was linked to its full source hash and had a unique end marker.
Grok returned native OK / PARTIALLY AGREE, acknowledged all ten end markers
and the bundle terminator, and gave specific facts consistent with each
supplied section. Source, bundle and brief hashes stayed unchanged.

Grok explicitly resolved its missing-evidence objection for the supplied
SL-1/SL-2 tail, manual amendment, CASE-HY-6 source sites and pending receipt.
This establishes coverage of those omissions, not fresh full-corpus or
amended-plan approval. It did not withdraw earlier substantive findings.

| Retained finding | Reconciliation |
| --- | --- |
| Manual amendment and receipt remain pending | Correct. No accepted EC/IF or runner success is fabricated; record an explicit decision only after the current candidate is fully reconciled. |
| Receipt panel-history field still describes rounds 1/2 | Intentional preserved input, not current Fable availability. Parent owns the recording update and before/after field/digest binding already accepted in round 3. |
| Three source windows do not establish exhaustive inventory | Correct scope limitation. The literal full-package scan is separately recorded above; no literal scan substitutes for GUARD's future AST controls. Carry the exact inventory evidence into the amended receipt and review bundle. |
| GUARD behavioral controls have not run | Execution and SL-2 obligations, not new planning failures. No runtime bug is declared fixed by this follow-up. |
| ID-1 repair, license selection and historical runner reconciliation | Retain PREP and tooling ownership. No source repair, license decision or historical state mutation is pulled into this review. |

### Current Decision

The specific Grok missing-input concern is resolved, as is the earlier Fable
availability concern. The remaining next step is the existing plan/receipt
amendment and fresh exact-candidate four-seat review. Do not rerun unchanged
reviewers merely to repeat this targeted follow-up, or silently reinterpret
PARTIALLY AGREE as accepted. No plan, receipt, product source, version or
historical runner state changed during this follow-up; no phase was accepted,
implemented, merged or published.
