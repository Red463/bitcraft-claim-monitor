import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACCESS_CONTROL_TARGETS,
  firstAllowedTab,
  normalizeAccessControlConfig,
  pageAccessTargets,
  publicAccessDecision,
} from "../src/access/accessControl.mjs";

let resolveAllowedView;
try {
  ({ resolveAllowedView } = await import("../src/navigation/routeState.ts"));
} catch {
  // RED starts with the shared resolver absent.
}

const anonymous = { user: null };
const signedIn = { user: { discordId: "111111", characterStatus: "pending" } };
const verified = { user: { discordId: "222222", characterStatus: "approved" } };

test("access control defaults allow public app targets and exclude admin", () => {
  const config = normalizeAccessControlConfig({});

  assert.equal(pageAccessTargets().some((target) => target.id === "admin"), false);
  assert.equal(ACCESS_CONTROL_TARGETS.some((target) => target.id === "page:admin"), false);
  assert.equal(publicAccessDecision(config, "page:dashboard", anonymous).allowed, true);
  assert.equal(publicAccessDecision(config, "tab:market:dealWatchlist", anonymous).allowed, true);
});

test("access control evaluates discord, verified, and specific user rules", () => {
  const config = normalizeAccessControlConfig({
    rules: {
      "page:market": { mode: "discord" },
      "page:map": { mode: "verified" },
      "tab:leaderboard:market": { mode: "specificUsers", allowedDiscordIds: ["222222"] },
    },
  });

  assert.equal(publicAccessDecision(config, "page:market", anonymous).allowed, false);
  assert.equal(publicAccessDecision(config, "page:market", signedIn).allowed, true);
  assert.equal(publicAccessDecision(config, "page:map", signedIn).allowed, false);
  assert.equal(publicAccessDecision(config, "page:map", verified).allowed, true);
  assert.equal(publicAccessDecision(config, "tab:leaderboard:market", signedIn).allowed, false);
  assert.equal(publicAccessDecision(config, "tab:leaderboard:market", verified).allowed, true);
});

test("access control migrates legacy page targets and prefers canonical rules", () => {
  const config = normalizeAccessControlConfig({
    rules: {
      "page:production": { mode: "discord" },
      "page:empire": { mode: "verified" },
      "page:craft-monitor": { mode: "specificUsers", allowedDiscordIds: ["222222"] },
    },
  });

  assert.deepEqual(config.rules["page:craft-monitor"], {
    mode: "specificUsers",
    allowedDiscordIds: ["222222"],
  });
  assert.deepEqual(config.rules["page:region"], {
    mode: "verified",
    allowedDiscordIds: [],
  });
  assert.equal("page:production" in config.rules, false);
  assert.equal("page:empire" in config.rules, false);

  const labels = new Map(pageAccessTargets().map((target) => [target.page, target.label]));
  assert.equal(labels.get("craft-monitor"), "Craft Monitor");
  assert.equal(labels.get("settlement-market"), "Local Market");
  assert.equal(labels.get("region"), "Region");
});

test("access control tab fallback chooses the first allowed tab", () => {
  const config = normalizeAccessControlConfig({
    rules: {
      "tab:market:overview": { mode: "verified" },
      "tab:market:browse": { mode: "discord" },
    },
  });

  assert.equal(firstAllowedTab(config, "market", anonymous), "deals");
  assert.equal(firstAllowedTab(config, "market", signedIn), "browse");
  assert.equal(firstAllowedTab(config, "market", verified), "overview");
});

test("allowed-view resolution returns a fallback or null when every view is restricted", () => {
  assert.equal(typeof resolveAllowedView, "function");
  assert.equal(resolveAllowedView("market", ["contribution", "market"]), "market");
  assert.equal(resolveAllowedView("online", ["contribution", "market"]), "contribution");
  assert.equal(resolveAllowedView("online", []), null);
});

test("account settings keep administrator sign-in discoverable before authentication", () => {
  const settingsDialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");
  assert.match(settingsDialog, /Administrator sign-in/);
  assert.doesNotMatch(settingsDialog, /settingsSection === "account" && showAdminTools/);
});
