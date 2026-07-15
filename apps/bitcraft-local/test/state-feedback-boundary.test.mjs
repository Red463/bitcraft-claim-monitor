import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { claimPendingAction, releasePendingAction } from "../src/utils/pendingActions.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("pending action registry rejects duplicate submissions until release", () => {
  const pending = new Set();
  assert.equal(claimPendingAction(pending, "discord:test"), true);
  assert.equal(claimPendingAction(pending, "discord:test"), false);
  releasePendingAction(pending, "discord:test");
  assert.equal(claimPendingAction(pending, "discord:test"), true);
});

test("shared async states expose distinct accessible semantics without owning page copy", () => {
  const url = new URL("../src/components/main/AsyncState.tsx", import.meta.url);
  assert.equal(existsSync(url), true);
  const component = readFileSync(url, "utf8");

  assert.match(component, /"loading"\s*\|\s*"empty"\s*\|\s*"no-match"\s*\|\s*"restricted"\s*\|\s*"stale"\s*\|\s*"error"/);
  assert.match(component, /kind === "error" \? "alert" : "status"/);
  assert.match(component, /aria-live=/);
  assert.match(component, /title: string/);
  assert.doesNotMatch(component, /Nothing here|No records found|Something went wrong/);
});

test("action buttons preserve validation disabling while announcing pending work", () => {
  const url = new URL("../src/components/main/ActionButton.tsx", import.meta.url);
  assert.equal(existsSync(url), true);
  const component = readFileSync(url, "utf8");

  assert.match(component, /pending: boolean/);
  assert.match(component, /pendingLabel: string/);
  assert.match(component, /disabled=\{disabled \|\| pending\}/);
  assert.match(component, /aria-busy=\{pending\}/);
});

test("public routes distinguish initial loading, settled empty, no match, restricted, stale, and error states", () => {
  const files = [
    "../src/pages/LeaderboardPage.tsx",
    "../src/pages/EmpiresPage.tsx",
    "../src/pages/PublicCraftFinderPage.tsx",
    "../src/pages/InventoryPage.tsx",
    "../src/pages/CraftCalculatorPage.tsx",
  ].map(source).join("\n");

  for (const kind of ["loading", "empty", "no-match", "restricted", "error"]) {
    assert.match(files, new RegExp(`kind=[{]?\\"${kind}\\"`));
  }
  assert.match(source("../src/components/main/AppChrome.tsx"), /kind="stale"/);
  assert.match(files, /AppSkeleton/);
});

test("refresh failures preserve previously rendered public data", () => {
  const leaderboard = source("../src/pages/LeaderboardPage.tsx");
  const empires = source("../src/pages/EmpiresPage.tsx");

  assert.match(leaderboard, /setState\(\(current\) => \(\{ \.{3}current, error:/);
  assert.match(empires, /setState\(\(current\) => \(\{ \.{3}current, loading: false, error:/);
});

test("admin mutations have keyed duplicate protection and accessible result announcements", () => {
  const admin = source("../src/components/admin/AdminPanel.tsx");

  assert.match(admin, /claimPendingAction\(pendingActionsRef\.current, busyKey\)/);
  assert.match(admin, /releasePendingAction\(pendingActionsRef\.current, busyKey\)/);
  assert.match(admin, /async function run\([\s\S]*?busyKey: string\)/);
  assert.match(admin, /role=\{messageKind === "error" \? "alert" : "status"\}/);
  assert.match(admin, /aria-live=\{messageKind === "error" \? "assertive" : "polite"\}/);
});

test("listed Discord mutation surfaces render pending-aware action buttons", () => {
  const files = [
    "../src/components/bot/DiscordNotificationsSection.tsx",
    "../src/components/bot/DiscordColourRolesSection.tsx",
    "../src/components/bot/DiscordRoleManagerSection.tsx",
    "../src/components/bot/DiscordRolePanelsSection.tsx",
    "../src/components/bot/DiscordModerationSection.tsx",
    "../src/components/bot/DiscordSafetySection.tsx",
    "../src/components/bot/DiscordTestsPanel.tsx",
    "../src/components/bot/DiscordDiagnosticsPanel.tsx",
  ].map(source);

  for (const file of files) {
    assert.match(file, /ActionButton/);
    assert.match(file, /pending=/);
    assert.match(file, /pendingLabel=/);
  }
});
