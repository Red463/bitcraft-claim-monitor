import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const setupWorkflowCss = readFileSync(new URL("../src/styles/setup-workflow.css", import.meta.url), "utf8");

test("setup workflow stylesheet keeps ownership to setup, workflow, and admin-message selectors", () => {
  const forbiddenGlobalSelectors = setupWorkflowCss
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /^(aside|nav\b|nav,|\.sidebar-collapsed nav\b|\.bot-section-nav\b)/.test(line));

  assert.deepEqual(forbiddenGlobalSelectors, []);
});

test("shared command panel primitives use neutral class names", () => {
  const checkedFiles = [
    "../src/styles.css",
    "../src/styles/public-craft.css",
    "../src/styles/market.css",
    "../src/pages/ActivityPage.tsx",
    "../src/pages/CraftCalculatorPage.tsx",
    "../src/pages/EmpiresPage.tsx",
    "../src/pages/InventoryPage.tsx",
    "../src/pages/MarketPage.tsx",
    "../src/pages/ProductionPage.tsx",
    "../src/pages/PublicCraftFinderPage.tsx",
    "../src/pages/ResearchPage.tsx",
    "../src/pages/RegionPage.tsx",
    "../src/pages/market/BuyOrderFinder.tsx",
    "../src/pages/market/DealWatchlist.tsx",
    "../src/pages/market/PriceFinder.tsx",
  ];
  const forbidden = [];
  for (const relativePath of checkedFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    for (const className of ["production-command-panel", "production-command-main", "production-command-title", "market-command-header"]) {
      if (source.includes(className)) forbidden.push(relativePath + ": " + className);
    }
  }

  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.equal(globalCss.includes(".command-filter-panel"), true);
  assert.equal(globalCss.includes(".command-filter-main"), true);
  assert.equal(globalCss.includes(".command-filter-title"), true);
  assert.equal(globalCss.includes(".command-filter-header"), true);
  assert.deepEqual(forbidden, []);
});

test("shared panel headers keep title and count separated", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const panelHeadRule = globalCss.match(/\.panel-head\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const panelHeadStrongRule = globalCss.match(/\.panel-head strong\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const panelHeadMetaRule = globalCss.match(/\.panel-head > span\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(panelHeadRule, /display:\s*flex\b/);
  assert.match(panelHeadRule, /justify-content:\s*space-between\b/);
  assert.match(panelHeadRule, /gap:\s*12px\b/);
  assert.match(panelHeadStrongRule, /gap:\s*7px\b/);
  assert.match(panelHeadStrongRule, /min-width:\s*0\b/);
  assert.match(panelHeadMetaRule, /white-space:\s*nowrap\b/);
});
test("shared table sort buttons keep a usable click target", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const sortRule = globalCss.match(/\.table-sort-button\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(sortRule, /min-height:\s*28px\b/);
  assert.match(sortRule, /padding:\s*0\s+6px\b/);
});
test("shared app chrome controls keep usable click targets", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const sidebarTitleRule = globalCss.match(/\.sidebar-section-title\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const footerLinkRule = globalCss.match(/\.app-footer a:not\(\.footer-bmc\),\s*\.footer-link\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const sidebarToggleRule = globalCss.match(/\.sidebar-toggle\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(sidebarTitleRule, /min-height:\s*30px\b/);
  assert.match(footerLinkRule, /min-height:\s*30px\b/);
  assert.match(sidebarToggleRule, /(?:width:\s*30px\b[\s\S]*height:\s*30px\b|height:\s*30px\b[\s\S]*width:\s*30px\b)/);
});
test("public craft table actions keep usable click targets", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const publicCraftCss = readFileSync(new URL("../src/styles/public-craft.css", import.meta.url), "utf8");
  const sortRule = globalCss.match(/\.sort-button\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const mapLinkRule = publicCraftCss.match(/\.map-location-link\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(sortRule, /min-height:\s*28px\b/);
  assert.match(sortRule, /min-width:\s*28px\b/);
  assert.match(sortRule, /padding:\s*0\s+6px\b/);
  assert.match(mapLinkRule, /min-height:\s*28px\b/);
  assert.match(mapLinkRule, /padding:\s*0\s+4px\b/);
});
test("bot dashboard shell styles live in the bot dashboard stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const botCssUrl = new URL("../src/styles/bot-dashboard.css", import.meta.url);
  assert.equal(existsSync(botCssUrl), true);
  const botCss = readFileSync(botCssUrl, "utf8");
  const botShellSelectors = [
    ".bot-control-page",
    ".bot-console",
    ".bot-dashboard",
    ".bot-overview",
    ".bot-layout",
    ".bot-section-nav",
    ".bot-nav-title",
    ".bot-nav-group",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  for (const selector of botShellSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(botCss.includes(selector), true, `${selector} should live in bot-dashboard.css`);
  }
});
test("dashboard page styles live in the dashboard stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const dashboardCssUrl = new URL("../src/styles/dashboard.css", import.meta.url);
  assert.equal(existsSync(dashboardCssUrl), true);
  const dashboardCss = readFileSync(dashboardCssUrl, "utf8");
  const dashboardSelectors = [
    ".dashboard-page",
    ".dashboard-topbar",
    ".dashboard-kpis",
    ".dashboard-metric",
    ".dashboard-main-grid",
    ".dashboard-feed",
    ".dashboard-feed-row",
    ".dashboard-member-list",
    ".dashboard-production-list",
    ".dashboard-alert-list",
    ".dashboard-empty",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/dashboard\.css";/);
  for (const selector of dashboardSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(dashboardCss.includes(selector), true, `${selector} should live in dashboard.css`);
  }
});test("leaderboard page styles live in the leaderboard stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const leaderboardCssUrl = new URL("../src/styles/leaderboard.css", import.meta.url);
  assert.equal(existsSync(leaderboardCssUrl), true);
  const leaderboardCss = readFileSync(leaderboardCssUrl, "utf8");
  const leaderboardSelectors = [
    ".leaderboard-page",
    ".leaderboard-tabs",
    ".leaderboard-summary",
    ".leaderboard-card",
    ".leaderboard-grid",
    ".leaderboard-profession-list",
    ".leaderboard-recent-list",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/leaderboard\.css";/);
  for (const selector of leaderboardSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(leaderboardCss.includes(selector), true, `${selector} should live in leaderboard.css`);
  }
});
test("production page styles live in the production stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const productionCssUrl = new URL("../src/styles/production.css", import.meta.url);
  assert.equal(existsSync(productionCssUrl), true);
  const productionCss = readFileSync(productionCssUrl, "utf8");
  const productionSelectors = [
    ".production-page",
    ".production-topbar",
    ".production-summary",
    ".production-grid",
    ".production-card",
    ".production-member-banner",
    ".production-page .production-member-banner",
    ".settlement-passive-crafts",
    ".private-craft-pill",
    ".production-private-toggle",
    ".production-crafter-line",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/production\.css";/);
  for (const selector of productionSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(productionCss.includes(selector), true, `${selector} should live in production.css`);
  }
});
test("public craft finder page styles live in the public craft stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const publicCraftCssUrl = new URL("../src/styles/public-craft.css", import.meta.url);
  assert.equal(existsSync(publicCraftCssUrl), true);
  const publicCraftCss = readFileSync(publicCraftCssUrl, "utf8");
  const publicCraftSelectors = [
    ".public-craft-page",
    ".public-craft-finder",
    ".public-craft-topbar",
    ".public-craft-summary",
    ".public-craft-command-panel",
    ".public-craft-hint",
    ".map-location-link",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/public-craft\.css";/);
  for (const selector of publicCraftSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(publicCraftCss.includes(selector), true, `${selector} should live in public-craft.css`);
  }
});
test("market page styles live in the market stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const marketCssUrl = new URL("../src/styles/market.css", import.meta.url);
  assert.equal(existsSync(marketCssUrl), true);
  const marketCss = readFileSync(marketCssUrl, "utf8");
  const marketSelectors = [
    ".market-page",
    ".market-topbar",
    ".market-summary",
    ".market-command-panel",
    ".market-filter-panel",
    ".market-tool-row",
    ".market-member-field",
    ".market-tabs",
    ".market-filter-grid",
    ".market-analytics",
    ".market-best-leaderboard",
    ".price-finder",
    ".buy-order-opportunities",
    ".opportunity-strip",
    ".pagination-row",
    ".price-recommendation",
    ".deal-watch-action",
    ".deal-watch-add-card",
    ".deal-watchlist-section",
    ".deal-watch-list",
    ".deal-watch-row",
    ".deal-watch-meta",
    ".deal-watch-actions",
    ".deal-watch-threshold",
    ".deal-watch-empty",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/market\.css";/);
  for (const selector of marketSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(marketCss.includes(selector), true, `${selector} should live in market.css`);
  }
});

test("craft calculator page styles live in the craft calculator stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const craftcalcCssUrl = new URL("../src/styles/craftcalc.css", import.meta.url);
  assert.equal(existsSync(craftcalcCssUrl), true);
  const craftcalcCss = readFileSync(craftcalcCssUrl, "utf8");
  const craftcalcSelectors = [
    ".craftcalc-page",
    ".craftcalc-topbar",
    ".craftcalc-controls",
    ".craftcalc-recipe-picker",
    ".craftcalc-control-grid",
    ".craftcalc-route-list",
    ".craftcalc-route-card",
    ".craftcalc-route-heading",
    ".craftcalc-route-pill",
    ".craftcalc-summary",
    ".craftcalc-section",
    ".craftcalc-material-grid",
    ".craftcalc-material-row",
    ".craftcalc-step-list",
    ".craftcalc-step-card",
    ".craftcalc-warning",
    ".craftcalc-empty",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/craftcalc\.css";/);
  for (const selector of craftcalcSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(craftcalcCss.includes(selector), true, `${selector} should live in craftcalc.css`);
  }
});
test("skills page styles live in the skills stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const skillsCssUrl = new URL("../src/styles/skills.css", import.meta.url);
  assert.equal(existsSync(skillsCssUrl), true);
  const skillsCss = readFileSync(skillsCssUrl, "utf8");
  const skillsSelectors = [
    ".skills-page",
    ".skills-topbar",
    ".skills-summary",
    ".skills-dashboard",
    ".focus-panel",
    ".coverage-panel",
    ".focus-metrics",
    ".focus-tier-strip",
    ".focus-tier-segment",
    ".focus-list",
    ".coverage-list",
    ".adventure-skills-panel",
    ".adventure-skill-grid",
    ".skills-toolbar",
    ".heatmap-wrap",
    ".skill-table",
    ".skill-cell",
    ".tier-legend",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/skills\.css";/);
  for (const selector of skillsSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(skillsCss.includes(selector), true, `${selector} should live in skills.css`);
  }
});test("members page styles live in the members stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const membersCssUrl = new URL("../src/styles/members.css", import.meta.url);
  assert.equal(existsSync(membersCssUrl), true);
  const membersCss = readFileSync(membersCssUrl, "utf8");
  const membersSelectors = [
    ".members-page",
    ".members-topbar",
    ".members-summary-grid",
    ".members-toolbar",
    ".members-roster-table",
    ".member-name-cell",
    ".member-row-avatar",
    ".member-row-copy",
    ".profile-actions",
    ".gear-preset-list",
    ".gear-preset",
    ".public-profile-grid",
    ".profile-history-panel",
    ".profile-section-heading",
    ".passive-craft-list",
    ".passive-craft-card",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/members\.css";/);
  for (const selector of membersSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(membersCss.includes(selector), true, `${selector} should live in members.css`);
  }
});
test("inventory page styles live in the inventory stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const inventoryCssUrl = new URL("../src/styles/inventory.css", import.meta.url);
  assert.equal(existsSync(inventoryCssUrl), true);
  const inventoryCss = readFileSync(inventoryCssUrl, "utf8");
  const inventorySelectors = [
    ".inventory-page",
    ".inventory-topbar",
    ".inventory-summary",
    ".inventory-command-header",
    ".inventory-command-actions",
    ".inventory-filter-grid",
    ".inventory-filter-field",
    ".inventory-inline-toggle",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/inventory\.css";/);
  for (const selector of inventorySelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(inventoryCss.includes(selector), true, `${selector} should live in inventory.css`);
  }
});
test("construction page styles live in the construction stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const constructionCssUrl = new URL("../src/styles/construction.css", import.meta.url);
  assert.equal(existsSync(constructionCssUrl), true);
  const constructionCss = readFileSync(constructionCssUrl, "utf8");
  const constructionSelectors = [
    ".construction-page",
    ".construction-topbar",
    ".construction-summary",
    ".construction-section-heading",
    ".construction-need-card",
    ".construction-controls",
    ".construction-sort-field",
    ".construction-material-list",
    ".construction-material-row",
    ".construction-complete-toggle",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/construction\.css";/);
  for (const selector of constructionSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(constructionCss.includes(selector), true, `${selector} should live in construction.css`);
  }
});
test("research page styles live in the research stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const researchCssUrl = new URL("../src/styles/research.css", import.meta.url);
  assert.equal(existsSync(researchCssUrl), true);
  const researchCss = readFileSync(researchCssUrl, "utf8");
  const researchSelectors = [
    ".research-panel",
    ".research-topbar",
    ".research-summary",
    ".research-unlocks",
    ".research-command-panel",
    ".research-command-header",
    ".research-filter-grid",
    ".research-lanes",
    ".research-card",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/research\.css";/);
  for (const selector of researchSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(researchCss.includes(selector), true, `${selector} should live in research.css`);
  }
});
test("activity page styles live in the activity stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const activityCssUrl = new URL("../src/styles/activity.css", import.meta.url);
  assert.equal(existsSync(activityCssUrl), true);
  const activityCss = readFileSync(activityCssUrl, "utf8");
  const activitySelectors = [
    ".activity-panel",
    ".activity-topbar",
    ".activity-overview",
    ".activity-command-panel",
    ".activity-command-head",
    ".activity-filter-grid",
    ".activity-filters",
    ".activity-options",
    ".activity-timeline",
    ".activity-event",
    ".activity-search-loading",
    ".activity-empty",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/activity\.css";/);
  for (const selector of activitySelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(activityCss.includes(selector), true, `${selector} should live in activity.css`);
  }
});
test("region page styles live in the region stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const regionCssUrl = new URL("../src/styles/region.css", import.meta.url);
  assert.equal(existsSync(regionCssUrl), true);
  const regionCss = readFileSync(regionCssUrl, "utf8");
  const regionSelectors = [
    ".region-panel",
    ".region-topbar",
    ".region-rank-grid",
    ".region-summary-grid",
    ".region-insights",
    ".region-context",
    ".region-leaders-panel",
    ".region-table-panel",
    ".nearby-panel",
    ".mine-row",
    ".mine-text",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/region\.css";/);
  for (const selector of regionSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(regionCss.includes(selector), true, `${selector} should live in region.css`);
  }
});
test("sync page styles live in the sync stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const syncCssUrl = new URL("../src/styles/sync.css", import.meta.url);
  assert.equal(existsSync(syncCssUrl), true);
  const syncCss = readFileSync(syncCssUrl, "utf8");
  const syncSelectors = [
    ".sync-panel",
    ".sync-topbar",
    ".sync-frame",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/sync\.css";/);
  for (const selector of syncSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(syncCss.includes(selector), true, `${selector} should live in sync.css`);
  }
});
test("map page styles live in the map stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const mapCssUrl = new URL("../src/styles/map.css", import.meta.url);
  assert.equal(existsSync(mapCssUrl), true);
  const mapCss = readFileSync(mapCssUrl, "utf8");
  const mapSelectors = [
    ".map-panel.full-height",
    ".map-topbar",
    ".map-frame",
    ".map-focus",
    ".map-workspace",
    ".map-resource-panel",
    ".map-resource-heading",
    ".map-resource-controls",
    ".map-selected-resources",
    ".map-resource-list",
    ".map-resource-icon",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/map\.css";/);
  for (const selector of mapSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(mapCss.includes(selector), true, `${selector} should live in map.css`);
  }
});


test("admin page and loader styles live in the admin stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const adminCssUrl = new URL("../src/styles/admin.css", import.meta.url);
  assert.equal(existsSync(adminCssUrl), true);
  const adminCss = readFileSync(adminCssUrl, "utf8");
  const adminSelectors = [
    ".admin-loading-panel",
    ".admin-session-loader",
    ".admin-loader-orb",
    ".admin-loader-track",
    ".admin-loader-steps",
    ".admin-grid",
    ".admin-login",
    ".admin-console",
    ".admin-page",
    ".admin-tabs",
    ".admin-section",
    ".admin-metrics",
    ".collector-settings-list",
    ".scheduled-job-list",
    ".scheduled-job-row",
    ".database-browser",
    ".database-browser-header",
    ".database-toolbar",
    ".database-export-actions",
    ".admin-users",
    ".audit-list",
    ".backup-list",
    ".maintenance-card",
    ".analytics-admin",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/admin\.css";/);
  for (const selector of adminSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(adminCss.includes(selector), true, `${selector} should live in admin.css`);
  }
});

test("Discord admin and bot section styles live in the Discord admin stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainTsx = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const discordAdminCssUrl = new URL("../src/styles/discord-admin.css", import.meta.url);
  assert.equal(existsSync(discordAdminCssUrl), true);
  const discordAdminCss = readFileSync(discordAdminCssUrl, "utf8");
  const discordAdminSelectors = [
    ".discord-admin",
    ".bot-admin-section",
    ".bot-section-setup",
    ".discord-presence-card",
    ".discord-rule-grid",
    ".discord-channel-card",
    ".craft-channel-grid",
    ".colour-role-grid",
    ".discord-panel-grid",
    ".role-option-list",
    ".discord-tool-actions",
    ".moderation-grid",
    ".discord-audit-report",
    ".discord-report",
    ".discord-test-grid",
    ".role-manager-layout",
    ".discord-terminal",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  assert.match(mainTsx, /import "\.\/styles\/discord-admin\.css";/);
  for (const selector of discordAdminSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(discordAdminCss.includes(selector), true, `${selector} should live in discord-admin.css`);
  }
});

