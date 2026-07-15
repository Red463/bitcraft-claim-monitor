import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("SearchBox requires a durable caller supplied label", () => {
  const source = readSource("../src/components/main/SearchBox.tsx");

  assert.match(source, /label:\s*string/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /resultsId\?:\s*string/);
});

test("Segmented uses named buttons with pressed state", () => {
  const source = readSource("../src/components/main/Segmented.tsx");

  assert.match(source, /type SegmentedOption/);
  assert.match(source, /label:\s*string/);
  assert.match(source, /role="group"/);
  assert.match(source, /aria-pressed=\{value === option\.id\}/);
  assert.match(source, /onChange\(option\.id\)/);
});

test("DataTable owns sort state on headers and accepts caller empty content", () => {
  const source = readSource("../src/components/main/DataTable.tsx");

  assert.match(source, /<th[^>]*aria-sort=/s);
  assert.match(source, /aria-label=\{`Sort by \$\{label\}`\}/);
  assert.match(source, /emptyState:\s*React\.ReactNode/);
  assert.match(source, /\{emptyState\}/);
  assert.doesNotMatch(source, /No data returned\./);
  assert.doesNotMatch(source, /<button[^>]*aria-sort=/s);
});

for (const [name, relativePath] of [
  ["Craft Calculator", "../src/pages/CraftCalculatorPage.tsx"],
  ["Price Finder", "../src/pages/market/PriceFinder.tsx"],
  ["Craft Plan Manager", "../src/pages/CraftPlanManagerDialog.tsx"],
]) {
  test(`${name} autocomplete exposes complete keyboard combobox semantics`, () => {
    const source = readSource(relativePath);

    assert.match(source, /role="combobox"/);
    assert.match(source, /aria-autocomplete="list"/);
    assert.match(source, /aria-expanded=/);
    assert.match(source, /aria-controls=/);
    assert.match(source, /aria-activedescendant=/);
    assert.match(source, /role="listbox"/);
    assert.match(source, /role="option"/);
    assert.match(source, /ArrowDown/);
    assert.match(source, /ArrowUp/);
    assert.match(source, /Escape/);
    assert.match(source, /Enter/);
    assert.match(source, /aria-live="polite"/);
  });
}
