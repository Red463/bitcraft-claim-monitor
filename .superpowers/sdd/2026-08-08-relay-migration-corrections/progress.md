# SDD ledger — plan: docs/superpowers/plans/2026-08-08-relay-migration-corrections.md

Baseline: `7029d2f153af1cc52a98f0504a0ced3e88468e87`
Baseline verification: 1624 tests passed, 0 failed (outside sandbox; sandbox denied dependency manifest reads).
Task 1 checkpoint: runtime reliability committed at `3656a60`; 36 focused tests and provider TypeScript build passed.
Task 1: minor (deferred): normal history refresh returns the full 365-day raw trade window without volume pagination/server-side aggregates.
Task 1: minor (deferred): repair deletion builds one SQLite placeholder per selected row and could exceed the bind-variable limit for a very large incident.
Task 1: fix round 1/5 (2 addressed, 0 open — reconnect backoff and exact market aggregation; commit `e5ba73a`).
Task 1: complete (commits `d7feb92..e5ba73a`, review clean; production deploy/repair/soak deferred to rollout gate).
Task 2: fix round 1/5 (1 addressed, 0 open — newest valid last-active timestamp; commits `92980a7`, `e6c0a1a`).
Task 2: complete (commits `e5ba73a..e6c0a1a`, review clean; live Allusion check deferred to rollout gate).
Task 3 RED checkpoint 1: `a8e6b16` (craft presentation, grouping, attribution; 6 expected failures).
Task 3 RED checkpoint 2: `dceb760` (migration, rebuild, visibility/name lookup; 4 expected failures).
Task 3: fix round 1/5 (4 addressed, 2 residual — attribution fallback, partial identity/measures, optional owner; commit `824d914`).
Task 3: fix round 2/5 (2 addressed, 0 open — active partial catalog/card and Members nullable quantity; commit `75be022`).
Task 3: minor (deferred): duplicate optional inventory-stack-key wrapper and broad migration function naming.
Task 3: complete (commits `e6c0a1a..75be022`, review clean; live contribution check deferred to rollout gate).
Task 4: fix round 1/5 (all icon security/identity/policy findings addressed; commit `0652842`).
Task 4: complete (commits `75be022..0652842`, review clean; live BitJita/production checks deferred to rollout gate).
Final fix wave: addressed the whole-branch review findings for the audited icon-policy exception, normalize-once Relay player/contribution/craft fields, 60-second failed-presence caching, compound-identity Craft Monitor icons, and the dead market-summary parameter.
Final review: minor (deferred): claim-market and primary-region runtimes retain similar reconnect/backoff supervision; consolidating them would be a broader refactor than this correction plan requires.
Rollout gate: blocked by missing production SSH/deploy access. No production diagnostics, repair, deployment, live contribution, or soak claim is recorded.
