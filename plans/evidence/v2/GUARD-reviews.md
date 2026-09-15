# GUARD Review Reconciliation

Updated 2026-09-15. GUARD is not accepted and omniagent-plus#29 must remain
draft. No product release, version change, main merge or new custody backend
implementation is approved by these records. omniagent-plus#20 stays open.

## Evidence

- Production round 1 reviewed da48523176c629ec3cc7b6d4d18cb333800e7d90:
  `reviews/GUARD-production-round1.json`. Three usable seats; Fable reached
  its output limit with no final text. Native forensic bytes were verified;
  there was no recoverable verdict, refusal, manual cancellation or vote transfer.
- Repair checkpoint b526db89483c2706fc647b88cf180380349452f1:
  `reviews/GUARD-repair-checkpoint.json`. Clean CI=true full gate passed 470/1
  permitted live skip, including SQL, retained packing/smoke and artifact checks.
  Build/lint/typecheck, 76 focused repairs, 35 independent cancellation controls and
  457 plain CI=true tests/1 skip passed. These do not supersede the next counterexample.
- `reviews/GUARD-immediate-orphan-probe.json` retains the executed method,
  helper hash and 10-trial result: 8 escaped immediate orphans after runProcess
  returned; all marked probe children subsequently quiesced under independent
  PID/start-fenced cleanup. Rescue is not evidence of correct helper cleanup.
  An earlier probe had a null-state diagnostic error and remains retained in
  operator evidence; it is not counted as a complete trial set.
- Custody plan round 1 reviewed plan 19751b969d9c210eab7efbfd212029e68d6182608a81019cef9e8874b8bafc46:
  `reviews/GUARD-custody-plan-round1.json`. Fable, Grok, Codex and Gemini all
  returned usable PARTIALLY AGREE. All exact input, provider and cleanup
  bindings were independently checked; Fable used the native subscription TUI.
  No manual cancellation or fallback occurred.
- The pre-decision revision was b4a4e01ed1332eb66ce64dcd02a185f2e5683ff6307f8b61786ad8673c59f628.
  The maintainer then approved Linux-only GUARD verification on 2026-09-15 by
  responding "Continue as recommended" to that explicit question. Published
  runtime portability remains unchanged; main protection was not approved.
- Custody round 2 reviewed plan 6816b39ed0371d7ab70303984b71873d2a1002abea0e40cdfb5c09404e039a0e:
  `reviews/GUARD-custody-plan-round2.json`. Three usable PARTIALLY AGREE results;
  Fable ended with claude_provider_quota_exhausted (HTTP 429, usage_credits).
  Direct hash-verified session inspection found an output-limit event without
  final text, followed only by the quota message. No final review is recoverable.
  No manual cancellation, API fallback, model substitution or approval occurred.
- Current revision: 212bf7734a096741e95d06a633b95be0586d28f69683178a19fae82686e0d84c.
  It incorporates the round-2 dispositions below but is not reviewed/accepted.
  Historical TRIAGE and round-9 bindings remain unchanged and do not authorize it.
- On draft head fc88e7d, CI run 34962852535 passed. Publish run 34962852700
  failed its prerequisite root-suite at boundaries.test.ts:63 (case 29);
  rehearsal and npm publication never ran. The retained category-only diagnostic
  does not establish the underlying exception or a custody/artifact cause.
- Boundary repair e35f07e (integrated as d242495): synthetic fixture types: []
  avoids 108 ambient dependency files. A one-CPU cold case reproduced a 5000ms
  timeout at 6072ms before repair and passed at 285ms after. This is a reproduced
  plausible cause, not recovered provenance of the original hosted exception.
  Checker/assertions/budgets are unchanged. Independent boundary file: 35 passed;
  clean full CI-mode gate: 470 passed/one permitted skip. Exact report/manifest
  hashes: `reviews/GUARD-boundary-repair-checkpoint.json`.

## Production Findings

| Finding | Disposition |
| --- | --- |
| Codex: interrupted detached children | Partially repaired in b526db8, but the immediate-orphan counterexample remains blocking. Polling is not accepted as custody. |
| Codex: dirty source can be packed under unchanged HEAD | Fixed with clean tracked/untracked input checks, including ignored source, before stages and through packing/consumption; actual prepack mutation and pre-npm negative controls pass. |
| Codex: production relay through skipped test files | Fixed with production-to-test-source rejection and static/dynamic/require relay controls. |
| Hosted root-suite failure | Reproduced with CI=true. Test-only lintText parser configuration fixes immutable-Program inference; actual production lint remains unchanged. New diagnostics expose only constrained file/index/category metadata. |
| Gemini: download-artifact@v4 lacks artifact-ids | Rejected: the official action declares artifact-ids and disallows combining it with name. Preserve producer-ID binding. |
| Gemini: cold npm install15s | Nonblocking measurement concern; current clean smoke passed. Do not make independent installation optional or increase frozen budgets speculatively. |
| Gemini: automatic age-based pruning | Rejected as a default: evidence custody requires lifecycle-based disposition, not age-only deletion. |
| Grok: plain tests pull Docker | Rejected: the cited environment control injects a fake run callback. Plain suite remains non-DB. |
| Grok: hosted fixture tuple may differ | Both prior hosted runs reached SQL admission successfully. No identity/image relaxation is justified. |
| Grok: ownership dropped before reaping | Valid; stronger kernel-backed custody and reaping remain the pending amendment. |

The action input verification used the official
[download-artifact v4 definition](https://github.com/actions/download-artifact/blob/v4/action.yml).
The lint test adjustment follows the supported
[parser single-run setting](https://typescript-eslint.io/packages/parser/#disallowautomaticsingleruninference).

## Custody Plan Dispositions

Disposition here means feedback classified and incorporated or rejected with
reason. It does not mean the new implementation exists or the revision passed review.

| Seats/findings | Disposition in revised proposal |
| --- | --- |
| Grok1: sibling payload loophole | Explicitly make the supervisor the sole payload fork/exec parent; Node never spawns a sibling. |
| Gemini1, Grok3, Codex3, Fable5: clone-aware exhaustion | Freeze one serialized __WALL-inclusive waitpid reaper; zero is not ECHILD, no automatic reaping, and retained pidfds/children lists corroborate exhaustion. Avoid waitid(P_PIDFD), retaining the5.3 kernel floor. |
| Gemini2, Grok4, Codex3, Fable6: pidfd acquisition race/churn | Bind parent/start identity before and after pidfd acquisition, verify live owned ancestry/fdinfo, serialize reaping, close descriptors, and test reuse/disappearance and churn. A pidfd alone does not prove ancestry. |
| Gemini3, Grok6, Codex4, Fable3: status fidelity | Freeze typed protocol outcomes and supervisor-versus-payload identities. Preserve raw payload wait status; no competing Popen reaper or ECHILD-to-zero conversion. Require agreement between final record and terminal state. |
| Codex2, Fable1/2: stalled admission/status and descriptor ownership | Put admission/protocol inside existing deadlines; define the ADMIT commit point, exclusive close-on-exec endpoints, per-launch nonce/sequence and bounded nonblocking status writes. Missing/duplicate/truncated frames fail. |
| Grok2/7, Gemini5, Codex1: competing escalation owners | Node uses protocol teardown, never kills the last keeper at500ms. Forced subtree drain has one absolute500ms+2s envelope; takeover cannot reset it. |
| Grok8, Codex1, Fable4: cooperative fixture cleanup | Separate FORWARD from forced SHUTDOWN; repeats cannot extend deadlines. Reserve finite cleanup command slots, clamp inherited deadlines, and require WORK_DRAINED before callbacks rather than circular whole-launcher exhaustion. The proposal derives reservations from existing bounds and needs fresh review. |
| Fable7, Codex4: rescue masks failure | Trigger drain on exit/adoption, preserve inner failure after outer rescue, record adopted/forced counts, and assert before test teardown. |
| Grok5: mandatory scope-wide/global keeper | Not adopted as mandatory. A further keeper moves rather than eliminates final-custodian loss; the bounded per-command design explicitly fails unproven on last-keeper loss. No infrastructure/global process authority is introduced. |
| Fable1: always emit a record despite keeper failure | Narrowed: a surviving observer must record failure; loss of all observers cannot promise a persisted record. Never release live custody merely to meet a timeout or fabricate success. |
| Fable8: Python3.10 -I includes the script directory | Rejected after checking official Python3.10 documentation: -I excludes it. Keep3.10 and add a shadow-module isolation control rather than impose an unnecessary3.11 floor. |
| Grok9, Gemini6, Fable8/10: platform/workflow/docs | Linux-only operator approval was pending at round 1 and is now recorded. Admission covers artifact consumers' guarded git/tar too. Existing owned workflows/tests/docs must add prerequisites before the combined candidate lands. |
| Fable9, Codex3/4: weak falsifiers/coverage | Assign at least100 immediate-exit trials on local/hosted Linux, actual reap assertions, clone/thread/status/stream/EOF/inner-loss controls and retained executable positive-control evidence. EC-GUARD-2's plan falsifier names immediate orphans; no separate roadmap criterion is invented. |
| All seats: absent future helper/test bodies | Expected at plan stage, not implementation approval. Fresh production review must include all changed code, the four existing process suites and artifact-consumer callers. |

Python isolation disposition is supported by the official
[Python3.10 command-line contract](https://docs.python.org/3.10/using/cmdline.html#cmdoption-I).
Subreaper and wait requirements follow the
[Linux subreaper contract](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html)
and [Linux wait semantics](https://man7.org/linux/man-pages/man2/wait.2.html).

## Custody Round 2 Dispositions

| Seats/findings | Disposition in current unaccepted revision |
| --- | --- |
| Codex1: buffered ADMIT/cancellation ordering | Owner-side synchronous cancellation check and admission authorization define the ordering. After authorization the payload may start and must drain; buffered-write/EOF controls forbid a stronger promise. |
| Codex2: empty Docker lookup after lost creation acknowledgment | Explicit unproven cleanup unless a terminal daemon outcome is known; add delayed creation crossing the empty lookup. Process quiescence is not daemon completion. |
| Gemini1: cleanup registration has no descriptor | Parent declares the maximum reservation in ADMIT; local ProcessScope callback registration cannot increase it and never writes to keeper control/status descriptors. |
| Grok1/2: sibling/last keeper loss and detach | Limit adoption to proven ancestor subreapers. No sibling rescue claim; last-keeper loss/hang can be unreclaimable/unproven. Changing detached alone or adding a global keeper cannot eliminate final-custodian failure. |
| Grok3/4, Gemini3: protocol/interrupt mapping | Freeze bounded JSON lines, direction-specific sequences, ADMIT contents, private argv/env transport, payload result mapping, OS INT/TERM forwarding, and cooperative-launcher versus forced-work routing. |
| Grok5/6, Gemini2: reaper/identity semantics | No Popen object/destructor or Node poller; only direct/adopted-child pidfd signaling, with acquisition before reap. Zombies can be reaped without pidfd acquisition; child adoption precedes parent reaping. |
| Gemini2: waitid requires newer kernel | Rejected as stated: only P_PIDFD has the newer floor. Current selected waitpid/__WALL contract remains; no unnecessary kernel/version increase. |
| Grok7, Gemini5: clone/thread exhaustion | Preserve __WALL, no automatic reaping or raw-PID fallback; add leader-exit/nonleader-fork and explicit foreign-namespace unproven boundaries. |
| Grok8, Gemini4: deadline math/test waits | Clarify ordinary child E=T versus no-child cases. 22.5/57.5 and nested 112.5 already include tails; do not double-add T. Use pre-admitted completion ceilings rather than guessed timeout increases, preserving operation/forced-drain bounds. |
| Grok8: callback after unproven work drain | Any bounded best-effort resource cleanup preserves unproven ordering/receipt and failure; cannot manufacture successful WORK_DRAINED. |
| Grok9/10/11, Gemini coverage: tests/workflows/docs | Existing owned changes remain mandatory before integrated merge. Add explicit OS-signal, admission, ceiling, sibling-loss and daemon-race controls. Lifecycle identity assertions adapt; lock/race outcomes cannot weaken. |
| Codex coverage, Grok12: missing caller bodies/old receipt | Include all four package process suites, CI and integration caller context in fresh review. Historical records stay historical; current amendment gets a distinct exact-hash binding. |

Fable's quota result is unavailable review evidence, not a fourth vote. Restore
that subscription's availability or obtain an explicit alternate-seat decision
before the next complete plan panel. Do not automatically spend usage credits,
switch subscription identity, retry the completed run, or use an API fallback.

## Remaining Gates

1. Resolve the unavailable Fable seat; Linux-only approval is already recorded.
2. Fresh complete four-seat review of the revised amendment, with the executable probe
   method and missing caller/test context; reconcile before new ownership runs.
3. Implement and independently verify kernel custody, then fresh full production
   panel, hosted CI/rehearsal and exact-head acceptance. Current polling code
   is not mergeable regardless of mechanical CI status.
4. Maintainer authorizes main to require guard-required and up-to-date PRs.
   No protection settings have been changed. Then exact-head merge, actual
   post-merge verification and custody-aware pruning can occur.

No audit issue is closed by this checkpoint. DATA/COORD/WIRE/INTEG/PREP/SHIP
remain downstream; GUARD emits no IF gate and no product release.
