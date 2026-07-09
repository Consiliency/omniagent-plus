# Detailed plan: adapt Omnigent transport contract to official v0.4.0

## Task

Update `omniagent-plus` from its `v0.3.0`/`v0.4.0dev0` Omnigent contract posture to the official upstream `omnigent` `v0.4.0` release, without chasing unreleased `main` behavior. The implementation must refresh release evidence, promote already-added forward compatibility to stable `v0.4.0` support, add the missing public harness catalog/read-state snapshot details, expand the SSE event allowlist, and preserve current blocked/emulated capability decisions for non-public surfaces.

## Research summary

The repo is clean on `main` at `4d57b26f588f208be39a006c0ec919fe19d68487`; `git log -5` shows the last local changes were the dev-tag compatibility update, upstream-readiness docs, HARDEN, HARDEN planning, and UI read model. There is no repo-local `AGENTS.md` or `CLAUDE.md`; use the in-chat instructions plus existing repo docs.

The frozen contract currently names `v0.3.0` in `docs/omnigent-contract.md`, including the supported version lines at `docs/omnigent-contract.md:6-19`, the HTTP surface table at `docs/omnigent-contract.md:46-63`, the stream event families at `docs/omnigent-contract.md:117-154`, and the capability matrix at `docs/omnigent-contract.md:170-185`. `docs/omnigent-upstream-readiness.md:7-35` still says `v0.3.0` is latest and treats `v0.4.0dev0` as prerelease-only, while `docs/omnigent-transport.md:7-13` describes `read-state` as additive prerelease compatibility.

Current transport code already includes some `v0.4.0dev0` support: `packages/omnigent-transport/src/types.ts:21-28` includes `launching` and `waiting`, `packages/omnigent-transport/src/types.ts:89-105` includes `background_task_count` and viewer read-state fields, and `packages/omnigent-transport/src/http-client.ts:103-115` implements `PUT /v1/sessions/{session_id}/read-state`. The current SSE allowlist at `packages/omnigent-transport/src/types.ts:41-59` only covers the v0.3-era session/response/turn events, and the parser at `packages/omnigent-transport/src/sse-stream.ts:16-60` skips unknown event types.

Live upstream evidence observed during planning: official `v0.4.0` is published on GitHub and PyPI; tag commit is `31669e1b413216c865d0ed7dfb469fb142c889f5`; current `main` is ahead at `0e6e2ec14d9e04c6acc22a342a7f490a889eb87b` with terminal transport work, but no OpenAPI path changes since `v0.4.0`. The `v0.4.0` OpenAPI delta relevant to this provider boundary adds `GET /v1/harnesses` and `PUT /v1/sessions/{session_id}/read-state`; most release-note surface is UI, admin, resources, permissions, policies, and native-harness behavior that should not become provider-required in this bounded change.

Three-agent panel amendment: Codex returned `DISAGREE` while reviewing the repo as if this implementation already existed, so treat that as a scope reminder rather than a plan blocker. Gemini returned `DEGRADED`/`DISAGREE` and specifically challenged `GET /v1/harnesses` and `active_response_id`; reconcile that with a fresh official `v0.4.0` OpenAPI/tag preflight before coding and amend again if either fact is absent. Claude Fable returned `PARTIALLY AGREE` and identified one concrete missed test file: `packages/omnigent-transport/src/capability-probe.test.ts:24` still asserts `snapshot.version` is `"0.3.0"`.

## Changes

### `docs/omnigent-contract.md` (modify)

- `Supported Version` — modify — update freeze target from `v0.3.0` to official `v0.4.0`, including tag commit, publish timestamp, package version, Python requirement, and current-main observation.
- `Source Provenance` — modify — add `omnigent/server/routes/harnesses.py`, `omnigent/harness_plugins.py`, `omnigent/server/schemas.py`, and current SDK/session source to the inspected source list; keep metadata-only probe posture.
- `HTTP API Surface` — modify — add `GET /v1/harnesses` as public read-only harness catalog and promote `PUT /v1/sessions/{session_id}/read-state` from prerelease to stable public surface.
- `Session status drift` — modify — remove the old `v0.3.0` OpenAPI-drift framing for `waiting`; record that `v0.4.0` OpenAPI now includes `waiting`, while `launching` remains a tolerated raw status edge that maps to `starting`.
- `Event Stream` — modify — update the pinned `ServerStreamEvent` families to include the official `v0.4.0` union while preserving the no-replay, `[DONE]`, malformed-frame skip, and duplicate-terminal normalization rules.
- `Capability Matrix` — modify — add a `harness_catalog` capability as `supported`; keep `child_session` as observe/fork only and `harness_override` as blocked unless a public API explicitly documents stable launch-time override.

### `docs/omnigent-upstream-readiness.md` (modify)

- `Current Decision` — modify — mark `v0.4.0` as the latest official release and note that previous `v0.4.0dev0` compatibility is now mostly stable release surface.
- `Unreleased Main Delta` — modify — narrow this section to current `main` only, especially tmux control-mode terminal transport, and state that it does not change the provider-bound OpenAPI path set from `v0.4.0`.
- `Bring-Up Plan` — modify — replace the future-release bring-up instructions with a post-adaptation maintenance note for the next official release.

### `docs/omnigent-transport.md` (modify)

- `HTTP mode` — modify — state that `read-state` and harness catalog support are official `v0.4.0` public surface, not prerelease compatibility.
- `Event And Failure Mapping` — modify — describe the expanded v0.4 event allowlist and clarify that UI/admin/resource-only events are accepted and no-op mapped unless they affect provider state.

### `docs/lifecycle-and-events.md` (modify)

- `Upstream Drift` — modify — update the drift note so `waiting` is no longer described as omitted from release OpenAPI; keep `launching` normalization and skipped unknown/malformed frame behavior.

### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` — modify — update tag, commit, publish timestamp, package version, and observed source metadata to official `v0.4.0`.
- `head_probe` — modify — update current main head to the latest observed `0e6e2ec14d9e04c6acc22a342a7f490a889eb87b` and keep it explicitly non-authoritative.
- `pre_release_probe` — delete or replace — remove stale `v0.4.0dev0` prerelease decision data; if retained for history, move it to a non-authoritative previous-probe field so it cannot be mistaken for current readiness.
- `provenance` — modify — add GitHub release, PyPI metadata, `openapi.json`, `omnigent/server/API.md`, `omnigent/server/routes/harnesses.py`, `omnigent/harness_plugins.py`, and SDK/session source refs at `v0.4.0`.

### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `session_endpoints` — modify — add `PUT /v1/sessions/{session_id}/read-state`.
- `harness_endpoints` — add — record `GET /v1/harnesses` as read-only harness catalog.
- `session_status_contract` — modify — reflect `v0.4.0` OpenAPI statuses `idle`, `running`, `waiting`, `failed`, plus tolerated raw `launching`.
- `stream_contract` — modify — keep live-tail/no-replay semantics and add official event-family coverage metadata.

### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- `capabilities[]` — add — add `harness_catalog` with status `supported` and evidence from `GET /v1/harnesses`.
- `capabilities[]` — modify — keep `child_session` blocked for spawn-under-parent and `harness_override` blocked; update evidence refs from `v0.3.0` to `v0.4.0`.
- `capabilities[]` — modify — update `reconnect`, `malformed_event`, and `terminal_event_uniqueness` evidence with current `v0.4.0` source refs without changing behavior.

### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- `release refs` — modify — update provenance refs to `v0.4.0`.
- `documented_commands` — modify only if official `v0.4.0` CLI docs/source add stable provider-bound commands; do not add web/UI-only or shell-passthrough commands as provider requirements.

### `fixtures/omnigent/events/*.json` and `fixtures/omnigent/errors/*.json` (modify)

- `provenance refs` — modify — update existing fixture provenance from `v0.3.0` to `v0.4.0` when the fixture is still valid against official `v0.4.0`.
- `v0.4 event fixture` — add — add a focused fixture containing representative new official event families that should parse and no-op or map safely, including `session.usage`, `response.reasoning.started`, `response.reasoning_text.delta`, `response.retry`, `response.error`, `response.heartbeat`, `session.reasoning_effort`, and `response.elicitation_request`.
- `blocked capability fixtures` — modify — keep child-session spawn-under-parent and harness override fixtures semantically blocked; update notes to say official `v0.4.0` still does not promote them to public transport capabilities.

### `fixtures/omnigent/fake-server/README.md` and `fixtures/omnigent/fake-server/scenarios.json` (modify)

- `freeze target` — modify — update text and scenario provenance to `v0.4.0`.
- `v0.4 scenario` — add — include a scenario that proves `GET /v1/harnesses`, `read-state`, `active_response_id`, and expanded SSE event parsing are covered by the fake server.

### `packages/omnigent-transport/src/types.ts` (modify)

- `omnigentStreamEventTypes` — modify — expand to the official `v0.4.0` `ServerStreamEvent` discriminator set: current events plus `session.usage`, `session.model`, `session.model_options`, `session.reasoning_effort`, `session.collaboration_mode`, `session.agent_changed`, `session.todos`, `session.terminal_pending`, `session.sandbox_status`, `session.skills`, `session.superseded`, `session.presence`, `session.resource.created`, `session.resource.deleted`, `session.changed_files.invalidated`, `session.terminal.activity`, `response.output_item.done`, `response.output_file.done`, `response.reasoning.started`, `response.reasoning_text.delta`, `response.reasoning_summary_text.delta`, `response.retry`, `response.error`, `response.compaction.in_progress`, `response.compaction.completed`, `response.compaction.failed`, `response.client_task.cancel`, `response.heartbeat`, `response.elicitation_request`, `response.elicitation_resolved`, and `session.heartbeat`.
- `OmnigentSessionSnapshot` — modify — add `active_response_id?: string | null` and `activeResponseId?: string | null`; keep `activeTurnId` for repo-local normalized use.
- `OmnigentRawEvent` — modify — add optional metadata fields needed to accept new events without `unknown` casts: `sequence_number`, `conversation_id`, `response_id`, `model`, `reasoning_effort`, `mode`, `total_cost_usd`, `usage_by_model`, `error`, `attempt`, `delay_seconds`, `tool_name`, `source`, `elicitation_id`, `params`, and other event payload fields as broad metadata-only optional properties.
- `OmnigentHarnessCatalogEntry` and `OmnigentHarnessCatalogResponse` — add — model `GET /v1/harnesses` as a metadata-only read-only catalog with permissive entry shape because upstream OpenAPI exposes `additionalProperties: true`.

### `packages/omnigent-transport/src/http-client.ts` (modify)

- `listHarnesses` — add — implement `GET /v1/harnesses` returning the typed catalog response.
- `createSession/getSession/listSessions` consumers — modify only if needed — normalize `active_response_id` into `activeResponseId` or leave raw plus typed alias for provider mapping.

### `packages/omnigent-transport/src/http-provider.ts` (modify)

- `toSessionInfo` — modify — prefer `snapshot.activeTurnId ?? snapshot.activeResponseId ?? snapshot.active_response_id ?? undefined` so mid-turn reconnect snapshots preserve active turn identity.
- `health` — modify — update notes so `waiting` is no longer called release OpenAPI drift; optionally include harness catalog availability only when `listHarnesses` succeeds in an explicit probe path, not as a required health dependency.

### `packages/omnigent-transport/src/fake-omnigent-server.ts` (modify)

- `GET /v1/harnesses` — add — return a deterministic metadata-only catalog with current harness names and capability flags sufficient for tests.
- `session snapshot` — modify — include `active_response_id` in a focused test/session path.
- `stream route` — modify — allow the new v0.4 fixture events to stream, including no-op event families, without changing terminal-turn uniqueness behavior.

### `packages/omnigent-transport/src/contract-fixtures.ts` (modify)

- `OmnigentHttpSurfaceFixture` — modify — add harness endpoint and expanded stream event metadata fields.
- `OmnigentCapabilityProbeFixture` — modify only if needed — ensure `harness_catalog` is accepted by local fixture loading without weakening the frozen capability-status enum.
- `OmnigentEventFixture` — modify — allow optional new-event payload metadata used by the new v0.4 fixture.

### `packages/omnigent-transport/src/types.test.ts` (modify)

- `transport types` — modify — assert official v0.4 event types, `active_response_id`, and harness catalog response typing are accepted.

### `packages/omnigent-transport/src/http-client.test.ts` (modify)

- `documented endpoints` — modify — include `GET /v1/harnesses` and prove it is read-only metadata.
- `read-state` assertion — modify — keep existing body assertion but update test naming from prerelease-forward-compat to stable v0.4 surface.

### `packages/omnigent-transport/src/event-mapper.test.ts` and/or `packages/omnigent-transport/src/sse-stream.test.ts` (modify or add tests)

- `expanded event allowlist` — add — prove representative v0.4 events parse without `unknown_event_type` skips.
- `provider mapping` — add — prove UI/resource/reasoning/usage/heartbeat events no-op unless explicitly mapped, and terminal event uniqueness still collapses `response.*` plus `turn.*`.

### `packages/omnigent-transport/src/http-provider.test.ts` (modify)

- `active response snapshot` — add — prove `active_response_id` from `getSession` becomes provider `activeTurnId`.
- `health drift note` — modify — remove expectations tied to old `waiting` OpenAPI drift text.

### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- `snapshot.version` — modify — update the freeze-pinned assertion from `"0.3.0"` to official `"0.4.0"` and keep the probe expectations aligned with the refreshed capability fixture.

### `packages/omnigent-transport/src/phase-verification.test.ts` or `packages/omnigent-transport/src/conformance.test.ts` (modify)

- `v0.4 conformance` — modify — add assertions that the contract fixture freeze target is `v0.4.0`, harness catalog is supported, blocked capabilities remain blocked, and full fixture corpus parses.

## Documentation impact

Documentation changes are required because the current docs are deliberately authoritative contract surfaces. Update:

- `docs/omnigent-contract.md`
- `docs/omnigent-upstream-readiness.md`
- `docs/omnigent-transport.md`
- `docs/lifecycle-and-events.md`
- `fixtures/omnigent/fake-server/README.md`

Do not update release notes or changelog surfaces unless the repo already has a local maintenance convention for contract-refresh PRs; this is not a product release dispatch.

## Dependencies & order

1. Refresh source evidence first from official `v0.4.0`: GitHub release metadata, PyPI metadata, `git ls-remote` tag/head refs, `openapi.json`, `omnigent/server/API.md`, `omnigent/server/routes/harnesses.py`, `omnigent/harness_plugins.py`, `omnigent/server/schemas.py`, and SDK session source.
2. Before implementing the disputed panel items, prove from the official `v0.4.0` tag/OpenAPI that `GET /v1/harnesses` exists and that session snapshots expose `active_response_id`; if either is absent, stop and amend this plan instead of coding a guessed surface.
3. Update fixtures before code so tests and docs consume the same authoritative `v0.4.0` facts.
4. Update docs to match the refreshed fixtures and explicitly record non-goals for current `main`.
5. Update TypeScript transport types, HTTP client/provider, fake server, and fixture loaders.
6. Update tests, including `capability-probe.test.ts`, and run targeted transport checks before whole-repo verification.
7. Sweep stale freeze literals across docs, fixtures, and transport tests: `v0.3.0`, `v0.4.0dev0`, `4edb4d9`, and the old `waiting`-is-missing-from-OpenAPI drift text may remain only when clearly labeled as previous historical context.
8. If implementation discovers a public `v0.4.0` capability contradicts the blocked `harness_override` or child-session spawn-under-parent posture, stop and amend the plan instead of silently changing routing semantics.

## Verification

Do not run these during planning. The implementation runner should run:

```bash
pnpm --filter @omniagent-plus/omnigent-transport test -- --run packages/omnigent-transport/src
pnpm test -- --run packages/omnigent-transport/src packages/core-contracts/src/fake-event-stream.test.ts
pnpm build
pnpm lint
pnpm typecheck
pnpm test
find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null
sh -c 'rg -n "v0\\.3\\.0|v0\\.4\\.0dev0|4edb4d9|waiting.*OpenAPI|OpenAPI.*waiting" docs fixtures packages/omnigent-transport || true'
git diff --check
phase-loop validate-roadmap specs/phase-plans-v1.md
```

Effective automation suite:

```bash
pnpm --filter @omniagent-plus/omnigent-transport test -- --run packages/omnigent-transport/src && pnpm test -- --run packages/omnigent-transport/src packages/core-contracts/src/fake-event-stream.test.ts && pnpm build && pnpm lint && pnpm typecheck && pnpm test && find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && sh -c 'rg -n "v0\\.3\\.0|v0\\.4\\.0dev0|4edb4d9|waiting.*OpenAPI|OpenAPI.*waiting" docs fixtures packages/omnigent-transport || true' && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md
```

The `rg` sweep is an audit step: remaining matches are acceptable only when they are intentionally labeled as historical previous-release context. If the implementation needs a hard-fail variant, add a short repository-local assertion script instead of relying on raw `rg` exit semantics.

Edge cases to verify:

- `read-state` remains metadata-only and does not become required for session traffic.
- `GET /v1/harnesses` works as a read-only metadata catalog and is not treated as launch authorization.
- `active_response_id` is used for reconnect state but does not create duplicate terminal turn events.
- New v0.4 SSE event families parse without being reported as unknown, while malformed JSON and non-object payloads are still skipped.
- `harness_override` and child-session spawn-under-parent remain blocked/emulated as currently documented.
- Current upstream `main` terminal transport changes are mentioned only as non-authoritative unreleased movement.

## Acceptance criteria

- [ ] `docs/omnigent-contract.md` and `fixtures/omnigent/discovery/source-metadata.json` name official `omnigent` `v0.4.0` as the freeze target with tag commit `31669e1b413216c865d0ed7dfb469fb142c889f5`.
- [ ] `docs/omnigent-upstream-readiness.md` no longer says `v0.3.0` is latest or treats `v0.4.0dev0` as the current prerelease decision.
- [ ] The implementation preflight re-confirms from official `v0.4.0` tag/OpenAPI evidence that `GET /v1/harnesses` and `active_response_id` exist before coding those surfaces.
- [ ] `GET /v1/harnesses` is represented in fixtures, fake server, `OmnigentHttpClient`, and tests as a supported read-only public catalog.
- [ ] `PUT /v1/sessions/{session_id}/read-state`, `background_task_count`, `viewer_last_seen`, and `viewer_unread` are documented and tested as official `v0.4.0` surface, not prerelease-only compatibility.
- [ ] `active_response_id` snapshots map to provider `activeTurnId` without duplicate turn terminal events.
- [ ] Official `v0.4.0` SSE event types are accepted by the parser; events not mapped to provider state no-op safely.
- [ ] Existing malformed-frame skip behavior, live-tail/no-replay reconnect behavior, and terminal-event uniqueness still pass.
- [ ] `harness_override` and child-session spawn-under-parent remain blocked at public provider boundaries.
- [ ] `packages/omnigent-transport/src/capability-probe.test.ts` and the broader docs/fixtures/tests sweep no longer contain stale current-freeze assertions for `v0.3.0`, `v0.4.0dev0`, `4edb4d9`, or old `waiting` OpenAPI drift text.
- [ ] The full automation suite above passes.
