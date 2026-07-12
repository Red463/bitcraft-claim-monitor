import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/SkillsPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/skills.css", import.meta.url), "utf8");

test("Settlement capability uses live tier readiness without fixed thresholds", () => {
  assert.match(page, /useState\(false\)/);
  assert.match(page, /Settlement Capability/);
  assert.match(page, /data\.claim\.tier/);
  assert.match(page, /buildProfessionCapability/);
  assert.match(page, /Settlement needs/);
  assert.match(page, /Dependency risk/);
  assert.doesNotMatch(page, /T3\+|T5\+/);
  assert.doesNotMatch(page, /Top Professional|Highest Profession/);
});

test("Capability dashboard keeps controls and expandable member detail", () => {
  assert.match(page, /capability-grid/);
  assert.match(page, /aria-expanded=\{insightsOpen\}/);
  assert.match(page, /className="profession-insights-select"[\s\S]*select-control/);
  assert.match(page, /insightsOpen\s*\?\s*<div className="skills-dashboard profession-insights-content"/);
  assert.match(page, /focus-metrics/);
  assert.match(page, /focus-tier-strip/);
  assert.match(page, /focusRows\.map/);
  assert.match(page, /Capability Detail/);
  assert.match(page, /Why this profession is/);
  assert.match(page, /Adventure Skills|Skills/);
  assert.match(page, /className="skill-table"/);
});

test("Profession summary and expanded insights use compact responsive boundaries", () => {
  assert.match(css, /\.skills-page \.mini-stat\s*\{[^}]*min-height:\s*76px/);
  assert.match(css, /\.profession-insights-content\s*\{[^}]*grid-template-columns:\s*minmax\(360px, \.95fr\) minmax\(440px, 1\.05fr\)/);
  assert.match(css, /@media \(max-width: 1250px\)[\s\S]*\.profession-insights-content\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.focus-tier-strip/);
  assert.match(css, /\.capability-grid/);
});
