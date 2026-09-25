# GUARD Review Reconciliation

Updated 2026-09-24. GUARD is not accepted and omniagent-plus#29 must remain
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
- Round-3 revision: 212bf7734a096741e95d06a633b95be0586d28f69683178a19fae82686e0d84c.
  It incorporates the round-2 dispositions below. Round 3 reviewed these bytes
  but did not accept them; the plan has not yet incorporated round-3 remedies.
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

## Custody Round 3 Dispositions

The maintainer reported Fable available on 2026-09-19. A fresh native four-seat
board reviewed head 160a770c5daf86ef384f9643e844ff47d68b4cea and all 21 complete
inputs, including the previously omitted callers. Installed runtime 0.7.14 was
bound by source hashes; the old isolated runtime was absent, so its historical
qualification was not reused. Evidence: `reviews/GUARD-custody-plan-round3.json`.

Codex, Gemini and Grok returned PARTIALLY AGREE. Fable's first-party subscription
authentication passed, but the native TUI adapter returned DEGRADED with
claude_tui_stalled after 573.2 seconds (558.3 seconds since observed progress).
No new quota error, manual cancellation, account/model switch or API fallback
was observed. Native cleanup verified; the adapter removed its session file.
Before cleanup, direct assistant-text inspection found no final text. Do not
relabel a valid login or an in-flight animation as a completed Fable review.
Grok initially said the bundle was truncated and it would read the remainder,
then claimed full coverage despite the tools-empty route. Preserve this
coverage uncertainty even though the runtime labels its result usable.

| Finding | Coordinator disposition and required follow-up |
| --- | --- |
| Codex: effective cancellation deadline never reaches the cooperative launcher | Valid blocker. The original admission ceiling is not the later selected cutoff. Define a separate payload notification contract for the selected epoch/effective absolute deadline, without leaking exclusive control/status endpoints; delayed signal handling must not renew time. Test that an unfundable callback never starts. |
| Gemini/Grok: strict allowlist drops synthetic package-test fields | Valid compatibility ambiguity. Preserve explicitly constructed test inputs through an enumerated owner-side map. Do not adopt wholesale passthrough of options.env: current callers spread process.env, which would defeat credential stripping. Scope caller edits to environment setup; preserve lock/race assertions and add hostile ambient controls. |
| Grok: pre-ADMIT OS signals have no defined state transition | Valid clarification. Install handlers before READY; cancellation observed before supervisor admission prevents exec and returns not_started. After validated admission, preserve started-and-drain semantics. Buffering and partial-write controls must not claim that execution was impossible. Never delegate keeper destruction to Node's AbortSignal. |
| Gemini: hardcoded cooperative wait bounds | Already assigned in the plan: derive waits from the pre-admitted/effective ceiling. Do not introduce suggested arbitrary 25/10-second constants or expand ordinary operation budgets. Codex correctly notes that long-lived direct spawnOwned callers also need explicit composite lifetimes before ADMIT. |
| Gemini: empty Docker recovery lookup reports removed | Already explicitly prohibited by the proposed plan and assigned a delayed-create falsifier. Still an implementation requirement; current source is not claimed fixed. |
| Codex: inherited Python signal dispositions | Add explicit payload signal-mask/disposition restoration and a native SIGPIPE regression control to substantiate the existing status-fidelity guarantee. |
| Other reaping, stream backpressure and callback guidance | Retain as implementation checks; do not create new product scope or treat absence of the future helper as a new plan defect. |

No round-3 vote transfers to a material amendment. This run stops after evidence
reconciliation rather than repeatedly rerunning the same stalled Fable request.
The next action is a bounded amendment and an exact-input review, not a quota
purchase, model substitution, execution waiver or product publication.

## Direct Recovery And Round 4

On the user's request, checked the previous exact Fable session, reviewer PID,
scratch directory and matching named archives. The process/session/scratch were
absent; no alternate transcript was found. Installed runtime cleanup explicitly
retains only transcript metadata, then deletes that exact file. Surviving round-3
verdict/result files contain no Fable text. No dead session was nudged or resumed.

Amended the plan to fix round-3 deadline notification, pre-admission signal,
synthetic environment and signal-restoration gaps. Staged review candidate SHA:
970c348f4a650b3c5ecd922cc04a1f9b834a97ba846cfaad81d0436bab0fe20c.
One bounded fresh four-seat review used the complete plan and affected callers
(ten full inputs, 132703 bundle bytes). No vote transferred. Evidence:
`reviews/GUARD-custody-plan-round4.json`.

- Codex returned AGREE with no blocking plan contradiction.
- Gemini returned PARTIALLY AGREE. Its claimed Python 3.12 pidfd_open floor is
  false: [Python 3.10's official documentation](https://docs.python.org/3.10/library/os.html#os.pidfd_open)
  records introduction in 3.9. Local Python 3.10.12 opened its own pidfd and sent
  signal zero successfully. No ctypes syscall fallback or version bump is added.
  Its remaining wait-bound concern is already assigned; do not invent larger
  constants or assume cleanup slots in a build-only test.
- Grok returned PARTIALLY AGREE, again opening with a truncation/read-remaining
  claim and then asserting coverage despite tools being disabled. Coverage is
  uncertain, but the protocol sequence finding is independently valid. The
  amendment now gives each channel its own sequence, makes WORK_DRAINED a local
  aggregate of ordinary child proofs, requires root reservations before resource
  effects, drains capability-probe children on pre-admission cancellation, and
  distinguishes forced-drain deadlines from cooperative completion deadlines.
- Fable returned DEGRADED / claude_tui_stalled after 455.9 seconds. Direct
  monitoring of the request-bound session captured no assistant text before
  runtime cleanup; the final native response is empty. No manual kill, interrupt,
  account/model switch, API fallback or repeated identical retry. All native
  reviewer cleanup and input/head/runtime bindings verified.

Post-reconciliation plan SHA:
f722e598cfbc00afab8383036c9edf3c5ea00c9e8a7d6b6ff9de13e5578bb453.
It is staged and dispatch-literal validation passes, but it is NOT accepted.
The new clarifications change the reviewed bytes; even Codex's AGREE is historical
to that candidate, not a vote for this one. This bounded follow-up stops here.
No production helper was implemented and no runtime tests were rerun.

## Transport Diagnostic And Round 5

One tiny native Fable 5.1/max diagnostic succeeded in 89.3 seconds on the
unchanged installed runtime. It echoed the diagnostic token, not a review:
`reviews/GUARD-fable-transport-20260920.json`. Authentication and the TUI
route can deliver text; this does not prove reliable full-review delivery.
agent-harness#734 remains open; the latest published harness release is still
v0.7.14 and diagnostic-retention agent-harness#851 is still draft.

One bounded new round then supplied only the complete current plan, 57806
bundle bytes, explicitly excluding source-code coverage. The four seats
reviewed f722e598cfbc00afab8383036c9edf3c5ea00c9e8a7d6b6ff9de13e5578bb453.
Codex and Gemini returned AGREE. Grok returned PARTIALLY AGREE with unambiguous
full-plan coverage. Fable returned DEGRADED / claude_tui_stalled after 315.5
seconds, last progress age 299.4 seconds, zero final response bytes.
All processes finished and native cleanup verified; no manual signal, fallback,
runtime patch or explicit deadline override was used. Direct sampled text was
empty, but its last hash differs from cleanup: do not claim final-event coverage.
Evidence: `reviews/GUARD-custody-plan-round5.json`.

Reconciliation:
- Admission: reject Grok's blanket refusal of successful not_started after an
  owner write. Authorization is not supervisor validation. A matching final
  not_started plus probe quiescence can prove cleanup; missing proof cannot.
- Nesting: the outer forced deadline dominates inner cooperative requests;
  no signal-sender inference or deadline extension. Add the exact falsifier.
- SHUTDOWN carries upper bounds; the supervisor alone selects the effective
  cutoff. This clarification preserves fixed operation and drain budgets.
- Group/poll-only instructions were already superseded, but remove their
  imperative wording rather than leave two adjacent implementation directions.
- Freeze WORK_DRAINED as child-supervisor-to-owner status, never lifecycle proof.
- The existing required-cases manifest and checkResults cover DB cases only.
  Add four mandatory exact-file custody IDs to verify/test:guard, with
  suppression/wrong-file controls. DB-only integration does not prove custody.

Post-reconciliation plan:
`0fe1020f36db66c1e99902e89281f2e6dd80676bd3a946aec63ab6a1cef50036`.
Dispatch-hint validation passes; this candidate is not reviewed or accepted.
No implementation/build/test, push, merge or publication occurred. The revised
plan/evidence are staged locally. The question whether to use Opus temporarily
through the same native subscription TUI has been presented to the operator;
no replacement is assumed and no further automatic review is dispatched.

## Native File-Pointer Follow-Up

The operator corrected the delivery approach: small prompt with file pointers.
The manual native TUI attempt used a 347-byte prompt, a frozen snapshot and
restricted Read-only tools. Fifteen reads returned successfully, including all
859 plan lines and the supplied caller files. This proves file delivery, not
review approval. The initial attempt still stalled after reading.

The native session was retained this time. One 406-byte same-session nudge
also stalled. Independent post-nudge inspection found no non-synthetic Fable
response; the synthetic resume marker is not a refusal. Neither attempt
yielded a verdict. Both finished; no further automatic attempt is running.

Two observer details are recorded rather than hidden: the installed helper
preserved a dot in the project slug where Claude 2.1.278 used a hyphen, corrected
with an exact-session alias without editing transcript bytes; and the nudge
reader's exact-string match missed the native paste wrapper. Independent
structured inspection verified the actual nudge and absence of a new answer.
The transcript remains private and resumable, its original prefix unchanged.

Evidence: `reviews/GUARD-fable-file-review-20260920.json`.
This manual diagnostic is not a governed board receipt. The plan, source files,
snapshot and installed runtime hashes are unchanged. No implementation,
test/build, push, merge or release. The operator's file-pointer instruction
supersedes the suggested Opus choice; no replacement was approved or used.

## Remaining Gates

### September 20 Continuation Preflight

The local continuation reader now recognizes the native pasted-content frame,
requires the new user prompt, exact model, read token and end-turn verdict,
and rejects historical/synthetic answers. Ten focused unit cases pass.
This fixes observation, not the provider's lack of a verdict.

One authorized same-session diagnostic prepared a 313-byte prompt and retained
the 1800-second backstop, allowing quiet waiting only for this diagnostic.
Preflight first detected a separately installed runtime update from panel
invoker SHA `74ffe982...` to `95774728...`, source commit
`b1fae7063e26fed8864b48b08e145572a65b2d2e`, still version 0.7.14.
The native launch now uses the shared provider launch function. The diagnostic
used the installed network-isolation context and its launch prefix, without
disabling egress policy or modifying the installed runtime.

The adapter returned `claude_tui_workspace_trust_blocked` before prompt
delivery. The retained transcript is byte-for-byte unchanged at 466080 bytes,
SHA `c08571a6b882e9c67b252dcc23588e0cbbae84eae19b857eeda847498eceefb1`.
There is no new model turn or review, and this is not another thinking stall.
The driver did not retain the adapter's fourth return value (sanitized terminal
tail), so the specific modal rejection cannot be reconstructed from this run.
Do not invent that cause or retry automatically. A startup-only diagnostic
must preserve that tail before attempting another model review.

Plan/source/snapshot/runtime hashes were unchanged during this attempt;
the retained-session process is gone. Evidence:
`reviews/GUARD-fable-quiet-wait-20260920.json`. No code acceptance, implementation,
merge, publication or new ownership. The separate upstream check is recorded
in `upstream-check-20260920.md`; it does not alter GUARD scope.

### Ordered Gates

September 21 operator-directed disposition: track the existing startup recurrence
on [agent-harness#926](https://github.com/Consiliency/agent-harness/issues/926#issuecomment-5755586262).
The comment attaches the existing consumer receipt, identifies our different
runtime pin and the missing terminal-tail limitation, and does not claim a
shared root cause. No new diagnosis or provider invocation was performed.
Pause duplicate local diagnostic work and automatic review retries. Preserve
the native session and frozen input; require a tested upstream fix and real
startup receipt before qualifying recovery. An issue closure alone is not a
review verdict. Post-read liveness (agent-harness#734) and heartbeat-only policy
(agent-harness#908) are separate. This does not add a product runtime dependency.

1. Preserve the staged, reconciled amendment and recover a usable review route;
   no more blind retries of the same Fable request. Linux-only approval stands.
2. Obtain a complete exact-input panel of the current amendment, including a usable
   Fable TUI verdict and unambiguous Grok coverage, before new ownership runs.
3. Implement and independently verify kernel custody, then fresh full production
   panel, hosted CI/rehearsal and exact-head acceptance. Current polling code
   is not mergeable regardless of mechanical CI status.
4. Maintainer authorizes main to require guard-required and up-to-date PRs.
   No protection settings have been changed. Then exact-head merge, actual
   post-merge verification and custody-aware pruning can occur.

No audit issue is closed by this checkpoint. DATA/COORD/WIRE/INTEG/PREP/SHIP
remain downstream; GUARD emits no IF gate and no product release.

## September 24 Opus Plan Review

The maintainer replaced Fable with Claude Opus 5.5 for this review. The
previous Fable-specific ordered gate above is historical, not the current
reviewer instruction. The panel runtime is agent-harness source
`3ed2b43b6062bffd7cac1a3ca15828034ebdd38a` in an isolated worktree;
its exact-head `test` workflow passed, but it is not the published `v0.7.16`
runtime. All invocations used heartbeat-only monitoring.

The first Opus round reviewed plan
`0fe1020f36db66c1e99902e89281f2e6dd80676bd3a946aec63ab6a1cef50036`.
Gemini agreed, Opus partially agreed with no blocking plan finding, Astra
dissented about three independently reproduced defects in the *current
pre-amendment source*, and Grok degraded without a verdict. That is not a
four-seat plan approval or source acceptance. Opus's actionable plan
clarifications were reconciled into the amended plan: live orphan adoption,
non-vacuous 250 ms control, nested descriptor closure, DB fixture isolation,
hosted loopback proof, architecture scope, SIGHUP, and partition wording.

The amended plan SHA-256 is
`ead29aaf009a6b01e1358f801e2768fd59235a2fffff3a95c3a9a9b533c7241a`.
Its short review brief is `reviews/GUARD-plan-brief-20260924.md`, explicitly
limiting this board to plan executability and excluding merge-readiness claims
on the existing source. On this exact input, Gemini, Astra, and Grok returned
usable `AGREE` plan reviews with no blocking findings. The initial Opus leg
had no verdict; exact-session inspection found only `Request timed out`.
The Opus-only recovery then returned a usable plan-level `AGREE` on the
same plan and brief. The wrapper failed while printing an aggregate attribute
after the runtime wrote the per-seat verdict; the verdict file and session
survived. This completes four usable plan reviews of `ead29aaf...`, not source
acceptance.

The nonblocking findings were reconciled into a new candidate:
`3e6577ca2298d863a565fd7175629de57d7a349cd6cbc8b788bdbcf395d279de`.
It binds the hung-child and legacy-positive falsifiers to required tooling
IDs; defines adoption against payload pidfd exit-readiness; isolates legacy
escapes under a test-owned subreaper; specifies pre-install client loading,
forced-root-suite cleanup evidence, inherited deadlines, platform and hosted
receipt scope, foreground SIGINT, and the Opus 5.5 production seat. Grok's
suggested `actions: write` on verification was not adopted: same-run artifact
upload uses the Actions runtime transport, while `GITHUB_TOKEN` permissions
remain least-privilege; independently bind the artifact digest as planned.
The final candidate has a new brief,
`reviews/GUARD-plan-brief-r8-20260924.md`, and requires fresh exact-hash review.
No vote transfers to it or to an SL-2 production review. No new GUARD source
implementation, merge, publication or issue closure occurred at this checkpoint.

Round 8 reviewed `3e6577ca2298d863a565fd7175629de57d7a349cd6cbc8b788bdbcf395d279de`
with the same four models and source runtime. Grok, Astra and Gemini returned
usable `AGREE`; Opus 5.5 returned usable `PARTIALLY AGREE`, so this round did
not approve the plan. Opus identified two decisive acceptance gaps: post-exit
adoptees could be silently signalled and counted as success, and none of the
required custody IDs forced the pre-/post-exit classification. Its related
suggestions covered deterministic legacy observation, no-install loading,
external job timing, every-run hosted evidence, and per-seat route provenance.

The reconciled round-9 candidate is
`d7e3cf7b111ae9f95e7a15e0a3176bd6d8a8e9bde4af1ca702b8bc26a38a45e4`.
Its brief is `reviews/GUARD-plan-brief-r9-20260924.md`. It requires a fresh
exact-hash four-seat review; no prior vote carries. If a material acceptance
gap remains after round 9, stop for operator disposition instead of silently
expanding or waiving the gate.

Round 9 first refused before provider launch with
`gemini_heartbeat_capability_unavailable`: local `agy` had advanced to 1.2.10
while the pinned runtime qualified only the 1.2.9 image. The official 1.2.9
archive and executable were obtained in an isolated tool directory and
matched the qualification record's SHA-256 digests. Agent-harness's
`--source-only` qualification check passed for 213 source files; the local
capability preflight then accepted that exact image. The installed 1.2.10
CLI and agent-harness source were not modified. The failed preflight cast
zero votes.

The qualified round reviewed plan
`d7e3cf7b111ae9f95e7a15e0a3176bd6d8a8e9bde4af1ca702b8bc26a38a45e4`.
Grok, Astra and Gemini returned usable `AGREE`; Claude Opus 5.5 returned
usable `PARTIALLY AGREE`. Its three blocking plan findings remain:

1. The required double-fork and immediate-orphan cases can pass without
   proving pre-exit adoption detection or passive post-exit waiting.
2. `stamp+17m` is ambiguous between work cutoff and completion ceiling;
   local fixture-owning commands lack frozen root lifetimes and hostile
   ambient deadline controls.
3. Every-run hosted non-loopback refusal is recorded but not defined as an
   admission precondition with a concrete address/probe and receipt check.

The complete verdicts and their hashes are in
`reviews/GUARD-plan-r9-receipt-20260924.json` and its four adjacent verdict
files. Opus also raised a consequential inner-supervisor failure propagation
risk and smaller sensitivity/provenance gaps; retain them for any amendment.
This third round is not a plan approval. The review loop stops at its bound:
these core custody and verification requirements cannot be descoped without
removing GUARD's acceptance goal. A maintainer must choose a new bounded
amendment/review authorization or defer the gate. Do not start new GUARD
source ownership, accept PR omniagent-plus#29, merge, publish or close
omniagent-plus#20 on this evidence.
The blocking checkpoint was posted on omniagent-plus#29 as
https://github.com/Consiliency/omniagent-plus/pull/29#issuecomment-5817652784;
that comment explicitly says the reviewed local plan is not the PR head.
