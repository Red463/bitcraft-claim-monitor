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
  assert.match(appShell, /from "\.\/pages\/CraftPlanningPage"/);
  assert.match(appShell, /planning: <CraftPlanningPage/);
});

test("Craft Planning page renders read-only plan sections with an admin-only manager entry", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /\/craft-plan\?claimId=/);
  assert.match(page, /\/admin\/me/);
  assert.match(page, /Manage Plan/);
  assert.match(page, /className="dashboard-top-meta"/);
  assert.doesNotMatch(page, /className="top-meta"/);
  assert.match(page, /<h3><Target size=\{17\} \/> Targets<\/h3>/);
  assert.match(page, /<ItemIcon item=\{item\} \/>/);
  assert.doesNotMatch(page, /craft-plan-item-icon"><ItemIcon item=\{item\} \/>/);
  assert.match(page, /Needs Board/);
  assert.match(page, /newly built/);
  assert.match(page, /Tracking pending/);
  assert.match(page, /needed/);
  assert.match(page, /quantity\(supplied\).*quantity\(cell\.required\)/s);
  assert.match(page, /craft-plan-needs-board/);
  assert.match(page, /craft-plan-section-filters/);
  assert.match(page, /craft-plan-needs-search/);
  assert.match(page, /placeholder="Search items"/);
  assert.match(page, /filterNeedsBoard\(personalBoard\.board, selectedSections, shortagesOnly, needsSearch\)/);
  assert.match(page, /No matching items in the selected Needs Board filters/);
  assert.match(page, /Shortages only/);
  assert.match(page, /group\.completion/);
  assert.match(page, /craft-plan-needs-section-row/);
  assert.match(page, /craft-plan-needs-legend/);
  assert.match(page, /plannedOutput/);
  assert.match(page, /craft-plan-row-section-button/);
  assert.match(page, /sectionOverrides/);
  assert.match(page, /rowNameOverrides/);
  assert.match(page, /Row display name/);
  assert.match(page, /Use API defaults/);
  assert.match(page, /Save row/);
  assert.match(page, /selectedNeed/);
  assert.match(page, /from "react-dom"/);
  assert.match(page, /createPortal\(needDetailDialog, document\.body\)/);
  assert.match(page, /craft-plan-need-detail/);
  assert.match(page, /How to get this/);
  assert.match(page, /Gathering byproduct/);
  assert.match(page, /route\.routeType === "gathering-byproduct"/);
  assert.match(page, /Expected yield/);
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
  assert.match(server, /scheduleGameCatalogNormalizationRefresh\(\)/);

  const computedCraftPlan = server.match(/async function computedCraftPlanResponse[\s\S]*?const bitjitaProxyCache/)?.[0] ?? "";
  assert.match(computedCraftPlan, /const catalogTargets = craftPlanCatalogTargets\(config\)/);
  assert.match(computedCraftPlan, /collectLocalCatalogCraftPlanDetails\(gameCatalogRepository, catalogTargets, config\.routeOverrides\)/);
  assert.match(computedCraftPlan, /enrichCraftPlanSourcesFromLocalCatalog\(gameCatalogRepository, sources\.inventory, catalogWarnings\)/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/claims\/\$\{encodeURIComponent\(claimId\)\}\/inventories`\)/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/claims\/\$\{encodeURIComponent\(claimId\)\}\/members`\)/);
  assert.match(computedCraftPlan, /memberNames/);
  assert.match(computedCraftPlan, /fetchBitjita\(`\/crafts\?claimEntityId=\$\{encodeURIComponent\(claimId\)\}&completed=false`\)/);
  assert.match(computedCraftPlan, /config\.sourceRules\.craftPlayerIds/);
  assert.match(computedCraftPlan, /\/players\/\$\{encodeURIComponent\(playerId\)\}\/crafts\?completed=all/);
  assert.match(computedCraftPlan, /trackedCraftPlanOutputs\(craftPayloads, detailsByKey\)/);
  assert.doesNotMatch(computedCraftPlan, /recipeDetailFromCatalogOrFetch|addCraftPlanItemOutputDetails|addCraftPlanCargoDerivationDetails|collectRecipeDetails|enrichCraftPlanSourceItems|fetchCraftPlanItemDetail/);
});
