import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Craft planning item details use a fixed viewport modal", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const match = css.match(/\.craft-plan-need-detail-backdrop\s*\{([^}]+)\}/);
  assert.ok(match, "detail backdrop CSS should exist");
  assert.match(match[1], /position:\s*fixed/);
  assert.match(match[1], /inset:\s*0/);
  assert.match(match[1], /display:\s*flex/);
});

test("Craft planning needs board cells avoid item icons", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const cellBody = page.match(/function needCellNode[\s\S]+?function cellSources/)?.[0] ?? "";
  assert.doesNotMatch(cellBody, /ItemIcon/);
  assert.doesNotMatch(cellBody, /craft-plan-need-icon/);
});
