# Detailed plan: preserve previews when replay identity is uncertain

## Task

Complete v0.15 B replay handling for alias-free history followed by a preview under a different nonempty message ID. This is the separately reviewed split and contract amendment required by the governing accommodation plan.

## Research summary

`OmnigentEventMapper.mapTextDelta` currently consumes alias-free historical text based on equality or prefix, even when the preview has a different message ID. A later alias can prove it was another message, after the text is irretrievably lost. The provider repeats the guess in `matchDeliveredTextGroups`. SSE is live-tail, mappers are rebuilt for subscriptions, and runtime events are append-only; a retrospective refund cannot preserve order for a mixed chunk. The B amendment chooses immediate, ordered, lossless delivery when identity is uncertain and accepts possible duplicate replay. It introduces no new public event or wire vocabulary.

## Changes

### `packages/omnigent-transport/src/event-mapper.ts` (modify)
- `OmnigentEventMapper.mapTextDelta` — modify — grant replay credit for an exact message ID or validated stream alias; do not infer credit solely from text when an alias-free historical item has a different nonempty ID. Preserve exact-ID, confirmed-alias, and identity-free replay behavior.
- `OmnigentEventMapper` inferred credit state — simplify only as needed — ensure no stale text-only credit survives after a distinct preview is emitted.

### `packages/omnigent-transport/src/http-provider.ts` (modify)
- `matchDeliveredTextGroups` — modify — disallow text-only cursor matching between two different nonempty message IDs without a validated alias. Preserve existing alias exclusions for identity-free fallback; an invalid collision marker grants no exact-ID or text credit.
- `resequenceRuntimeEvents` and `recordDeliveredText` — modify — retain a stable cursor for a numbered upstream frame across subscribers and reconnects; a frame without an upstream sequence keeps its connection-specific synthetic ID. Key delivered text by sequence as well as event ID. Register durable aliases before mapping their items, and synchronize invalidated stream IDs into already-open mappers before they consume another preview or durable item.

### `packages/omnigent-transport/src/event-mapper.test.ts` (modify)
- Identity replay tests — modify/add — assert immediate full preview for distinct ID against alias-free history, including full match, partial then continuation, one mixed delta, late confirming and differing aliases, durable B before/after A alias, and cross-response isolation. Preserve exact-ID and known-alias suppression tests.

### `packages/omnigent-transport/src/history-mapper.test.ts` (modify)
- Response-local history replay expectation — modify — an alias-free durable ID cannot consume a different nonempty preview ID, even when text and response match.

### `packages/omnigent-transport/src/http-provider.test.ts` (modify)
- Stream cursor tests — add — assert full preview delivery without a subsequent frame and once per cursor across a reconnect, with history lacking alias and a later alias correction. Assert reused invalid stream IDs remain lossless across reconnects, stable numbered frames keep one cursor, and already-open subscribers see invalidated aliases on previews and durable items, including the item that first creates a conflict.

### `docs/omnigent-transport.md` and `plans/evidence/omnigent-v0-15-accommodation.json` (modify)
- Replay contract — document the possible duplicate when association is only text, including the change from published v0.12 replay behavior in this unpublished v0.15 candidate, and record verification and exact-head review truthfully.

## Dependencies & order

1. Review the amended B contract and this split. The earlier refund draft was rejected because it cannot preserve append-only order and cross-subscription state.
2. Add failing mapper/provider regressions, then make the two focused matching changes.
3. Run targeted tests, full suite, build, typecheck, lint, pack smoke, and exact-head review.

## Verification

`pnpm exec vitest --config vitest.config.ts --run packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/http-provider.test.ts`

`automation.suite_command: pnpm test && pnpm build && pnpm typecheck && pnpm lint && pnpm --filter @consiliency/omnigent-transport test:pack`

## Acceptance criteria

- [ ] An alias-free historical item cannot hide a preview with a different nonempty ID; full text arrives in order without waiting for an alias or another frame. Targeted mapper/provider tests prove this.
- [ ] Exact-ID and confirmed-alias replay remains suppressed; a distinct preview stays distinct across responses, cursors, and subscriptions. Targeted mapper/provider tests prove this.
- [ ] A later durable item emits only content not already delivered for its own preview ID; targeted mapper tests prove this.
- [ ] Full suite, build, typecheck, lint, and packed consumer smoke pass via `automation.suite_command`.
- [ ] Exact-head panel accepts the B amendment and implementation before B is marked accepted in evidence.
