# Detailed plan: stop reporting fixture target as detected runtime version

## Task

Resolve the v0.15 C2 capability snapshot version ambiguity without changing the frozen upstream source target or the published v0.12 support claim.

## Research summary

`specs/agent-runtime-provider-omnigent-spec.md` section 14.5 requires detecting Omnigent version and git SHA if available. `capability-probe.ts` currently copies these optional fields from `sourceMetadata.freeze_target`, which is a v0.15 research fixture, while `provider.health()` supplies no detected version. Thus the snapshot implies a live observation that did not occur.

## Changes

### `packages/omnigent-transport/src/capability-probe.ts` (modify)
- `buildSnapshot` — modify — omit optional `version` and `gitSha` until a real runtime probe supplies them; retain capability and health fields.

### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)
- Snapshot assertion — modify — require those fields to be absent and separately assert the frozen v0.15 source target remains available from the fixture.

### `scripts/smoke-packed-omnigent-transport.mjs` (modify)
- Packed consumer assertion — modify — verify absence of unobserved snapshot version fields while retaining the independent v0.15 wire authority check.

### `docs/omnigent-transport.md` (modify)
- Capability snapshot explanation — add — distinguish the candidate source fixture, the published v0.12 support claim, and detected live runtime metadata.

### `plans/evidence/omnigent-v0-15-accommodation.json` (modify)
- C2 disposition — add — record that runtime version detection remains a separate pinning requirement; do not claim it from fixture metadata.

## Documentation impact

The transport documentation gains the snapshot interpretation. No public schema change: both fields are already optional.

## Dependencies & order

Apply the spec interpretation, update test/docs, then run the targeted capability test and full suite. A future real version endpoint probe may populate these optional fields.

## Verification

`pnpm exec vitest --config vitest.config.ts --run packages/omnigent-transport/src/capability-probe.test.ts`

`automation.suite_command: pnpm exec vitest --config vitest.config.ts --run --maxWorkers=1 && pnpm build && pnpm typecheck && pnpm lint && pnpm --filter @consiliency/omnigent-transport test:pack`

## Acceptance criteria

- [ ] A health-only snapshot has no claimed runtime version or SHA; targeted test proves this.
- [ ] The fixture still identifies v0.15 as the source comparison target and documentation still states published support is v0.12; targeted test and docs review prove this.
- [ ] Full suite, build, typecheck, lint and pack smoke pass; suite command proves this.
