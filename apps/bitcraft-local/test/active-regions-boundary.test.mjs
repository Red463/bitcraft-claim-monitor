import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("active region helpers live outside the legacy MainPages bundle", () => {
  const mainPages = readFileSync(new URL("../src/pages/MainPages.tsx", import.meta.url), "utf8");
  const activeRegionsUrl = new URL("../src/hooks/useActiveRegions.ts", import.meta.url);

  assert.equal(existsSync(activeRegionsUrl), true);
  assert.match(
    mainPages,
    /import\s+\{\s*activeRegionLabel,\s*useActiveRegions\s*\}\s+from\s+"..\/hooks\/useActiveRegions";/,
  );
  assert.doesNotMatch(mainPages, /type\s+ActiveRegion\s*=/);
  assert.doesNotMatch(mainPages, /function\s+activeRegionLabel\s*\(/);
  assert.doesNotMatch(mainPages, /function\s+useActiveRegions\s*\(/);
});
