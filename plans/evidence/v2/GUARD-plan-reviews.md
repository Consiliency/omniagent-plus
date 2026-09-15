# GUARD Plan Review Reconciliation

Latest amendment: 2026-09-14. Round-3 and targeted Grok findings are now
incorporated in the existing GUARD plan and pending TRIAGE receipt. See the
round-4 and later sections below for current-candidate review; earlier
decisions are historical and do not establish approval of these new bytes.

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

### Decision After Targeted Grok Follow-up (2026-09-12)

The specific Grok missing-input concern is resolved, as is the earlier Fable
availability concern. The remaining next step is the existing plan/receipt
amendment and fresh exact-candidate four-seat review. Do not rerun unchanged
reviewers merely to repeat this targeted follow-up, or silently reinterpret
PARTIALLY AGREE as accepted. No plan, receipt, product source, version or
historical runner state changed during this follow-up; no phase was accepted,
implemented, merged or published.

## Round 4 - Amendment Review (2026-09-14)

Evidence: `reviews/GUARD-plan-round4.json`, with the exact `-bundle.md`,
`-brief.md` and `-observation.json` companions. The entire plan and receipt
plus bounded source sections S1-S9 were staged inline in a 46652-byte bundle.
All recorded input hashes remained unchanged throughout review. The reviewed
plan was `bbaa004c4847b67fbb98d10f95ab60eac33d10f42b9f9ad2eeb450f286c1690a`.

Codex and Grok returned native OK / PARTIALLY AGREE with usable findings.
Gemini returned complete affirmative text but native DEGRADED because its
terminal line was `**Verdict**: **AGREE**`, not accepted by the native parser.
Do not relabel that result OK or use it as accepted review. Fable returned
DEGRADED with no answer; the native adapter reported claude_tui_stalled after
294.2 seconds, with 278.1 seconds since meaningful progress. Its read-only
session observation is diagnostic evidence, never an override of that result.
No provider was killed, nudged or replaced by the coordinator. No refusal is
established. This panel is incomplete.

| Finding | Reconciliation in the round-5 candidate |
| --- | --- |
| PR github.sha may be a synthetic merge, not the reviewed head | Accepted Codex's defect. Freeze event-derived tested_source_sha inside verification and consumers: PR head for pull_request, github.sha for release/dispatch, no caller-selected ref. Bind checkout, manifests, rehearsal and closeout consistently and test distinct merge/head values. Grok's no-caller-ref constraint is retained without treating the synthetic merge as PR-head proof. |
| Immutable receipt contract describes itself as pending | Accepted. Replace the contract's decision with an immutable acceptance precondition; only top-level status carries current state. Keep the recording-field allowlist and external before/after digest binding. |
| New lint rules could cause unowned fixes | Accepted. New type-aware overrides name only SL-0-owned scripts, guard tests/helpers and four existing process suites. Preserve other lint coverage. Wider ownership requires an amendment. |
| Ambiguous focused commands | Accepted. test:guard runs tooling/setup controls plus designated DB cases; test:integration runs the same DB cases only. Each standalone command owns its fixture; verify runs one full root suite. |
| New publish CLI path or only existing-version skips may not prove artifact reuse | Accepted. Modes are mutually exclusive; a stub NPM_CLI E404 control must exercise the non-skip retained-tarball path, reject tampering and prove no pnpm pack occurs. Preserve the positional interface. Hosted skip-only evidence is insufficient. |
| Required CI check unnamed | Accepted. Freeze guard-required and its failed/skipped/cancelled dependency falsifiers. SL-2 checks protection requires it; protection changes remain maintainer-owned and cannot be silently waived. |
| Source appendix is bounded, not the whole corpus | Preserve limitation. Full smoke/migration/process-suite behavior has not been executed or exhaustively reviewed in this planning round. Unexpected migration prerequisites or unowned implementation changes fail closed into a scoped amendment. |
| Preserve cleanup, empty-selection and no_doc_delta obligations | Already explicit; retained as implementation requirements. Affirmative Gemini prose supplies useful feedback but does not repair its degraded review status. |

The literal-target source scan was repeated on 2026-09-14 and again returned
the same three imports. The receipt records its exact command, output and
scope limitation. Registry metadata established the plan's linux/amd64
PostgreSQL manifest digest; the image was not locally cached, downloaded or
started. Read-only inspection found the sole current migration's public
tables, core gen_random_uuid(), PL/pgSQL and named-role prerequisites. No
database, migration, build, product test or publication ran in this planning
amendment. The product baseline remains expressly dated 2026-09-12.

The corrected plan's dispatch-hint validation returned no findings, and the
plan validator parsed three serial lanes. Its semicolon-interface and
release-shaped heuristic warnings are retained, not treated as execution or
release authority. Lane-IR parsing returned no diagnostics; this is structural
planning evidence, not tested automatic scheduler readiness.

## Round 5 - Corrected Candidate (2026-09-14)

Evidence: `reviews/GUARD-plan-round5.json` and its exact bundle, brief and
read-only observation companions. Inputs remained unchanged. Reviewed plan
SHA-256: `1e807d175559146fd661afb7ae772b680a6da9bbf3b5baa7a667f0cae28a8351`;
reviewed receipt: `ddfddc77b68b4aae26b8bc42ef7d2149a8f084cc16426854a53a497ac36d979b`.

| Seat | Native outcome | Reconciliation |
| --- | --- | --- |
| Codex gpt-6-astra, max | OK / AGREE | Complete input/S1-S9/end-marker coverage; no established blocking defect. Accept explicit main-push mapping to github.sha and a routing falsifier as a precision improvement. |
| Grok grok-4.6, max | OK / PARTIALLY AGREE | Complete input/S1-S9/end-marker coverage. Findings independently assessed below, not treated as blanket approval. |
| Fable claude-fable-5-1, max | DEGRADED / empty | Native subscription TUI reported claude_tui_stalled at 298.3 seconds, 282.2 seconds since meaningful progress. No recoverable answer. |
| Gemini gemini-3.8-flash, high | ERROR / empty | Native agy stream parser rejected the stream before collecting a terminal result. Not an accepted review or a provider refusal. |

Fable's observed final session was 73710 bytes. Its path/session identity
hashes and full digest exactly match native cleanup metadata:
`334eef2804db4876ac0ca2bee0fee4b2489b7719b6bb29959e845d2e9db9b0f2`.
The correlated observer found no assistant text, so there is no hidden review
to promote. Cleanup and quiescence passed. Gemini's metadata reports
provider_stream_outcome=parse_error, result_count=0, child_returncode=0 and
no timeout; its raw stream is represented only by digest/length. The retained
evidence does not reveal the exact rejected event, so no specific cause is
invented. No coordinator kill, nudge, runtime patch or model substitution.

| Grok finding | Coordinator disposition |
| --- | --- |
| P1: fixture variables could change existing non-DB tests | The claimed current failure is unproven: the package-test source scan found no reads of GUARD_TEST_DATABASE_URL, DATABASE_URL or the listed PG connection variables. Four process suites do spread process.env to children. Accept preventive isolation of DB/non-DB workers within the single root invocation and a zero-leakage control including descendants; do not claim an existing runtime defect was reproduced. |
| P2: destructive setup controls could mutate the admitted fixture or disappear from verify | Accepted substantive planning gap. Run destructive controls serially in separate owned disposable instances, never the admitted integration fixture. Require their IDs in the full gate and a suppression falsifier. |
| P3: new floating-promise lint may exceed timeout/readiness/cleanup-only ownership | No actual violation was supplied. Remove the ambiguity conservatively: the four process suites keep their existing lint rules; new promise rules cover owned tooling/guard tests/helpers only. No behavioral source edits are added. |
| P4: legacy publication route might still repack | The previous candidate already prohibited rebuild/repack and required same-run artifact identity. Make implementation wiring explicit: the id-token job needs the producing verify job, invokes only --verified-artifact and accepts no caller artifact ID; test those constraints. |
| P5: required case identity unnamed | Accepted. tests/guard/required-cases.json, already inside SL-0 ownership, names setup/DB case IDs; dropped, renamed or skipped IDs fail the gate. This is not a minimum-count-only approximation. |
| P6: hypothetical unowned zero-edge boundary test | Read-only package-test scans found no such assertion. The prior unchanged-product baseline passed with all three edges; it is historical evidence, not a new run. Retain the existing ownership stop rule for any newly discovered unowned fix. Do not invent a new failing test or expand ownership speculatively. |

These material changes were incorporated into the round-6 candidate and
submitted for a fresh complete four-seat review. Round-5 Codex approval and
earlier Fable/Gemini results do not approve those later bytes. All historical
evidence remains intact. TRIAGE is still pending and no IF gate is produced.

## Round 6 - Final Panel Attempt (2026-09-14)

Evidence: `reviews/GUARD-plan-round6.json`, with exact bundle, brief and
observation companions. The 50496-byte bundle contained the full candidate
plan/receipt and bounded S1-S9 source appendix. All inputs remained unchanged
through completion. Reviewed plan:
`8da696bb928431c7821aff58fba5850e47bbad414c3d46356163ddf5a0fc2250`;
reviewed receipt:
`d9f24ca1b112af8fd395c300d75566f42e4c513d71a0b173b7279f0369c1d39d`.

| Seat | Native result | Coverage / disposition |
| --- | --- | --- |
| Codex gpt-6-astra, max | OK / AGREE | All input/source/end markers confirmed. No blocking plan defect; retain existing implementation and acceptance obligations. |
| Gemini gemini-3.8-flash, high | OK / AGREE | All markers confirmed, stream ingestion accepted. Earlier parser failures are historical, not current Gemini unavailability. |
| Grok grok-4.6, max | OK / PARTIALLY AGREE | All supplied markers confirmed; bounded omitted source remains explicitly outside this review. Six findings reconciled below. |
| Fable claude-fable-5-1, max | DEGRADED / empty | No review text; native claude_tui_stalled at 302.7 seconds, 286.3 seconds since meaningful progress. Not approval or refusal. |

Fable's correlated final session was 75632 bytes, with no assistant answer.
Observer and native cleanup digests match exactly:
`0dd604820c5eb3e971708841d8523d77e4b6d24594589ac7af94cf42c8221565`.
Session identity, cleanup and quiescence metadata agree. No coordinator
signals, runtime overrides or model substitutions occurred. Three materially
different candidate rounds in this turn failed to produce a Fable review;
another unchanged attempt is not evidence of progress. Preserve the specified
subscription TUI route and diagnose its result boundary before resubmission.
This is missing review evidence, not a new package/runtime dependency on
Agent Harness or permission to waive the panel.

| Finding | Coordinator reconciliation |
| --- | --- |
| Grok 1: plain pnpm test could inherit DB-enable mode | Accepted final wording gap. Explicitly clear DB enablement/connection variables and exclude DB cases in plain pnpm test even when pre-set; only admitted verify/test:guard/test:integration paths enable DB collection. Require a hostile ambient-enable control. This material post-review amendment is not approved by round 6. |
| Grok 2: process assertions must survive environment scrubbing | Already required jointly by zero fixture leakage to non-DB workers/descendants, preserved real lock/race assertions and unchanged DATA/COORD assertions. SL-0 must demonstrate these together; no relaxed assertion or new production edit is authorized. |
| Grok 3: live setup falsifiers belong under the DB selector/required manifest | Already covered by all live-SQL-dependent cases using *.db.test.ts and the required setup/DB case-ID manifest. This includes admission, destructive, role, privilege and function controls, not just the happy-path query. |
| Grok 4: omitted smoke tail, acquire body and package manifests | Agreed limitation. No full-corpus or runtime/publication acceptance is claimed. SL-0 owns preserved smoke assertions, package identity checks and signature-only acquire inspection; real results are due at implementation/SL-2. |
| Grok 5: unowned writes / plan-review versus implementation-review files | Retain existing ownership amendment requirement. Parent GUARD-plan-reviews.md is not SL-2 GUARD-reviews.md; no ownership expansion is inferred. |
| Grok 6: receipt writes and four usable seats | Retain. The final plan change below is explicitly material, not an allowlisted recording-only update. Receipt stays pending; no acceptance binding or IF success is fabricated. |
| Gemini: worker isolation implementation | Keep the zero-leakage obligation. Choose/test an appropriate worker configuration in owned vitest.config.ts during SL-0; do not adopt an unverified general claim about shared thread environments or require broad pool changes without evidence. |
| Gemini: AST controls | Already required, including exact baseline and stale-exception rejection. Source removal remains PREP-owned. |
| Gemini: real OIDC only on release events | Do not adopt that narrowing. The reviewed plan deliberately also allows explicitly selected dispatch publish mode while default dispatch/PR remain dry-run. Preserve existing authorization and routing controls. |
| Gemini/Codex: acceptance binding and later evidence | Retain current procedure and ownership. Review, structural validation, phase acceptance, implementation, hosted CI and registry publication remain distinct. |

## Decision After Round 6

The plan and pending receipt incorporate the reconciled findings. The final
post-round-6 candidate is:

- GUARD plan SHA-256: `80aa9de48cde9764dd7dad66db1ce31e471fa61b2c2d5f1e55ab0e62e49bd537`.
- TRIAGE receipt SHA-256: `dcff1bee72c01b82613d9c0dc53752233175b135bc5cb60de9125faf7ecad35a`.

**Not accepted / not execution-ready.** Final launcher-only enablement wording
and its updated receipt need fresh exact-current-input four-seat review and
coordinator reconciliation. No earlier approval is carried to these bytes.
The substantive findings have dispositions; the unresolved gate is complete
review evidence. Do not restart panels blindly, substitute a reviewer, infer
success from authenticated access, or label a degraded seat an approval.

After that gate, explicitly accept TRIAGE with its external recording-only
digest binding, then execute the existing serial GUARD lanes. No new roadmap
or detailed-plan fork is needed. All runtime findings and later owners remain
open. This turn changed planning/evidence only: no product implementation,
build/test run, migration, phase acceptance, merge, release or worktree prune.

## Availability Diagnostic and Round 7 (2026-09-14)

The maintainer requested the next step. The final plan and pending receipt
were frozen at the hashes above; no further material amendment was made.
Live metadata confirmed first-party subscription authentication. Installed
phase-loop-runtime remains 0.7.14, Claude Code is 2.1.270, and the installed
panel_invoker.py SHA-256 remains
`74ffe98271b41ccb72e59e5eb32e7a891f7e1cee32c34f9da47910f29c7d3016`.
No installed runtime file, model, authentication route or liveness limit was
changed. Existing agent-harness#730 and agent-harness#734 document related
terminal-error and quiet-wait classification failures; those reports do not
establish the cause of these sessions.

The small native Fable diagnostic succeeded in 15.72 seconds: 1480-byte
provider input, correct correlation marker and native OK / AGREE. Its
38275-byte final transcript matched the observer and native cleanup digest
`03647fbb68a905e40ff6533fb338da91b4136867c3686f0cc7931dc07419d837`.
The sanitized observation counted one user event, two assistant events, one
text block and one thinking block; no thinking content was retained. No
synthetic API-error event was observed. This is current small-request
availability, not review of any plan. Evidence:
`reviews/GUARD-fable-diagnostic-20260914.json` and its three companions.

Following that positive control, round 7 submitted the unchanged final plan,
receipt and bounded source appendix. The brief requested concise findings
without omitting blockers. All supplied bytes remained unchanged. Evidence:
`reviews/GUARD-plan-round7.json` and its exact bundle/brief/observation files.

| Seat | Native result | Disposition |
| --- | --- | --- |
| Codex gpt-6-astra, max | OK / AGREE | Complete supplied coverage. No material corrective finding, including the final plain-test enablement clarification. |
| Grok grok-4.6, max | OK / PARTIALLY AGREE | Complete supplied coverage. Explicitly recognizes closure of the earlier ambient-enable gap. Remaining comments reconciled below; verdict is not relabeled AGREE. |
| Fable claude-fable-5-1, max | DEGRADED / empty | No assistant response to the full request. Native stock adapter reclaimed at 303.6 seconds after 287.3 seconds without recorded progress. |
| Gemini gemini-3.8-flash, high | ERROR / empty | Native stream parse_error before any parsed terminal result; no timeout. One same-input focused follow-up also returned ERROR / parse_error. |

The full Fable provider input was 54686 bytes. Its 76349-byte final transcript
matched native cleanup exactly:
`b6b556d6f5a515541b522f2556a8f5bf97cda3c3fbb832d4982334f71660b396`.
The observer counted one bound user event and no assistant blocks or synthetic
API-error events. No answer can be recovered from that session. Cleanup and
quiescence passed. Small-request success plus larger-request silence does not
distinguish long inference from client/service failure, nor prove quota or
login contention. No coordinator killed, nudged or substituted a reviewer.

The standalone Gemini follow-up retained the same exact bundle and brief;
no other seat was restarted. It ended in 106.84 seconds, child return code 0,
parse_error, zero collected terminal results and verified quiescence. The
native result remained ERROR; its raw stream is represented only by native
digest/length. Evidence: `reviews/GUARD-plan-round7-gemini-followup.json`.

### Grok Reconciliation

| Comment | Coordinator assessment |
| --- | --- |
| Hosted destructive-fixture topology | Retain as an SL-0 implementation check, not proof that the plan is impossible. The owned prepare-test-postgres.mjs launcher and tests/guard files already cover separate destructive instances; the full hosted gate must execute their required IDs and may not substitute mocks or the shared cluster. GitHub's Ubuntu 24.04 runner inventory lists Docker client/server. Selecting the launcher-backed mechanism on that hosted runner is within existing ownership; SL-2 must prove it actually ran. |
| Acquire-signature/query read-only falsifiers | Existing missing-function setup negatives, signature-only acquire inspection, prohibition on acquire execution and read-only query requirement jointly cover these obligations. SL-0 must bind the relevant required-case IDs and assert zero acquire invocation; no runtime behavior or ownership change is adopted. |
| Enablement variable and dispatch input names | Internal setting/input names remain SL-0-owned implementation details, not an externally consumed API. SL-0 must name them before its tests, preserve plain-test rejection of ambient enablement and default-dry-run dispatch, and test the implemented names. No current command contract, scope or user authorization is changed by naming them. |
| Semicolon warning, bounded smoke excerpt and pending receipt | Retain the documented validation warning and supplied-source limitation. SL-2 no_doc_delta is already reconciled with SL-1-owned docs. No approval, acceptance or additional source proof is inferred. |

Hosted tool inventory source (read 2026-09-14, image 20260907.300.1):
[GitHub Ubuntu 24.04 runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).
This is tool availability evidence, not observed CI or database execution.

The original TRIAGE structural command was rerun successfully: 55 findings,
28 N/Q cases, four cross-cutting cases, six negative controls and eight valid
roadmap phases. The existing fab_gate import warning remains; successful
structural validation is not FAB closeout or TRIAGE phase acceptance.

### Gemini Diagnostic Follow-up

After the two native parse errors, one diagnostic attempt observed the
unchanged native parser's return tuple before higher-level result reduction.
The observer called the original parser once and returned that exact result;
it changed no parser rule, provider route, result status, liveness policy or
installed file. It retained only native return code, whitelisted reason
category and existing stream metadata, not raw stream or thinking content.
Its exact entrypoint is archived as source evidence, not a runnable script
from its archive location:
`reviews/GUARD-plan-round7-gemini-diagnostic.py` (SHA-256
`81daa49127c5be6327cf01dcfe59e088d71e086cdb0359b9cceed42b68305cbb`).

This request succeeded in 178.62 seconds: native OK / AGREE, accepted stream
ingestion with two results, complete supplied-input/end-marker coverage,
unchanged inputs and verified quiescence. Evidence:
`reviews/GUARD-plan-round7-gemini-diagnostic.json`.
The successful stream did not reproduce the rejection, so the earlier parser
failures remain unexplained; no parser fix or upgrade is claimed.

Native provider input SHA-256 is identical across round 7 and both Gemini
follow-ups:
`8968d8b1b582d16415476909603a7eab2bad050205823bcdbe7b43c1b0c76516`.
Bundle and brief digests also match exactly. This usable Gemini assessment
therefore supplements the same frozen candidate, without restarting Codex
or Grok and without converting either failed Gemini attempt into approval.

Gemini found no blocking correction. Its expansive description of a
"leak-proof" gate is not adopted as an implementation claim; all SQL,
isolation, artifact and CI tests are still future evidence obligations.
Directory shorthand in the review does not override the plan's explicit
public package names or distinction between stub falsifiers and hosted
rehearsal. No plan or receipt changes follow from this review.

## Current Decision

Three usable current-input seats are retained: Codex AGREE, Gemini AGREE and
Grok PARTIALLY AGREE with the dispositions above. The substantive plan/receipt
and roadmap remain unchanged. **The required Fable full-input review is still
missing, so neither plan-panel acceptance nor TRIAGE acceptance is recorded.**

The maintainer has been asked whether to permit a temporary diagnostic
15-minute Fable quiet window with a 20-minute maximum, retaining the same
subscription TUI, model, isolation and review requirements. No approval has
been received and no such override was used. An approval would authorize a
bounded diagnostic follow-up only, not a production runtime fix, skipped
review or phase acceptance. Preserve this exact bundle/brief and the three
usable seats; do not restart the full board merely to retry Fable.

No product source, package version, plan, acceptance receipt or historical
runner state changed in this continuation. No product build/test, database,
migration, implementation, merge, release or prune occurred. The live
structural recheck and diagnostic availability are not substitutes for the
missing review. Agent Harness remains tooling, not an npm runtime dependency.

## Approved Bounded Retry: 2026-09-14

The maintainer subsequently said "Approved for bound fable retry". This
supersedes the pending-approval status above, not the review gate. The approved
diagnostic profile is a 900-second quiet window and 1200-second maximum for
only claude-fable-5-1 at max effort through the same subscription TUI.

The first entrypoint wrapped the TUI function for transcript observation. The
native invoker refused before launch with UNAVAILABLE and
`unbound_review_execution_replacement_refused`. Its unchanged native result is
archived in `reviews/GUARD-fable-bounded-retry-20260914-prelaunch-refusal.json`.
The rejected entrypoint is retained privately with that run. No guard was
disabled or relabeled to get past this refusal.

The corrected entrypoint retains the production execution functions and only
overrides the process-local broker silence threshold/profile, with an explicit
1200-second per-leg timeout. Source is archived in
`reviews/GUARD-fable-bounded-retry-20260914.py`. It staged the unchanged archived
bundle/brief, but the launcher exited 143 before returning a native result.
The cause/sender of the signal is unknown. Retained scratch contains the staged
inputs and broker allocation, but no correlated Claude transcript or provider
execution evidence was found. Provider launch and consumption of the proposed
timing profile are therefore unproven; this is not a Fable timeout, refusal,
review vote, or production liveness diagnosis. No coordinator kill was issued.
Native cleanup completion is also unproven. Private scratch was preserved;
host-probe contents were not read or copied into public evidence.

Installed `panel_invoker.py` remains SHA256
`74ffe98271b41ccb72e59e5eb32e7a891f7e1cee32c34f9da47910f29c7d3016`.
Plan and TRIAGE receipt hashes are unchanged. The other three seats were not
restarted. The exact-input Fable review remains missing; investigate the
launcher termination before another provider attempt. No phase acceptance,
product implementation, merge or publication follows from this diagnostic.

## Fable Recovery and Amendment (2026-09-15)

The approved focused retry completed through the previously validated native
r58 subscription-TUI diagnostic instrument, with no execution-function
replacement and no other seat restarted. Native result: OK, usable,
PARTIALLY AGREE in 512.8 seconds. Exact 54686-byte provider input SHA256:
8968d8b1b582d16415476909603a7eab2bad050205823bcdbe7b43c1b0c76516.
All three input/end markers and S1-S9 were acknowledged. The final transcript
hash matches retained forensic bytes and cleanup evidence; the child and
broker are quiescent, and no provider cancellation was requested. The 900-second
quiet/1200-second maximum profile was diagnostic only. This establishes the
missing review, not a production liveness fix or GUARD acceptance.

The earlier exit143 sender remains unknown. Before the new request, privileged
read-only process inspection found no references to either old scratch root;
the targeted journal scan found no associated OOM/kill entry. The corrected
native instrument provides its own evidence capture; no rejected wrapper or
guard override was reused. The live publisher is separately qualified merged
agent-harness main, not this review-only instrument.

| Fable finding | Reconciliation |
| --- | --- |
| 1: hosted destructive controls versus shared workflow service | Material clarification adopted. Destructive controls own separate Docker instances on hosted runners too. Explicit github-service mode, workflow-owned container/port identity and named synthetic installer tuple are frozen; local mode ignores ambient fixture fields. |
| 2: broader source inventory before SL-0 | Completed AST inventory of all 213 tracked package source files (all .ts), including tests and static/literal dynamic/type-query/reference forms. Exactly three CASE-HY-6 edges; no tsconfig aliases. One computed require has a fixed external @consiliency/contract prefix, not a relative source edge. This is inventory, not evasion-proof runtime enforcement. |
| 3: live opt-in/credential leakage and skip set | Material requirement adopted. All GUARD/test children use a tested noncredentialed allowlist, strip live/provider settings, and reject unexpected skips/todos. The exact documented live case is the only full-root skip; focused subsets permit none. Separate explicit live-smoke usage remains outside GUARD. |
| 4: replace manifest and tarball together | Adopted. The producing job emits artifact_manifest_sha256 outside the artifact; consumers compare it before tarball checks. A replaced internally consistent pair is a required negative control. This does not claim protection against compromise of the producing job itself. |
| 5: cold pull versus readiness bound | Adopted. Separate 300-second image-pull budget before local/destructive creation; readiness starts afterward. Hosted shared service follows runner image setup. |
| 6: criterion recording exception and dated verification | Receipt contract now permits one exact before/after EC-TRIAGE-3 suffix transition only. External acceptance binding must carry those strings, dated structural run, actual matrix/roadmap hashes and inventory digest. Receipt remains pending; no binding is fabricated. |
| 7: workflow ownership and SQL receipt path | Inventory confirms publish.yml is the only current workflow and contains all three helper calls. Producer writes .phase-loop/guard/<run-id>/sql-setup.json; parent alone retains the final plans/evidence record. Recheck inventory before execution. |
| 8: explicit membership options and merge commit evidence | Adopted ADMIN FALSE, INHERIT FALSE, SET TRUE plus attribute assertions. SL-2 records strictness and post-merge main verification for the actual merged SHA. PostgreSQL 17 GRANT option semantics checked against official documentation; no SQL execution claimed. |

Inventory: `reviews/GUARD-pre-SL0-inventory-20260915.json`.
Fable response and sanitized native binding:
`reviews/GUARD-fable-native-followup-20260915.json`.
PostgreSQL reference: https://www.postgresql.org/docs/17/sql-grant.html

These are material plan/receipt amendments, not recording-only acceptance.
All earlier votes remain historical. A fresh exact-candidate four-seat panel
is required before TRIAGE acceptance or GUARD execution. No product source,
migration, runtime state, version, merge or npm publication changed here.

## Round 8 Reconciliation (2026-09-15)

Four native usable reviews completed: Codex and Gemini AGREE; Grok and Fable
PARTIALLY AGREE. All reviewed the same frozen working-tree candidate. Their
results remain historical after this material amendment. No TRIAGE or GUARD
acceptance is inferred. Sanitized binding: reviews/GUARD-plan-round8.json.

Review churn diagnosis: the bounded packet omitted the computed loader and
full publication workflow, leaving concrete interface decisions implicit.
Keep the existing roadmap and reconcile these requests together; the next
packet adds actual source, not another roadmap or speculative runtime work.

| Finding | Disposition |
| --- | --- |
| Grok 1 / Fable 1: computed loaders and evasion forms | Adopted with a narrower exception than a generic external-prefix allowlist: only the existing contract-loader call and createRequire binding are exempt, pinned by source location and AST shape. New or modified computed calls fail. Literal require/import-equals, maps, symlinks and unsupported forms have explicit controls. No unowned runtime repair. |
| Grok 2: OIDC scope | Explicitly job-level id-token:write on publication only; never workflow-level or inherited by verify/rehearsal. |
| Fable 2: helper digest input | Verified-artifact mode requires --expected-manifest-sha256 and checks it before entries or registry operations, including existing-version skips. Pair replacement tests use that entrypoint. Hosted jobs set no NPM_CLI override; local falsifiers retain it. |
| Fable 3: dispatch publication ref | Dispatch publish requires the default-branch ref and github.ref_protected=true before the id-token job starts. Release-published routing stays unchanged. Branch protection is maintainer-owned and independently checked at SL-2. |
| Fable 4: inventory base | Both base and HEAD packages trees equal ba300e481e74180ed581ab8c7b0ebebab1644eb1. New dated inventory additionally checks working bytes against HEAD and records helper/smoke hashes; previous inventory is preserved. |
| Fable 5: fixture binding and live route | Do not weaken loopback admission to client-host-only. Explicitly configure Docker HostIp=127.0.0.1 in hosted service mapping and test metadata. Direct pnpm exec vitest run of the live-smoke file survives outside GUARD; docs/omnigent-live-smoke.md is explicitly added to SL-1 ownership. |
| Fable 6: required case mapping | Separate setup/integration IDs and file selectors. test:guard and verify require both partitions; test:integration only integration, never destructive setup controls. |
| Fable 7: recording precision | Phase docs_updated via SL-1; SL-2 has no additional delta. Fix the sentence fragment. New parent-owned inventory filenames preserve prior reviewed bytes; external binding includes helper/smoke hashes. |

All other controls identified by the reviewers remain implementation obligations,
not missing plan scope and not executed evidence. No product, migration, version,
publication, or live database behavior has changed in this amendment.

## Round 9 Acceptance (2026-09-15)

All four native seats returned usable AGREE on plan b84275af and the exact
pending TRIAGE receipt; full input digests are authoritative in the panel record.
The exact result, all six input digests and source hashes are retained in
reviews/GUARD-plan-round9.json. Provider input digests agree across seats;
staged bundle/instruction bindings, Fable retained transcript bytes, and
quiescence/cleanup were independently checked. No cancellation was requested.

Fable's remaining notes are existing implementation obligations, not new
policy or ownership decisions: name the pack/manifest stage in sequencing
tests; prove direct live opt-in against a closed loopback port while plain
test remains scrubbed; reject stale fixture relations/roles before bootstrap;
pin the loader by path/function/AST rather than line number. SL-1 adds the
live invocation while preserving existing phrase contracts. The planned
.phase-loop output path is ignored through the repository's info/exclude.
The full dispositions are in the panel record. Gemini's word "Closed" means
clarified plan requirements, not closed runtime findings or implemented code.

TRIAGE is now accepted through its reviewed manual recording contract.
TRIAGE-acceptance-binding.json records before/after receipt digests, the exact
six allowed JSON-path changes, fresh structural verification, source comparison,
panel and EC decisions. Only IF-0-TRIAGE-1 is produced. No plan bytes changed
after review. Historical runner state is untouched. GUARD itself is not
implemented or accepted, and no production merge/release is approved by this
planning result.
