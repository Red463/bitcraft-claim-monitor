import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("active region helpers live outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const activeRegionsUrl = new URL("../src/hooks/useActiveRegions.ts", import.meta.url);

  assert.equal(existsSync(activeRegionsUrl), true);
  assert.equal(marketPage.includes('import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";'), true);
  assert.doesNotMatch(mainPages, /type\s+ActiveRegion\s*=/);
  assert.doesNotMatch(mainPages, /function\s+activeRegionLabel\s*\(/);
  assert.doesNotMatch(mainPages, /function\s+useActiveRegions\s*\(/);
});
