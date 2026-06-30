import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("watchtower dialog stays viewport bounded and renders all empire members", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(page, /const members:[\s\S]*tower\.members/);
  assert.match(page, /setSelectedTower\(\{ \.\.\.row, members:/);
  assert.doesNotMatch(page, /No storage or hexite-capable members were returned/);
  assert.match(css, /\.empires-page \.help-overlay \{/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /align-items:\s*center/);
  assert.match(css, /max-height:\s*calc\(100vh - 40px\)/);
});