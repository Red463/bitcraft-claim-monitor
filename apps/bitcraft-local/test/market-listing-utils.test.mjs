import assert from "node:assert/strict";
import test from "node:test";

import {
  displayItemName,
  listingDate,
  listingTrackingKey,
  liveDaysSince,
  safeDisplayJson,
  settlementListingState,
} from "../src/pages/market/listingUtils.ts";

test("displayItemName hides empty and placeholder item labels", () => {
  assert.equal(displayItemName(" Iron Sword "), "Iron Sword");
  assert.equal(displayItemName(""), null);
  assert.equal(displayItemName(null), null);
  assert.equal(displayItemName("Unknown Item"), null);
  assert.equal(displayItemName("unknown item"), null);
});

test("listingTrackingKey uses the stable BitJita listing id fallbacks", () => {
  assert.equal(listingTrackingKey({ entityId: "entity-1", id: "id-1" }), "entity-1");
  assert.equal(listingTrackingKey({ id: "id-2", marketListingId: "market-2" }), "id-2");
  assert.equal(listingTrackingKey({ marketListingId: "market-3", listingId: "listing-3" }), "market-3");
  assert.equal(listingTrackingKey({ listingId: "listing-4" }), "listing-4");
  assert.equal(listingTrackingKey({}), "");
});

test("listingDate prefers live BitJita timestamps over persisted first-seen dates", () => {
  assert.equal(listingDate({ timestamp: "2026-06-28T10:00:00.000Z" }, "2026-06-27T10:00:00.000Z"), "2026-06-28T10:00:00.000Z");
  assert.equal(listingDate({}, "2026-06-27T10:00:00.000Z"), "2026-06-27T10:00:00.000Z");
});

test("safeDisplayJson preserves parsed JSON objects and arrays", () => {
  assert.deepEqual(safeDisplayJson('{"quantity":3}'), { quantity: 3 });
  assert.deepEqual(safeDisplayJson("[]"), []);
  assert.deepEqual(safeDisplayJson("not-json"), {});
  assert.deepEqual(safeDisplayJson(null), {});
});
test("liveDaysSince formats listing age from the current time", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2026-06-28T12:00:00.000Z").getTime();
  try {
    assert.equal(liveDaysSince("2026-06-28T09:00:00.000Z"), "<1 day");
    assert.equal(liveDaysSince("2026-06-26T11:00:00.000Z"), "2 days");
    assert.equal(liveDaysSince("2026-06-27T11:00:00.000Z"), "1 day");
    assert.equal(liveDaysSince("2026-06-29T11:00:00.000Z"), "-");
    assert.equal(liveDaysSince("not-a-date"), "-");
  } finally {
    Date.now = originalNow;
  }
});

test("settlementListingState distinguishes loading, failure, empty settlement, and filtered results", () => {
  assert.deepEqual(settlementListingState({ loading: true, error: null, totalListings: 0, visibleListings: 0 }), {
    kind: "loading",
    title: "Loading live listings…",
  });
  assert.deepEqual(settlementListingState({ loading: false, error: "BitJita timed out", totalListings: 0, visibleListings: 0 }), {
    kind: "error",
    title: "Unable to load live listings",
    detail: "BitJita timed out",
  });
  assert.deepEqual(settlementListingState({ loading: false, error: null, totalListings: 0, visibleListings: 0 }), {
    kind: "empty",
    title: "This settlement has no live listings.",
  });
  assert.deepEqual(settlementListingState({ loading: false, error: null, totalListings: 29, visibleListings: 0 }), {
    kind: "no-match",
    title: "No listings match the current filters.",
  });
  assert.equal(settlementListingState({ loading: false, error: null, totalListings: 29, visibleListings: 12 }), null);
});
