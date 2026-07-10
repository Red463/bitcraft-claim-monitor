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
  assert.match(page, /Needs Board/);
  assert.match(page, /craft-plan-needs-board/);
  assert.match(page, /craft-plan-section-filters/);
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
  assert.match(page, /selectedSection/);
  assert.doesNotMatch(page, /inferTierFromName/);
  assert.doesNotMatch(page, /inferTierFromItemId/);
  assert.doesNotMatch(page, /UNTIERED_MATERIAL_PATTERN/);
  assert.doesNotMatch(page, /TIER_NAME_PREFIXES/);
  assert.doesNotMatch(page, /craft-plan-need-icon/);
  assert.ok(page.indexOf("Targets") < page.indexOf("Needs Board"), "targets should render before the public needs board");
  assert.doesNotMatch(page, /<h3><Package size=\{17\} \/> Materials<\/h3>/);
  assert.doesNotMatch(page, /<DataTable rows=\{materials\}/);
  assert.doesNotMatch(page, /<h3><Route size=\{17\} \/> Recipe Routes<\/h3>/);
  assert.match(page, /Unavailable sources/);
  assert.match(page, /CraftPlanManagerDialog/);
});

test("Craft Planning manager owns full admin editing controls", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/components/admin/AdminCraftPlanSection.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(admin, /Open Manager/);
  assert.match(admin, /page=planning/);
  assert.match(manager, /\/admin\/craft-plan/);
  assert.match(manager, /Tier upgrade presets/);
  assert.match(manager, /Loaded from BitJita claim research/);
  assert.match(manager, /tierPresets/);
  assert.match(server, /nestedKeys = \["input", "inputs"/);
  assert.match(server, /techType === "settlement"/);
  assert.match(manager, /Target items/);
  assert.match(manager, /Settlement storage/);
  assert.match(manager, /Players & deployables/);
  assert.match(manager, /groupDeployablesByPlayer/);
  assert.match(manager, /craft-plan-deployable-group/);
  assert.match(manager, /function itemTypeLabel/);
  assert.match(manager, /meta=\{itemTypeLabel\(item\)\}/);
  assert.match(manager, /Chance and drop multipliers/);
  assert.match(manager, /mergeTargets/);
});

test("Dashboard shows Gather Next instead of Recent Activity", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /\/api\/local\/craft-plan|LOCAL_API\}\/craft-plan/);
  assert.match(dashboard, /Gather Next/);
  assert.match(dashboard, /onNavigate\("planning"\)/);
  assert.doesNotMatch(dashboard, /DashboardCardHeader title="Recent Activity"/);
});

test("Craft Planning recipe discovery runs in the scheduled job, not page-load requests", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /refreshCraftPlanProducerCatalog/);
  assert.match(server, /craftPlanHasItemListOutputs/);
  assert.match(server, /craftPlanCargoLooksLikeTransportPackage/);
  assert.match(server, /runRecipeCatalogRefreshJob[\s\S]*refreshCraftPlanProducerCatalog/);
  assert.match(server, /recipe_catalog_refresh:[\s\S]*producer\/byproduct metadata/);
  assert.match(server, /recipeDetailHasPlanningMetadata/);
  assert.match(server, /metadata_refresh/);
  assert.match(server, /RECIPE_CATALOG_DISCOVERY_LIMIT \?\? 2000/);

  const itemOutputHelper = server.match(/async function addCraftPlanItemOutputDetails[\s\S]*?async function addCraftPlanCargoDerivationDetails/)?.[0] ?? "";
  assert.match(itemOutputHelper, /recipeDetailFromCatalog\(\{ id: itemId, kind: "items", itemType: 0 \}\)/);
  assert.doesNotMatch(itemOutputHelper, /recipeDetailFromCatalogOrFetch\(\{ id: itemId, kind: "items", itemType: 0 \}\)/);

  const itemProducerHelper = server.match(/async function craftPlanItemProducerIdsFromCatalog[\s\S]*?async function craftPlanCargoIdsFromCatalog/)?.[0] ?? "";
  assert.doesNotMatch(itemProducerHelper, /craftPlanItemProducerLooksRelevant/);

  const cargoHelper = server.match(/async function addCraftPlanCargoDerivationDetails[\s\S]*?function activeCraftPlanOutputs/)?.[0] ?? "";
  assert.match(cargoHelper, /const sourceCargoIds = new Set\(craftPlanCargoIdsFromSources\(sources\)\)/);
  assert.match(cargoHelper, /sourceCargoIds\.has\(cargoId\)[\s\S]*recipeDetailFromCatalogOrFetch/);
  assert.match(cargoHelper, /recipeDetailFromCatalog\(target\)/);
  assert.match(cargoHelper, /sourceCargoIds\.has\(cargoId\)[\s\S]*recipeDetailFromCatalogOrFetch\(outputTarget\)[\s\S]*recipeDetailFromCatalog\(outputTarget\)/);
});
