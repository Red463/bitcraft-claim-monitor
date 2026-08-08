import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/ResearchPage.tsx", import.meta.url), "utf8");

test("Research renders exactly the Completed Technology and Available Research lanes", () => {
  assert.equal((page.match(/<section><h3>/g) ?? []).length, 2);
  assert.match(page, /Completed Technology/);
  assert.match(page, /Available Research/);
  assert.doesNotMatch(page, /Current Research|Locked Technology|No active research/);
  assert.match(page, />Locked</);
  assert.match(page, /prerequisite/);
});
