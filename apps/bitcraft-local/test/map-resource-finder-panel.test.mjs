import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resource finder presents search, compact filters, tracked chips, rows, and a bounded footer", async () => {
  const source = await readFile(new URL("../src/pages/map/MapResourceFinderPanel.tsx", import.meta.url), "utf8");

  assert.ok(source.indexOf('className="map-resource-finder-search"') < source.indexOf('className="map-resource-filters"'));
  assert.match(source, /selectedTokens\.map/);
  assert.match(source, /aria-label=\{`Stop tracking/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /iconAssetName:\s*resource\.iconAssetName/);
  assert.match(source, /<ItemIcon item=\{resourceIcon\} \/>/);
  assert.match(source, /<TierBadge tier=\{resource\.tier\} \/>/);
  assert.match(source, /Showing \{resources\.length\} of \{visibleCount\}/);
  assert.match(source, />Show more</);
  assert.match(source, /map-resource-list-footer/);
});

test("resource finder keeps typed resource identities through every action", async () => {
  const source = await readFile(new URL("../src/pages/map/MapResourceFinderPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /const token = mapResourceToken\(resource\)/);
  assert.match(source, /onToggle\(token\)/);
  assert.match(source, /onRemove\(token\)/);
  assert.doesNotMatch(source, /Number\(token\)|parseInt\(token/);
});

test("resource finder leaves region scope to the map toolbar", async () => {
  const source = await readFile(new URL("../src/pages/map/MapResourceFinderPanel.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /regionValue|regionOptions|onRegionChange|>Region/);
});

test("tracked resource pills reuse their final native marker colours", async () => {
  const panel = await readFile(new URL("../src/pages/map/MapResourceFinderPanel.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/map.css", import.meta.url), "utf8");

  assert.match(panel, /resourceColours: Readonly<Record<string, string>>/);
  assert.match(panel, /token\.startsWith\("resource:"\)/);
  assert.match(panel, /resourceColours\[resourceId\]/);
  assert.match(panel, /--map-resource-chip-colour/);
  assert.doesNotMatch(panel, /Number\(resourceId\)|parseInt\(resourceId/);
  assert.match(css, /\.map-selected-resources button\.has-marker-colour/);
  assert.match(css, /color-mix\(in srgb, var\(--map-resource-chip-colour, #f0c64f\)/);
});
