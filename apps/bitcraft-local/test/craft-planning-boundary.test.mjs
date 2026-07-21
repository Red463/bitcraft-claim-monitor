import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Craft Planning page is registered in navigation, access control, and AppShell", () => {
  const appType = readFileSync(new URL("../src/types/app.ts", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../src/navigation.ts", import.meta.url), "utf8");
  const access = readFileSync(new URL("../src/access/accessControl.mjs", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appType, /\| "planning"/);
  assert.match(navigation, /\["planning", "Craft Planning"/);
  assert.match(access, /\["planning", "Craft Planning"\]/);
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/CraftPlanningPage"\)/);
  assert.match(appShell, /planning: <CraftPlanningPage/);
});

test("Craft Planning labels estimated active output as material-planning coverage", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const cellBody = page.match(/function needCellNode[\s\S]+?function recipeOptionLabel/)?.[0] ?? "";

  assert.match(page, /EqualApproximately/);
  assert.match(cellBody, /aria-label="Approximate requirement"/);
  assert.match(cellBody, /cell\.available \+ cell\.guaranteedInProgress \+ cell\.estimatedInProgress/);
  assert.match(cellBody, /aria-label="Estimated craft output; counted for material planning"/);
  assert.match(cellBody, /craft-plan-cell-indicators/);
  assert.doesNotMatch(cellBody, /craft-plan-estimated-marker/);
  assert.doesNotMatch(cellBody, />~<\/span>/);
  assert.match(page, />Approximate requirement<\/span>/);
  assert.match(page, />Covered for material planning<\/span>/);
  assert.match(page, />Estimated craft output; counted for material planning<\/span>/);
  assert.doesNotMatch(page, />Estimated active output; not counted<\/span>/);
});

test("Craft Planning exposes a public probability workbook download with explicit gathering units", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(server, /\/api\/local\/catalog\/probabilities\.xlsx/);
  assert.match(server, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(server, /getProbabilityWorkbookData/);
  assert.match(server, /Probability catalogue is not ready/);
  assert.match(page, /Download probabilities/);
  assert.match(page, /per resource progress/);
  assert.match(page, /Expected per full resource/);
  assert.doesNotMatch(page, /per gathering action/);
});

test("Craft Planning makes the distinct-material shortage count explicit", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /"Materials still short"/);
  assert.match(page, /"different materials after stock and tracked crafts"/);
  assert.match(page, /<span>\{quantity\(totals\.missingItems\)\} materials still short<\/span>/);
  assert.doesNotMatch(page, /"Materials missing"/);
  assert.doesNotMatch(page, /<span>\{quantity\(totals\.missingItems\)\} missing items<\/span>/);
});

test("Craft Planning page renders read-only plan sections with an admin-only manager entry", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /\/craft-plan\?claimId=/);
  assert.match(page, /\/admin\/me/);
  assert.match(page, /Manage Plan/);
  assert.match(page, /className="dashboard-top-meta"/);
  assert.doesNotMatch(page, /className="top-meta"/);
  assert.match(page, /className="craft-plan-targets-toggle"/);
  assert.match(page, /<Target size=\{17\} \/>\s*<span>Targets<\/span>/);
  assert.match(page, /<ItemIcon item=\{item\} \/>/);
  assert.doesNotMatch(page, /craft-plan-item-icon"><ItemIcon item=\{item\} \/>/);
  assert.match(page, /Needs Board/);
  assert.match(page, /newly built/);
  assert.match(page, /Tracking pending/);
  assert.match(page, /needed/);
  assert.match(page, /quantity\(planningSupplied\).*quantity\(cell\.required\)/s);
  assert.match(page, /craft-plan-needs-board/);
  assert.match(page, /craft-plan-section-filters/);
  assert.match(page, /craft-plan-needs-search/);
  assert.match(page, /placeholder="Search items"/);
  assert.match(page, /filterNeedsBoard\(personalBoard\.board, selectedSections, shortagesOnly, needsSearch\)/);
  assert.match(page, /No matching items in the selected Needs Board filters/);
  assert.match(page, /Shortages only/);
  assert.match(page, /effortView\.sections\[group\.section\]/);
  assert.doesNotMatch(page, /craft-plan-effort-warning/);
  assert.doesNotMatch(page, /effortView\.warnings(?:\[0\]|\.join)/);
  assert.doesNotMatch(page, /effortView\.overall\.completion == null && effortView\.warnings\[0\]/);
  assert.match(page, /craft-plan-needs-section-row/);
  assert.match(page, /craft-plan-needs-legend/);
  assert.doesNotMatch(page, /planned secondary outputs|plannedOutput/);
  assert.match(page, /in stock/);
  assert.match(page, /guaranteed active output/);
  assert.match(page, /guaranteed/);
  assert.match(page, /estimated/);
  assert.match(page, /craft-plan-row-section-button/);
  assert.match(page, /sectionOverrides/);
  assert.match(page, /rowNameOverrides/);
  assert.match(page, /Row display name/);
  assert.match(page, /Planner default:/);
  assert.match(page, /Use planner defaults/);
  assert.doesNotMatch(page, /Use API defaults/);
  assert.match(page, /section:\s*row\.sectionOverride\s*\?\?\s*row\.plannerSection/);
  assert.doesNotMatch(page, /section:\s*row\.sectionOverride\s*\?\?\s*row\.apiSection/);
  assert.match(page, /Save row/);
  assert.match(page, /selectedNeed/);
  assert.match(page, /import \{ Dialog \} from "\.\.\/components\/main\/Dialog";/);
  assert.match(page, /<Dialog[\s\S]*craft-plan-need-detail/);
  assert.match(page, /craft-plan-need-detail/);
  assert.match(page, /How to get this/);
  assert.match(page, /Treat this cell as gathered/);
  assert.match(page, /cellItemKeys/);
  assert.match(page, /gatheredCellState/);
  assert.match(page, /setCellGathered/);
  assert.match(page, /canManage[\s\S]*craft-plan-gathered-control/);
  assert.match(page, /x-csrf-token/);
  assert.match(page, /href="\/\?page=map"/);
  assert.match(page, /Open Map resource finder/);
  assert.match(page, /must be gathered or supplied from counted stock/);
  assert.match(page, /Craft output/);
  assert.match(page, /Craft byproduct/);
  assert.match(page, /Gathering output/);
  assert.match(page, /Gathering byproduct/);
  assert.match(page, /routeType\.startsWith\("gathering"\)/);
  assert.match(page, /routeType\.endsWith\("-byproduct"\)/);
  assert.doesNotMatch(page, /route\.routeType === "gathering-byproduct"/);
  assert.match(page, /Guaranteed output:/);
  assert.match(page, /Expected yield/);
  assert.match(page, /per craft/);
  assert.match(page, /per resource progress/);
  assert.doesNotMatch(page, /per gathering action/);
  assert.match(page, /Craft inputs/);
  assert.match(page, /Used for/);
  assert.match(page, /Show \{usage\.entries\.length\} recipe demands/);
  assert.match(page, /selectedNeedSources/);
  assert.match(page, /selectedNeedSourceRoutes/);
  assert.match(page, /selectedNeedUsages/);
  assert.match(page, /groupNeedCellSources/);
  assert.match(page, /groupNeedCellSourceRoutes/);
  assert.match(page, /groupNeedCellRecipeUsages/);
  assert.match(page, /Needed for/);
  assert.doesNotMatch(page, /ItemLabel/);
  assert.match(page, /Stock locations/);
  assert.match(page, /selectedSections/);
  assert.match(page, /function toggleSection/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /setSelectedSections\(\[\]\)/);
  assert.match(page, /needsBoardRowCount/);
  assert.doesNotMatch(page, /All <span>\{needsBoard\.length\}<\/span>/);
  assert.doesNotMatch(page, /inferTierFromName/);
  assert.doesNotMatch(page, /inferTierFromItemId/);
  assert.doesNotMatch(page, /UNTIERED_MATERIAL_PATTERN/);
  assert.doesNotMatch(page, /TIER_NAME_PREFIXES/);
  assert.doesNotMatch(page, /craft-plan-need-icon/);
  assert.ok(page.indexOf("Targets") < page.indexOf("Needs Board"), "targets should render before the public needs board");
  assert.doesNotMatch(page, /<h3><Package size=\{17\} \/> Materials<\/h3>/);
  assert.doesNotMatch(page, /<DataTable rows=\{materials\}/);
  assert.doesNotMatch(page, /<h3><Route size=\{17\} \/> Recipe Routes<\/h3>/);
  assert.match(page, /Catalog diagnostics/);
  assert.match(page, /canManage && warnings\.length/);
  assert.match(page, /<details className="[^"]*craft-plan-catalog-diagnostics[^"]*"/);
  assert.match(page, /Unavailable stock sources/);
  assert.match(page, /CraftPlanManagerDialog/);
});

test("Craft Planning keeps the preferred fishing route browser-local", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(page, /usePersistedState<FishingRoutePreference>\("planning\.fishingRoute", "ocean"\)/);
  assert.match(page, /normalizeFishingRoutePreference\(fishingRoute\)/);
  assert.match(page, /applyPersonalFishingView\(needsBoard, plan\?\.personalViews\?\.fishing, normalizedFishingRoute\)/);
  assert.match(page, /personalBoard\.board/);
  assert.match(page, /aria-label="Preferred fishing route"/);
  assert.match(page, />Ocean<\/button>/);
  assert.match(page, />Lake<\/button>/);
  assert.match(page, /group\.section === "Fishing" \? <div className="craft-plan-fishing-route"/);
  assert.doesNotMatch(page, /craft-plan-section-filters[\s\S]{0,1800}aria-label="Preferred fishing route"/);
  assert.match(page, /personalBoard\.reason/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(styles, /\.craft-plan-section-filters\s*>\s*button\s*>\s*span/);
  assert.doesNotMatch(styles, /\.craft-plan-section-filters span\s*\{/);
  assert.doesNotMatch(page.match(/async function saveRowOverride[\s\S]*?\n  }\n  async function saveRouteOverride/)?.[0] ?? "", /setFishingRoute/);
  assert.doesNotMatch(page.match(/async function saveRouteOverride[\s\S]*?\n  }\n\n  if \(loading/)?.[0] ?? "", /setFishingRoute/);
});

test("Craft Planning manager owns full admin editing controls", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/components/admin/AdminCraftPlanSection.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(admin, /Open Manager/);
  assert.match(admin, /page=planning/);
  assert.match(manager, /\/admin\/craft-plan/);
  assert.match(manager, /Tier upgrade presets/);
  assert.match(manager, /Workstation presets/);
  assert.match(manager, /workstationPresets/);
  assert.match(manager, /addWorkstationPreset/);
  assert.match(manager, /\/admin\/craft-plan\/workstation-preset\?tier=/);
  assert.match(manager, /Loaded from BitJita claim research/);
  assert.match(manager, /tierPresets/);
  assert.match(server, /nestedKeys = \["input", "inputs"/);
  assert.match(server, /techType === "settlement"/);
  assert.match(manager, /Target items/);
  assert.doesNotMatch(manager, /craft-plan-item-icon"><ItemIcon item=\{target\} \/><\/span><ItemLabel item=\{target\} \/>/);
  assert.match(manager, /Settlement storage/);
  assert.match(manager, /Players & deployables/);
  assert.match(manager, /bankPlayerIds/);
  assert.match(manager, />Banks<\/span>/);
  assert.match(manager, /all BitJita-visible settlement banks/i);
  assert.match(manager, /craft-plan-player-source-card/);
  assert.match(styles, /\.craft-plan-player-source-toggles\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(100px,\s*1fr\)\)/s);
  assert.match(styles, /\.craft-plan-player-source-card\s+header\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.craft-plan-player-source-toggles\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /@media[^}]*max-width:\s*640px[^}]*\{[\s\S]*?\.craft-plan-player-source-toggles\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(manager, /groupDeployablesByPlayer/);
  assert.match(manager, /craft-plan-deployable-group/);
  assert.match(manager, /function itemTypeLabel/);
  assert.match(manager, /meta=\{itemTypeLabel\(item\)\}/);
  assert.match(manager, /Chance-drop safety buffers/);
  assert.match(manager, /How to get this/);
  assert.match(manager, /Loading plan data/);
  assert.match(manager, /Saving plan/);
  assert.match(manager, /Refreshing plan data/);
  assert.match(manager, /aria-live="polite"/);
  assert.match(manager, /LoaderCircle/);
  assert.match(manager, /mergeTargets/);
  assert.match(manager, /buildingProgress/);
  assert.match(manager, /delete nextProgress\[itemKey\(target\)\]/);
  assert.match(server, /reconcileCraftPlanBuildingProgress/);
  assert.match(server, /\/claims\/\$\{encodeURIComponent\(claimId\)\}\/buildings/);
  assert.match(server, /\/api\/local\/admin\/craft-plan\/workstation-preset/);
  assert.match(server, /fetchBitjita\(`\/buildings\/\$\{encodeURIComponent\(workstation\.id\)\}`/);
});

test("Craft Planning manager exposes a lazy, resilient audit history tab", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");

  assert.match(manager, /const TABS = \[[^\]]*"audit"/);
  assert.match(manager, /<History size=\{15\} \/>/);
  assert.match(manager, /\/admin\/craft-plan\/audit\?limit=100/);
  assert.match(manager, /gathered_item:\s*"Gathered item"/);
  assert.match(manager, /gatheredItemKeys:\s*string\[\]/);
  assert.match(manager, /activeTab !== "audit" \|\| auditLoaded \|\| auditLoading/);
  assert.match(manager, /Audit history/);
  assert.match(manager, /No craft plan changes have been recorded yet\./);
  assert.match(manager, /Retry audit/);
  assert.match(manager, /Other plan settings changed/);
  assert.match(manager, /enabled/);
  assert.match(manager, /disabled/);
  assert.match(manager, /setAuditLoaded\(false\)/);
});

test("Craft Planning manager renders presets as compact tier-only controls", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(manager, /className="craft-plan-preset-tier"/);
  assert.match(manager, /aria-label={`Add upgrade materials for \${preset\.label}`}/);
  assert.match(manager, /aria-label={`Add workstation targets for \${preset\.label}`}/);
  assert.doesNotMatch(manager, /\{presetSummary\(preset\)\}/);
  assert.doesNotMatch(manager, /\{formatNumber\(preset\.workstations\?\.length \?\? 0, 0\)\} workstations/);
  assert.match(styles, /\.craft-plan-preset-grid\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  assert.match(styles, /\.craft-plan-preset-tier\s*\{[^}]*min-height:\s*38px;/s);
});


test("Craft Planning manager shows compact catalog diagnostics and manual refresh controls", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(manager, /\/admin\/craft-plan\/catalog-refresh/);
  assert.match(manager, /Refresh planner catalog/);
  assert.match(manager, /No planner catalog yet/);
  assert.match(manager, /processedCount/);
  assert.match(manager, /totalCount/);
  assert.match(manager, /itemCount/);
  assert.match(manager, /cargoCount/);
  assert.match(manager, /recipeCount/);
  assert.match(manager, /byproductCount/);
  assert.match(manager, /failureCount/);
  assert.match(manager, /lastSuccessAt/);
  assert.match(manager, /completedAt/);
  assert.match(manager, /scheduledJob\?\.running/);
  assert.match(manager, /catalogContinuing/);
  assert.match(manager, /catalogPollingActive/);
  assert.match(manager, /Last full refresh/);
  assert.match(manager, /Next batch queued/);
  assert.match(manager, /if \(!open \|\| !catalogPollingActive\) return/);
  assert.match(manager, /window\.setInterval\(\(\) => \{\s*void loadCatalogStatus\(\{ silent: true \}\);\s*\}, CATALOG_REFRESH_POLL_MS\)/s);
  assert.match(manager, /window\.clearInterval/);
  assert.doesNotMatch(manager, /window\.setTimeout\(\(\) => \{\s*void loadCatalogStatus\(\{ silent: true \}\);\s*\}, CATALOG_REFRESH_POLL_MS\)/s);
  assert.match(manager, /run\?\.status === "completed"/);
  assert.doesNotMatch(manager, /run\?\.status === "complete"/);
  assert.match(styles, /\.craft-plan-catalog-band/);
  assert.match(styles, /\.craft-plan-catalog-stats/);
  assert.match(styles, /\.craft-plan-catalog-stat/);
  assert.match(styles, /\.craft-plan-catalog-empty/);
  assert.match(styles, /\.craft-plan-manager-backdrop \{ position: fixed; inset: 0;/);
});
test("Dashboard shows Gather Next instead of Recent Activity", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /\/api\/local\/craft-plan|LOCAL_API\}\/craft-plan/);
  assert.match(dashboard, /Gather Next/);
  assert.match(dashboard, /onNavigate\("planning"\)/);
  assert.doesNotMatch(dashboard, /DashboardCardHeader title="Recent Activity"/);
});

test("Craft Planning catalog refresh stays in the scheduled job/admin layer, not page-load requests", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /createGameCatalogRepository/);
  assert.match(server, /runRecipeCatalogRefreshJob/);
  assert.match(server, /weekly@1@00:00/);
  assert.match(server, /catalog database/);
  assert.match(server, /\/api\/local\/admin\/craft-plan\/catalog-refresh/);
  assert.match(server, /\/items/);
  assert.match(server, /\/cargo/);
  assert.match(server, /cursor_kind|cursorKind/);
  assert.match(server, /recipeDetailHasPlanningMetadata/);
  assert.match(server, /refreshKnownRecipeCatalogEntries/);
  assert.match(server, /refreshCraftPlanProducerCatalog/);
  assert.match(server, /GAME_CATALOG_REFRESH_DETAIL_DELAY_MS/);
  assert.match(server, /await delay\(gameCatalogRefreshDetailDelayMs\)/);
  assert.match(server, /GAME_CATALOG_NORMALIZATION_VERSION/);
  assert.match(server, /catalogRefreshShouldResume\(previousRun, storedNormalizationVersion\)/);
  assert.match(server, /game_catalog_normalization_version/);
  assert.match(server, /fetchGameDataProbabilitySnapshot\(\{/);
  assert.match(server, /replaceProbabilitySnapshot\(probabilitySource\)/);
  assert.match(server, /listProbabilityEffortCandidates\(\)/);
  assert.match(server, /replaceEffortWeights\(\s*effortCandidates,\s*CRAFT_PLAN_EFFORT_MODEL_VERSION/);
  assert.match(server, /game_catalog_effort_model_version/);
  assert.match(server, /scheduleGameCatalogNormalizationRefresh\(\)/);

  const computedCraftPlan = server.match(/async function computedCraftPlanResponse[\s\S]*?const bitjitaProxyCache/)?.[0] ?? "";
  assert.match(computedCraftPlan, /const catalogTargets = craftPlanCatalogTargets\(config\)/);
  assert.match(computedCraftPlan, /collectLocalCatalogCraftPlanDetails\([\s\S]*?gameCatalogRepository,[\s\S]*?catalogTargets,[\s\S]*?config\.routeOverrides,[\s\S]*?64,[\s\S]*?\[\],[\s\S]*?requireValidatedProbabilities: true/);
  assert.match(computedCraftPlan, /enrichCraftPlanSourcesFromLocalCatalog\(gameCatalogRepository, sources\.inventory, catalogWarnings\)/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/claims\/\$\{encodeURIComponent\(claimId\)\}\/inventories`\)/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/claims\/\$\{encodeURIComponent\(claimId\)\}\/members`\)/);
  assert.match(computedCraftPlan, /memberNames/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/crafts\?claimEntityId=\$\{encodeURIComponent\(claimId\)\}&completed=false`\)/);
  assert.match(computedCraftPlan, /config\.sourceRules\.craftPlayerIds/);
  assert.match(computedCraftPlan, /selectedPlayerInventoryIds\(config\.sourceRules\)/);
  assert.match(computedCraftPlan, /config\.sourceRules\.bankPlayerIds/);
  assert.match(computedCraftPlan, /sources\.banks/);
  assert.match(computedCraftPlan, /bankSources/);
  assert.match(computedCraftPlan, /\/players\/\$\{encodeURIComponent\(playerId\)\}\/crafts\?completed=all/);
  assert.match(computedCraftPlan, /trackedCraftPlanOutputs\(craftPayloads, detailsByKey\)/);
  assert.match(computedCraftPlan, /craftPlanEffortBaselineKey/);
  assert.match(computedCraftPlan, /craftPlanEffortBaselineCache\.getOrCreate/);
  assert.match(computedCraftPlan, /compactCraftPlanEffortInput\(computeCraftPlan/);
  assert.match(computedCraftPlan, /calculateCraftPlanEffortProgress/);
  assert.match(computedCraftPlan, /effortProgress/);
  const playerInventoryLoop = computedCraftPlan.match(/for \(const playerId of selectedPlayerInventoryIds\(config\.sourceRules\)\)[\s\S]*?const livePlan/)?.[0] ?? "";
  assert.equal((playerInventoryLoop.match(/\/players\/\$\{encodeURIComponent\(playerId\)\}\/inventories/g) ?? []).length, 1);
  assert.match(playerInventoryLoop, /inventoryPlayerIds\.has\(playerId\)/);
  assert.match(playerInventoryLoop, /bankPlayerIds\.has\(playerId\)/);
  assert.doesNotMatch(computedCraftPlan, /recipeDetailFromCatalogOrFetch|addCraftPlanItemOutputDetails|addCraftPlanCargoDerivationDetails|collectRecipeDetails|enrichCraftPlanSourceItems|fetchCraftPlanItemDetail/);
});

test("Craft Planning serves a compact live board and lazy item drilldowns", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const bitjita = readFileSync(new URL("../src/api/bitjita.ts", import.meta.url), "utf8");

  assert.match(server, /computedCompactCraftPlanResponse/);
  assert.match(server, /createCraftPlanResponseWorkspace/);
  assert.match(server, /\/api\/local\/craft-plan\/detail/);
  assert.match(server, /craftPlanDetailResponse\(await computedCraftPlanResponse/);
  assert.match(server, /craftPlanResponseCache/);
  assert.match(server, /craftPlanResponseInflight/);
  assert.match(page, /\/craft-plan\/detail\?claimId=/);
  assert.match(page, /detailLoading/);
  assert.match(page, /groupNeedCellSourceRoutes\(selectedNeed, detailSteps\)/);
  assert.match(page, /item\.hasSourceRoutes/);
  assert.match(page, /selectCraftPlanningEffortView/);
  assert.match(page, /Effort complete/);
  assert.match(page, /Confirmed stock and guaranteed active crafts/);
  assert.match(page, /Effort progress unavailable/);
  assert.doesNotMatch(page, /needsBoardCompletion/);
  assert.match(bitjita, /activePanel === "planning"/);
});

test("Craft Planning explains unavailable producer yields and labels logistics routes", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /probabilityStatus\s*===\s*["']unavailable["']/);
  assert.match(page, /Validated output rate unavailable/);
  assert.match(page, /route is known, but required completions and inputs cannot be calculated/i);
  assert.match(page, /isTransportRoute[\s\S]*?Logistics/);
});
