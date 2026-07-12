import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/SkillsPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/skills.css", import.meta.url), "utf8");

test("Profession insights default closed while keeping controls and glance metrics visible", () => {
  assert.match(page, /useState\(false\)/);
  assert.match(page, /className="profession-insights"/);
  assert.match(page, /aria-expanded=\{insightsOpen\}/);
  assert.match(page, /Profession insights/);
  assert.match(page, /className="profession-insights-select"[\s\S]*select-control/);
  assert.match(page, /Average level/);
  assert.match(page, /Best tier/);
  assert.match(page, /T5\+/);
});

test("Expanded Profession insights preserve focus and coverage detail", () => {
  assert.match(page, /insightsOpen\s*\?\s*<div className="skills-dashboard profession-insights-content"/);
  assert.match(page, /focus-metrics/);
  assert.match(page, /focus-tier-strip/);
  assert.match(page, /focusRows\.map/);
  assert.match(page, /coverage\.slice\(0, 8\)\.map/);
  assert.match(page, /onClick=\{\(\) => setFocusSkill\(skill\.id\)\}/);
});

test("Profession summary and expanded insights use compact responsive boundaries", () => {
  assert.match(css, /\.skills-page \.mini-stat\s*\{[^}]*min-height:\s*76px/);
  assert.match(css, /\.profession-insights-content\s*\{[^}]*grid-template-columns:\s*minmax\(360px, \.95fr\) minmax\(440px, 1\.05fr\)/);
  assert.match(css, /@media \(max-width: 1250px\)[\s\S]*\.profession-insights-content\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.focus-tier-strip/);
});
