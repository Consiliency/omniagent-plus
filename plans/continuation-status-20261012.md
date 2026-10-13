# Continuation snapshot: October 12, 2026

Snapshot as of October 12, 2026, approximately 23:59 UTC. This is historical evidence, not current readiness. Recheck live repository, PR, reviewer and quota state before using its saved inputs or recovery commands. Read it alongside the [original handoff](continuation-handoff-20261011.md), [proposal](sandbox-reuse-proposal-20261011.md) and [continuation research record](evidence/research/sandbox-reuse-continuation-20261011.json). The original five handoff/research/proposal files remain byte-for-byte preserved.

## Errata and supersession for preserved inputs

The original handoff's final paragraph refers to a September 25 handoff "linked earlier." It contains no such link or target; that handoff is historical and absent from current main. This note corrects the reference without rewriting the preserved input.

At this snapshot's check, the continuation research record's October 11 observations were superseded as follows: agent-harness#1489 had merged; the owner selected Gemini 3.8 Flash (High) after Gemini 3.1 Pro disappeared from the live catalog; and actual Opus attempts hit the October 12 five-hour limit despite earlier successful availability checks. Earlier proposal reviews and their model identities remain historical approvals of their original inputs. None of these observations establishes later availability or approval.

## Owner instructions still in force

The owner authorized continuing the recommended sequence and explicitly selected available **Gemini 3.8 Flash (High)** when Gemini 3.1 Pro disappeared from the installed subscription CLI catalog. Record the model change and retain manual tools-enabled `agy` review using live model ID `gemini-3.8-flash-high`. This changes only that reviewer model; confinement qualification, roster, authentication, architecture and acceptance requirements remain.

Required roster: two Astra max and two gpt-5.6 Sol max harness reviewers with distinct lenses; separate native independent reviewer; manual tools-enabled Gemini and first-party subscription Opus 5.5 max through the qualified self-PTY TUI adapter; additional Fable-only Opus president. No worker implementation delegation. Every role must finish before fixing; unavailable, degraded or interrupted output is not approval. The three-round checkpoint diagnoses scope and inputs and never waives acceptance. Actual-source implementation CR, independent approval, president and required checks precede merge, followed by postmerge verification and eligible cleanup/issue closure. No packages are published or services deployed by this continuation.

## Work recorded at the snapshot check

| Work | Saved state as of the check | Next gate as of the check |
| --- | --- | --- |
| Sandbox reuse proposal | [omniagent-plus#35](https://github.com/Consiliency/omniagent-plus/pull/35), draft. Original proposal SHA256 `9411887504d0fadbcb2764f2247f3e1a2088971a40040d74b6913cb1c5c44961`. All seven proposal reviews and Fable-only president reconciled the proposal only. | Whole-PR review and merge remained open; no architecture, dependency or implementation adoption inferred. |
| Driver prerequisite | [agent-harness#1556](https://github.com/Consiliency/agent-harness/pull/1556), draft for agent-harness#1504. Plan review input `4b50b789f878a1c4107b03edfe73f162b47dc149`; plan SHA256 `46b6c610a5db14f8b84f9e2258d72719813417193b19c973be350c1fe7624a63`. Six fresh AGREE; receipt commit `40280c1b` is later metadata. | Required manual Opus review and Fable-only president; then authorized serial implementation and full implementation gates. |
| WIRE | [omniagent-plus#33](https://github.com/Consiliency/omniagent-plus/pull/33), draft. Fresh review input `230ce79b011067f627c3f975eab38c094ef21f17`; plan SHA256 `f6a23f830b95b3d29b0388f7216c424531b157eb9e4d813ac2906ac086144d24`. Six fresh AGREE; receipt commit `0bb782b` is later metadata. | Required manual Opus review and Fable-only president; then serial lanes, full CR/verification/producer audit and IF/EC gates. |
| SSH | Private preparation record and metadata-only strict-host-key access check to the SSH candidate. No remote installation/source or live workload. | Verified driver, then separately reviewed backend/qualification plan with flag off; reconnect; real placed Claude; subordinate-uid Codex/Grok; cloud later. |

At the snapshot check, both active plans had **no implementation started and no production source changed**. The six fresh AGREE reports in each case came from four owner harness seats, the separate independent reviewer and manual Gemini. These are plan-sufficiency opinions, not full plan authorization or test, phase or merge proof. Recheck the linked PRs for subsequent work.

## External blocker observed on October 12

Actual Opus calls at that check were rejected with HTTP 429, `usage_limit_reached`, a five-hour subscription limit, and overage rejected/org-level disabled. Reported reset: **2026-10-13 at 00:50 UTC = October 12 at 8:50 p.m. EDT**. This records the observed rejection and reported reset, not evidence of a current outage. It is separate from the historical October 6 weekly outage. A successful first-party authentication/tool probe does not establish quota availability; readiness requires the actual required review.

The qualified adapter returned `claude_tui_stalled` and `review_written=true` for captured API-error text, but no actual requested report file existed. Those attempts are explicitly unusable. Do not count text or exit metadata without the actual output file and successful qualified transport. No weaker model, API/SDK, T3 Claude adapter or president fallback is authorized. Gemini's owner-authorized change does not waive Opus.

Cancelled/restarted attempts were retained separately. All available driver and WIRE reviews at the check finished and were preserved before waiting-only wrappers were stopped. No active reviewer was cancelled to revise a plan. No incomplete background job is expected to report approval.

## Driver checkpoint and verification as of the check

The first driver round found false reachability evidence when the dispatcher exhausted workers; the second found a frozen C7 class/code mismatch. The third plan checks worker readiness at the final START local check before probe/lease, translates cap/startup failure to `failed_locally` / `sandbox_placement_refused`, and keeps operation-timeout for later bounded calls, including execute-answer waiting. It changes no ladder table, oracle, ordering, criterion or scope. Six reviewers agreed at the check. No additional execute-answer reservation is proposed; G7 still required a president ruling.

The four agent-harness#1504 obligations remain bounded sealing, four live workers per call group including abandoned workers, result type/byte cap before parsing/completion, and typed lexically saturated placement-duration inputs. Context propagation is each immediate submitting caller, not root context across heartbeat threads. Cleanup exhaustion keeps fenced evidence.

Existing unmodified driver baseline: 85 tests passed on isolated Python 3.10.21. This does not prove the proposed hardening. Meaningful controls, mutations, all ladder orderings, regression inventories/lint, actual-source CR and hosted checks were still required. agent-harness#1502 and agent-harness#1506 remained separately open; agent-harness#1489 had merged. The unrelated Python-floor agent-harness#1549 remained open; recheck CI lanes if it lands.

## Upstream and WIRE boundaries at the check

Latest stable observed: Omnigent `v0.17.0` (October 6), T3 `v0.0.45` (October 2). Development main heads observed were Omnigent `85811cb2321cb665b3987187921dbef62e5b20e3` and T3 `ffb4af8d5d4fcfc5e9322295ff846a6d1e7ffbf8`; they are not adopted or qualified inputs. Omnigent's mapped sandbox/reaper/egress/credential-proxy paths had no delta from the original research main pin to that checked main. Stable qualification claims remain limited to the recorded assessment.

WIRE's pinned comparison of `v0.16.0` to `v0.17.0` is assessment-only. Default `v0.12` and optional `v0.15`/`v0.16` remain frozen; do not regenerate fixtures or silently add `v0.17` support. The compared tagged event union is unchanged; process-local stream epoch, shutdown terminal-marker suppression and runner recovery uncertainty are recorded separately. IF-0-WIRE-5 and EC-WIRE-1 through EC-WIRE-4 remained unaccepted. Accepted DATA schemas and `@consiliency/contract@0.6.3` stay frozen; the local core-contracts package is `@consiliency/runtime-provider@0.2.0`. Preserve omniagent-plus#30 and both candidate/planning worktrees. INTEG, PREP and license choices remain downstream; unrelated omniagent-plus#34 Python-floor work is separate.

## Recovery locations and procedure recorded at the check

Owned worktrees:

- Driver: `/home/viperjuice/workspace/worktrees/agent-harness-placement-hardening-1504-20261012`, branch `codex/placement-hardening-1504-20261012`.
- WIRE: `/mnt/workspace/worktrees/viperjuice/omniagent-plus-v2-wire-20261004`, branch `codex/v2-wire-20261004`.
- Proposal record: `/home/viperjuice/workspace/worktrees/omniagent-plus-sandbox-proposal-record-20261012`.

Private review root: `/home/viperjuice/workspace/coord-reviews`. Preserve actual reports there; tracked receipts export metadata/hashes rather than raw transcripts. Qualified review interpreter: `harness-upstream-20261003/phase-loop-runtime/.venv/bin/python` (0.7.21, pinned `4a62fc1`), separate from newer test environments.

The recorded next action was to recheck actual readiness after the reported reset and review the saved immutable inputs. At that check, driver wrapper `placement-hardening-1504-20261012/review_plan.py` supported `HARDEN_REVIEW_ROUND=3` and mode `opus`, followed by `collect_and_preside_round3.py`. WIRE wrapper `WIRE-resumption-20261012/review_plan.py` mode `opus` required a fresh output directory with the old quota attempt archived, followed by `collect_and_preside.py`. These are historical recovery locations: inspect current inputs, PIDs and outputs before using them or launching a job. Both manual routes use Read/Write/Grep/Glob and no Bash; print, SDK and app-provider reviews are not substitutes.

If a required reviewer dissents, collect every role before the bounded repair, record source/delta and rerun affected standing reviews without inventing approval. President approval permits serial implementation of that plan only. Use the supported publication adapter for implementation; complete full actual-source reviews and required checks before merge. The launch flag, signed-claim gate, Q4 before second rung/cloud spend, Q5 before flag-on, lease/evidence contracts and pending WIRE work remain unchanged.

SSH preparation: `ssh-qualification-preparation-20261012.md` under the private review root, digest recorded in the driver receipt. The metadata check proves operational access only, not confinement. The eventual SSH plan must use the production driver, exact stage, credential-free owned qualification, bounded capture, fixed end, owner-scoped unknown-lease fencing/full listing/confirmed destruction and crash recovery. Reconnect and the real required subscription leg remain separate follow-ons.

The primary OmniAgent checkout's original untracked handoff/research/proposal files and primary harness checkout's pre-existing `.pmcp/` must be preserved. All unrelated branches/candidate worktrees remain preserved. At the check, the three work PRs were linked to this continuation's T3 Code conversation; no merge or issue closure had occurred.
