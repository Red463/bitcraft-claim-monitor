import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("dashboard command state relies on the shared page-header divider", () => {
  const dashboard = read("../src/styles/dashboard.css");
  const rule = dashboard.match(/\.dashboard-command-state\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.notEqual(rule, "", "dashboard command-state rule should exist");
  assert.doesNotMatch(rule, /border-bottom/);
});

test("command palette results reserve separate rows for title and description", () => {
  const chrome = read("../src/styles/app-chrome.css");

  assert.match(chrome, /\.command-palette button\s*\{[^}]*grid-template-columns:\s*23px minmax\(0,\s*1fr\);[^}]*grid-template-rows:\s*auto auto;/s);
  assert.match(chrome, /\.command-palette button > svg\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1 \/ 3;/s);
  assert.match(chrome, /\.command-palette strong\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
  assert.match(chrome, /\.command-palette span\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/s);
});
