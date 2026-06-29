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
test("leaderboard page styles live in the leaderboard stylesheet", () => {
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
    ".settlement-passive-crafts",
    ".private-craft-pill",
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
