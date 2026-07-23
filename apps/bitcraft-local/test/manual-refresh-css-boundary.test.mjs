import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("manual refresh icon rotates only while refreshing", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /@keyframes\s+floating-refresh-spin\s*\{[\s\S]*rotate\(360deg\)[\s\S]*\}/);
  assert.match(css, /\.floating-action-item\.is-refreshing\s+svg\s*\{[^}]*animation:\s*floating-refresh-spin[^}]*\}/s);
  assert.match(css, /\.floating-action-item\.is-refreshing\s*\{[^}]*color:\s*var\(--active-color\)/s);
});

test("manual refresh motion is removed for reduced-motion users", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.floating-action-item\.is-refreshing\s+svg\s*\{[^}]*animation:\s*none\s*!important/s);
});

test("manual refresh cooldown is visible without relying on colour alone", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /\.floating-actions \.floating-action-item\.is-cooldown[\s\S]*?\{[^}]*border-color:[^}]*background:[^}]*opacity:\s*1/s);
  assert.match(css, /\.refresh-cooldown-countdown\s*\{[^}]*min-width:[^}]*font:/s);
});
