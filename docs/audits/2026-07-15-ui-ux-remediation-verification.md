# UI/UX remediation verification

Date: 2026-07-15

Product: BitCraft Claim Monitor — Settlement Control Room

Scope: local production candidate verification for findings F1–F31

Release status: **not released, pushed, deployed, or compared with production**

## Candidate identity

The verified application-code candidate is commit `16dacbd9e049e0798d2339e9dc334e83af351de3`. This report is committed separately and does not change that candidate's application assets.

| Property | Recorded value |
| --- | --- |
| Branch | `codex/ui-ux-audit-remediation` |
| Package version | `0.32.0-beta.57` |
| Build ID | empty string (`""`) |
| Node | `v24.15.0` |
| OS | Microsoft Windows NT `10.0.26200.0` |
| Time zone | `GMT Standard Time` (Europe/London) |
| Identity captured | `2026-07-15T19:53:21.1548857+01:00` |
| Smoke origin | `http://127.0.0.1:18451/` |
| Server health | `ok: true`; package `0.32.0-beta.57`; polling disabled and not running |
| Served entry | `assets/index-BKi3F4uD.js` |
| Local `dist` entry | `assets/index-BKi3F4uD.js` |
| Served/local match | yes |

### Generated asset inventory

Entry and shared boundaries:

- `index-BKi3F4uD.js`, `index-D-3n2JGN.css`
- `AppShell-BO6s-ssb.js`, `AppShell-DglpARwf.css`
- `AdminPanel-BC7cvXAa.js`, `AdminPanel-CqcjKhhM.css`

Public route boundaries:

| Route boundary | JavaScript | CSS |
| --- | --- | --- |
| Dashboard | `DashboardPage-DWGpSxR7.js` | `DashboardPage-4Ws3VQv2.css` |
| Leaderboard | `LeaderboardPage-jzDoDawN.js` | `LeaderboardPage-Bf8jL85a.css` |
| Members | `MembersPage-BuJQBj7F.js` | `MembersPage-BxIA6Rhg.css` |
| Skills | `SkillsPage-UGobBf77.js` | `SkillsPage-BDTKMQFi.css` |
| Production | `ProductionPage-CEVocdGI.js` | `ProductionPage-Bv0s-8du.css` |
| Craft Planning | `CraftPlanningPage-BJIyqKXu.js` | `CraftPlanningPage-DdAFw_rs.css` |
| Inventory | `InventoryPage-DDoeUIhy.js` | `InventoryPage-CUfeIYE8.css` |
| Construction | `ConstructionPage-D5sDyLQG.js` | `ConstructionPage-D572-Uxz.css` |
| Research | `ResearchPage-C0UrWaMz.js` | `ResearchPage-FPs5-cOP.css` |
| Market | `MarketPage-CLOLaXXs.js` | `MarketPage-SuGiL1wH.css` |
| Empire / Region | `RegionPage-8eVi0nwP.js` | `RegionPage-CMGrt5YZ.css` |
| Empires | `EmpiresPage-DF9yovyS.js` | `EmpiresPage-BQl4Fyo1.css` |
| Map | `MapPage-rX2gxrNT.js` | `MapPage-YnsaPjyq.css` |
| Activity | `ActivityPage-BBsGdFpP.js` | `ActivityPage-Dqyadb84.css` |
| Public Craft Finder | `PublicCraftFinderPage-BMj9ANP-.js` | `PublicCraftFinderPage-BnHLnI3F.css` |
| Craft Calculator | `CraftCalculatorPage-C61rZmQf.js` | `CraftCalculatorPage-G5S_lBan.css` |
| Sync | `SyncPage-C-R-p_h2.js` | `SyncPage-ZjhBCinf.css` |

## Verification commands and results

| Check | Command or method | Result |
| --- | --- | --- |
| Full tests | `corepack pnpm --filter @workspace/bitcraft-local test` | **743/743 passed** |
| Production build | `corepack pnpm --filter @workspace/bitcraft-local run build` | passed; TypeScript passed; Vite transformed 1,826 modules |
| Focused access/state/a11y | `node --test` over access control, state feedback, modal foundation, shared controls, navigation, first-run tour, theme, route delivery, and admin-section boundaries | **67/67 passed** |
| Focused text/responsive | `node --test apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs` | **12/12 passed** |
| Source hygiene | `git diff --check` | passed |
| Candidate identity | fetched `/` and compared its `index-*.js` with local `dist/index.html` | exact match |
| Health | fetched `/api/local/health` | healthy; background polling disabled |

The render harness used the bounded Edge/CDP endpoint on port 9223 because the in-app browser bootstrap was unavailable. It performed read-only navigation and screenshots only. No admin, Discord, database, or external mutation was triggered.

## Responsive and special-mode evidence

### Normal responsive matrix

All 17 public routes were rendered at:

`1440×1000`, `1250×900`, `920×900`, `760×900`, `480×900`, `390×844`, `375×812`, `320×700`, and `390×600`.

- **153/153 route/viewport cases had zero body, main, page, and route overflow.**
- The prior Empires overflow was reproduced before the fix and is zero at all nine required widths on this candidate.
- Across the normal matrix, 255 case-level observations of horizontally scrollable `.table-wrap` regions were visible, durably labelled, and keyboard reachable with `tabIndex=0`; failures: **0**.
- 122 cases logged expected anonymous `401` resource responses for authenticated data endpoints. These were not JavaScript exceptions and did not produce route/layout failure.

Evidence JSON and associated PNGs:

- `.superpowers/task13-candidate-matrix-a/results-dashboard,leaderboard,members,skills,production,planning-required.json`
- `.superpowers/task13-candidate-matrix-b/results-inventory,construction,research,market,empire,empires-required.json`
- `.superpowers/task13-candidate-matrix-c/results-map,activity,publiccrafts,craftcalc,sync-required.json`

### Special modes

| Mode | Result | Evidence |
| --- | --- | --- |
| Forced colours at 390×844 | 17/17 media queries active; 17/17 zero overflow | `.superpowers/task13-candidate-forced-colors/results-all-special.json` |
| Reduced motion at 390×844 | 17/17 media queries active; 17/17 zero overflow | `.superpowers/task13-candidate-reduced-motion/results-all-special.json` |
| 200% zoom equivalent (720 CSS px for a 1440px reference) | 16/17 zero overflow; Activity retained 23px main/page/route overflow | `.superpowers/task13-candidate-zoom200/results-all-special.json` |
| Text-only 200%, 1440×1000 | 17/17 zero overflow | `.superpowers/task13-all-text200-*/results-*-textWidths.json` |
| Text-only 200%, 390×844 | 17/17 zero overflow | same three text-width result sets |

The wider cross-product text-only stress run intentionally went beyond the planned 1440/390 acceptance points. It found these residuals:

- 720×500: Activity `+99px` main/page/route overflow.
- 320×700: Skills `+41px`, Inventory `+13px`, Construction `+12px`, Empire `+5px`, and Activity `+50px` main/page/route overflow.

Market is zero at 1440, 720, 390, and 320 under 200% text after the candidate fix. Research is also zero at those four widths. Normal (unscaled) 320px remains zero on all 17 routes. The cross-product residuals are accepted limitations for this candidate rather than hidden with global overflow clipping; frontend ownership is recorded below.

## Safe role and state evidence

| Variant | Evidence obtained | Status / limitation |
| --- | --- | --- |
| Signed out | Current-candidate render matrix, route titles/content, expected protected-resource 401s | verified read-only |
| Standard / verified access decisions | Executable access-control and allowed-view tests | logic verified; no current authenticated browser fixture |
| Administrator | Admin composition, discoverability, access, modal, pending-action, and result-announcement boundaries | static/executable verification only; no authenticated browser mutation used |
| Bot route | Route title/level-one-heading and Bot navigation/state boundaries | verified by tests; no real Discord action used |
| Populated public data | Current anonymous smoke data on available routes | verified where returned by the local server |
| Loading / empty / no-match / partial-stale / failed / restricted | Shared state taxonomy and route exclusivity executable boundaries | **all kinds covered by tests**; not every kind could be forced visually without test fixtures |
| Duplicate/pending mutation | Production pending-action registry and pending-aware control tests | verified with dependency-free fixtures; no external mutation |

Authenticated visual variants remain **Deferred with owner: Product QA / repository maintainer**. Required checklist: provision non-production standard, verified, and admin sessions; confirm visible routes and locked-route explanations; confirm command palette/sidebar parity; confirm all-denied tab states contain no stale content; confirm administrator discovery before/after sign-in; confirm `/bot` heading and read-only states; do not press controls that deliver Discord messages, change permissions, delete data, create backups, or otherwise mutate external/local production-like state.

## Manual assistive-technology deferrals

No NVDA, VoiceOver, Safari, iOS, or physical touch-device session was available. These checks are **not claimed**.

- **Owner: Accessibility QA — Windows.** With NVDA on current Chrome and Firefox, traverse landmarks/headings and grouped navigation; activate Back/Forward routes; operate command palette, comboboxes, sort buttons, explicit detail actions, and labelled horizontal table scrollers; verify modal initial focus, forward/backward containment, Escape, and trigger restoration; verify loading, error, stale, restricted, action-progress, and route-change announcements are timely and not duplicated.
- **Owner: Accessibility QA — Apple platforms.** With VoiceOver on current macOS Safari and iOS Safari, repeat landmark/heading rotor and swipe-order checks; verify drawer/dialog focus ownership; operate autocompletes, segmented controls, tables/scrollers, and explicit row actions; verify 390px/320px touch targets and that content remains discoverable without two-dimensional page scrolling.

## Finding disposition ledger

Evidence abbreviations: **A** = focused 67-test access/state/a11y set; **B** = full suite and production build; **R** = current-candidate responsive/special render JSON above; **Tn** = implementation report `C:\tmp\ui-ux-task-n-report.md` and its committed focused tests.

| Finding | Disposition | Evidence | Residual risk | Owner / follow-up |
| --- | --- | --- | --- | --- |
| F1. Modal surfaces lack shared keyboard/focus behavior | **Resolved** | A; T6; shared `Dialog` contract | Manual screen-reader replay unavailable | Accessibility QA checklist above |
| F2. Mouse-only table/detail workflows | **Resolved** | A; T5; explicit buttons/sort controls; labelled scrollers | Some live-data actions were not present in anonymous smoke data | Accessibility QA with safe fixture |
| F3. Incomplete search/autocomplete semantics | **Resolved** | A; T5 combobox/listbox boundaries | Manual announcement quality not replayed | Accessibility QA |
| F4. Async progress/results inconsistently announced | **Resolved** | A; T7 pending registry and live-region boundaries | Authenticated mutation UI not visually exercised | Product QA with non-mutating fixtures |
| F5. Undefined CSS variables invalidate declarations | **Resolved** | B; T1 and T8 theme/token guardrails | New CSS could regress without tests | Frontend maintainers; retain guardrails |
| F6. Late narrow CSS overrides clip content | **Improved / accepted limitation** | R: normal 153/153 zero; T2/T3; Task 13 fixes | Activity zoom/text and five 320-text stress residuals listed above | Frontend; focused follow-up without global clipping |
| F7. No coherent loading/empty/error/stale/partial taxonomy | **Resolved** | A; T7 state-kind and route exclusivity tests | Visual fixture matrix incomplete | Product QA fixture pass |
| F8. Monolithic page/CSS delivery | **Resolved** | A; T9; generated route asset inventory | Bundle boundaries can regress | Frontend; retain delivery test |
| F9. Theme is not application-wide/reliable | **Resolved** | A; T8 contrast, semantic surface, import validation tests | Manual extreme-theme visual replay limited | Frontend/Design QA |
| F10. Tables behaviorally fragmented | **Resolved** | A; T5 shared `DataTable`; Task 13 scroller labels | Route-specific dense layouts still exist by design | Frontend; use shared primitive for new tables |
| F11. Fragile global CSS ownership/specificity | **Improved / accepted limitation** | B; T1/T8/T9/T12 ownership guardrails | Plain CSS cascade remains inherently shared | Frontend; keep route-owned styles and guardrails |
| F12. `AdminPanel` has excessive responsibilities | **Resolved** | A; T11 focused Admin sections | Orchestration remains centralized intentionally | Frontend; preserve section seams |
| F13. First-run tour teaches sitemap, not success | **Resolved** | A; T10 executable task-based tour | Browser replay unavailable | Product QA safe replay |
| F14. SPA navigation lacks page orientation | **Resolved** | A; T4 titles, focus, status, history tests | Screen-reader announcement quality unverified manually | Accessibility QA |
| F15. Placeholder contrast is too low | **Resolved** | A; T8 contrast contract | Device/font rasterization not manually sampled | Design QA |
| F16. Touch sizing is exception-based | **Resolved** | A; T2/T8 semantic touch tokens and shell tests | Physical-device testing unavailable | Mobile QA |
| F17. Typography/elevation/page headers contain outliers | **Resolved** | A; T8; T12 visual ownership cleanup | Specialized route vocabulary remains where operationally useful | Design QA during new route work |
| F18. Motion lacks a small shared system | **Resolved** | A; R reduced-motion 17/17; T6/T8 | Manual vestibular review unavailable | Accessibility QA |
| F19. Iframe/font policies are implicit | **Resolved** | A; T8 font coverage; T9 Map/Sync host states | Cross-origin iframe internals remain outside app control | Frontend; retain timeout/recovery states |
| F20. Confirmed legacy/duplication adds noise | **Resolved** | B; T12 dead-selector and duplicate-ownership guardrails | Future dead CSS remains possible | Frontend; retain ownership tests |
| F21. Permission meaning is colour-only | **Resolved** | T5 member permission text tests | Live member fixture not visually replayed | Accessibility QA |
| F22. Chart points are non-activating buttons | **Resolved** | T5 chart image/summary boundary | Live history was insufficient for visual replay | Product QA with populated history fixture |
| F23. Source/live version drift blocks parity assessment | **Improved / accepted limitation** | Exact commit/version/build/assets/served-local match in this report | Production parity deliberately not assessed; release not authorized | Release owner before any release/deploy |
| F24. First-visit surfaces lack one coordinator | **Resolved** | A; T6/T10 modal/tour coordination tests | Full identity/consent visual fixture unavailable | Product QA |
| F25. `replaceState` prevents Back navigation | **Resolved** | A; T4 push/replace and Market subview tests | None identified in tested routes | Frontend; retain navigation tests |
| F26. Fully restricted tabs can retain stale content | **Resolved** | A; T4 allowed-view/all-denied boundaries | Authenticated visual role variants unavailable | Product QA role fixtures |
| F27. Permission/admin discoverability is inconsistent | **Resolved** | A; T4/T10 shared access and settings discovery | Grant semantics require configured role fixtures | Product QA role fixtures |
| F28. Account sync copy overpromises | **Resolved** | T10 settings-copy boundaries | Future settings additions could drift | Product owner; update copy with capability |
| F29. Bot dashboard labels overlap implementation sections | **Resolved** | A; T10 Bot catalog/navigation; T12 semantic status vocabulary | Authenticated Bot visual replay unavailable | Product QA read-only Bot fixture |
| F30. Mobile shell chrome competes with content | **Resolved** | R normal 320/375/390; T2 launcher geometry tests | Physical safe-area devices not tested | Mobile QA |
| F31. Dashboard KPIs collide at default desktop shell | **Resolved** | R normal widths; T2 container-query boundaries | Extreme localized copy not separately tested | Frontend/Localization QA |

Disposition count: **28 Resolved; 3 Improved / accepted limitation; 0 Deferred finding dispositions; 0 Not reproducible on candidate.** Manual/platform and authenticated-fixture verification deferrals are recorded separately above.

## Historical-audit pointer blocker

The historical source audit exists only in the original checkout at:

`C:\Users\Tom\Documents\Bitcraft_Claim_Monitor_PerformancePass\docs\audits\2026-07-15-complete-ui-ux-design-system-audit.md`

It is approximately 107 KiB and is absent from this isolated worktree/branch. The task explicitly prohibits editing the original user checkout and requires `apply_patch` for branch changes. Reconstructing or shell-copying that large user file would not safely preserve it byte-for-byte. Therefore the historical audit is **unchanged**, and its requested concise pointer to this verification report remains blocked. The release/repository owner should add a pointer to `docs/audits/2026-07-15-ui-ux-remediation-verification.md` when the historical document is safely present on the same branch.

## Conclusion

The local candidate resolves or materially improves all 31 audit findings and passes the full automated suite, production build, focused accessibility/state boundaries, and the 153-case normal responsive matrix. It is not a release approval: the explicitly recorded zoom/text residuals, authenticated visual role variants, and manual NVDA/VoiceOver/device checks remain owner follow-ups.
