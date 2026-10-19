# Continuation prompt for OmniAgent integration and sandbox work

You are continuing the owner's work on `Consiliency/omniagent-plus`, its integration with `Consiliency/agent-harness`, and an assessment of T3 Code and Omnigent as complementary runtime dependencies. This handoff records the state checked on October 11, 2026, America/New_York. Recheck live state before using historical availability or approval records.

The latest discussion investigated whether Omnigent already provides sandbox mechanisms that agent-harness should reuse. The assessment is complete; no sandbox adapter, T3 adapter, deployment, or architecture migration has been implemented. Earlier WIRE planning is still pending required review. Preserve that work while turning the integration recommendations into a concrete, bounded proposal.

## Read these files first

Paths in this section are relative to the `omniagent-plus` repository unless stated otherwise.

1. [T3 assessment](evidence/research/T3-base-assessment-20261011.json): pinned sources, extension paths, migration constraints, proposed acceptance cases and the 79 focused upstream tests.
2. [Harness sandbox assessment](evidence/research/harness-sandbox-assessment-20261011.json): current harness plans/issues, upstream reuse candidates, contract gaps and the recommended responsibility split.
3. [Active OmniAgent roadmap](../specs/phase-plans-v2.md), [architecture](../docs/architecture.md), [coordination contracts](../docs/coordination-backend.md), [harness integration](../docs/agent-harness-integration.md), [readiness](../docs/hardening-readiness.md).
4. In the WIRE worktree, read `plans/phase-plan-v2-WIRE.md`, `plans/evidence/v2/WIRE.json`, and the review files referenced by that evidence. These are on the unmerged branch, not current main.
5. In current agent-harness, read `AGENTS.md`, `specs/phase-plans-v11.md`, `plans/detailed-remote-seat-placement-896-20261010.md`, `plans/detailed-seat-launch-factoring-896-20261010.md`, and the placement/seat code named below.

The two research JSON files have been copied into this repository byte-for-byte, so the handoff does not depend on external scratch files. Original source clones and scratch records remain available on this host. Absolute paths inside the records are provenance, not portable assumptions; obtain the pinned public sources again if necessary.

## Working copies and immutable inputs

| Repository or worktree | State checked |
| --- | --- |
| `/home/viperjuice/code/omniagent-plus` | Main `f33471de858d3be1fc01a50696abdcb4ab717a87`; clean before adding this handoff and its two research records |
| `/mnt/workspace/worktrees/viperjuice/omniagent-plus-v2-wire-20261004` | Branch `codex/v2-wire-20261004`, head `9ea0c4540d4a5c810e54f67ff212e4b66b89d619`; clean; planning only |
| `/mnt/workspace/worktrees/viperjuice/omniagent-plus-v015-implementation-20260928` | Preserved candidate `aee2df42ebdd5679664477c9b2c754e6eb5942ea`, associated with omniagent-plus#30 |
| `/mnt/workspace/worktrees/viperjuice/omniagent-plus-v015-plan-update-20260928` | Preserved planning branch; do not prune as incidental cleanup |
| `/home/viperjuice/code/agent-harness` | Local main `570bdda0e30ec57fc49b14b7477fc5dbefcdd1b6`, behind inspected upstream; pre-existing untracked `.pmcp/` must be preserved |
| Research agent-harness clone | `/home/viperjuice/workspace/coord-reviews/harness-sandbox-assessment-20261011/agent-harness`, inspected current-main input `0f146ffc3d531867fbe4097e0a4a0aa285433a16` |
| Research T3 clone | `/home/viperjuice/workspace/coord-reviews/t3-base-assessment-20261011/t3code`, input `74f9df3abfb62b3a977390f01321b93a63c29cc5` |
| Research Omnigent clone | `/home/viperjuice/workspace/coord-reviews/t3-base-assessment-20261011/omnigent`, input `4c35f65bd743b5349e47d6468e6a1a431d86b5c3` |

T3's latest stable release observed was v0.0.45, October 2, at `6c8fed35dded9ff71c5b46807125457acbb76be6`. Its latest observed prerelease was v0.0.46-nightly.20261011.2980. The inspected V2 outbox, provider packages, configurable ACP registry and external orchestration MCP tools are development-main findings; they are absent from that stable architecture. Do not assume the nightly is identical to the pinned main.

Omnigent's latest stable observed was v0.17.0, October 6, at `12b5f67d2529b43eab7366a7288fb89f7587e48b`. Main was 0.18.0.dev0. Its sandbox providers, credential proxy and related sandbox/test files exist in stable; specific newer behavior should still be checked against the intended deployment version.

These are input snapshots, not required future commit identities. Never pin the SHA, commit count or topology of implementation that has not happened yet.

## Existing authorized work and WIRE status

The owner previously authorized continuing the roadmap, planning and paneling WIRE, implementing after reconciliation, reviewing the implementation, reconciling until mergeable, merging, pruning merge worktrees and closing/commenting related issues. This does not waive the required review roles or acceptance criteria.

DATA and COORD are accepted on main. WIRE and INTEG are not accepted. The WIRE evidence explicitly records:

- `planning_blocked`, `full_plan_approval=false`, `implementation_started=false`, and `production_source_changed=false`.
- Six usable standing plan approvals after reconciliation, but the required manual Opus reviewer and Fable-only Opus president are missing. Historical carried approvals retain their original source binding; they do not approve a new upstream or architecture amendment automatically.
- A first-party subscription weekly-limit outage, with a reported reset of **October 6, 2026, 14:00 EDT**. That date has passed. Recheck readiness; do not announce that this outage still exists without fresh evidence.
- IF-0-WIRE-5 and EC-WIRE-1 through EC-WIRE-4 remain unaccepted.

[omniagent-plus#33](https://github.com/Consiliency/omniagent-plus/pull/33) is the open WIRE planning PR. Its evidence directs resumption through upstream recheck, required manual Opus plan approval and qualified president ruling, followed by serial implementation, verification, CR reconciliation and closeout. Do not start by assuming implementation already exists.

WIRE preserves the published v0.12 default and freezes optional v0.15/v0.16 policies. Its October 4 upstream assessment predates stable v0.17. Reconcile v0.17's actual impact before changing fixtures or acceptance; this research did not authorize a silent dependency upgrade. WIRE owns bounded HTTP/SSE/CLI behavior, replay, immutable mutation inputs, capacities and cold-start races. INTEG owns durable operator composition. PREP owns distribution/license/dependency decisions. Use the plan for exact lane ownership and verification commands.

Open OmniAgent work checked:

- [omniagent-plus#25](https://github.com/Consiliency/omniagent-plus/issues/25): WIRE transport reliability.
- [omniagent-plus#30](https://github.com/Consiliency/omniagent-plus/pull/30): preserved unpublished v0.15 candidate; selective reconciliation, not automatic merge.
- [omniagent-plus#26](https://github.com/Consiliency/omniagent-plus/issues/26): INTEG durable lifecycle/replay.
- [omniagent-plus#27](https://github.com/Consiliency/omniagent-plus/issues/27): PREP packaging/retained evidence.
- [omniagent-plus#20](https://github.com/Consiliency/omniagent-plus/issues/20): audit/distribution, including an owner license choice; never infer our license from upstream licenses.
- [omniagent-plus#19](https://github.com/Consiliency/omniagent-plus/issues/19): overall remediation tracker.

## Research conclusions and their limits

The proposed architecture uses our repo as a coordination/extension layer over independently versioned T3 and Omnigent runtimes. It is a recommendation, not an adopted architecture or merged roadmap change.

Retain our routing, identity, provider-family cooldowns, fleet holder/fence/expiry contracts, metadata-only evidence controls, and harness/governed-pipeline integration. Let each runtime own its execution and provider conversation history. Give each session/run one execution owner; cross-platform continuation is an explicit handoff. Avoid two independently authoritative execution logs.

T3 is a credible execution/UI base, but not a drop-in library dependency. Its published server is `t3`; provider-core/contracts/client-runtime are private workspace packages. Native providers require static registrations and a build. ACP is configurable, but an arbitrary TUI or phase-loop CLI entrypoint is not an ACP server. External orchestration MCP requires OAuth. Universal routing/lease enforcement across UI, MCP, scheduled work, delegation and recovery would require server integration and dispatch-time revalidation. An external wrapper governs only calls passing through it, with either upstream.

T3 already has quota recovery. Its environment-local state and in-process workspace semaphore do not replace global fleet leasing or scheduling. Portable handoffs are lossy summaries. Its built-in Claude adapter uses the agent SDK, not our exact manual Opus TUI leg.

Omnigent has configurable policies and installed community headless harness/sandbox plugins. Community native TUI harness registrations are explicitly unsupported. This distinction matters when estimating our exact workflow's integration cost.

Our `AgentRuntimeProvider` method set is a starting point, but `packages/core-contracts/src/types.ts` accepts only the Omnigent runtime/backend IDs and an Omnigent agent-spec reference. Adding T3 requires explicit schema/configuration/capability changes and compatibility proof. The current TypeScript harness adapter maps requests/results; it does not provision environments.

## Sandbox convergence findings

Current harness source, not the older local checkout, is authoritative for this comparison:

- [agent-harness#1492](https://github.com/Consiliency/agent-harness/pull/1492) merged the placement driver and lease journal, proven with fake backends. `_NONLOCAL_EXECUTION_DRIVER=False` remains at the launch site. No concrete remote backend, reconnect or SSH path ships in that change.
- The latest remote plan specifies self-hosted **SSH first**, then reconnect, placed Claude, and subordinate-uid Codex/Grok placement; cloud is follow-on. Changing that sequence is an architectural plan change.
- Active v11 retires EC-HARDEN-5 and replaces it with **EC-HARDEN-6**: declared seat capabilities, valid review-isolation authorization and recorded deliberately credentialed/tooled seats. Do not evaluate today's work against the retired blanket prohibition. SBXEXEC/SBXFETCH/SBXSEAT are a separate proposal.
- Codex has nested-namespace and staged-tree write conflicts: [agent-harness#1335](https://github.com/Consiliency/agent-harness/issues/1335), [agent-harness#1470](https://github.com/Consiliency/agent-harness/issues/1470). [agent-harness#1489](https://github.com/Consiliency/agent-harness/pull/1489) was open with the targeted writable-tree fix. Recheck its state before duplicating work.
- Gemini's tooled jail is unqualified because inference and other Google APIs share front-end IPs. Omnigent's TLS-inspecting proxy is a candidate for this problem, not proven compatibility with real agy traffic.
- `advisor_board/backing_omnigent.py` is frozen to v0.4, intended for breadth harnesses, and has no production factory caller in inspected source. Its create path does not request managed sandbox placement. Wiring it unchanged is not the solution.
- [agent-harness#1504](https://github.com/Consiliency/agent-harness/issues/1504), [agent-harness#1502](https://github.com/Consiliency/agent-harness/issues/1502), [agent-harness#1506](https://github.com/Consiliency/agent-harness/issues/1506) retain driver hardening, launch-site and backend-contract obligations.

Omnigent reuse candidates: `onboarding/sandboxes/{base,types,registry,e2b,openshell,kubernetes,agent_sandbox,agent_sandbox_warm_pool}.py`, `server/managed_sandbox_reaper.py`, `inner/{bwrap_sandbox,seatbelt_sandbox,credential_proxy}.py`, `inner/egress/proxy.py`, and the corresponding tests/runbooks. Consume configured provider primitives; avoid rebuilding a separate provider SDK layer in the harness.

Keep the harness's `sandbox_placement.ExecutingBackend` and `placement_lease` obligations: exact snapshot digest, destination verification, runtime/backend evidence distinction, owner-bound references, lease fencing, no retry after uncertain launch, bounded calls/output, and confirmed destruction. The upstream launcher API does not supply these guarantees. Its E2B adapter uses environment-based control credentials and disables some command timeouts, which differs from our plans. Windows Job Object support does not enforce filesystem or network isolation. Linux helper seccomp blocks new namespaces, so adopting that wrapper does not automatically fix nested Codex execution.

## Verification already performed

T3 pinned-main tests passed: 56 tests across ProjectionRecovery, McpToolAccess and OrchestratorReplayRecovery, plus 23 runtimeLayer tests filtered to receipts/idempotency/usage-limit recovery. Fifty unrelated runtimeLayer tests were excluded. Exact commands, runtime versions and upstream CI are in the T3 research record.

Dependencies installed with frozen pnpm lockfile and lifecycle scripts disabled. The first install timed out; a lower-concurrency, longer-timeout retry succeeded. The generic preflight helper's npm/yarn-marker warning was resolved by checking the actual pnpm install and module resolution. These tests do not validate our T3 adapter or sandbox integration.

The sandbox assessment was a source/issue audit. No live sandbox, subscription seat or cloud deployment was tested. No production code changed during either investigation. Old quota, lock, storage or app-server/session-registration reports must be rechecked, not treated as current blockers. Never delete a lock on the strength of this historical conversation.

## How to continue

1. Read the handoff and research records; inspect applicable AGENTS instructions and current git state. Preserve this handoff, both research files, existing branches and unrelated changes.
2. Refresh upstream releases, current PR/issue state and actual reviewer readiness. Use pinned inputs for reproducible comparison; distinguish stable, nightly and main.
3. Unless the owner gives a different next instruction, prepare a bounded sandbox-reuse proposal: map one upstream provider/transport to the existing placement contract, preserve SSH-first sequencing, identify gaps, and define one end-to-end qualification. Keep WIRE's pending review and remaining acceptance explicit.
4. The qualification should transfer/recheck the exact stage, execute one harmless owned workload, produce bounded evidence, renew/cancel/release, and reject late execution after a lease is killed. Then qualify one real required subscription review leg through that same production path. Evaluate actual Gemini traffic separately before promising tooled parity.
5. Present concrete scope and trade-offs before requesting a real owner architecture/license/access decision. The research recommendations do not establish that the owner chose a dual backend, replaced srt, or waived a panel role. Routine read-only investigation and reversible preparation need no renewed permission.
6. When implementing authorized scope, panel the plan, reconcile, implement, verify, run CR with a prescript disposing continuing out-of-scope findings, reconcile/rerun until the exact source passes, obtain the required president ruling, merge with passing checks, verify post-merge, and then prune only eligible merge worktrees and close/comment related issues.

## Owner workflow and operational constraints

- Merge depends on the agent-harness panel CR and separate independent review. Branch protection is optional for this solo project; its absence is not a merge blocker by itself.
- Launch Gemini and Opus 5.5 review legs manually with tools enabled; use the qualified TUI adapter for Opus. Avoid the large agent-harness bundle for those legs. Include the required president. Read relevant advisor-panel/CLI skills and live help before executing.
- The owner previously substituted Sol for Grok due to quota until October 2. That historical date has passed; preserve the requested Sol roster unless current instructions change it, and do not assume current Grok quota either way.
- Do not count unavailable/degraded legs as approval or substitute a weaker model silently. Historical reviews carry explicit original-source binding; changed scope may require new review.
- Do not spawn worker agents unless the owner or an applicable skill explicitly authorizes delegation. The WIRE plan specifies serial execution and no worker fanout.
- Qualify every issue/PR reference with its repository. Use `rg`, read before editing, preserve unrelated changes, and batch appropriate verification. This handoff is documentation, not a verification or approval receipt.
- Probe `/etc/consiliency/team-host` before selecting worktree storage. On this team host, use `$WORKTREE_ROOT/<project>-<branch>` or the per-user workspace fallback; never share writable worktrees/build outputs between users.
- Use metadata-only operational probes before asking for access. Never print secrets. Shared credentials belong in `Consiliency Deploy Secrets`; local experiments belong in `Consiliency Development`. No live credential or runtime data was needed for these assessments.
- Do not publish packages, deploy services, relax declared confinement, choose the project license or discard preserved candidate work as incidental cleanup. Follow actual authorized scope and genuine decision requirements.

At creation, this handoff and its two research records are uncommitted documentation additions on the primary checkout. Preserve them when changing branches; commit/push through the appropriate workflow if the continuation needs to move to another machine. The existing WIRE branch is unchanged. The September 25 handoff linked earlier is historical and is no longer present at that path on current main.
