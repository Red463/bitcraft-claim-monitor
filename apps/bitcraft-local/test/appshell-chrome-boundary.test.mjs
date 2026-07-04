import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("floating action rail can be collapsed with persisted state and accessible toggle", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /usePersistedState\("layout\.floatingActionsCollapsed", false\)/);
  assert.match(appShell, /floating-actions-collapsed/);
  assert.match(appShell, /aria-expanded=\{!floatingActionsCollapsed\}/);
  assert.match(appShell, /Hide tools/);
  assert.match(appShell, /Show tools/);
});

test("floating action rail CSS slides collapsed rail offscreen with reduced motion support", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /\.floating-actions\.floating-actions-collapsed\s*\{[^}]*translateX\(calc\(100% - 24px\)\)/s);
  assert.match(css, /\.floating-actions\.floating-actions-collapsed\s+\.floating-action-item\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.floating-actions-toggle/);
  assert.match(css, /\.floating-actions\.floating-actions-collapsed\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.floating-actions\s+\.floating-actions-toggle\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
test("footer shows the app version and build id", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /fetch\(`\$\{LOCAL_API\}\/health`, \{ cache: "no-store" \}\)/);
  assert.match(appShell, /setAppBuildId/);
  assert.match(appShell, /appBuildIdRef/);
  assert.match(appShell, /footer-build/);
  assert.match(appShell, /APP_VERSION/);
});
test("sidebar exposes a persistent app account sign-in affordance", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appShell, /sidebar-account-card/);
  assert.match(appShell, /Not signed in/);
  assert.match(appShell, /Sign in to save settings and verify your character/);
  assert.match(appShell, /Sign in with Discord/);
  assert.match(appShell, /Join Discord Server/);
  assert.match(appShell, /setUserSettingsOpen\(true\)/);
  assert.match(css, /\.sidebar-account-card/);
  assert.match(css, /\.sidebar-account-avatar/);
  assert.match(css, /\.sidebar-account-action/);
  assert.match(css, /\.sidebar-top-stack/);
  assert.match(css, /nav a, nav button \{[^}]*min-height:\s*34px/s);
  assert.match(css, /nav a\.active, nav button\.active \{[^}]*inset 2px 0 0 var\(--active-color\)/s);
});
test("sidebar overview label preserves the existing command group key", () => {
  const navigation = readFileSync(new URL("../src/navigation.ts", import.meta.url), "utf8");

  assert.match(navigation, /\{\s*id:\s*"command",\s*label:\s*"Overview"/);
  assert.doesNotMatch(navigation, /\{\s*id:\s*"overview"/);
  assert.doesNotMatch(navigation, /label:\s*"Command"/);
});

