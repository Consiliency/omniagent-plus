# dev0 handoff: omniagent-plus

Recorded 2026-09-25 UTC. This is a transfer of recoverable work, not approval to
merge, release, publish, deploy, retire account switching, or close issues.

## Start here

- Remote: `git@github.com:Consiliency/omniagent-plus.git`. At transfer,
  `origin/main` was `8d6b7c177f8ce10164b89375e37d927b0a28ad83`.
  Fetch before work; do not use the older source-host `main` checkout as base.
- Read `specs/phase-plans-v2.md`, `plans/audit-remediation-disposition-20260905.md`,
  and open tracking issue [omniagent-plus#19](https://github.com/Consiliency/omniagent-plus/issues/19).
  The roadmap checkboxes are not a substitute for reviewed, exact-head evidence.
- Probe `/etc/consiliency/team-host` first, then `/mnt/workspace`, before making
  dev0 worktrees. On a team host use the private `$WORKTREE_ROOT` convention in
  `AGENTS.md`; otherwise use `/mnt/workspace/worktrees` if it exists.
- These branches are preservation points. Inspect their diffs and reconcile
  individually; several edit `plans/manifest.json` and
  `.dev-skills/handoffs/codex-plan-detailed/latest.md`. Do not merge them all
  wholesale or treat an old `latest.md` as release authority.

## Remote recovery points

| Remote branch | Exact commit | Meaning / disposition |
| --- | --- | --- |
| `codex/dev0-v012-snapshot-20260925` | `af8e33979cfa484b60001f30896693eb6e17943b` | Previously uncommitted v0.12 plan, review handoffs and manifest from an old `main` checkout. Historical; branch is ten commits behind current `main`, so do not merge wholesale. |
| `codex/cliproxy-eval-20260922` | `8640f0c8e9d6dc054bc1c6ecf7a502849ab6fc3a` | CLIProxyAPI subscription-pooling evaluation and bounded fake-auth probe. No integration or live canary. |
| `codex/omnigent-v015-plan-20260922` | `6cf69a4327536fe83a6e208e06ca2faa934eb46a` | v0.15 accommodation draft plus source/registry evidence. No product changes or review approval. |
| `codex/dev0-guard-plan-snapshot-20260925` | `e1d749c85edb09fab9d361242de7684a43671714` | Full local GUARD plan/review snapshot, including v0.14 planning notes and r9 four-seat verdicts. This is deliberately separate from the active draft PR head. |
| `codex/v2-guard-sl0-20260915` | `e35f07e0fc04641e8624abfe88fc37384f9bbd3f` | One previously local-only test commit (`tests/guard/boundaries.test.ts`); experimental lane, not accepted GUARD completion. |
| `codex/v2-guard-sl1-20260915` | `126968276d4e8266306284c9673e63a8516c6240` | Clean lane marker; its content was already reachable from the draft PR branch. |

Other clean local branch tips (`codex/audit-triage-20260909`,
`codex/omnigent-v0-12`, `plan/gp-adapter-roadmap`) were already reachable from
`origin/main` or an existing remote branch; no unique commit was stranded.
The locked detached v0.12 worktree was clean and its commit is on `main`.

## Active decisions and gates

- [omniagent-plus#29](https://github.com/Consiliency/omniagent-plus/pull/29)
  remains **open and draft** at `160a770c5daf86ef384f9643e844ff47d68b4cea`.
  The later GUARD plan is only on the snapshot branch above. Its exact plan
  SHA-256 is `d7e3cf7b111ae9f95e7a15e0a3176bd6d8a8e9bde4af1ca702b8bc26a38a45e4`.
  See `plans/evidence/v2/GUARD-reviews.md` and
  `plans/evidence/v2/reviews/GUARD-plan-r9-receipt-20260924.json` on that branch.
  Round 9 returned Grok/Astra/Gemini AGREE and Opus 5.5 PARTIALLY AGREE with
  three **blocking plan defects**: custody cases do not prove pre-exit detection
  and passive post-exit wait; work cutoff/completion ceiling and local root
  lifetimes are ambiguous; every hosted run does not gate on non-loopback
  refusal. The three-round review loop is exhausted. Reconcile these findings
  in a scoped follow-up and obtain a fresh qualified review before GUARD source
  ownership, merge, issue closeout, or publication. No production GUARD work
  or XG/canon work was authorized by this snapshot.
- `plans/detailed-omnigent-v0-15-accommodation-20260922.md` is a **draft**.
  Its 2026-09-22 research observed PyPI Omnigent 0.15.0 while the checked-in
  support and published `@consiliency/omnigent-transport` remained v0.12.0
  and 0.7.0 respectively. Recheck tag, package, registry and contracts on
  dev0. The draft requires accepted GUARD/DATA interface gates, exclusive
  transport ownership under [omniagent-plus#25](https://github.com/Consiliency/omniagent-plus/issues/25),
  and a reconciled panel before implementation. Do not call it compatibility
  or release evidence.
- `plans/cliproxyapi-evaluation-20260922.md` recommends **KEEP** the existing
  native account-switching work. A one-credential isolated API proxy is only
  a possible complement; the proxy is not proven to adopt native CLI sessions
  or preserve Remote Control, and fake-auth tests expose cross-credential
  failover. No replacement, credentialed experiment, team subscription pool,
  review-transport substitution, deployment, or deletion is approved. Resolve
  provider/product authorization before any owned-account experiment; Stage A
  synthetic gates precede any separate Stage B authorization.
- The v2 audit remediation issues
  [omniagent-plus#20](https://github.com/Consiliency/omniagent-plus/issues/20)
  through [omniagent-plus#27](https://github.com/Consiliency/omniagent-plus/issues/27)
  remain open. Keep issue ownership and phase ordering from the roadmap; do
  not infer completion from the snapshot branches.

## Transfer verification and local-only material

- All nine pre-existing source-host worktrees had zero nonignored tracked or
  untracked changes after the snapshots. The four dirty lanes were committed
  and pushed without altering `main` or the active PR head. The sole unique
  clean local commit was also pushed.
- `git diff --check` passed for all four snapshots. All new JSON records and
  their manifests parsed. Secret scans found no credentials in three branches;
  the GUARD scan's only two findings were verified 64-hex `OpenAPI SHA256`
  digests, not secrets. No keys or credential files were transferred.
- Ignored `.phase-loop` runs, upstream research clones, dependency/build
  caches and host-local CLI authentication are **not** in Git. The durable
  findings, review verdicts and receipt needed to resume are on the branches.
  Recreate tools and fetch upstream sources on dev0; do not copy auth state or
  claim that an ignored source-host session is review approval.

Next step: select one lane with an explicit owner. For GUARD, first reconcile
the three Opus blockers against the exact snapshot plan, then seek a fresh
qualified plan review. In parallel, refresh the v0.15 release evidence and
transport ownership before deciding whether its draft plan needs amendment.
