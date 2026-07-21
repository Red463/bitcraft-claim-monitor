import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Craft planning item details use a fixed viewport modal", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const match = css.match(/\.craft-plan-need-detail-backdrop\s*\{([^}]+)\}/);
  assert.ok(match, "detail backdrop CSS should exist");
  assert.match(match[1], /position:\s*fixed/);
  assert.match(match[1], /inset:\s*0/);
  assert.match(match[1], /display:\s*grid/);
  assert.match(match[1], /place-items:\s*center/);
  assert.match(match[1], /overscroll-behavior:\s*contain/);

  const modalMatch = css.match(/\.craft-plan-need-detail\s*\{([^}]+)\}/);
  assert.ok(modalMatch, "detail modal CSS should exist");
  assert.match(modalMatch[1], /max-height:\s*calc\(100vh - 36px\)/);
  assert.match(modalMatch[1], /overflow:\s*hidden/);

  const headerMatch = css.match(/\.craft-plan-need-detail \.modal-header\s*\{([^}]+)\}/);
  assert.ok(headerMatch, "detail modal header CSS should exist");
  assert.match(headerMatch[1], /position:\s*relative/);
  assert.match(headerMatch[1], /padding:\s*16px 58px 16px 18px/);

  const closeMatch = css.match(/\.craft-plan-need-detail \.modal-header \.icon-button\s*\{([^}]+)\}/);
  assert.ok(closeMatch, "detail modal close-button CSS should exist");
  assert.match(closeMatch[1], /position:\s*absolute/);
  assert.match(closeMatch[1], /top:\s*16px/);
  assert.match(closeMatch[1], /right:\s*18px/);
});

test("Craft planning needs board cells avoid item icons", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const cellBody = page.match(/function needCellNode[\s\S]+?function summaryStat/)?.[0] ?? "";
  assert.doesNotMatch(cellBody, /ItemIcon/);
  assert.doesNotMatch(cellBody, /craft-plan-need-icon/);
});

test("Craft Planning estimate indicators share a compact non-overlapping row", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(css, /\.craft-plan-cell-indicators\s*\{[^}]*display:\s*flex[^}]*gap:/s);
  assert.match(css, /\.craft-plan-need-cell\.has-indicators\s*\{[^}]*padding-top:/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-guaranteed\s*\{[^}]*#65b7fa/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-estimated[^}]*var\(--muted\)/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-approximate[^}]*var\(--muted\)/s);
  assert.doesNotMatch(css, /\.craft-plan-estimated-marker/);
});

test("Craft planning needs board uses one continuous compact matrix with status states", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  assert.match(css, /\.craft-plan-needs-matrix\s*\{/);
  assert.match(page, /<colgroup>/);
  assert.match(page, /craft-plan-needs-row-column/);
  assert.match(page, /craft-plan-needs-data-column/);
  assert.match(css, /\.craft-plan-needs-row-column\s*\{[^}]*width:\s*250px/);
  assert.match(css, /\.craft-plan-needs-data-column\s*\{[^}]*width:\s*78px/);
  assert.match(css, /\.craft-plan-needs-section-row\s+th/);
  assert.match(page, /is-shortage/);
  assert.match(css, /\.craft-plan-need-cell\.is-shortage/);
  assert.match(css, /\.craft-plan-need-cell\.is-blocked/);
  assert.match(css, /\.craft-plan-need-cell\.has-active/);
  assert.match(page, /selectCraftPlanningEffortView/);
  assert.match(page, /Effort complete/);
  assert.match(page, /Confirmed stock and guaranteed active crafts/);
  assert.match(page, /Effort progress unavailable/);
  assert.doesNotMatch(page, /needsBoardCompletion/);
  assert.match(css, /span\.is-critical/);
  assert.match(css, /span\.is-complete/);
  assert.match(css, /span\.is-unavailable/);
  assert.match(css, /\.craft-plan-needs-legend/);
  assert.match(css, /\.craft-plan-needs-legend \.covered \{ color: var\(--good\); \}/);
  assert.match(css, /\.craft-plan-needs-legend \.short \{ color: var\(--gold\); \}/);
});
test("Craft planning section override dialog has a structured viewport modal header", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const headerMatch = css.match(/\.craft-plan-section-override \.modal-header\s*\{([^}]+)\}/);
  assert.ok(headerMatch, "section override header CSS should exist");
  assert.match(headerMatch[1], /position:\s*relative/);
  assert.match(headerMatch[1], /display:\s*grid/);
  assert.match(headerMatch[1], /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(headerMatch[1], /gap:\s*14px/);
  assert.match(headerMatch[1], /padding:\s*18px 54px 12px 18px/);

  const closeMatch = css.match(/\.craft-plan-section-override \.modal-header \.icon-button\s*\{([^}]+)\}/);
  assert.ok(closeMatch, "section override close-button CSS should exist");
  assert.match(closeMatch[1], /position:\s*absolute/);
  assert.match(closeMatch[1], /top:\s*14px/);
  assert.match(closeMatch[1], /right:\s*14px/);

  const bodyMatch = css.match(/\.craft-plan-section-override-body\s*\{([^}]+)\}/);
  assert.ok(bodyMatch, "section override body CSS should exist");
  assert.match(bodyMatch[1], /padding:\s*18px 20px 20px/);
});
test("Craft planning item details style grouped stock and usage drilldowns", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  assert.match(css, /\.craft-plan-need-detail-side\s*\{/);
  assert.match(css, /\.craft-plan-detail-group summary\s*\{/);
  assert.match(css, /\.craft-plan-detail-breakdown\s*\{/);
  assert.match(css, /\.craft-plan-detail-row\.subtle\s*\{/);
  assert.match(css, /\.craft-plan-usage-breakdown summary\s*\{/);
});

test("Craft planning detail cards wrap rows without horizontal scrolling", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const card = css.match(/\.craft-plan-need-detail-grid \.nested-card\s*\{([^}]+)\}/)?.[1] ?? "";
  const row = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row\s*\{([^}]+)\}/)?.[1] ?? "";
  const label = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row > span\s*\{([^}]+)\}/)?.[1] ?? "";
  const value = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row > strong\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(card, /overflow-x:\s*hidden/);
  assert.match(card, /overflow-y:\s*auto/);
  assert.match(row, /min-width:\s*0/);
  assert.match(row, /align-items:\s*flex-start/);
  assert.match(label, /flex:\s*1 1 auto/);
  assert.match(label, /overflow:\s*visible/);
  assert.match(label, /text-overflow:\s*clip/);
  assert.match(label, /white-space:\s*normal/);
  assert.match(label, /overflow-wrap:\s*anywhere/);
  assert.match(value, /flex:\s*0 0 auto/);
});

test("Craft planning target editor keeps search and row actions visually grouped", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");

  assert.match(page, /craft-plan-target-search/);
  assert.match(page, /craft-plan-target-editor-actions/);
  assert.match(css, /\.craft-plan-target-search\s*\{[^}]*width:\s*min\(520px, 100%\)/);
  assert.match(css, /\.craft-plan-target-editor-row\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.craft-plan-target-search \.search:focus-within\s*\{/);
  assert.match(css, /\.craft-plan-target-search \.search input:focus\s*,\s*\.craft-plan-target-search \.search input:focus-visible\s*\{[^}]*box-shadow:\s*none/);
  assert.match(css, /\.craft-plan-target-editor-actions\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.craft-plan-target-editor-actions \.compact-field\s*\{[^}]*width:\s*120px/);
  assert.match(css, /\.craft-plan-target-editor-actions \.compact-field input\s*\{[^}]*min-width:\s*0/);
});

test("Craft Planning audit history uses a compact responsive timeline", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(css, /\.craft-plan-audit-list\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.craft-plan-audit-entry\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.craft-plan-audit-change\.is-enabled/);
  assert.match(css, /\.craft-plan-audit-change\.is-disabled/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.craft-plan-audit-entry\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test("Craft planning needs board row headings are allowed to wrap", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const rowHeader = css.match(/\.craft-plan-needs-table tbody th\s*\{([^}]+)\}/)?.[1] ?? "";
  const rowButton = css.match(/\.craft-plan-row-section-button\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(rowHeader, /white-space:\s*normal/);
  assert.match(rowHeader, /overflow:\s*visible/);
  assert.match(rowHeader, /overflow-wrap:\s*anywhere/);
  assert.match(rowButton, /white-space:\s*normal/);
  assert.match(rowButton, /overflow:\s*visible/);
  assert.match(rowButton, /overflow-wrap:\s*anywhere/);
});

test("Craft planning targets default collapsed and expose an accessible persisted disclosure", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /ChevronDown/);
  assert.match(page, /usePersistedState<boolean>\("planning\.targetsCollapsed", true\)/);
  assert.match(page, /const targetsAreCollapsed = targetsCollapsed !== false/);
  assert.match(page, /className="craft-plan-targets-toggle"/);
  assert.match(page, /aria-expanded=\{!targetsAreCollapsed\}/);
  assert.match(page, /aria-controls="craft-plan-target-list"/);
  assert.match(page, /id="craft-plan-target-list"/);
  assert.match(page, /hidden=\{targetsAreCollapsed\}/);
  assert.match(css, /\.craft-plan-target-list\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.craft-plan-targets-toggle:focus-visible\s*\{/);
  assert.match(css, /\.craft-plan-targets-toggle\[aria-expanded="true"\][^{]*\.craft-plan-targets-chevron\s*\{/);
});

test("Craft planning targets use safe container-responsive columns", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const listRule = css.match(/\.craft-plan-target-list\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(css, /\.craft-plan-targets-strip\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(listRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(listRule, /minmax\(300px/);
  assert.match(css, /@container\s*\(max-width:\s*1140px\)\s*\{[\s\S]*?\.craft-plan-target-list\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test("Craft planning chance controls and compact targets retain responsive boundaries", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  assert.match(page, /Safety buffer \(% extra\)/);
  assert.match(page, /saveMultiplier/);
  assert.match(page, /Counted stock exists, but source details are unavailable/);
  assert.match(page, /craft-plan-target-progress/);
  assert.match(css, /\.craft-plan-need-cell\.has-indicators\s*\{[^}]*padding-top:\s*16px/);
  assert.match(css, /\.craft-plan-target-progress\s*\{/);
  assert.match(css, /\.craft-plan-target-status\s*\{/);
  assert.match(css, /\.craft-plan-manager-pending\s*\{/);
  assert.match(css, /\.craft-plan-need-cell\.is-blocked\s*\{[^}]*rgba\(239, 100, 97/);
  assert.match(css, /\.craft-plan-needs-legend \.blocked\s*\{[^}]*#ef6461/);
});

test("Needs Board shortage states use fill without persistent borders", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.craft-plan-need-cell\.is-shortage::before/);
  assert.doesNotMatch(css, /\.craft-plan-need-cell\.is-blocked::before/);
  assert.match(css, /\.craft-plan-need-cell\.is-blocked:hover[\s\S]*background:\s*rgba\(239, 100, 97/);
  assert.match(css, /\.craft-plan-overall-progress\s*\{/);
});

test("Craft planning loading and active craft states communicate ongoing work", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /craft-plan-loading/);
  assert.match(page, /craft-plan-loading-skeleton/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-busy="true"/);
  assert.match(css, /@keyframes craft-plan-active-pulse/);
  assert.match(css, /\.craft-plan-need-cell\.has-active::before/);
  assert.match(css, /\.craft-plan-need-cell\.has-active::before\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.craft-plan-need-cell\.has-active::before[\s\S]*animation:\s*none/);
});

test("How to get this separates route headings and producer buffer controls", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /craft-plan-route-heading/);
  assert.match(page, /craft-plan-buffer-settings/);
  assert.match(page, /Recipe completions/);
  assert.match(page, /full nodes/);
  assert.match(page, /extraction progress/);
  assert.match(page, /node exhaustion is unknown/i);
  assert.match(page, /total station actions/i);
  assert.match(page, /Craft inputs/);
  assert.match(page, /Gather\/process/);
  assert.match(page, /does not increase the .* goal/);
  assert.match(css, /\.craft-plan-route-heading\s*\{/);
  assert.match(css, /\.craft-plan-route-kind\.is-craft\s*\{/);
  assert.match(css, /\.craft-plan-route-kind\.is-gathering\s*\{/);
  assert.match(css, /\.craft-plan-buffer-settings\s*\{/);
  assert.match(css, /\.craft-plan-route-options\s*\{/);
  assert.match(css, /\.craft-plan-calculation\s*\{/);
  assert.doesNotMatch(css, /\.craft-plan-gathered-control\s*\{/);
  assert.doesNotMatch(css, /\.craft-plan-gathered-state\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.craft-plan-buffer-control/);
});

test("Craft planning route cards and calculations wrap without horizontal scrolling", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(css, /\.craft-plan-route-options\s*\{[^}]*display:\s*grid[^}]*min-width:\s*0/s);
  assert.match(css, /\.craft-plan-route-option\s*\{[^}]*display:\s*grid[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.craft-plan-route-option\.is-selected\s*\{/);
  assert.match(css, /\.craft-plan-route-option\.is-pending\s*\{/);
  assert.match(css, /\.craft-plan-route-option:has\(input:focus-visible\)\s*\{/);
  assert.match(css, /\.craft-plan-route-option strong,[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(css, /\.craft-plan-calculation-body\s*\{[^}]*display:\s*grid[^}]*min-width:\s*0/s);
});

test("Overall Needs Board progress sits on the left and shares section completion tones", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /craft-plan-needs-heading-content[\s\S]*craft-plan-overall-progress/);
  assert.match(css, /\.craft-plan-needs-heading-content\s*\{/);
  for (const tone of ["critical", "low", "mid", "high", "complete"]) {
    assert.match(css, new RegExp(`\\.craft-plan-overall-progress\\.is-${tone}[^}]*strong`));
    assert.match(css, new RegExp(`\\.craft-plan-overall-progress\\.is-${tone}[^}]*i`));
  }
});

test("Needs Board header keeps progress and filters in compact aligned rows", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const searchIndex = page.indexOf("craft-plan-needs-search");
  const shortagesIndex = page.indexOf("craft-plan-list-only");
  const allFilterIndex = page.indexOf(">All <span>{needsBoardRowCount}</span>");

  assert.ok(searchIndex < shortagesIndex && shortagesIndex < allFilterIndex);
  assert.match(css, /\.craft-plan-needs-heading-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.craft-plan-overall-progress\s*\{[^}]*justify-self:\s*end/);
  assert.doesNotMatch(css, /\.craft-plan-list-only\s*\{[^}]*margin-left:\s*auto/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.craft-plan-needs-heading-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});
