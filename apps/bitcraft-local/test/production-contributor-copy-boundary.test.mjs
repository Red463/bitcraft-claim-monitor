import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionPage = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");

test("Craft Monitor uses operational contributor copy while retaining attribution evidence", () => {
  assert.match(productionPage, /No contribution activity recorded\./);
  assert.match(productionPage, /Matched action/);
  assert.match(productionPage, /Craft owner/);

  for (const technicalCopy of [
    /Contributor activity is observed/i,
    /No contributor activity has been observed/i,
    /tracking became available/i,
    /joined to its member and structure by the Relay/i,
    /Current Relay snapshot/i,
    /provider's member-scoped craft data/i,
    /public-crafts marker/i,
  ]) {
    assert.doesNotMatch(productionPage, technicalCopy);
  }
});
