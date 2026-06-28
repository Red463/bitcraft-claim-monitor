import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const setupWorkflowCss = readFileSync(new URL("../src/styles/setup-workflow.css", import.meta.url), "utf8");

test("setup workflow stylesheet keeps ownership to setup, workflow, and admin-message selectors", () => {
  const forbiddenGlobalSelectors = setupWorkflowCss
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /^(aside|nav\b|nav,|\.sidebar-collapsed nav\b|\.bot-section-nav\b)/.test(line));

  assert.deepEqual(forbiddenGlobalSelectors, []);
});
test("bot dashboard shell styles live in the bot dashboard stylesheet", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const botCssUrl = new URL("../src/styles/bot-dashboard.css", import.meta.url);
  assert.equal(existsSync(botCssUrl), true);
  const botCss = readFileSync(botCssUrl, "utf8");
  const botShellSelectors = [
    ".bot-control-page",
    ".bot-console",
    ".bot-dashboard",
    ".bot-overview",
    ".bot-layout",
    ".bot-section-nav",
    ".bot-nav-title",
    ".bot-nav-group",
  ];

  const startsOwnedSelector = (css, selector) => css
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${selector} {`) || line.trim().startsWith(`${selector},`));

  for (const selector of botShellSelectors) {
    assert.equal(startsOwnedSelector(globalCss, selector), false, `${selector} standalone styles should not live in styles.css`);
    assert.equal(botCss.includes(selector), true, `${selector} should live in bot-dashboard.css`);
  }
});
