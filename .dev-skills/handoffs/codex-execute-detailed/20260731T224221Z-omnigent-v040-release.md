---
from: codex-execute-detailed
timestamp: 2026-07-31T22:42:21Z
repo: Consiliency/omniagent-plus
repo_root: /mnt/workspace/worktrees/omniagent-plus-record-v0-4-release
branch: codex/record-omnigent-v0-4-release
commit: c453d78833c972d4416cdfd34c566b66cefaff7e
run_id: 20260731T224221Z-omnigent-v040-release
artifact: plans/detailed-omnigent-v0-7-contract-maintenance-20260730-0256.md
verification_status: passed
---

# Omnigent Transport 0.4.0 Release Verification

This post-merge handoff supersedes only the publication-state section of
`20260730T035308Z-omnigent-v070-verification.md`. That earlier handoff remains
the exact pre-release implementation record.

## State Reduction

- PR: [Consiliency/omniagent-plus#12](https://github.com/Consiliency/omniagent-plus/pull/12)
  was panel-reviewed at exact head
  `81fbc14c13c420332f9375fcd1ccbdc46e47b223` and merged on
  `2026-07-31T22:38:24Z`.
- Main: squash commit `c453d78833c972d4416cdfd34c566b66cefaff7e`.
- GitHub release: [`v0.4.0`](https://github.com/Consiliency/omniagent-plus/releases/tag/v0.4.0),
  published on `2026-07-31T22:38:55Z` against the exact main commit above.
- Publish workflow: [run 30670604719](https://github.com/Consiliency/omniagent-plus/actions/runs/30670604719)
  completed `success` on the release event and exact main commit. Jobs
  `verify` (`91287328285`) and `publish-npm` (`91287456287`) both completed
  `success`.
- npm: `@consiliency/omnigent-transport@0.4.0` is published. The unchanged
  sibling packages remain `@consiliency/runtime-provider@0.2.0` and
  `@consiliency/pipeline-provider-adapter@0.2.0`.

## Publisher And Registry Evidence

- Canonical publisher identity remains repository
  `Consiliency/omniagent-plus`, workflow `.github/workflows/publish.yml`.
- The unchanged workflow grants `id-token: write` only to `publish-npm`, uses
  Node 24's OIDC-capable npm, and provides no `NODE_AUTH_TOKEN`.
- npm records SLSA v1 provenance at
  `https://registry.npmjs.org/-/npm/v1/attestations/@consiliency%2fomnigent-transport@0.4.0`.
- Registry tarball:
  `https://registry.npmjs.org/@consiliency/omnigent-transport/-/omnigent-transport-0.4.0.tgz`.
- Registry integrity:
  `sha512-D9fpq8KWKS1rghsy6ZkT3VM7Ct4P7WfnGUUzZieRs2JkNmCQHXBKQ1cxiRhuBU/kfgsPMysFXknLLmEOAf58/A==`.

## Exact-Pin Consumer Proof

A fresh isolated npm project installed with scripts disabled:

```text
npm install --ignore-scripts @consiliency/omnigent-transport@0.4.0
```

The installed root export `snapshotFromHealth` reported authoritative upstream
Omnigent version `0.7.0` and tag SHA
`35519fb04743f66b30cac8a40695d5d72fa163ea`. A strict NodeNext TypeScript
consumer compiled the published root declarations for
`OmnigentSessionSnapshot`, `OmnigentNativeModelOption`, and
`OmnigentNativeReasoningEffortOption`, covering both camelCase and snake_case
session aliases.

## Final State

The adaptation is merged, released, workflow-verified, independently visible
on npm, and consumable by exact pin. No runtime-provider or
pipeline-provider-adapter version was changed by this release.
