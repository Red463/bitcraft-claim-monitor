import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("shell-owned page headers keep route headings accessible without repeating the visible title", () => {
  const app = read("../src/styles.css");
  const header = read("../src/components/main/PageHeader.tsx");

  assert.match(header, /className="page-header-copy route-title-copy"/);
  assert.match(app, /\.route-title-copy\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;[^}]*clip-path:\s*inset\(50%\)/s);
  assert.match(app, /\.page-header:has\(\.page-header-aside\)\s*\{[^}]*border-bottom:\s*1px solid var\(--line-subtle\)/s);
  assert.match(app, /\.page-header:not\(:has\(\.page-header-aside\)\)\s*\{[^}]*display:\s*contents/s);
});

test("legacy conventional pages use the same shell-owned route-title contract", () => {
  for (const path of [
    "../src/pages/MarketPage.tsx",
    "../src/pages/SettlementMarketPage.tsx",
    "../src/pages/LeaderboardPage.tsx",
    "../src/pages/ActivityPage.tsx",
    "../src/pages/RegionPage.tsx",
    "../src/pages/CraftCalculatorPage.tsx",
    "../src/pages/PublicCraftFinderPage.tsx",
    "../src/pages/SyncPage.tsx",
    "../src/pages/CraftPlanningPage.tsx",
    "../src/pages/EmpiresPage.tsx",
  ]) {
    assert.match(read(path), /className="route-title-copy"/, path);
  }
});

test("settlement market hides only route title copy and leaves ranking controls interactive", () => {
  const page = read("../src/pages/SettlementMarketPage.tsx");
  assert.match(page, /<header className="members-topbar market-topbar">\s*<div className="route-title-copy">\s*<h2>/s);
  assert.doesNotMatch(page, /market-best-toolbar[\s\S]{0,180}className="route-title-copy"/s);
});

test("shared header metadata groups keep their spacing without dashboard route CSS", () => {
  const app = read("../src/styles.css");
  const dashboard = read("../src/styles/dashboard.css");

  assert.match(app, /\.dashboard-meta-cluster\s*\{[^}]*padding-right:\s*24px;[^}]*display:\s*grid;[^}]*gap:\s*8px;/s);
  assert.match(app, /\.dashboard-settlement-pill\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*12px;/s);
  assert.match(app, /\.dashboard-settlement-pill \.tier-badge\s*\{[^}]*min-width:\s*33px;/s);
  assert.match(app, /\.dashboard-region-line,\s*\.dashboard-refresh-line\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*8px;/s);
  assert.match(app, /\.dashboard-claim-link\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*12px;/s);
  assert.doesNotMatch(dashboard, /^\.dashboard-meta-cluster\s*\{/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-settlement-pill\s*\{/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-region-line/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-claim-link/m);
});

test("distinct primary page headers follow the same spacing rhythm", () => {
  const dashboard = read("../src/styles/dashboard.css");
  const skills = read("../src/styles/skills.css");
  const craft = read("../src/styles/craft-planning.css");
  const empires = read("../src/styles/empires.css");

  assert.match(dashboard, /\.dashboard-topbar\s*\{[^}]*gap:\s*16px;/s);
  assert.match(dashboard, /\.dashboard-topbar p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(skills, /\.skills-topbar\s*\{[^}]*gap:\s*16px;/s);
  assert.match(skills, /\.skills-topbar p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(craft, /\.craft-plan-page-header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*gap:\s*16px;/s);
  assert.match(craft, /\.craft-plan-page-header p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(craft, /@media \(max-width:\s*760px\)[\s\S]*\.craft-plan-page-header\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(empires, /\.page-title-row\s*\{[^}]*gap:\s*16px;[^}]*margin-bottom:\s*24px;/s);
});
