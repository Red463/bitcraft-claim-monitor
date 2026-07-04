import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_CONTROL_TARGETS,
  firstAllowedTab,
  normalizeAccessControlConfig,
  pageAccessTargets,
  publicAccessDecision,
} from "../src/access/accessControl.mjs";

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

test("access control tab fallback chooses the first allowed tab", () => {
  const config = normalizeAccessControlConfig({
    rules: {
      "tab:market:live": { mode: "verified" },
      "tab:market:analytics": { mode: "discord" },
    },
  });

  assert.equal(firstAllowedTab(config, "market", anonymous), "pricing");
  assert.equal(firstAllowedTab(config, "market", signedIn), "analytics");
  assert.equal(firstAllowedTab(config, "market", verified), "live");
});