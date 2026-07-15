# UI/UX remediation verification

Date: 2026-07-15

Product: BitCraft Claim Monitor — Settlement Control Room

Scope: local production candidate verification for findings F1–F31

Release status: **not released, pushed, deployed, or compared with production**

## Candidate identity

The verified application-code candidate is commit `cee5825fafbcae0cbc64dbfc550f92207d0aee98`. This report is committed separately and does not change that candidate's application assets.

| Property | Recorded value |
| --- | --- |
| Branch | `codex/ui-ux-audit-remediation` |
| Package version | `0.32.0-beta.57` |
| Build ID | empty string (`""`) |
| Node | `v24.15.0` |
| OS | Microsoft Windows NT `10.0.26200.0` |
| Time zone | `GMT Standard Time` (Europe/London) |
| Identity captured | `2026-07-15T20:20:00+01:00` |
| Smoke origin | `http://127.0.0.1:18451/` |
| Server health | `ok: true`; package `0.32.0-beta.57`; polling disabled and not running |
| Served entry | `assets/index-BPSf3A2y.js` |
| Local `dist` entry | `assets/index-BPSf3A2y.js` |
| Served/local match | yes |

[Candidate, test, and generated-asset summary](../../.superpowers/task13-final-evidence/candidate-and-tests.json)

### Generated asset inventory

Entry and shared boundaries:

- `index-BPSf3A2y.js`, `index-D-3n2JGN.css`
- `AppShell-COo8NC0-.js`, `AppShell-DglpARwf.css`
- `AdminPanel-BpFuG5kO.js`, `AdminPanel-CqcjKhhM.css`

Public route boundaries:

| Route boundary | JavaScript | CSS |
| --- | --- | --- |
| Dashboard | `DashboardPage-C8B01hE_.js` | `DashboardPage-4Ws3VQv2.css` |
| Leaderboard | `LeaderboardPage-We_me80y.js` | `LeaderboardPage-Bf8jL85a.css` |
| Members | `MembersPage-DVia4lGW.js` | `MembersPage-BxIA6Rhg.css` |
| Skills | `SkillsPage-CIpO6WIq.js` | `SkillsPage-BDTKMQFi.css` |
| Production | `ProductionPage-CnGXr3u_.js` | `ProductionPage-Bv0s-8du.css` |
| Craft Planning | `CraftPlanningPage-T1GNlE0I.js` | `CraftPlanningPage-DdAFw_rs.css` |
| Inventory | `InventoryPage-BIdC6KEF.js` | `InventoryPage-CUfeIYE8.css` |
| Construction | `ConstructionPage-BWtmEWgS.js` | `ConstructionPage-D572-Uxz.css` |
| Research | `ResearchPage-CqkEA5uP.js` | `ResearchPage-FPs5-cOP.css` |
| Market | `MarketPage-B-IRHd3k.js` | `MarketPage-SuGiL1wH.css` |
| Empire / Region | `RegionPage-CeqIEzH-.js` | `RegionPage-CMGrt5YZ.css` |
| Empires | `EmpiresPage-DnsehVMx.js` | `EmpiresPage-BQl4Fyo1.css` |
| Map | `MapPage-ySSl1zHh.js` | `MapPage-YnsaPjyq.css` |
| Activity | `ActivityPage-BBqUdelq.js` | `ActivityPage-Dqyadb84.css` |
| Public Craft Finder | `PublicCraftFinderPage-CAS3v-f7.js` | `PublicCraftFinderPage-BnHLnI3F.css` |
| Craft Calculator | `CraftCalculatorPage-De2_ugAL.js` | `CraftCalculatorPage-G5S_lBan.css` |
| Sync | `SyncPage-C-R-p_h2.js` | `SyncPage-ZjhBCinf.css` |

## Verification commands and results

| Check | Command or method | Result |
| --- | --- | --- |
| Full tests | `corepack pnpm --filter @workspace/bitcraft-local test` | **743/743 passed** |
| Production build | `corepack pnpm --filter @workspace/bitcraft-local run build` | passed; TypeScript passed; Vite transformed 1,826 modules |
| Focused access/state/a11y | exact command below | **67/67 passed** |
| Focused text/responsive | `node --test apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs` | **12/12 passed** |
| Source hygiene | `git diff --check` | passed |
| Candidate identity | fetched `/` and compared its `index-*.js` with local `dist/index.html` | exact match |
| Health | fetched `/api/local/health` | healthy; background polling disabled |

The render harness used the bounded Edge/CDP endpoint on port 9223 because the in-app browser bootstrap was unavailable. It performed read-only navigation and screenshots only. No admin, Discord, database, or external mutation was triggered.

Exact focused access/state/a11y command:

```powershell
node --test apps/bitcraft-local/test/access-control.test.mjs apps/bitcraft-local/test/state-feedback-boundary.test.mjs apps/bitcraft-local/test/modal-foundation-boundary.test.mjs apps/bitcraft-local/test/shared-controls-boundary.test.mjs apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs apps/bitcraft-local/test/first-run-tour.test.mjs apps/bitcraft-local/test/theme-contract.test.mjs apps/bitcraft-local/test/route-delivery-boundary.test.mjs apps/bitcraft-local/test/admin-sections-boundary.test.mjs
```

## Responsive and special-mode evidence

### Normal responsive matrix

All 17 public routes were rendered at:

`1440×1000`, `1250×900`, `920×900`, `760×900`, `480×900`, `390×844`, `375×812`, `320×700`, and `390×600`.

- The first capture contained 26 static-title lazy-loading frames. Those rows were rejected, not counted as passes, and rerun with the route-specific readiness rule below.
- **The merged matrix has 153/153 route/viewport cases route-ready and zero body, main, page, and route overflow.**
- The prior Empires overflow was reproduced before the fix and is zero at all nine required widths on this candidate.
- The merged matrix contains 349 case-level custom-scroller observations, 261 of which are horizontally scrollable. Visibility, durable-name, and `tabIndex=0` failures: **0**.
- 148 of 153 cases logged 151 expected anonymous `401` resource responses for authenticated data endpoints. These were not JavaScript exceptions and did not produce route/layout failure.

Readiness required the expected route-specific document title and a visible route-owned root or final restricted/error state, with no route-loading state, stable for two consecutive 250ms polls within 20 seconds. All 26 normal replacements reached that state; none timed out.

Durable evidence:

- [Readiness replacement summary](../../.superpowers/task13-final-evidence/readiness-replacements.json)
- [Scroller summary](../../.superpowers/task13-final-evidence/scroller-summary.json)
- [Normal Dashboard at 320×700](../../.superpowers/task13-final-ready-normal/dashboard-default-320x700.png)
- [Skills custom scrollers at 320×700](../../.superpowers/task13-custom-scrollers/skills-default-320x700.png)

The Skills runtime screenshot and summary contain two visible horizontal heatmaps, both named and `tabIndex=0`, with 256px clients containing 1,580px tables and no main overflow. The conditional Craft Planning needs board was not mounted because the safe anonymous fixture returned no filtered rows; runtime geometry is not claimed for it. Its exact `Craft plan needs board` name and `tabIndex=0` are verified by the passing source boundary.

### Special modes

| Mode | Result | Evidence |
| --- | --- | --- |
| Forced colours at 390×844 | initial 6 static-title rows replaced; 17/17 route-ready, media active, and zero overflow | [Readiness summary](../../.superpowers/task13-final-evidence/readiness-replacements.json); [Skills PNG](../../.superpowers/task13-final-ready-forced/skills-forced-colors-390x844.png) |
| Reduced motion at 390×844 | initial 5 static-title rows replaced; 17/17 route-ready, media active, and zero overflow | [Readiness summary](../../.superpowers/task13-final-evidence/readiness-replacements.json); [Dashboard PNG](../../.superpowers/task13-final-ready-reduced/dashboard-reduced-motion-390x844.png) |
| 200% zoom equivalent (720 CSS px for a 1440px reference) | 16/17 zero overflow; Activity retained 23px main/page/route overflow | [Special/residual summary](../../.superpowers/task13-final-evidence/special-and-residual-summary.json) |
| Text-only 200%, 1440×1000 and 390×844 | initial 2 static-title rows replaced; combined planned set 34/34 route-ready and zero overflow | [Readiness summary](../../.superpowers/task13-final-evidence/readiness-replacements.json); [Dashboard PNG](../../.superpowers/task13-final-ready-text200/dashboard-text200-390x844.png) |

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
