import assert from "node:assert/strict";
import test from "node:test";

import * as appSettingsPolicy from "../src/server/appSettingsPolicy.mjs";

const {
  DEFAULT_APP_PAGE,
  VALID_APP_PAGES,
  normalizeSavedRefreshIntervalSeconds,
  normalizeStoredExcludedMemberIds,
  normalizeSubmittedExcludedMemberIds,
  parseRegionIds,
  validAppPage,
  validBitcraftSyncUrl,
  validClaimId,
  validRefreshIntervalSeconds,
  validRegionId,
} = appSettingsPolicy;

test("validBitcraftSyncUrl accepts only https BitCraft Sync links", () => {
  assert.equal(validBitcraftSyncUrl("https://bitcraftsync.app/claim/12345678"), true);
  assert.equal(validBitcraftSyncUrl("https://bitcraftsync.app"), true);
  assert.equal(validBitcraftSyncUrl("http://bitcraftsync.app/claim/12345678"), false);
  assert.equal(validBitcraftSyncUrl("https://example.com/claim/12345678"), false);
  assert.equal(validBitcraftSyncUrl("not a url"), false);
  assert.equal(validBitcraftSyncUrl(""), false);
});

test("validAppPage preserves the existing default-page allow list", () => {
  assert.equal(DEFAULT_APP_PAGE, "dashboard");
  assert.deepEqual(VALID_APP_PAGES, [
    "dashboard",
    "leaderboard",
    "overview",
    "members",
    "skills",
    "production",
    "planning",
    "publiccrafts",
    "craftcalc",
    "inventory",
    "construction",
    "research",
    "market",
    "empire",
    "empires",
    "map",
    "sync",
    "activity",
  ]);
  for (const page of VALID_APP_PAGES) {
    assert.equal(validAppPage(page), true, `${page} should be allowed`);
  }
  assert.equal(validAppPage("admin"), false);
  assert.equal(validAppPage("bot"), false);
  assert.equal(validAppPage("dashboard?admin=true"), false);
  assert.equal(validAppPage(""), false);
});

test("validClaimId preserves the existing numeric settlement id policy", () => {
  assert.equal(validClaimId("12345678"), true);
  assert.equal(validClaimId(" 12345678 "), true);
  assert.equal(validClaimId("1234567"), false);
  assert.equal(validClaimId("claim-12345678"), false);
  assert.equal(validClaimId(""), false);
});

test("settings interval validator preserves the existing integer range", () => {
  assert.equal(validRefreshIntervalSeconds(15), true);
  assert.equal(validRefreshIntervalSeconds(300), true);
  assert.equal(validRefreshIntervalSeconds("30"), true);
  assert.equal(validRefreshIntervalSeconds(14), false);
  assert.equal(validRefreshIntervalSeconds(301), false);
  assert.equal(validRefreshIntervalSeconds(30.5), false);
});

test("snapshot retention policy is no longer exported", () => {
  assert.equal(Object.hasOwn(appSettingsPolicy, "validSnapshotRetentionDays"), false);
  assert.equal(Object.hasOwn(appSettingsPolicy, "normalizeSavedSnapshotRetentionDays"), false);
});

test("region and excluded member helpers preserve settings normalization", () => {
  assert.equal(validRegionId("123"), true);
  assert.equal(validRegionId(" 123 "), true);
  assert.equal(validRegionId(""), false);
  assert.equal(validRegionId("12a"), false);

  assert.deepEqual(parseRegionIds("101, 202 303\n404"), ["101", "202", "303", "404"]);
  assert.deepEqual(parseRegionIds("north, 202,, 303x 404"), ["202", "404"]);
  assert.deepEqual(parseRegionIds(null), []);

  assert.deepEqual(normalizeStoredExcludedMemberIds(["12345678", " 12345678 ", "bad", "1234567", ""]), ["12345678", "bad", "1234567"]);
  assert.deepEqual(normalizeSubmittedExcludedMemberIds(["12345678", " 12345678 ", "87654321", "bad", "1234567"]), ["12345678", "87654321"]);
  assert.deepEqual(normalizeStoredExcludedMemberIds("12345678"), []);
  assert.deepEqual(normalizeSubmittedExcludedMemberIds("12345678"), []);
});

test("saved interval normalizer preserves settings fallback and clamp behavior", () => {
  assert.equal(normalizeSavedRefreshIntervalSeconds("45", 30), 45);
  assert.equal(normalizeSavedRefreshIntervalSeconds("10", 30), 15);
  assert.equal(normalizeSavedRefreshIntervalSeconds("900", 30), 300);
  assert.equal(normalizeSavedRefreshIntervalSeconds("not-a-number", 30), 30);
  assert.equal(normalizeSavedRefreshIntervalSeconds("0", 90), 90);
  assert.equal(normalizeSavedRefreshIntervalSeconds("0", 5), 15);
  assert.equal(normalizeSavedRefreshIntervalSeconds("0", 900), 300);
});
