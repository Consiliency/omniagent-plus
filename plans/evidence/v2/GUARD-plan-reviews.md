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

## Current Decision

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

## Remaining Review Gate

The final amended plan has not been resubmitted or approved. The required
Fable seat failed twice through its specified adapter despite authenticated
subscription access. The coordinator requested explicit approval for temporary
Opus through the same TUI route; no approval has been received or inferred.
Preserve both incomplete panels. Resume with an available approved Claude
reviewer, fresh four-agent review of current bytes, and reconciliation before
GUARD implementation or merge. Agent-harness#831 is not this product blocker.
