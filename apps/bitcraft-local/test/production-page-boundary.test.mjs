import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("Production page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const productionPage = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(mainPages, /export function Production\b/);
  assert.doesNotMatch(mainPages, /export function MemberPassiveCrafts\b/);
  assert.match(productionPage, /export function Production\b/);
  assert.match(productionPage, /export function MemberPassiveCrafts\b/);
  assert.match(appShell, /from "\.\/pages\/ProductionPage"/);
  assert.doesNotMatch(appShell, /import \{ Market, Production \} from "\.\/pages\/MainPages"/);
});
test("Production contributors render as a wrapping grid", () => {
  const productionPage = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");
  const productionCss = readFileSync(new URL("../src/styles/production.css", import.meta.url), "utf8");

  assert.doesNotMatch(productionPage, /contributors\.slice\(0,\s*3\)/);
  assert.match(productionPage, /contributors\.map\(\(person\) =>/);
  assert.match(productionCss, /\.production-page \.contributors \{/);
  assert.match(productionCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(productionCss, /\.production-page \.contributors span strong \.tracked-owner-name \{/);
  assert.match(productionCss, /\.production-page \.contributors span strong \.tracked-owner-name svg \{/);
  assert.match(productionCss, /@media \(max-width: 1250px\)[\s\S]*\.production-page \.contributors \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});