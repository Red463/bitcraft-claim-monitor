import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("shared page headers own consistent spacing in the application stylesheet", () => {
  const app = read("../src/styles.css");
  const members = read("../src/styles/members.css");
  const dashboard = read("../src/styles/dashboard.css");

  assert.match(app, /\.panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  assert.match(app, /\.members-topbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*gap:\s*16px;/s);
  assert.match(app, /\.members-topbar\s*\{[^}]*min-width:\s*0;/s);
  assert.match(app, /\.members-topbar > \*\s*\{[^}]*min-width:\s*0;/s);
  assert.match(app, /\.members-topbar p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(app, /\.dashboard-top-meta\s*\{[^}]*column-gap:\s*12px;[^}]*row-gap:\s*8px;[^}]*flex-wrap:\s*wrap;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  assert.match(app, /@media \(max-width:\s*920px\)[\s\S]*\.members-topbar\s*\{\s*grid-template-columns:\s*1fr;\s*\}[\s\S]*\.dashboard-top-meta\s*\{\s*justify-content:\s*flex-start;\s*\}/s);
  assert.doesNotMatch(members, /^\.members-topbar(?:\s|\{|h2|p)/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-top-meta\s*\{/m);
});

test("shared header metadata groups keep their spacing without dashboard route CSS", () => {
  const app = read("../src/styles.css");
  const dashboard = read("../src/styles/dashboard.css");

  assert.match(app, /\.dashboard-meta-cluster\s*\{[^}]*padding-right:\s*24px;[^}]*display:\s*grid;[^}]*gap:\s*8px;/s);
  assert.match(app, /\.dashboard-settlement-pill\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*12px;/s);
  assert.match(app, /\.dashboard-settlement-pill \.tier-badge\s*\{[^}]*min-width:\s*33px;/s);
  assert.match(app, /\.dashboard-region-line,\s*\.dashboard-refresh-line\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*8px;/s);
  assert.match(app, /\.dashboard-claim-link\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*12px;/s);
  assert.doesNotMatch(dashboard, /^\.dashboard-meta-cluster\s*\{/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-settlement-pill\s*\{/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-region-line/m);
  assert.doesNotMatch(dashboard, /^\.dashboard-claim-link/m);
});

test("distinct primary page headers follow the same spacing rhythm", () => {
  const dashboard = read("../src/styles/dashboard.css");
  const skills = read("../src/styles/skills.css");
  const craft = read("../src/styles/craft-planning.css");
  const empires = read("../src/styles/empires.css");

  assert.match(dashboard, /\.dashboard-topbar\s*\{[^}]*gap:\s*16px;/s);
  assert.match(dashboard, /\.dashboard-topbar p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(skills, /\.skills-topbar\s*\{[^}]*gap:\s*16px;/s);
  assert.match(skills, /\.skills-topbar p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(craft, /\.craft-plan-page-header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*gap:\s*16px;/s);
  assert.match(craft, /\.craft-plan-page-header p\s*\{[^}]*margin:\s*8px 0 0;/s);
  assert.match(craft, /@media \(max-width:\s*760px\)[\s\S]*\.craft-plan-page-header\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(empires, /\.page-title-row\s*\{[^}]*gap:\s*16px;[^}]*margin-bottom:\s*24px;/s);
});
