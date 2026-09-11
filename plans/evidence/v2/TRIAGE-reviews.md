# TRIAGE review reconciliation

Scope: planning only. No runtime finding, production-readiness assertion,
publication gate, or release is accepted by this review.

## Round 1

The canonical agent-harness advisor-board runtime completed four usable seats.
Fable used the Claude Code subscription TUI adapter; the active process had a
PTY input. No gateway, native Task replacement, or API-key leg was substituted.
All legs were allowed to finish. Raw review text and precise input hashes are
retained in `reviews/TRIAGE-round-1.json`.

| Seat | Transport result | Review verdict |
| --- | --- | --- |
| Fable 5, correctness, max | OK | PARTIALLY AGREE |
| Grok 4.6, adversarial, max | OK | PARTIALLY AGREE |
| GPT-5.6 Sol, red-team, max | OK | DISAGREE |
| Gemini 3.7 Flash, alternative approach, high | OK | AGREE |

`OK` means a usable response, not approval. Round 1 does not accept TRIAGE.

## Reconciliation

| Feedback | Disposition in revised candidate |
| --- | --- |
| Fable/Grok/Sol: HY-2 has conflicting owners | Amended decision 7: omniagent-plus#20 alone owns the license decision; omniagent-plus#27 consumes it for package implementation. Confirmed against both live issue bodies. |
| Grok: public redaction labels could remain false | Amended TR-1 and decision 1: WIRE must emit truthful stream/history labels and prove them with an independently packed transport consumer. Allowlist projection remains required; docs alone cannot close TR-1. |
| Sol/Fable: retained CoordinationStore defects disappeared | Expanded CASE-SL-8 to cover cross-mode conflicts, overwrite prevention, expired entries and explicit renew/release or unsupported-operation semantics. Removal requires tested consumer migration and removing the export. |
| Sol: health and other CLI/UI paths were not explicitly tested | Expanded decision 1, CASE-CC-5 and CASE-CLI-4 to include health/profile/state/ledger/manifest/coordination paths, JSON/human output, CLI envelopes and UI snapshots. Internal paths remain unchanged; incompatible export changes require explicit versioning. |
| Fable: missing receipt described as already present | Changed the statement to designate the receipt prospectively; no phase closeout until actual acceptance is recorded there. |
| Fable: SL-11 empty-string configuration subclaim lost | Added absent/empty/whitespace configuration and valid synthetic controls, with no invalid-client construction or secret-value disclosure. Preserved event indexing as a separate acceptance item too. |
| Fable: COORD ownership omits state-ledger files | Added coordination.ts and supabase-coordination-channel.ts to COORD key files in the roadmap. |
| Fable: HY-3/HY-5 cases lack concrete controls | Added disposable-log versus retained-evidence ignore checks, floating/awaited promise controls, and bounded stalled-process failure with no child leak. |
| Grok: shared scanner ownership unspecified | Named the existing core-contracts redaction module as owner, with no reverse imports from identity-isolation or state-ledger. |
| Fable: planning tool is external | Recorded the agent-harness-owned installed phase-loop CLI entrypoint; it is not a dependency of the future public-package PR gate. |

No actionable finding is rejected. All material amendments require review of
the revised bytes; neither the transport OK statuses nor this disposition
table transfer approval from the first candidate.

## Limits

Fable and Sol inspected the audit-triage worktree's current source. Grok's local
clone lacked the audit/v2 files, so its inventory verification used the supplied
matrix rather than independently enumerating the original audit. Gemini
reviewed only staged documents. GitHub/offload observations were verified by
the coordinating agent; the reviewers did not independently verify all of
them. Structural inventory checks are not behavioral remediation evidence.

## Round 2

Fable, Grok and Gemini returned AGREE; Sol returned DISAGREE on the new plan's
runner verification wiring. All four returned usable results, retained with
the exact input hashes in `reviews/TRIAGE-round-2.json`. Round 2 does not accept
the phase plan.

Sol's blocker is accepted: the installed runtime discovers bullet-form
backticked verification commands and frontmatter `automation.suite_command`,
not the original fenced shell/YAML blocks. The revised plan uses that format
and owns `verify-triage.mjs`. The script runs exact inventory checks, six
in-memory negative controls, roadmap validation, and both staged/unstaged
whitespace checks. The installed resolver now finds four verification commands
and the suite, with zero intake findings. Independent subprocess probes of
complete, missing-finding and duplicate-case inputs returned 0, 1 and 1.

Minor notes are carried to their owners, not lost or treated as TRIAGE blockers:

- Fable: the roadmap names TRIAGE.json and the plan additionally names this
  reconciliation file. Installed plan validation accepts this evidence-path
  superset with zero warnings; the receipt links the additional evidence.
- Fable: DATA and COORD touch state-ledger at different phases. Their serial
  dependency resolves simultaneous ownership; the DATA phase plan must identify
  shared frozen interfaces and COORD-owned coordination files explicitly.
- Grok: COORD's phase plan must enumerate CLI args/output/runtime/types paths
  for CASE-CLI-4, not only the commands directory (omniagent-plus#23).
- Grok: DATA must test identity-less legacy lock files and fail closed when
  holder/replacement safety cannot be proven (omniagent-plus#22).

## Round 3

Fable, Grok, Sol and Gemini each returned AGREE on the corrected phase plan
and structural checker. Results and exact input hashes are retained in
`reviews/TRIAGE-round-3.json`. The matrix and roadmap bytes are unchanged from
round 2; this round focused on the remaining verification blocker, not another
full review of the remediation program. All round-1 and round-2 blockers are
reconciled. No further blocking plan finding remains.

Sol independently resolved the four commands and suite through the installed
runtime, ran clean intake/plan validation and the full structural suite. Other
seats inspected the plan/checker; their execution and external-state limits
remain in the raw reports. No reviewer result is treated as runtime remediation
or permission to publish. Some reviewers used "committed" when referring to
worktree files: live Git HEAD remains the original roadmap candidate and these
new changes are staged, not committed.

Fable's checker nits are retained as maintenance notes: the negative controls
are deliberately bound to the current inventory, `--inventory-only` includes
its negative controls, and whitespace checks cover staged/unstaged changes,
not historical commits. These limitations are explicit and fail closed.

The bounded plan is execution-ready. Formal TRIAGE acceptance reduction and
landing remain pending; no IF gate, implementation issue closure or release
is claimed by this planning handoff.

## Round 4 (supplemental execution review)

The canonical advisor board was rerun against the current phase-plan bytes
(`1e33ace96bd6a1175e9b57a6a608be679ca7b462da42a460a43c9506a0dd6b8e`).
Grok returned DISAGREE and Codex returned PARTIALLY AGREE because a plan-only
bundle does not itself supply the matrix, reducer, results, or verification
outputs that the plan requires. Gemini returned AGREE with that same scope
limitation. Fable's Claude Code subscription TUI reported a spend limit and is
DEGRADED, not an approval. The metadata-only record is
`reviews/TRIAGE-round-4.json`.

This is preserved as a supplemental, non-approval review. It identifies no
material defect in the plan or a correction to the matrix, roadmap, plan, or
checker. It does not supersede the binding round-2 matrix/roadmap review or
round-3 plan/checker review: their input hashes match the current bytes, and
their reconciled actionable feedback remains closed. The fresh structural
suite and roadmap validation were run by the executor; their results are
separate from advisor approval.

## Round 5 (complete-artifact review with Opus)

The user authorized replacing Fable with Opus for now. The canonical board
replaced only the Claude model with `claude-opus-5`; Grok 4.6, GPT-6 Astra and
Gemini 3.8 Flash were unchanged. Shared model defaults were not edited. Opus
used the homebrew Claude Code subscription TUI adapter; the live process's
stdin resolved to `/dev/pts/8`. No native-agent, gateway or API route replaced
it. The operator did not terminate a reviewer or retry the refusal.

The bundle staged the original audit, matrix, roadmap, plan, checker, local
receipt, reconciliation, latest handoff and canonical runner state. All ten
input/brief hashes were unchanged during review. Full returned text and
hashes are retained in `reviews/TRIAGE-round-5.json`.

| Seat | Transport result | Review verdict |
| --- | --- | --- |
| Opus 5, correctness, max | DEGRADED: provider refusal | No usable review |
| Grok 4.6, adversarial, max | OK | PARTIALLY AGREE |
| GPT-6 Astra, red-team, max | OK | AGREE |
| Gemini 3.8 Flash, alternative approach, high | OK | AGREE |

Claude Code returned a provider safeguard message with `reasoning_extraction`;
the adapter ultimately reported `claude_tui_stalled`. This is unavailable
review evidence, not approval or permission to change routes or prompts to
evade the refusal. Three usable results do not establish four-seat acceptance.

### Round-5 dispositions

| Feedback | Disposition |
| --- | --- |
| Grok medium; Gemini low: ambiguous final acceptance flag | Accepted. The legacy `final_candidate_accepted` is false, explicit `plan_review_accepted` is false for the amended candidate, and EC-TRIAGE-1 now distinguishes structural proof from pending disposition review. The current handoff records no accepted IF output and no runner verification artifact. |
| Grok low: CASE-CC-4 does not name owned input boundaries | Accepted and amended. Source inspection confirmed `parseCliArgs` uses strict Node argument parsing, while `buildHandoffPacket` is public. The case names CLI argv including route-task as the typo-rejection surface and preserves existing public builder/schema/wire unknown-field behavior absent a separately reviewed versioned change. No runtime source changed. |
| Gemini low: roadmap/plan evidence-path symmetry | No change required. The phase plan's paths are a superset, TRIAGE.json links this reconciliation, and installed validation accepted the plan with zero warnings. No evidence is missing; exact textual symmetry is not an acceptance requirement. |
| Codex P2: GUARD import enforcement precedes PREP's ID-1 repair | Deferred explicitly to GUARD phase planning, before enabling the rule: move the minimum ID-1 fix forward with ownership recorded, or review a precisely bounded temporary baseline that rejects new escapes and is removed by PREP. No broad exemption or failing full gate is authorized here. |
| Grok/Gemini: future implementation and external-state evidence limits | Retained with phase owners. DATA owns exported-path compatibility and recovery freezes; COORD inventories external CoordinationStore consumers and owns CLI boundary files; WIRE/INTEG own packed-consumer and supervision proofs. Reviewers did not run tests, inspect current runtime source, or verify live issue bodies/hashes. Coordinating-agent observations remain separately attributed. |

The matrix amendment invalidates reuse of its earlier approval for current
bytes. The roadmap, plan and checker themselves remain unchanged, but this
current package is not accepted. A follow-up review must assess the amended
candidate and resolve the missing Opus seat through supported governance;
there is no automatic refusal retry. Structural checks are still independent
from content review. TRIAGE closeout, IF-0-TRIAGE-1, GUARD and publication remain
pending. The historical execution-ready statements above apply to their
recorded hashes, not this amended candidate.

## Round 6 (Fable restored, 2026-09-11)

At the user's request after reported availability recovery, the fresh canonical
board restored Fable 5.1 through the Claude Code subscription TUI adapter.
The process had `/dev/pts/11` as stdin and delivered a full usable review.
All four seats completed without operator termination. Fable, Grok and Codex
(GPT-6 Astra) returned PARTIALLY AGREE; Gemini returned AGREE. Full results and
unchanged-during-review hashes are in `reviews/TRIAGE-round-6.json`. This
proves Fable availability, not acceptance of the candidate or earlier Opus
refusal. The current OpenAI seat is labeled Codex; historical GPT-5.6 Sol and
GPT-6 Astra model names in raw records remain accurate provenance.

### Round-6 dispositions

| Feedback | Disposition in resubmitted candidate |
| --- | --- |
| Fable/Grok: CASE-CC-4 CLI control has DATA ownership | Accepted. DATA's case retains public schema/type and unknown-field compatibility obligations. CASE-CLI-4 and EC-COORD-5 now bind the existing CLI unknown-option regression control to COORD/omniagent-plus#23; COORD's key files name args.ts, runtime.ts and types.ts. |
| Fable/Grok: GUARD/ID-1 sequencing exists only in reconciliation | Accepted. HY-6, CASE-HY-6, ID-1 and GUARD scope notes now require the recorded forward-fix or exact existing-edge baseline decision before enabling enforcement. New/altered escapes fail and PREP removes any baseline; no broad exception or failed full gate is permitted. |
| Fable: WL-2 allows bypass of independent holder proof | Accepted. Decision 3 explicitly governs all destructive cleanup paths, including operator actions; independent evidence and path/liveness checks remain mandatory. |
| Codex: CASE-CC-7 has no expected message disposition | Accepted. Preserve the existing public schema's string acceptance including empty/whitespace and multibyte strings over metadata limits, reject missing/non-string values, and require a reviewed versioned change for a new common bound. Metadata limits do not establish provider request limits, and schema acceptance is not provider admission. Redacted-text bounds remain a separate test family. |
| Codex: TR-5 omits whitespace preservation | Accepted. Matrix TR-5 and EC-WIRE-1 require preserving trailing/additional leading spaces, stripping only one optional space after the data colon, and testing split-chunk equivalence. This restores the original audit subclaim without claiming a runtime fix. |
| Fable: machine-readable receipt and handoff staleness | Accepted. The unchanged-input boolean is false, historical approval reuse is denied, current EC-TRIAGE-3 references the fresh Fable board, the restoration has a recorded timestamp, and hashes cover rounds 4 through 6. Current handoff replaces obsolete Opus instructions; old dated handoffs remain history. |
| Fable: section-6 doc claim ownership and dated publication language | Clarified. GUARD's docs lane must map every section-6 claim to its finding/phase owner with truthful interim wording. Decision 7 dates the old partition block and directs landing to the current recovery receipt; the TRIAGE plan now makes the same distinction. |
| All reviewers: unavailable execution, source and staging evidence | Retained as limits. The coordinator inspected the named source boundaries and verifies hashes/staging separately. Reviewers assessed supplied text, not current runtime behavior. The Sep-10 canonical runner snapshot is authoritative for its pending closeout status, but not a current staging inventory. No local handoff supersedes runner-owned phase acceptance. |

All changed matrix/roadmap/plan bytes require round-7 review. The phase plan's
roadmap hash is updated; canonical runner state is not edited to manufacture
an acceptance event. Local structural verification, content review, governed
phase acceptance and publication remain separate. Earlier sections describe
their historical snapshots, not current approval or current model selection.

## Round 7 (corrected candidate)

All four seats delivered again, with Fable 5.1 using the same verified
subscription TUI route (`/dev/pts/11`). Codex and Gemini returned AGREE;
Fable and Grok returned PARTIALLY AGREE. Input bytes stayed unchanged during
review. Raw results and hashes are in `reviews/TRIAGE-round-7.json`; no verdict
is promoted to unanimous agreement or governed acceptance.

### Round-7 dispositions

| Feedback | Local correction / disposition, not yet re-reviewed |
| --- | --- |
| Fable: CASE-3.3 consolidation has no executable owner | Clarified. DATA's shared scanner remains mandatory under decision 1/EC-DATA-1. Broader locks/readers/atomic-writer, RPC-wrapper, transport-helper and copied-enum consolidation is explicitly deferred to DATA, COORD, WIRE and PREP respectively until caller inventory and measured complexity justify it. Their correctness cases, conformance and ID-1 repair remain mandatory; no broad refactor is an exit criterion. |
| Fable: identity-less locks have no recovery disposition | Accepted the conservative option. SL-2 and decision 2 explicitly leave unprovable locks blocked with bounded diagnostics and preserved bytes. Manual deletion and operator break-lock are unsupported; no new recovery authority is introduced. |
| Fable: dead-holder recovery lacks substitute evidence | Clarified. Decision 3 and CASE-WL-5 permit metadata-only recovery under CASE-WL-3 absence/registration checks, never filesystem deletion or conflicting takeover. Existing paths without independent holder evidence remain blocked. |
| Fable: persisted-schema compatibility omitted | Accepted. CASE-CC-4 now preserves current unknown-field behavior for ledger, manifest and registry schemas absent a reviewed versioned migration. Existing structure/version/content checks are not weakened. |
| Fable/Grok: ID-1 forward-fix file ownership ambiguous | Resolved by selecting the exact existing-edge baseline as the default. Source inspection confirms the two type-only OmnigentProviderMode imports; CASE-HY-6 names both source files, symbol and target. PREP/omniagent-plus#27 owns their correction and baseline removal. Moving repair into GUARD would require a separate reviewed ownership amendment; this plan authorizes no such source edit. |
| Fable/Grok: timestamp and receipt hash binding incomplete | Accepted. Historical authoring observations are explicitly labeled; fresh structural verification is separately timestamped and bound to current candidate hashes. The receipt additionally pins this reconciliation and the review brief. |
| Fable: manifest ownership and Gemini provenance | The entry was appended by codex-plan-phase; codex-execute-phase's control layer later recorded its Sep-10 executing lifecycle transition outside SL-0 file ownership. Both predate the Sep-11 resumption, which did not edit the manifest. This corrects the earlier overbroad denial of any execution write. Historical Gemini 3.7 Flash and current Gemini 3.8 Flash retain their raw seat identities. |
| Fable: PostgreSQL probe topology unspecified | Accepted. Decision 6 and GUARD scope require a version-pinned disposable PostgreSQL service for COORD integration probes in the hosted full gate; unavailable setup fails instead of silently skipping. |

No runtime behavior is fixed by these amendments. The final matrix, roadmap
and plan require follow-up review; plan_review_accepted remains false and no
IF gate is produced. The current evidence reducer and handoff summarize the
outcome but do not retroactively alter either board's input hashes. Reviewer
claims about live infrastructure remain limited to the supplied text: the
coordinator's live check found agent-harness#819 OPEN, not a permanent loss of
normal closeout enforcement. Publication remains held separately.

## Round 8 (2026-09-11)

All four canonical seats delivered without operator termination. Fable 5.1
used the verified subscription self-PTY. Grok, Codex and Gemini returned AGREE;
Fable returned PARTIALLY AGREE. Full inputs and results are preserved in
reviews/TRIAGE-round-8.json. Input and staged-diff hashes stayed unchanged.

| Feedback | Disposition for resubmission |
| --- | --- |
| Fable medium: worktree lock/writer repairs lost under consolidation deferral | Accepted. Decision 3 and EC-COORD-3/4 require DATA-equivalent ownership, initialized identity, replacement-race and sync-ordering cases for worktree locks.ts and lease-manager.ts. COORD may adopt the shared primitive or retain its helper; only consolidation is optional. |
| Fable medium: acquisition crash creates unprovable new lock; read behavior ambiguous | Accepted. Decision 2/EC-DATA-2 require atomic initialized-identity publication and fault controls. Decision 2/EC-DATA-3 require bounded stable lock-free reads, explicit incomplete/in-progress tails, no repair or mixed-snapshot success, and committed-data inspection despite a blocked writer lock. DATA planning freezes the exact API and algorithm. |
| Fable medium: plain PostgreSQL cannot apply Supabase role grants or prove RPC wrappers | Accepted. Source confirms anon/authenticated/service_role grants. GUARD's positive control creates those disposable roles, connects, applies the existing migration unmodified with SQL error-stop and checks an installed function; unavailable service/migration fails. COORD planning separately chooses and tests the RPC harness. SQL-only/mocked mapping evidence is not hosted Supabase proof. |
| Fable low: recovery post-state unspecified | Accepted. CASE-WL-3/decision 3 name released/releasedAt, active-map removal and durable WL-4 transition. Registry collision clears, but normal future acquisition checks remain; Git metadata is not pruned and stale registration can still block acquisition. |
| Fable low: manifest execution attribution | Corrected here and in TRIAGE.json. The plan-authoring append and Sep-10 executor-control lifecycle transition are distinct pre-existing writes; neither was changed in this Sep-11 resumption. |
| All seats: source and live-evidence limits | Coordinator rechecked parseCliArgs at args.ts:408, both ID-1 imports, worktree lock create/write and lease released-state code, migration role grants, all open issue bodies and the empty runtime diff. Structural suite and plan validation pass. Reviewers did not execute those probes. Historical runner ownership buckets remain a closeout concern, not fabricated phase acceptance. |

The matrix/roadmap/plan amendments require a fresh exact-input review. All
runtime finding issues and IF-0-TRIAGE-1 remain open. The user's Sep-11 request
authorizes review, merge, issue updates and safe pruning, but no registry release,
authority bypass, or false phase closeout. Earlier publication holds describe
their historical attempts; the supported broker path must prove any new push.

## Round 9: documentation review reconciled

Round 9 delivered four usable reviews on unchanged inputs. Fable, Codex and
Gemini returned AGREE; Grok returned PARTIALLY AGREE. This is not unanimous
agreement. Fable used the subscription self-PTY at /dev/pts/13, with no fallback
or operator termination. Full responses and hashes are in
reviews/TRIAGE-round-9.json.

| Feedback | Coordinator disposition and remaining owner |
| --- | --- |
| Grok medium: worktree-query outcome under blocked locks | Reconciled by retaining alternative (b), the existing bounded fail-closed query behavior, under decision 3's unprovable-lock policy and the roadmap's compatibility default. Source confirms LocalLeaseStore.query -> withLeaseLock -> withFilesystemLock with a finite timeout. Only decision 2/EC-DATA-3 promises lock-free ledger inspection; it is not a global lease-store guarantee. COORD/omniagent-plus#24 must prove blocked-query negative and unlocked-query positive controls, bounded sanitized failure, no empty-success fallback and no business-state mutation. No new snapshot algorithm or runtime policy is introduced; no content blocker remains. |
| Grok low: Git registration checks could block metadata reconciliation | Decision 3 already says that leftover registration can block later acquisition. The checks inspect path/identity conflicts; stale registration alone is not a requirement to refuse the missing-path metadata transition. COORD/omniagent-plus#24 retains that explicit test case. No Git pruning or bypass is introduced. |
| Grok low: local versus hosted PostgreSQL wording | Decision 6 is the authoritative topology: a disposable service usable locally or on a hosted runner. This is not a hosted production Supabase claim. No competing backend requirement is created. |
| Fable low: SL-2/3 worktree subclaim issue linkage | Carry the explicit cross-reference into omniagent-plus#22 and omniagent-plus#24. The former remains primary owner of the IDs, but must not close their worktree subclaims before COORD's EC-COORD-3/4 proof. No duplicate finding owner or new issue is needed. |
| Fable low: recovery cause/actor attribution | DATA/omniagent-plus#22 freezes bounded cause/actor provenance in the release-record shape; COORD/omniagent-plus#24 and INTEG/omniagent-plus#26 prove that metadata recovery is not misattributed as holder release in replay/UI. Keep released status compatibility and metadata-only policy. This is a detailed-phase evidence obligation, not completed remediation. |
| Fable low: test roles, privilege boundary and future migrations | GUARD/omniagent-plus#20 must pin role attributes, installer versus test caller, and ordered application of all migration files; COORD tests client-visible role/permission behavior. The migration uses SECURITY DEFINER, so the claim that a plain service_role necessarily denies every RPC row is not established by grants alone. Do not add production policies or use superuser results as service-role/RLS proof. These are explicit GUARD/COORD plan inputs, not changes to production migrations here. |
| Remaining source/evidence questions | Coordinator confirmed parseCliArgs exists, the provider-mode type is not exported from transport index.ts (PREP/omniagent-plus#27 must own any export), all live issue owners, all candidate hashes, and an empty runtime diff. Cross-container PID/liveness ambiguity stays fail-closed and must be resolved by DATA's detailed tests. The stale runner snapshot remains a separate closeout concern. |

Disposition: documentation content is ready to land after the exact-candidate
publication checks. Matrix, roadmap, phase plan and checker bytes are unchanged
from round 9. Subsequent changes only record this review, refresh evidence
bindings and update the handoff; they are not retroactively part of the board's
input. Nonblocking follow-ups remain in their owning issue comments before
implementation. No runtime finding, IF gate or phase acceptance is claimed.
