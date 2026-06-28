import assert from "node:assert/strict";
import test from "node:test";

import {
  activityNoticeKey,
  sanitizeActivityLog,
  activitySummary,
  compactActivity,
  diffSnapshot,
  signedDelta,
  toastItemFromActivity,
} from "../src/pages/activity/activityUtils.ts";

test("activitySummary formats tracked before and after changes", () => {
  assert.equal(signedDelta(120, 75, "g"), "+45g");
  assert.equal(signedDelta(75, 120, "g"), "-45g");
  assert.equal(activitySummary({
    event_type: "treasury",
    metadata_json: JSON.stringify({ before: 100, after: 175 }),
  }), "+75g to treasury");
  assert.equal(activitySummary({
    event_type: "storage",
    summary: "Tester deposited 12 Bronze Ingot to Ingots",
  }), "Tester deposited 12 Bronze Ingot to Ingots");
});

test("toastItemFromActivity extracts market item display metadata defensively", () => {
  assert.deepEqual(toastItemFromActivity({
    id: 12,
    event_type: "market_new_listing",
    metadata_json: JSON.stringify({
      itemId: 30,
      itemType: 0,
      itemName: "Leather",
      tier: 2,
      rarity: "Common",
      iconAssetName: "leather.png",
    }),
  }), {
    id: 30,
    itemId: 30,
    itemType: 0,
    name: "Leather",
    itemName: "Leather",
    tier: 2,
    itemTier: 2,
    rarity: "Common",
    itemRarityStr: "Common",
    iconAssetName: "leather.png",
  });
  assert.equal(toastItemFromActivity({ metadata_json: "{}" }), null);
  assert.equal(activityNoticeKey({ id: 12, source_key: "activity-source" }), "activity-source");
});

test("compactActivity combines adjacent treasury updates only", () => {
  const compacted = compactActivity([
    { id: 1, event_type: "treasury", occurred_at: "2026-06-28T10:00:00.000Z", metadata_json: JSON.stringify({ before: 100, after: 125 }) },
    { id: 2, event_type: "treasury", occurred_at: "2026-06-28T10:01:00.000Z", metadata_json: JSON.stringify({ before: 125, after: 110 }) },
    { id: 3, event_type: "storage", summary: "Storage move" },
  ]);

  assert.equal(compacted.length, 2);
  assert.equal(compacted[0].summary, "+10g to treasury across 2 refreshes");
  assert.equal(compacted[1].summary, "Storage move");
});

test("diffSnapshot reports tracked settlement changes", () => {
  assert.deepEqual(diffSnapshot(
    { members: 2, buildings: 3, market: 4, claim: { supplies: 100, treasury: 50 } },
    { members: 3, buildings: 3, market: 5, claim: { supplies: 80, treasury: 75 } },
  ), [
    "members changed from 2 to 3",
    "market changed from 4 to 5",
    "Supplies changed to 80",
    "Treasury changed to 75g",
  ]);
});
test("sanitizeActivityLog normalizes mojibake separators and hides zero transition noise", () => {
  const items = [
    "Storage\u00c2\u00b7Bronze Ingot",
    "Treasury\u00e2\u20ac\u201dUpdated",
    "members changed from 4 to 0",
    "members changed from 0 to 4",
    "market changed from 4 to 5",
    null,
  ];

  assert.deepEqual(sanitizeActivityLog(items), [
    "Storage-Bronze Ingot",
    "Treasury-Updated",
    "market changed from 4 to 5",
    "null",
  ]);
  assert.deepEqual(sanitizeActivityLog("not-array"), []);
  assert.equal(sanitizeActivityLog(Array.from({ length: 105 }, (_, index) => `event ${index}`)).length, 100);
});
