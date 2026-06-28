import assert from "node:assert/strict";
import test from "node:test";

import {
  dealAlertToastDraft,
  marketActivityToastDraft,
  productionCraftToastDraft,
  selectUnseenNotificationItems,
} from "../src/notifications/notificationSources.ts";
import { createToastNotice, dedupeNotifications, notificationDedupeKey } from "../src/notifications/toastNotices.ts";

test("dedupeNotifications keeps the newest notice for source and legacy duplicates", () => {
  const notices = [
    { id: "new-source", title: "Market sale", body: "Oak Plank sold", kind: "market", sourceKey: "activity:12" },
    { id: "old-source", title: "Market sale", body: "Oak Plank sold", kind: "market", sourceKey: "activity:12" },
    { id: "new-legacy", title: "Craft completed", body: "Fine Plank", kind: "production" },
    { id: "old-legacy", title: "Craft completed", body: "Fine Plank", kind: "production" },
    { id: "distinct", title: "Craft completed", body: "Simple Plank", kind: "production" },
  ];

  assert.deepEqual(dedupeNotifications(notices).map((notice) => notice.id), ["new-source", "new-legacy", "distinct"]);
  assert.equal(notificationDedupeKey(notices[0]), "source:activity:12");
  assert.equal(notificationDedupeKey(notices[2]), "legacy:production:Craft completed:Fine Plank");
});

test("createToastNotice assigns stable notification fields and destinations", () => {
  const marketNotice = createToastNotice({
    id: "notice-1",
    title: "Market deal found",
    body: "Leather: 6g at Timbersteel Trade",
    kind: "market",
    occurredAt: "2026-06-28T10:00:00.000Z",
    item: { itemName: "Leather", tier: 2 },
    sourceKey: "deal-alert:1",
  });
  const productionNotice = createToastNotice({
    id: "notice-2",
    title: "Craft started",
    body: "Fine Plank - Carpentry",
    kind: "production",
  });

  assert.deepEqual(marketNotice, {
    id: "notice-1",
    title: "Market deal found",
    body: "Leather: 6g at Timbersteel Trade",
    kind: "market",
    occurredAt: "2026-06-28T10:00:00.000Z",
    read: false,
    destination: "market",
    item: { itemName: "Leather", tier: 2 },
    sourceKey: "deal-alert:1",
  });
  assert.equal(productionNotice.destination, "production");
  assert.equal(productionNotice.read, false);
  assert.equal(productionNotice.item, null);
});

test("marketActivityToastDraft respects listing and sale settings", () => {
  const listing = {
    id: 42,
    event_type: "market_new_listing",
    occurred_at: "2026-06-28T10:00:00.000Z",
    summary: "New market listing: Oak Plank",
    metadata_json: JSON.stringify({ itemName: "Oak Plank", itemId: 12, itemType: 0, tier: 2 }),
  };
  const sale = {
    id: 43,
    event_type: "market_sale_confirmed",
    occurredAt: "2026-06-28T10:05:00.000Z",
    summary: "Market sale confirmed: Oak Plank",
    metadataJson: JSON.stringify({ itemName: "Oak Plank", itemId: 12, itemType: 0, tier: 2 }),
  };
  const settings = { marketListings: true, marketSales: true };
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: JSON.parse(event.metadata_json ?? event.metadataJson).itemName }),
    key: (event) => `activity:${event.id}`,
  };

  assert.deepEqual(marketActivityToastDraft(listing, settings, helpers), {
    title: "New market listing",
    body: "New market listing: Oak Plank",
    kind: "market",
    occurredAt: "2026-06-28T10:00:00.000Z",
    item: { itemName: "Oak Plank" },
    sourceKey: "activity:42",
  });
  assert.deepEqual(marketActivityToastDraft(sale, settings, helpers), {
    title: "Market sale",
    body: "Market sale confirmed: Oak Plank",
    kind: "market",
    occurredAt: "2026-06-28T10:05:00.000Z",
    item: { itemName: "Oak Plank" },
    sourceKey: "activity:43",
  });
  assert.equal(marketActivityToastDraft(listing, { marketListings: false, marketSales: true }, helpers), null);
  assert.equal(marketActivityToastDraft(sale, { marketListings: true, marketSales: false }, helpers), null);
  assert.equal(marketActivityToastDraft({ ...listing, event_type: "storage" }, settings, helpers), null);
});

test("dealAlertToastDraft builds market deal notices with source keys and item metadata", () => {
  const draft = dealAlertToastDraft({
    id: 7,
    itemName: "Leather",
    unitPrice: 6,
    marketClaimName: "Timbersteel Trade",
    discountPercent: 40.2,
    baselineAverage: 10,
    baselineWindowDays: 7,
    tier: 2,
    rarity: "Common",
    iconAssetName: "leather.png",
    createdAt: "2026-06-28T11:00:00.000Z",
  });

  assert.deepEqual(draft, {
    title: "Market deal found",
    body: "Leather: 6g at Timbersteel Trade (40% below 10g 7-day average)",
    kind: "market",
    item: { name: "Leather", itemName: "Leather", tier: 2, rarity: "Common", iconAssetName: "leather.png" },
    occurredAt: "2026-06-28T11:00:00.000Z",
    sourceKey: "deal-alert:7",
  });
});
test("productionCraftToastDraft builds started and completed notices", () => {
  const job = { entityId: "craft-1", buildingName: "Carpentry Station", recipeId: "recipe-1" };
  const helpers = {
    displayName: () => "Fine Plank",
    item: () => ({ itemName: "Fine Plank", tier: 4 }),
  };

  assert.deepEqual(productionCraftToastDraft("started", "claim-1", "craft-1", job, helpers), {
    title: "Craft started",
    body: "Fine Plank - Carpentry Station",
    kind: "production",
    item: { itemName: "Fine Plank", tier: 4 },
    sourceKey: "production-started:claim-1:craft-1",
  });
  assert.deepEqual(productionCraftToastDraft("completed", "claim-1", "craft-1", job, helpers), {
    title: "Craft completed",
    body: "Fine Plank - Carpentry Station",
    kind: "production",
    item: { itemName: "Fine Plank", tier: 4 },
    sourceKey: "production-completed:claim-1:craft-1",
  });
});

test("selectUnseenNotificationItems seeds known ids then returns newest unseen items in display order", () => {
  const seeded = selectUnseenNotificationItems(null, [{ id: "old-1" }, { id: "old-2" }], (item) => item.id);
  assert.deepEqual(seeded.unseen, []);
  assert.deepEqual([...seeded.knownIds], ["old-1", "old-2"]);

  const next = selectUnseenNotificationItems(seeded.knownIds, [
    { id: "new-3" },
    { id: "new-2" },
    { id: "new-1" },
    { id: "old-1" },
  ], (item) => item.id, 2);

  assert.deepEqual(next.unseen.map((item) => item.id), ["new-2", "new-3"]);
  assert.deepEqual([...next.knownIds], ["old-1", "old-2", "new-3", "new-2", "new-1"]);
});
