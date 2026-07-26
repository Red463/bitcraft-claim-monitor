import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? sourceFiles(url) : entry.name.endsWith(".tsx") ? [url] : [];
  });
}

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
  assert.match(source, /sortable\?: boolean/);
  assert.match(source, /rowOffset\?: number/);
  assert.match(source, /rowLimit\?: number/);
  assert.match(source, /sortable = true/);
  assert.match(source, /windowIndexedRows\(sortedRows,\s*rowOffset,\s*rowLimit\)/);
});

test("every data table and custom horizontal table scroller has a durable keyboard label", () => {
  const dataTable = readSource("../src/components/main/DataTable.tsx");
  assert.match(dataTable, /scrollLabel:\s*string/);
  assert.doesNotMatch(dataTable, /scrollLabel\?:\s*string/);
  assert.match(dataTable, /className="table-wrap"\s+tabIndex=\{0\}\s+aria-label=\{scrollLabel\}/);

  const unlabeledCallers = sourceFiles(new URL("../src/", import.meta.url)).flatMap((url) => {
    const source = readFileSync(url, "utf8");
    return source.split("<DataTable").slice(1).flatMap((segment, index) => segment.includes("scrollLabel=") ? [] : [`${url.pathname}#${index + 1}`]);
  });
  assert.deepEqual(unlabeledCallers, []);

  for (const [path, className, label] of [
    ["../src/pages/PublicCraftFinderPage.tsx", "table-wrap", "Public craft jobs table"],
    ["../src/pages/RegionPage.tsx", "table-wrap", "Regional rankings table"],
    ["../src/pages/market/BuyOrderFinder.tsx", "table-wrap", "Current buy orders table"],
    ["../src/pages/SkillsPage.tsx", "heatmap-wrap", "Profession skill levels table"],
    ["../src/pages/SkillsPage.tsx", "heatmap-wrap", "Adventure skill levels table"],
    ["../src/pages/CraftPlanningPage.tsx", "craft-plan-needs-scroll", "Craft plan needs board"],
  ]) {
    const source = readSource(path);
    assert.match(source, new RegExp(`<div className="${className}" tabIndex=\\{0\\} aria-label="${label}"`));
  }
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
