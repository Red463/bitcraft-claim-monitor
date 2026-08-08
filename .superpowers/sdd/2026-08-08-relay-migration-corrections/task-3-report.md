# Task 3 Report — Craft Projection and Contribution Attribution

## Status

Implemented Task 3 in the isolated `relay-corrections` worktree. No production, VPS, deployment, Discord, or live game-data mutation was performed.

## Behavior delivered

- Dashboard and Craft Monitor consume one shared craft presentation projection with compound item/cargo identity, resolved recipe placeholders, and stable output, recipe, icon, and item fields.
- Partial craft outputs remain explicitly nullable and renderable rather than inventing `items:0` or throwing.
- Passive crafts group only when exact member, output, structure, and status identities match. Quantity and craft-count sums use `BigInt`; the newest valid timestamp is retained. Partial rows remain separate.
- Contribution attribution uses reducer caller `authoritative`, a unique matching player action `matched_action`, then exact progressive-row owner `owner_fallback`. New unknown contributions are rejected.
- Claim-member names take precedence. Missing names use the bounded Relay player resolver and retain `Player <entityId>` as the exact-ID fallback.
- Both production contribution tables migrate `joined` to `matched_action`, accept the four specified confidence values, retain historic unknown events, and rebuild aggregates only from durable stored evidence. Malformed historic JSON remains safely retained rather than aborting migration.
- Historic unknown rows are excluded from public contribution totals, recent activity, and rankings, while their count is exposed only through admin health diagnostics.
- Contribution leaderboard aggregation, ordering, and UI display preserve exact integer/decimal strings beyond `Number.MAX_SAFE_INTEGER`.
- Version and changelog are updated to `0.51.0-beta.4`.

## Main files

- `apps/bitcraft-local/src/pages/production/craftPresentation.ts`
- `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- `apps/bitcraft-local/src/pages/ProductionPage.tsx`
- `apps/bitcraft-local/src/pages/LeaderboardPage.tsx`
- `apps/bitcraft-local/src/server/game-data/craftProjection.ts`
- `apps/bitcraft-local/src/server/game-data/craftContributionAttribution.ts`
- `apps/bitcraft-local/src/server/game-data/primaryRegionPlayerSession.ts`
- `apps/bitcraft-local/src/server/game-data/primaryRegionRuntime.ts`
- `apps/bitcraft-local/src/server/game-data/exactDecimal.ts`
- `apps/bitcraft-local/src/server/craftContributionLeaderboard.mjs`
- `apps/bitcraft-local/src/server/craftContributionVisibility.mjs`
- `apps/bitcraft-local/src/server/schemaMigrations.mjs`
- `apps/bitcraft-local/server.mjs`
- `apps/bitcraft-local/package.json`
- `CHANGELOG.md`

## TDD evidence

### Initial craft and attribution red

Focused craft-presentation, passive grouping, attribution, session, and repository tests were run before implementation.

Observed: exit 1, 13 passed / 6 failed. Failures covered the absent shared craft projection, item/cargo collision protection, recipe placeholder substitution, passive grouping boundaries, and missing attribution paths.

### Migration and visibility red

Focused schema-migration, contribution-visibility, server health, and current-contribution tests were run before implementation.

Observed: exit 1, 21 passed / 4 failed. Failures covered the old confidence constraint/data, evidence-only rebuild, public unknown-row exclusion, and admin-only diagnostic count.

### Migration hardening red

```powershell
node --test test/server-schema-migrations.test.mjs
```

Observed: exit 1, 17 passed / 1 failed. Malformed historic `raw_json` aborted JSON extraction before migration could retain the row safely.

### Parallel review reds

The required Standards and Spec reviews identified four High/Medium gaps. Each received a focused failing test before its fix:

- Partial craft output and partial passive grouping: exit 1, 9 passed / 2 failed.
- Exact leaderboard aggregation and blank claim-member name lookup: exit 1, 5 passed / 3 failed.
- Exact decimal comparison/display: exit 1, 4 passed / 1 failed.

### Focused green

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/craft-presentation.test.mjs test/craft-provider-projection.test.mjs test/craft-contribution-leaderboard.test.mjs test/exact-decimal.test.mjs test/primary-region-player-session.test.mjs test/server-schema-migrations.test.mjs
```

Observed: exit 0, 42 passed / 0 failed.

## Final verification

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Observed: exit 0. Server/provider TypeScript, bindings, asset verification, frontend TypeScript, Vite client build, and Relay runtime boundaries passed.

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Observed: exit 0, 1,659 passed / 0 failed.

## Commits

- `a8e6b16` — Test Task 3 craft projection and attribution
- `dceb760` — Test Task 3 contribution migration and visibility
- `d2f7725` — Correct craft projection and contribution attribution
- `862a0af` — Release Task 3 contribution corrections
- `e290f3d` — Harden Task 3 exact contribution views

## Concerns

- Live Relay contribution actions were intentionally not exercised. Runtime behavior is covered with generated binding fixtures and no real Discord or game action was sent.
- Historic unknown events remain intentionally unattributed and visible only as an admin diagnostic count; the migration does not guess ownership.
