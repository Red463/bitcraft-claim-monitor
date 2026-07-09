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
});

test("Craft planning needs board cells avoid item icons", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const cellBody = page.match(/function needCellNode[\s\S]+?function recipeOptionLabel/)?.[0] ?? "";
  assert.doesNotMatch(cellBody, /ItemIcon/);
  assert.doesNotMatch(cellBody, /craft-plan-need-icon/);
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