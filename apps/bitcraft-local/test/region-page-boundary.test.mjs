import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Region page defaults rankings to weighted settlement score", () => {
  const page = readFileSync(new URL("../src/pages/RegionPage.tsx", import.meta.url), "utf8");

  assert.match(page, /usePersistedState\("region\.sort\.v2", "score"\)/);
  assert.match(page, /\["Score", "score"/);
  assert.match(page, /\["Supplies", "supplies"/);
  assert.match(page, /90% tier, 7% treasury, 3% tiles/);
  assert.match(page, /Supplies remain visible in the table but do not affect ranking/);
  assert.match(page, /title=\{key === "score" \? scoreFormulaTitle : undefined\}/);
  assert.match(page, /<strong title=\{scoreFormulaTitle\}>/);
});
