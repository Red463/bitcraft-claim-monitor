import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionPage = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");

test("Craft Monitor empty state does not claim Relay contributor mapping is unavailable", () => {
  assert.doesNotMatch(productionPage, /Contributor mapping is not yet available from the Relay/i);
  assert.match(productionPage, /No contributor activity/i);
});
