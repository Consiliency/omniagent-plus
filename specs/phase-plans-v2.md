# GP consumes the AgentRuntimeProvider seam — Phase Plan v2

> How to use this document: save to `specs/phase-plans-v2.md`, then run `/claude-plan-phase <ALIAS>` to produce the lane-level plan for each phase (→ `plans/phase-plan-v2-<alias>.md`), then `/claude-execute-phase <alias>` to build it.

> Scope note: this is a **separate initiative** from `specs/phase-plans-v1.md`. v1 is the full-depth build of the `agent-runtime-provider-omnigent` provider layer inside `omniagent-plus`. v2 is the narrow cross-repo integration that makes `governed-pipeline` (gp) the seam's first real, governed consumer, with `agent-harness` as the reference prototype. v2 depends on v1's `IF-0-ADAPTERS-10` adapter surface already existing in source; it does not re-open v1's phases.

> Provenance: shape is unanimous across the 4-vendor design panel (codex/grok/agy CLI legs + a claude governance leg), then a 4-vendor design-review panel (grok + claude APPROVE-WITH-CHANGES, agy REWORK, codex subscription-capped). This revision applies the review verdicts: **depend-path is LOCKED as the maintainer decision**; TS-conformance is moved upstream to gate publish; governance invariants are rewritten as falsifiable named CI tests; gp's existing failover chain is explicitly guarded.

> **Amendment status (2026-07-11) — CONFORM + PUBHARDEN are DONE; GPBRANCH + DEMO remain.** This roadmap was ratified before the seam packages shipped; the following four facts are now reconciled into the text below:
> 1. **Package names shipped as `@consiliency/*`** (not `@omniagent-plus/*`): `@omniagent-plus/core-contracts → @consiliency/runtime-provider`, `@omniagent-plus/governed-pipeline-adapter → @consiliency/pipeline-provider-adapter`, `@omniagent-plus/omnigent-transport → @consiliency/omnigent-transport`. Repo-relative *paths* (`omniagent-plus/packages/…`, directory names like `packages/governed-pipeline-adapter/`) are UNCHANGED — only the npm package `name` moved.
> 2. **PUBHARDEN is complete.** `@consiliency/runtime-provider@0.2.0` and `@consiliency/pipeline-provider-adapter@0.2.0` are PUBLISHED to npm, un-`private`, built to `dist/` with real `exports` (the `./conformance` subpath preserved), trusted-publisher (OIDC) provenance attached; the TS-vs-golden gate and P0a smoke passed pre-publish. `@consiliency/omnigent-transport@0.2.0` is renamed/built in source but intentionally NOT published (live transport stays a non-goal). GPBRANCH's L-DEPS therefore pins those two real published versions, not a `git`/`file:` spec.
> 3. **Provider injection is the scaffolded per-repo adapter, seeded by quickstart.** gp now ships `npx @consiliency/pipeline-cli init --quickstart` (gp#110) which scaffolds a per-repo adapter and zero-config *adapter discovery*. That scaffolded `adapterModulePath` adapter is the injection point for the runtime provider (default `FakeAgentRuntimeProvider` from `@consiliency/runtime-provider`); `harness: "provider"` / `options.runtimeProvider` selects it. Wherever this doc says "the per-repo `adapterModulePath`", read it as "the quickstart-scaffolded, discovery-resolved per-repo adapter".
> 4. **`@consiliency/pipeline-runtime` version bumps are a lockstep-ratchet release (HARD GATE).** Any bump to `packages/pipeline-runtime/package.json` version MUST move, in the same release, BOTH bootstrap templates (`packages/pipeline-runtime/templates/pipeline-bootstrap.yml` and `packages/pipeline-adapter-sdk/templates/.github/workflows/pipeline-bootstrap.yml.tmpl`) AND the vendored PROVENANCE fixture (`packages/pipeline-runtime/src/workflow/vendor/consiliency-contract/PROVENANCE.json`). gp's offloaded agent-gate (full ~2786-test suite on the `ai` host) enforces this; a bare version bump is what killed gp#111. Staging such a release is a maintainer-cut tag, not an executor action.

---

## Context

The Consiliency fleet has an advisor-panel-reviewed seam contract — `agent-runtime-provider-omnigent.v0.1` (`omniagent-plus/specs/agent-runtime-provider-omnigent-spec.md`). The seam and its gp adapter **already exist in source** but are not yet consumable end-to-end:

- `omniagent-plus` ships 10 packages, ALL `private:true`, source-only (`exports.types → ./src/*.ts`, no build), unpublished. The three that matter here: `@consiliency/runtime-provider` (`AgentRuntimeProvider` interface + zod `schemas.ts` + `FakeAgentRuntimeProvider`), `@consiliency/pipeline-provider-adapter` (`mapInvokeAgenticHarnessRequest` / `mapExecutorAdapterResult` + `examples/governed-pipeline/*.json` fixtures + `dependency-direction.test.ts` + freeze gate `IF-0-ADAPTERS-10`), and `@consiliency/omnigent-transport` (the live `OmnigentHttpProvider` HTTP path).
- `agent-harness` is the **prototype consumer (done)**: `phase_loop_runtime/agent_runtime_provider.py` ports the interface to a Python `Protocol` with `HomebrewAgentRuntimeProvider` (the advisor panel already routes legs through it, CS-0.8) and `OmnigentAgentRuntimeProvider` (agent-harness#101, merged). It is the language-neutral conformance baseline.
- `governed-pipeline` **does NOT consume the seam yet**. Its agentic boundary is `packages/pipeline-runtime/src/harness/invoke.mjs` `invokeAgenticHarness(options) → invokeNativeHarness(...)`, dispatching to per-harness native invokers (codex/claude/gemini/opencode/pi/phase-loop/fake). `loadPipelineRuntimeConfig` requires a per-repo `adapterModulePath`. gp `package.json` has no `@consiliency/*` dependency. **gp already ships a native failover chain** at the tail of `invokeNativeHarness` (`invoke.mjs:727-778`): `defaultFallbackHarnesses(harness)` / `options.fallbackHarnesses`, gated by `harnessFailureLooksRetryable(result)`, resolved by `resolveFailover(routeDecision, fallbackHarness)` (`./failover.mjs`), which **re-enters `invokeNativeHarness`** with the fallback harness. The provider path must be structurally excluded from this machinery (see Cross-Cutting Principles + GPBRANCH).

**Thesis (panel-unanimous):** introduce an **opt-in, execution-only, DEPEND-path** provider path in gp. The seam only *dispatches a turn*; gp keeps **all** governance, ratification, run-mode, worktree-lease authority, identity/profile routing, and the failover decision unchanged. Correctness order (design-review-driven): (1) the language-neutral conformance golden is authored and its four invariants proven against the `agent-harness` Python baseline FIRST (CONFORM); (2) the `@consiliency` TS types are asserted against that golden **before npm publish**, so a mismatch can never surface only in gp and force a republish (PUBHARDEN); (3) gp DEPENDS on the published packages and adds a single opt-in branch through UNCHANGED governance, with the TS compiler binding gp to the package types and governance invariants proven by negative CI tests (GPBRANCH); (4) a thin external-caller vertical proves an outside agent drives a *governed* run without bypassing governance (DEMO).

---

## Architecture North Star

```text
   ┌──────────────────────────┐
   │  external agent / caller │   drives ONE governed gp phase
   │  (Node; owns nothing gp) │
   └────────────┬─────────────┘
                │  harness: "provider"  (opt-in; branch in invokeAgenticHarness,
                ▼   BEFORE invokeNativeHarness → failover tail unreachable)
   ┌──────────────────────────────────────────────────────┐
   │  governed-pipeline (gp)                                │
   │                                                        │
   │  invokeAgenticHarness(options)                         │
   │    ├─ harness === "provider" ──► invokeProviderHarness │  ◄─ NEW leaf branch (no failover)
   │    └─ else ─────────────────────► invokeNativeHarness  │  (byte-unchanged default;
   │                                     └─ failover tail    │   defaultFallbackHarnesses/
   │                                        (727-778)        │   resolveFailover — provider EXCLUDED)
   │                                                        │
   │  invokeProviderHarness  (routes THROUGH adapterModulePath; binds gp governance/run-mode;
   │    map*Request ─► createSession ─► sendTurn ─► close     │   rejects non-empty fallbackHarnesses)
   │              ─► map*Result ─► gp executor-adapter shape  │
   │                          │                              │
   │                          ▼                              │
   │        UNCHANGED gp governance / ratify path            │  ◄─ provider output is FACTS-ONLY,
   │        (gp OWNS the ledger + worktree-lease authority;  │      UNTRUSTED until gp ratifies;
   │         gp derives the ratify verdict itself)           │      no verdict passed INTO provider
   └────────────────────────────┬───────────────────────────┘
                                │  AgentRuntimeProvider seam (execution-only, facts-only)
                                ▼
   ┌──────────────────────────────────────────────────────┐
   │  @consiliency/* (leaf; imports no consumer internals)│
   │    core-contracts: AgentRuntimeProvider + Fake + zod    │
   │    governed-pipeline-adapter: map*Request/map*Result +  │
   │      exported golden fixture (conformance.v0.1.json)    │
   │    (omnigent-transport: live HTTP path — DEFERRED)      │
   └──────────────────────────────────────────────────────┘
                                ▲
                                │  same cross-language golden (conformance.v0.1)
                ┌───────────────┴───────────────┐
                │  agent-harness (Python port)   │  conformance baseline (authored FIRST;
                │  agent_runtime_provider.py     │  snake_case ↔ camelCase mapping table)
                └────────────────────────────────┘
```

---

## Assumptions (fail-loud if wrong)

1. **RESOLVED — depend-path (was the one genuine 3-vs-1 panel split; the maintainer has decided).** The executable roadmap is **depend-path only**: PUBHARDEN publishes the packages, gp DEPENDS on them (no 3rd copy of the contract). Historical context: 3 legs (codex/grok/agy) advocated publish-first-then-depend; 1 leg (claude) advocated port-now-then-collapse if package maturity was unproven. The design-review panel unanimously found the earlier "edge relaxed / port-now fallback" language contradicted the hard dependency; it is removed from the executable plan. Port-now survives only as an out-of-band **Contingency runbook** (see Execution Notes), triggered by a re-plan if PUBHARDEN's P0a proves infeasible — not as an in-lane alternate.
2. The three `@consiliency` packages build cleanly to `dist/` with `tsc` and expose the same runtime symbols they expose today via `src/` — no source refactor, packaging only.
3. `FakeAgentRuntimeProvider` is CI-stable and can complete one `createSession → sendTurn → closeSession` turn with zod-validated inputs from a standalone consumer that imports only the package (no repo-internal imports). This is the P0a check (see IF-0-PUBHARDEN-1).
4. gp's `invokeAgenticHarness` is the correct injection point; the opt-in branch lands **in `invokeAgenticHarness`, before `invokeNativeHarness`**, so the native failover tail (`invoke.mjs:727-778`) is structurally unreachable by the provider path. The branch does not touch gp's governance/ratify path, and still binds the per-repo `adapterModulePath` governance/run-mode config.
5. gp's existing executor-adapter result shape is stable enough that `mapExecutorAdapterResult(...)` produces it without a governance-path change.
6. `agent-harness`'s `phase_loop_runtime/agent_runtime_provider.py` is the authoritative language-neutral conformance baseline; the golden is authored from the contract source + fixtures and proven against the Python provider WITHOUT the TS packages being built (so CONFORM is the root, and gates PUBHARDEN's pre-publish TS-vs-golden check).
7. v1's `IF-0-ADAPTERS-10` adapter API surface is present in `omniagent-plus` source and will not be re-shaped by concurrent v1 work during this roadmap. (If v1's ADAPTERS phase is still in flux, serialize against `omniagent-plus/packages/governed-pipeline-adapter/`.)

---

## Non-Goals

- **Live `OmnigentHttpProvider` streaming.** `omnigent-transport` is publish-hardened for consumability only; the live HTTP transport path is not wired into gp in this roadmap.
- **Adapter-of-adapters.** Native invokers (codex/claude/gemini/opencode/pi/phase-loop/fake) are NOT rewritten to become one provider impl. The provider path is a parallel opt-in branch, not a replacement.
- **Provider participation in gp's failover chain.** "provider" is excluded from `defaultFallbackHarnesses`/`resolveFailover`; a provider invocation never re-enters native dispatch.
- **Worktree leasing done BY the provider as authority, handoff packets, identity/profile lanes, multi-turn sessions.** All deferred. (Worktree-lease *authority* + identity/profile routing stay with gp throughout — see Cross-Cutting Principles.)
- **Changing gp's governance, ratify, or run-mode semantics.** The seam is execution-only; governance is untouched.
- **Port-now as an executable path.** Demoted to an out-of-band contingency runbook (Assumption 1).
- **Re-opening `omniagent-plus/specs/phase-plans-v1.md`.** v2 consumes v1's `IF-0-ADAPTERS-10` surface; it does not modify v1 phases.

---

## Cross-Cutting Principles

1. **Execution-only seam.** The `AgentRuntimeProvider` seam dispatches a turn and returns a result. It carries no governance authority. Everything crossing back into gp is data, not a decision.
2. **gp owns governance.** Provider output is **untrusted until gp ratifies it** through the UNCHANGED governance/ratify path. The provider path funnels through the same ratification as native results.
3. **FACTS-ONLY seam surface.** The seam carries only facts — events, text, exit codes, turn-state. A ratify verdict is NEVER passed INTO the provider, and a provider-reported "completed" is NEVER treated as a governance pass. gp derives the verdict itself, independently, from the facts. (Falsified by `provider_completed_with_failing_facts_fails_ratify`.)
4. **gp owns worktree-lease authority + the ledger.** gp — not the provider — is the authority over which worktree/branch a governed run targets, and gp OWNS the run ledger. The provider surface exposes no lease-grant/ledger-write; any attempt fails closed. (Falsified by `provider_cannot_lease_worktree_or_write_ledger`.)
5. **`adapterModulePath` still binds governance on the provider path.** The provider path routes THROUGH the per-repo `adapterModulePath` (governance/run-mode config still applies); it never bypasses the adapter to reach an executor directly. (Falsified by `missing_adapter_config_fails_loud_no_native_fallback`.)
6. **Identity/auth material never lands in ledger or logs.** Vendor-key header metadata is pass-through and **never-silent-key** (a missing required key fails loud, never silently proceeds). Auth material (keys, tokens, headers) MUST NOT be written to the ledger or logs. Identity/profile routing authority is unchanged. (Falsified by `auth_material_absent_from_ledger_and_logs` + `identity_profile_authority_unchanged`.)
7. **DEPEND, do not port (locked).** gp depends on the published/pinned `@consiliency/*` packages; the TS compiler binds gp to the package types. There is no in-lane port. Cross-language drift is caught upstream (TS-vs-golden before publish + the Python baseline), not by a redundant gp-side golden test.
8. **No silent fallback — concrete mechanism.** `harness: "provider"` is an explicit opt-in that branches in `invokeAgenticHarness` before the `invokeNativeHarness` failover tail. `defaultFallbackHarnesses("provider")` returns `[]` (provider is never a fallback candidate), and the provider branch **rejects a non-empty `options.fallbackHarnesses`** with the `provider_no_failover` blocker rather than re-entering native dispatch. (Falsified by `provider_with_fallbackHarnesses_fails_loud_no_native_reentry`.)
9. **Leaf-adapter dependency direction.** `@consiliency/*` adapters may depend on provider core contracts and public consumer schemas, but MUST NOT import gp or agent-harness internals. `invoke-provider.mjs` is a leaf that imports the adapter; the adapter never imports gp. Enforced by `dependency-direction.test.ts`.
10. **Native path byte-unchanged.** Every existing native-executor test stays byte-identical and green. The default (no `harness: "provider"`) code path — including the failover tail — is untouched.
11. **Repo-qualified references.** This is a multi-repo fleet; issue/PR numbers are always written `agent-harness#NNN` / `governed-pipeline#NNN` / `omniagent-plus#NNN`, never a bare `#NNN`.

---

## Phase Dependency DAG

```text
  CONFORM   (root; golden artifact conformance.v0.1.json + agent-harness Python
   │         baseline + cross-repo distribution)
   ▼
  PUBHARDEN (un-private/build/publish; TS-vs-golden conformance gate BEFORE publish;
   │         P0a consumability proof)                  ── also feeds ──┐
   ▼                                                                   │
  GPBRANCH  (gp; DEPEND-path; opt-in provider branch; governance      ◄┘
   │         negative CI tests; failover exclusion)   Depends on: PUBHARDEN, CONFORM
   ▼
  DEMO      (thinnest governed vertical)
```

- `CONFORM` is the sole **root**. It gates PUBHARDEN (its golden is the pre-publish TS-vs-golden target) and GPBRANCH (which consumes the conformance-proven, distribution-exported package; gp itself runs no golden test — the TS compiler + PUBHARDEN's TS-vs-golden bind it).
- Critical path: `CONFORM → PUBHARDEN → GPBRANCH → DEMO` — deliberately serial. The earlier PUBHARDEN∥CONFORM parallelism was traded away for the review panel's two correctness gates (golden-before-consumption + TS-conformance-before-publish); this is an intentional trade, not a regression.
- Intra-phase overlap: PUBHARDEN's un-private/build lanes (L-CORE/L-ADAPTER/L-TRANSPORT) may begin alongside CONFORM; only the L-PUBLISH gate (TS-vs-golden + npm publish) consumes CONFORM's golden freeze.

---

## Top Interface-Freeze Gates

These gates are the narrowest contracts that unblock downstream phases. `/claude-plan-phase` concretizes each (exact signature/schema/version) when it plans the owning phase. (v1's adapter freeze gate — the `governed-pipeline-adapter` API surface — is an **upstream** input to this roadmap, not produced here.)

1. **IF-0-CONFORM-1** — the **frozen conformance golden**. Artifact: `omniagent-plus/examples/governed-pipeline/conformance.v0.1.json` (schema id `conformance.v0.1`). Contents: four invariant tables — (a) method names, (b) event-type strings, (c) terminal states, (d) error categories — plus a **method-name mapping table** pinning the snake_case ↔ camelCase correspondence (Python `create_session`/`send_turn`/`read_history`/`close_session` ↔ TS `createSession`/`sendTurn`/`readHistory`/`closeSession`) so a mutation test can distinguish real drift from a naming-convention delta. **Cross-repo distribution mechanism:** the golden is exported as a package subpath in `governed-pipeline-adapter`'s `exports` (`"./conformance"` → the `conformance.v0.1.json`); gp resolves it via that export, and `agent-harness` pins a vendored copy guarded by a committed checksum. (Source-first: no pinned `@consiliency` runtime version is part of this gate.)
2. **IF-0-PUBHARDEN-1** — the **consumable package surface** for `@consiliency/runtime-provider` and `@consiliency/pipeline-provider-adapter`: `private` removed; a real `tsc` build to `dist/`; `exports` map pointing at built `./dist/*.js` + `./dist/*.d.ts` (not `./src/*.ts`), **preserving** the `./conformance` subpath from IF-0-CONFORM-1; a pinned consumable version. **P0a (crisp, machine-checkable):** the package installs into a scratch directory (`npm pack` tarball or pinned `git`/`file:` spec) and a standalone consumer importing only `@consiliency/runtime-provider` runs `new FakeAgentRuntimeProvider()` through one `createSession → sendTurn → closeSession` turn and exits 0. **Pre-publish TS-vs-golden:** the `@consiliency` TS types are asserted to conform to IF-0-CONFORM-1 BEFORE publish. Accountable signer of P0a: the PUBHARDEN release owner (the maintainer), via the pre-publish cross-vendor CR — evidence is the exit-0 smoke, not a human gate. Frozen importable symbols: `FakeAgentRuntimeProvider`, `AgentRuntimeProvider`, `mapInvokeAgenticHarnessRequest`, `mapExecutorAdapterResult`. **SHIPPED (2026-07-11):** this gate is CLOSED — `@consiliency/runtime-provider@0.2.0` + `@consiliency/pipeline-provider-adapter@0.2.0` are published to npm (un-`private`, `dist/` build, `./conformance` preserved, trusted-publisher/OIDC provenance); TS-vs-golden and the P0a exit-0 smoke passed pre-publish.
3. **IF-0-GPBRANCH-1** — the **provider-executor-result contract**: the `harness: "provider"` (or `options.runtimeProvider`) opt-in switch in `invokeAgenticHarness` (before `invokeNativeHarness`), and the shape `invokeProviderHarness(options)` returns — gp's existing executor-adapter result shape, produced by `mapExecutorAdapterResult(...)`, flowing through the UNCHANGED governance/ratify path. Includes: the provider-injection contract (the quickstart-scaffolded, discovery-located per-repo `adapterModulePath` adapter — `npx @consiliency/pipeline-cli init --quickstart`, gp#110 — default `FakeAgentRuntimeProvider`) that still binds governance/run-mode; and the **failover-exclusion contract** (`defaultFallbackHarnesses("provider") === []`; provider branch rejects non-empty `options.fallbackHarnesses` with the `provider_no_failover` blocker).
4. **IF-0-GPBRANCH-2** — the **L-DEPS intra-phase import surface** (fulfils agy's requested DEPS import-surface freeze, named per the `IF-0-<phase>` convention because gate aliases must be defined phases): the exact set of importable symbols + their source specifiers that gp pins from the published `@consiliency/runtime-provider@0.2.0` + `@consiliency/pipeline-provider-adapter@0.2.0`, frozen on L-DEPS's first day so `invoke-provider.mjs` (L-PROVIDER) compiles against a stable surface.
5. **IF-0-DEMO-1** — the **reference governed-provider vertical**: the external-caller entrypoint + the named assertion set proving provider output is untrusted-until-ratified, native tests unchanged, governance fails-closed without adapter config, no auth material in ledger/logs, and a correlated session id end-to-end.

---

## Phases

### Phase 0 — Cross-language conformance golden + baseline (CONFORM)

> **Status: ✅ DONE (2026-07-11).** The golden `conformance.v0.1.json` ships, is exported as the `./conformance` subpath of `@consiliency/pipeline-provider-adapter`, the `agent-harness` Python baseline test + mutation-bites case are green, and the checksummed vendored copy landed (agent-harness#138). Retained below as the ratified record; no executor action remains.

**Objective**
Author the language-neutral conformance golden (`conformance.v0.1.json`) — four invariant tables + the snake_case↔camelCase method-name mapping — prove it against the `agent-harness` Python provider baseline, and publish the cross-repo distribution mechanism, so downstream TS-vs-golden (PUBHARDEN) and gp consumption (GPBRANCH) are gated by a proven contract.

**Exit criteria**
- [ ] `omniagent-plus/examples/governed-pipeline/conformance.v0.1.json` exists (schema id `conformance.v0.1`) with the four invariant tables + the method-name mapping table.
- [ ] An `agent-harness` Python conformance test (`test_conformance_golden.py`) asserts `phase_loop_runtime/agent_runtime_provider.py` matches the golden, resolving snake_case names via the mapping table.
- [ ] `test_conformance_golden.py::mutation_bites` — mutating one event-string in a scratch copy makes the Python test fail; mutating only a naming-convention delta (snake↔camel) does NOT (the mapping table absorbs it).
- [ ] The golden is exported as `governed-pipeline-adapter`'s `./conformance` subpath, and `agent-harness` vendors a checksummed copy.

**Scope notes**
- Decompose into 3 lanes, disjoint by concern:
  - **L-GOLDEN** — `omniagent-plus/examples/governed-pipeline/conformance.v0.1.json` (owns the artifact; freezes IF-0-CONFORM-1 on day one so the baseline + distribution lanes work against a frozen set).
  - **L-AH-BASELINE** — `agent-harness/**` Python conformance test + the mutation-bites negative case (real drift vs naming-convention delta).
  - **L-DISTRIB** — the distribution mechanism: add the `./conformance` export subpath to `omniagent-plus/packages/governed-pipeline-adapter/package.json`; add the vendored checksummed copy + checksum test in `agent-harness`.
- **This phase is the ROOT — depends on NOTHING.** It is authored from the contract source + fixtures; it does NOT need the TS packages built (that is PUBHARDEN's TS-vs-golden gate, which consumes this golden).
- **Single-writer note (cross-phase):** L-DISTRIB adds the `./conformance` subpath to `governed-pipeline-adapter/package.json`; PUBHARDEN's L-ADAPTER later rewrites that same `exports` for `dist/` and MUST PRESERVE the `./conformance` subpath. Recorded in Execution Notes.

**Non-goals**
- Testing gp or the TS package against the golden (TS-vs-golden is PUBHARDEN; gp is bound by the compiler + a thin smoke in GPBRANCH).

**Key files**
- `omniagent-plus/examples/governed-pipeline/conformance.v0.1.json` (create)
- `omniagent-plus/packages/governed-pipeline-adapter/package.json` (add `./conformance` export; single-writer w.r.t. PUBHARDEN L-ADAPTER)
- `agent-harness/phase_loop_runtime/agent_runtime_provider.py` (assert against; do not reshape)
- `agent-harness/**` conformance test + vendored golden copy + checksum (new)

**Depends on**
- (none)

**Produces**
- IF-0-CONFORM-1

**Spec closeout policy**
- schema: `spec_delta_closeout.v1`
- decision: `canonical_spec_update`
- target surfaces: `omniagent-plus/examples/governed-pipeline/conformance.v0.1.json`, `omniagent-plus/packages/governed-pipeline-adapter/package.json`
- evidence paths: `omniagent-plus/conformance-agent-harness.log`, `omniagent-plus/conformance-mutation.log`
- redaction posture: `metadata_only`
- routing: on missing/malformed conformance or mutation evidence, `blocker_class=contract_bug` (non-human).

---

### Phase 1 — Publish-harden the seam packages (PUBHARDEN)

> **Status: ✅ DONE (2026-07-11).** `@consiliency/runtime-provider@0.2.0` + `@consiliency/pipeline-provider-adapter@0.2.0` are published to npm (un-`private`, `dist/` build, real `exports` with `./conformance` preserved, trusted-publisher/OIDC provenance); TS-vs-golden and the P0a exit-0 `FakeAgentRuntimeProvider` smoke passed pre-publish. `@consiliency/omnigent-transport@0.2.0` is renamed/built in source but intentionally UNpublished (live transport is a non-goal). Retained below as the ratified record; no executor action remains — GPBRANCH consumes these as pinned deps.

**Objective**
Make `@consiliency/{runtime-provider,pipeline-provider-adapter,omnigent-transport}` consumable — un-private, build to `dist/`, real `exports` (preserving the golden `./conformance` subpath), pinned version — assert the TS types conform to the IF-0-CONFORM-1 golden **before** publish, and prove P0a consumability from a standalone consumer.

**Exit criteria**
- [ ] `cd omniagent-plus && pnpm -r build` produces `dist/` for the three packages with `.js` + `.d.ts` entrypoints matching each package's `exports` map; `governed-pipeline-adapter` retains its `./conformance` subpath.
- [ ] None of the three packages carries `"private": true`; each has a pinned consumable version and an `exports` map pointing at `./dist/*`, not `./src/*.ts`.
- [ ] **TS-vs-golden (load-bearing):** `test_ts_conformance.ts` asserts the `@consiliency` TS types match IF-0-CONFORM-1 (all four invariant tables via the mapping); mutating one golden event-string in a scratch copy makes it fail. This runs BEFORE publish.
- [ ] **P0a:** the package installs into a scratch directory and a standalone consumer importing only `@consiliency/runtime-provider` completes one `FakeAgentRuntimeProvider` turn and exits 0 (`omniagent-plus/scripts/smoke-fake-provider.mjs`).
- [ ] `dependency-direction.test.ts` still green (adapter imports no consumer internals).

**Scope notes**
- Decompose into 5 lanes:
  - **L-CORE** — `omniagent-plus/packages/core-contracts/` (un-private, `tsc`→`dist/`, `exports`, version). Owns root `pnpm-workspace.yaml` / `tsconfig*.json` (single-writer within the phase).
  - **L-ADAPTER** — `omniagent-plus/packages/governed-pipeline-adapter/` (un-private, build, `exports` for `dist/`; **PRESERVE the `./conformance` subpath CONFORM's L-DISTRIB added**; preserves the `IF-0-ADAPTERS-10` surface).
  - **L-TRANSPORT** — `omniagent-plus/packages/omnigent-transport/` (build/`exports`-only; live `OmnigentHttpProvider` path stays a non-goal).
  - **L-TSCONFORM** — `test_ts_conformance.ts`: assert TS types vs IF-0-CONFORM-1 before publish (the load-bearing conformance check). Consumes CONFORM's golden.
  - **L-PUBLISH-SMOKE** — `omniagent-plus/scripts/smoke-fake-provider.mjs` + scratch-dir install (P0a) + CHANGELOG; gated by L-TSCONFORM (do not publish until TS-vs-golden is green).
- L-CORE/L-ADAPTER/L-TRANSPORT may start alongside CONFORM; L-TSCONFORM + L-PUBLISH-SMOKE consume CONFORM's golden freeze.
- The publish is a public-surface change → decision gate: cross-vendor CR before npm publish (or land a pinned `git`/`file:` dep first). See `public-repo-admin-merge-cr-gate`.

**Non-goals**
- Wiring the live `OmnigentHttpProvider` HTTP transport into any consumer; changing the provider interface symbols (packaging only).

**Key files**
- `omniagent-plus/packages/core-contracts/package.json`
- `omniagent-plus/packages/governed-pipeline-adapter/package.json` (preserve `./conformance`)
- `omniagent-plus/packages/omnigent-transport/package.json`
- `omniagent-plus/packages/*/tsconfig.json`, `omniagent-plus/pnpm-workspace.yaml`, `omniagent-plus/tsconfig*.json`
- `omniagent-plus/packages/governed-pipeline-adapter/test_ts_conformance.ts` (create)
- `omniagent-plus/scripts/smoke-fake-provider.mjs` (create)
- `omniagent-plus/CHANGELOG.md`

**Depends on**
- CONFORM

**Produces**
- IF-0-PUBHARDEN-1

**Spec closeout policy**
- schema: `spec_delta_closeout.v1`
- decision: `canonical_spec_update`
- target surfaces: `omniagent-plus/packages/{core-contracts,governed-pipeline-adapter,omnigent-transport}/package.json`, `omniagent-plus/CHANGELOG.md`
- evidence paths: `omniagent-plus/dist-build.log`, `omniagent-plus/ts-conformance.log`, `omniagent-plus/scripts/smoke-fake-provider.out`
- redaction posture: `metadata_only`
- routing: on missing/malformed build, TS-conformance, or smoke evidence, `blocker_class=contract_bug` (non-human).

---

### Phase 2 — GP opt-in provider branch (GPBRANCH)

**Objective**
Add an explicit, opt-in `harness: "provider"` branch in gp's `invokeAgenticHarness` (before `invokeNativeHarness`) that maps a request → `createSession`/`sendTurn`/`closeSession` → an executor-adapter result via the depended-upon `@consiliency` adapter, flowing through gp's UNCHANGED governance/ratify path. Native default (including the failover tail) byte-unchanged; provider excluded from failover; governance invariants proven by falsifiable negative CI tests.

**Exit criteria**
- [ ] `governed-pipeline/package.json` + `packages/pipeline-runtime/package.json` pin the published `@consiliency/runtime-provider@0.2.0` and `@consiliency/pipeline-provider-adapter@0.2.0` (the real IF-0-PUBHARDEN-1 versions on npm, trusted-publisher provenance), not a `git`/`file:` spec; L-DEPS freezes the import surface as IF-0-GPBRANCH-2.
- [ ] `invokeAgenticHarness` routes to `invokeProviderHarness(options)` when `options.harness === "provider"` (or `options.runtimeProvider` is set), **before** reaching `invokeNativeHarness`; otherwise the existing native dispatch (and its failover tail) is byte-unchanged.
- [ ] `invokeProviderHarness` (`packages/pipeline-runtime/src/harness/invoke-provider.mjs`) runs `mapInvokeAgenticHarnessRequest → createSession → sendTurn → consume-to-terminal/read_history → closeSession → mapExecutorAdapterResult` and returns gp's existing executor-adapter result shape; it imports no gp internals (leaf rule).
- [ ] **Import-surface smoke** (`provider-import-surface.smoke.mjs`): the four importable symbols resolve from `@consiliency/*`. (gp's conformance is bound by the TS compiler + PUBHARDEN's TS-vs-golden; no redundant gp-side golden test.)
- [ ] **Failover exclusion:** `defaultFallbackHarnesses("provider")` returns `[]`; and `provider-no-failover.test.mjs::provider_with_fallbackHarnesses_fails_loud_no_native_reentry` — a provider invocation with a non-empty `options.fallbackHarnesses` returns the `provider_no_failover` blocker and never re-enters `invokeNativeHarness`.
- [ ] **FACTS-ONLY** (`provider-facts-only.test.mjs::provider_completed_with_failing_facts_fails_ratify`): a Fake that returns terminal "completed" but FAILING facts → gp ratify FAILS (verdict derived by gp, never accepted from the provider).
- [ ] **adapterModulePath binds governance** (`provider-config-missing.test.mjs::missing_adapter_config_fails_loud_no_native_fallback`): missing `adapterModulePath`/provider config → loud fail, NO native fallback.
- [ ] **No auth leak** (`provider-no-auth-leak.test.mjs::auth_material_absent_from_ledger_and_logs`): inject a sentinel key/header (`X-Provider-Key: SENTINEL_DO_NOT_LOG`) in provider options; grep the ledger + logs asserts the pattern `SENTINEL_DO_NOT_LOG` is ABSENT; a missing required key fails loud (never-silent-key).
- [ ] **gp sole authority** (`provider-no-authority.test.mjs::provider_cannot_lease_worktree_or_write_ledger`): a stub provider that attempts a worktree lease / ledger write cannot — the provider surface exposes no lease-grant/ledger-write; the attempt fails closed; gp remains the sole authority.
- [ ] **Identity unchanged** (`provider-identity-unchanged.test.mjs::identity_profile_authority_unchanged`): identity/profile routing authority on the provider path is byte-equivalent to native.
- [ ] Every existing native-executor test (including the failover tail) is byte-unchanged and green; there is NO provider→native fallback path.
- [ ] **Provider injection via the scaffolded adapter** (reconciled to gp#110): the provider is resolved through the quickstart-scaffolded, discovery-located per-repo adapter (`npx @consiliency/pipeline-cli init --quickstart`), whose `adapterModulePath` returns the runtime provider (default `FakeAgentRuntimeProvider` from `@consiliency/runtime-provider`). No new bespoke config surface is introduced; the provider branch reuses the existing scaffolded-adapter discovery.
- [ ] **Lockstep-ratchet gate (HARD GATE — do NOT ship a bare bump):** IF adding these deps forces a `@consiliency/pipeline-runtime` version bump, the SAME change set must move `packages/pipeline-runtime/package.json` version, BOTH bootstrap templates (`packages/pipeline-runtime/templates/pipeline-bootstrap.yml`, `packages/pipeline-adapter-sdk/templates/.github/workflows/pipeline-bootstrap.yml.tmpl`), AND the vendored PROVENANCE fixture (`packages/pipeline-runtime/src/workflow/vendor/consiliency-contract/PROVENANCE.json`) together; gp's offloaded agent-gate enforces it (bare bump = the gp#111 failure). Prefer landing GPBRANCH WITHOUT a runtime version bump; if a bump is unavoidable, stage the lockstep-ratchet release for the maintainer to cut (this is a release-tag HARD GATE, not an executor action).

**Scope notes**
- Decompose into 5 lanes:
  - **L-DEPS** — pin the built `@consiliency` deps + lockfile; freeze the import surface as IF-0-GPBRANCH-2 (intra-phase, day one) so L-PROVIDER compiles against it. Depend-path only — no port alternate (Assumption 1).
  - **L-BRANCH** — the opt-in switch in `packages/pipeline-runtime/src/harness/invoke.mjs`, placed in `invokeAgenticHarness` **before** `invokeNativeHarness`; set `defaultFallbackHarnesses("provider") = []`. **`invoke.mjs` is single-writer — L-BRANCH owns it**; the native path + failover tail stay byte-identical. Freezes IF-0-GPBRANCH-1 day one.
  - **L-PROVIDER** — create `packages/pipeline-runtime/src/harness/invoke-provider.mjs` (map→session→result; routes through `adapterModulePath`; rejects non-empty `fallbackHarnesses` with `provider_no_failover`; leaf).
  - **L-GOVERNANCE** — the six named negative CI tests above (facts-only, config-missing, no-auth-leak, no-authority, identity-unchanged, no-failover-reentry). Owns the governance test files.
  - **L-SMOKE-GP** — the import-surface smoke + the native-byte-unchanged guard (checksum/no-diff on native + failover test files).
- L-PROVIDER depends on L-DEPS's IF-0-GPBRANCH-2 + L-BRANCH's IF-0-GPBRANCH-1 (both frozen day one).
- Serialize against gp's `packages/pipeline-runtime/src/harness/` if GP-RUNNER / un-vendor R3 work touches the same tree (see `fleet-unification-spine-vs-outer-ring`).

**Non-goals**
- Any governance/ratify code change; any change to `loadPipelineRuntimeConfig` beyond reading the provider `adapterModulePath`; any change to the native failover tail.
- Multi-turn sessions, live transport, handoff packets, provider-as-worktree-authority, a redundant gp-side golden test.

**Key files**
- `governed-pipeline/package.json`, `governed-pipeline/packages/pipeline-runtime/package.json`
- `governed-pipeline/packages/pipeline-runtime/src/harness/invoke.mjs` (modify; single-writer; branch before `invokeNativeHarness`; `defaultFallbackHarnesses`)
- `governed-pipeline/packages/pipeline-runtime/src/harness/invoke-provider.mjs` (create)
- `governed-pipeline/packages/pipeline-runtime/src/harness/provider-*.test.mjs` (governance negative tests; do not edit native/failover tests)
- `governed-pipeline/CHANGELOG.md`

**Depends on**
- PUBHARDEN
- CONFORM

**Produces**
- IF-0-GPBRANCH-1
- IF-0-GPBRANCH-2

**Spec closeout policy**
- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `governed-pipeline/packages/pipeline-runtime/src/harness/invoke.mjs`, `governed-pipeline/packages/pipeline-runtime/src/harness/invoke-provider.mjs`
- evidence paths: `governed-pipeline/test-native-unchanged.log`, `governed-pipeline/test-provider-path.log`, `governed-pipeline/test-governance-invariants.log`, `governed-pipeline/test-provider-no-failover.log`
- redaction posture: `metadata_only`
- routing: on missing/malformed test evidence, `blocker_class=contract_bug` (non-human).

---

### Phase 3 — Thinnest governed vertical demo (DEMO)

**Objective**
Prove the goal end-to-end with the smallest load-bearing vertical: an external Node caller drives ONE existing gp governed phase via `harness: "provider"` + `FakeAgentRuntimeProvider`, and gp's governance still owns the outcome — asserted by named tests.

**Exit criteria**
- [ ] An external Node caller (owns no gp internals) drives one existing gp governed phase/tick through `harness: "provider"` + `FakeAgentRuntimeProvider` (`governed-pipeline/examples/provider-demo/run.mjs`).
- [ ] `demo-vertical.test.mjs::untrusted_until_ratified` — provider output is untrusted until gp ratifies (governance ran, not bypassed; the verdict is gp's, not the provider's "completed").
- [ ] `demo-vertical.test.mjs::native_tests_unchanged` — the default native-path tests remain unchanged and green.
- [ ] `demo-vertical.test.mjs::fails_closed_without_adapter_config` — governance fails closed when `adapterModulePath`/provider config is missing (no silent success, no fallback to native).
- [ ] `demo-vertical.test.mjs::no_auth_material_in_ledger_or_logs` — the sentinel key/header does not appear in the ledger or logs for the governed run.
- [ ] `demo-vertical.test.mjs::correlated_session_id_end_to_end` — a correlated session id is visible end-to-end (caller → provider → gp result).

**Known scope boundary (first-class — a demonstrated reachability limit, NOT a bug)**
gp consumes the seam at the **`invokeAgenticHarness` tick boundary** — reachable today and demonstrated by this DEMO: an external caller drives `harness:"provider"`, and gp derives the executor-adapter status from the provider's emitted facts (status flips success→failed on the failing facts, independent of the provider's "completed" claim). What the DEMO does **not** exercise is the **full pipeline governed-RUN path** `execute-phase → runNode`: that path is **text-consuming** (it gates on `result.text` at `runNode` ~`:921` and parses BAML at ~`:1030`), so a **facts-only** provider result produces no text and cannot flow through it today. Reconciling that is a **deferred design follow-on**, not in DEMO scope — either `invoke-provider` surfaces the agent response text, or `execute-phase` grows a facts-native execution path. This is a known scope boundary of the seam's current reach, not a defect. The DEMO therefore proves the *governed tick* is consumable end-to-end; it does not claim the *whole run loop* consumes a facts-only provider yet.

**Scope notes**
- Decompose into 2 lanes:
  - **L-CALLER** — `governed-pipeline/examples/provider-demo/` external caller entrypoint driving one governed phase via the provider branch.
  - **L-ASSERT** — `demo-vertical.test.mjs` with the five named assertions. Owns test files; disjoint from the caller entrypoint.
- Terminal phase — no downstream freeze; IF-0-DEMO-1 documents the reference vertical for future consumers.
- Uses only `FakeAgentRuntimeProvider` (from PUBHARDEN) — no live transport.
- **Primary proof is un-fabricated**; the runtime-enforcement gate is a *secondary* illustration fed FIXTURE cage/ledger evidence (`enforcement-evidence.mjs`) — the fixture is clearly labeled and never presented as how a real governed caller produces evidence, so the DEMO does not re-introduce the rejected runtime-ledger Option B.

**Non-goals**
- Any real agent/backend; live `OmnigentHttpProvider`; multi-turn; new gp governed phases (reuse an existing one).

**Key files**
- `governed-pipeline/examples/provider-demo/run.mjs` (create)
- `governed-pipeline/examples/provider-demo/demo-vertical.test.mjs` (create)
- `governed-pipeline/packages/pipeline-runtime/src/harness/invoke-provider.mjs` (consume; do not modify)

**Depends on**
- GPBRANCH

**Produces**
- IF-0-DEMO-1

**Spec closeout policy**
- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `governed-pipeline/examples/provider-demo/`
- evidence paths: `governed-pipeline/demo-vertical.log`
- redaction posture: `metadata_only`
- routing: on missing/malformed demo evidence, `blocker_class=contract_bug` (non-human).

---

## Execution Notes

- **Planning**: `/claude-plan-phase CONFORM` first (the root). Then `/claude-plan-phase PUBHARDEN`, then `/claude-plan-phase GPBRANCH`, then `/claude-plan-phase DEMO`. The DAG is serial — no two phases share the "no common ancestor" property, so plan/execute in order.
- **Execution**: `/claude-execute-phase conform → pubharden → gpbranch → demo`. Intra-phase overlap only: PUBHARDEN's build/un-private lanes can begin while CONFORM finishes; the publish gate waits on CONFORM's golden.
- **Critical path**: `CONFORM → PUBHARDEN → GPBRANCH → DEMO`. This is deliberately serial: the review panel required golden-before-consumption and TS-conformance-before-publish, trading the earlier PUBHARDEN∥CONFORM parallelism for those two gates.
- **Single-writer files across phases**: `omniagent-plus/packages/governed-pipeline-adapter/package.json` — CONFORM's L-DISTRIB adds the `./conformance` export subpath; PUBHARDEN's L-ADAPTER rewrites `exports` for `dist/` and MUST PRESERVE that subpath. `governed-pipeline/packages/pipeline-runtime/src/harness/invoke.mjs` — touched only by GPBRANCH (L-BRANCH), native + failover tail byte-unchanged. `agent-harness/phase_loop_runtime/agent_runtime_provider.py` — read-only (CONFORM asserts against it).
- **Cross-repo**: CONFORM = `omniagent-plus` + `agent-harness`; PUBHARDEN = `omniagent-plus`; GPBRANCH = `governed-pipeline`; DEMO = `governed-pipeline`.
- **Contingency runbook (out-of-band, port-now):** if PUBHARDEN's P0a proves infeasible (the packages cannot be made consumable in a reasonable window), do NOT silently degrade GPBRANCH. Trigger an out-of-band re-plan that temporarily PORTS a minimal `AgentRuntimeProvider` interface into gp (born conformant against IF-0-CONFORM-1 via the vendored golden), unblocks GPBRANCH, and records a collapse-to-dependency debt item to remove the port once P0a is green. This is a re-plan trigger, not an executable lane in this roadmap (Assumption 1).

---

## Acceptance Criteria

- [ ] The conformance golden `conformance.v0.1.json` exists, passes against the `agent-harness` Python baseline, and a one-string mutation makes the Python test fail while a snake↔camel delta does not.
- [ ] `@consiliency/{runtime-provider,pipeline-provider-adapter}` are consumable (built, versioned, un-private, `./conformance` preserved); TS-vs-golden passes BEFORE publish; and a standalone script completes one `FakeAgentRuntimeProvider` turn (P0a, exit 0).
- [ ] `gp invokeAgenticHarness({harness:"provider", ...})` runs create→turn→close and returns gp's executor-adapter result through the UNCHANGED governance/ratify path; gp is bound to the package types by the TS compiler + the import-surface smoke (no redundant gp-side golden test).
- [ ] Governance invariants hold as named negative tests: facts-only (provider "completed" + failing facts → ratify fails), adapterModulePath-missing → loud fail no native fallback, no auth material in ledger/logs, provider cannot lease worktree / write ledger, identity/profile authority unchanged.
- [ ] Failover exclusion holds: `defaultFallbackHarnesses("provider") === []` and a provider invocation with `fallbackHarnesses` set fails loud with `provider_no_failover`, never re-entering native dispatch.
- [ ] Every existing native executor (codex/claude/gemini/opencode/pi/phase-loop/fake) test AND the failover tail are byte-unchanged and green; there is NO silent provider→native fallback.
- [ ] The vertical demo proves (by named tests) untrusted-until-ratified, native-unchanged, fails-closed without adapter config, no auth material in ledger/logs, and a correlated session id end-to-end.

---

## Verification

```bash
# Phase 0 — CONFORM: golden proven against the agent-harness Python baseline (root)
cd ~/code/agent-harness && python3 -m pytest -k conformance
#   test_conformance_golden.py green; mutation_bites: flip an event-string → FAILS; snake↔camel delta → PASSES

# Phase 1 — PUBHARDEN: TS types conform to the golden BEFORE publish; P0a consumability
cd ~/code/omniagent-plus && pnpm -r build
pnpm test -- test_ts_conformance          # TS-vs-golden green; flip a golden string in a scratch copy → FAILS
node scripts/smoke-fake-provider.mjs       # P0a: createSession → sendTurn → closeSession, exit 0
# install into a scratch dir and re-run the smoke from there (no repo-internal imports)

# Phase 2 — GPBRANCH: provider branch + failover exclusion + governance negative tests
cd ~/code/governed-pipeline && pnpm install && pnpm test
#   provider-import-surface.smoke.mjs green (symbols resolve; TS compiler binds types);
#   provider-no-failover.test.mjs: fallbackHarnesses set → provider_no_failover, no native re-entry;
#   provider-facts-only / provider-config-missing / provider-no-auth-leak / provider-no-authority /
#     provider-identity-unchanged — all green;
#   ALL existing native-executor + failover-tail tests byte-unchanged and green

# Phase 3 — DEMO: external caller drives one governed gp phase via Fake provider
cd ~/code/governed-pipeline && node examples/provider-demo/run.mjs && pnpm test -- demo-vertical
#   untrusted_until_ratified, native_tests_unchanged, fails_closed_without_adapter_config,
#   no_auth_material_in_ledger_or_logs, correlated_session_id_end_to_end — all green
```
