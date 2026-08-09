import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chrome = readFileSync(new URL("../src/components/main/AppChrome.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
const publicCrafts = readFileSync(new URL("../src/pages/PublicCraftFinderPage.tsx", import.meta.url), "utf8");

test("non-blocking provider warnings live beside Last Refresh instead of above page content", () => {
  assert.match(chrome, /refresh-warning/);
  assert.match(chrome, /Technical warning details/);
  assert.match(chrome, /event\.key === "Escape"/);
  assert.match(chrome, /contains\(event\.target as Node\)/);
  assert.match(chrome, /aria-expanded=\{warningOpen\}/);
  assert.match(chrome, /onClick=\{\(\) => setWarningOpen\(true\)\}/);
  assert.match(shell, /<RefreshStatus[\s\S]*warnings=\{apiWarnings\}/);
  assert.doesNotMatch(shell, /<ApiStatusBanner/);
});

test("Public Craft Finder does not duplicate retained-data refresh errors", () => {
  assert.doesNotMatch(publicCrafts, /providerError \? <AsyncState/);
  assert.match(publicCrafts, /`Player \$\{ownerEntityId\}`/);
  assert.match(publicCrafts, /owner: publicCraftOwnerName/);
});
