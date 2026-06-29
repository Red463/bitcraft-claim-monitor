import assert from "node:assert/strict";
import test from "node:test";

import {
  dealAlertToastDraft,
  dealAlertQueueToastDrafts,
  marketActivityToastDraft,
  marketActivityQueueToastDrafts,
  productionCraftToastDraft,
  productionCraftQueueToastDrafts,
  selectUnseenNotificationItems,
} from "../src/notifications/notificationSources.ts";
import { browserNotificationSourceDrafts } from "../src/notifications/browserNotificationSourceQueue.ts";
import { appendNotificationLog, appendToastStack, createToastNotice, dedupeNotifications, markNotificationsRead, notificationDedupeKey } from "../src/notifications/toastNotices.ts";

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

test("appendNotificationLog prepends notices, lets the newest duplicate win, and caps persisted history", () => {
  const notice = (id, sourceKey) => ({ id, title: "Market sale", body: id, kind: "market", sourceKey, read: false });
  const existing = Array.from({ length: 82 }, (_, index) => notice(`old-${index}`, `source-${index}`));
  const result = appendNotificationLog(existing, notice("new", "source-3"));

  assert.equal(result.length, 80);
  assert.equal(result[0].id, "new");
  assert.equal(result.filter((entry) => entry.sourceKey === "source-3").length, 1);
  assert.equal(result.some((entry) => entry.id === "old-3"), false);
});

test("appendToastStack keeps only the newest visible toast notices", () => {
  const stack = Array.from({ length: 4 }, (_, index) => ({ id: `old-${index}`, title: "Notice", body: String(index), kind: "market" }));
  const result = appendToastStack(stack, { id: "new", title: "Notice", body: "new", kind: "production" });

  assert.deepEqual(result.map((notice) => notice.id), ["old-1", "old-2", "old-3", "new"]);
});

test("markNotificationsRead preserves notice order and marks unread notices as read", () => {
  const notices = [
    { id: "new", title: "Market sale", body: "Sale", kind: "market", read: false },
    { id: "old", title: "Craft completed", body: "Craft", kind: "production", read: true },
  ];

  assert.deepEqual(markNotificationsRead(notices), [
    { id: "new", title: "Market sale", body: "Sale", kind: "market", read: true },
    { id: "old", title: "Craft completed", body: "Craft", kind: "production", read: true },
  ]);
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

test("marketActivityQueueToastDrafts seeds by claim and emits unseen notable market drafts", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: event.itemName }),
    key: (event) => `activity:${event.id}`,
  };
  const seeded = marketActivityQueueToastDrafts(null, "claim-1", [
    { id: 2, event_type: "market_sale", summary: "Old sale", itemName: "Old Sale" },
    { id: 1, event_type: "market_new_listing", summary: "Old listing", itemName: "Old Listing" },
    { id: 99, event_type: "storage", summary: "Ignored storage", itemName: "Storage" },
  ], { marketListings: true, marketSales: true }, helpers);
  assert.equal(seeded.seeded, true);
  assert.deepEqual(seeded.drafts, []);
  assert.equal(seeded.snapshot.claimId, "claim-1");
  assert.deepEqual([...seeded.snapshot.knownIds], ["2", "1"]);

  const next = marketActivityQueueToastDrafts(seeded.snapshot, "claim-1", [
    { id: 5, event_type: "market_sale_confirmed", summary: "New sale", itemName: "New Sale" },
    { id: 4, eventType: "market_new_listing", summary: "New listing", itemName: "New Listing" },
    { id: 3, event_type: "storage", summary: "Ignored storage", itemName: "Storage" },
    { id: 2, event_type: "market_sale", summary: "Old sale", itemName: "Old Sale" },
  ], { marketListings: true, marketSales: true }, helpers);
  assert.equal(next.seeded, false);
  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), ["activity:4", "activity:5"]);
  assert.deepEqual(next.drafts.map((draft) => draft.title), ["New market listing", "Market sale"]);
  assert.deepEqual([...next.snapshot.knownIds], ["2", "1", "5", "4"]);

  const changedClaim = marketActivityQueueToastDrafts(next.snapshot, "claim-2", [
    { id: 7, event_type: "market_new_listing", summary: "Claim two listing", itemName: "Other" },
  ], { marketListings: true, marketSales: true }, helpers);
  assert.equal(changedClaim.seeded, true);
  assert.deepEqual(changedClaim.drafts, []);
  assert.equal(changedClaim.snapshot.claimId, "claim-2");
});

test("marketActivityQueueToastDrafts records disabled market events without replaying them later", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: event.itemName }),
    key: (event) => `activity:${event.id}`,
  };
  const previous = { claimId: "claim-1", knownIds: new Set(["1"]) };
  const result = marketActivityQueueToastDrafts(previous, "claim-1", [
    { id: 3, event_type: "market_sale", summary: "Sale enabled", itemName: "Sale" },
    { id: 2, event_type: "market_new_listing", summary: "Listing disabled", itemName: "Listing" },
  ], { marketListings: false, marketSales: true }, helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["activity:3"]);
  assert.deepEqual([...result.snapshot.knownIds], ["1", "3", "2"]);
});

test("dealAlertQueueToastDrafts seeds signed-in deal alerts and emits capped unseen drafts", () => {
  const seeded = dealAlertQueueToastDrafts(null, [
    { id: 2, itemName: "Old Leather", unitPrice: 6, discountPercent: 30, baselineAverage: 10, baselineWindowDays: 7 },
    { id: 1, itemName: "Old Ore", unitPrice: 3, discountPercent: 20, baselineAverage: 5, baselineWindowDays: 7 },
  ]);
  assert.equal(seeded.seeded, true);
  assert.deepEqual(seeded.drafts, []);
  assert.deepEqual([...seeded.knownIds], ["2", "1"]);

  const next = dealAlertQueueToastDrafts(seeded.knownIds, [
    { id: 5, itemName: "New Hide", unitPrice: 4, discountPercent: 50, baselineAverage: 8, baselineWindowDays: 7 },
    { id: 4, itemName: "New Plank", unitPrice: 9, discountPercent: 25, baselineAverage: 12, baselineWindowDays: 7 },
    { id: 3, itemName: "New Ore", unitPrice: 2, discountPercent: 60, baselineAverage: 5, baselineWindowDays: 7 },
    { id: 2, itemName: "Old Leather", unitPrice: 6, discountPercent: 30, baselineAverage: 10, baselineWindowDays: 7 },
  ], 2);

  assert.equal(next.seeded, false);
  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), ["deal-alert:4", "deal-alert:5"]);
  assert.deepEqual([...next.knownIds], ["2", "1", "5", "4", "3"]);
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

test("productionCraftQueueToastDrafts seeds baselines, handles claim changes, and respects disabled settings", () => {
  const helpers = {
    displayName: (job) => job.name,
    item: (job) => ({ itemName: job.name }),
  };
  const initial = productionCraftQueueToastDrafts(null, "claim-1", [{ entityId: "a", name: "Oak Plank" }], helpers);
  assert.equal(initial.seeded, true);
  assert.deepEqual(initial.drafts, []);
  assert.deepEqual([...initial.snapshot.jobs.keys()], ["a"]);

  const disabled = productionCraftQueueToastDrafts(initial.snapshot, "claim-1", [{ entityId: "a", name: "Oak Plank" }, { entityId: "b", name: "Fine Plank" }], helpers, { enabled: false });
  assert.equal(disabled.seeded, false);
  assert.deepEqual(disabled.drafts, []);
  assert.deepEqual([...disabled.snapshot.jobs.keys()], ["a", "b"]);

  const changedClaim = productionCraftQueueToastDrafts(disabled.snapshot, "claim-2", [{ entityId: "c", name: "Copper Ingot" }], helpers);
  assert.equal(changedClaim.seeded, true);
  assert.deepEqual(changedClaim.drafts, []);
  assert.deepEqual([...changedClaim.snapshot.jobs.keys()], ["c"]);
});

test("productionCraftQueueToastDrafts emits capped started and completed drafts in queue order", () => {
  const helpers = {
    displayName: (job) => job.name,
    item: (job) => ({ itemName: job.name }),
  };
  const previous = {
    claimId: "claim-1",
    jobs: new Map([
      ["old-1", { entityId: "old-1", name: "Old One", buildingName: "Kiln" }],
      ["old-2", { entityId: "old-2", name: "Old Two", buildingName: "Forge" }],
      ["old-3", { entityId: "old-3", name: "Old Three", buildingName: "Workbench" }],
    ]),
  };

  const result = productionCraftQueueToastDrafts(previous, "claim-1", [
    { entityId: "old-2", name: "Old Two", buildingName: "Forge" },
    { entityId: "new-1", name: "New One", buildingName: "Loom" },
    { entityId: "new-2", name: "New Two", buildingName: "Tannery" },
    { entityId: "new-3", name: "New Three", buildingName: "Mill" },
  ], helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), [
    "production-started:claim-1:new-1",
    "production-started:claim-1:new-2",
    "production-completed:claim-1:old-1",
    "production-completed:claim-1:old-3",
  ]);
  assert.deepEqual(result.drafts.map((draft) => draft.title), ["Craft started", "Craft started", "Craft completed", "Craft completed"]);
  assert.deepEqual([...result.snapshot.jobs.keys()], ["old-2", "new-1", "new-2", "new-3"]);
});
test("browserNotificationSourceDrafts queues live source rows without page-mounted state", () => {
  const helpers = {
    activity: {
      summary: (event) => event.summary,
      item: (event) => ({ itemName: event.itemName }),
      key: (event) => `activity:${event.id}`,
    },
    production: {
      displayName: (job) => job.name,
      item: (job) => ({ itemName: job.name }),
    },
  };
  const enabledSettings = { marketListings: true, marketSales: true, production: true };
  const seeded = browserNotificationSourceDrafts(null, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: {
      refreshToken: 1,
      events: [
        { id: 2, event_type: "market_sale", summary: "Old sale", itemName: "Old Sale" },
        { id: 1, event_type: "market_new_listing", summary: "Old listing", itemName: "Old Listing" },
      ],
    },
    dealAlerts: {
      refreshToken: 1,
      alerts: [{ id: 1, itemName: "Old Hide", unitPrice: 5, discountPercent: 20, baselineAverage: 8, baselineWindowDays: 7 }],
    },
    productionCrafts: [{ entityId: "old-craft", name: "Old Beam", buildingName: "Workshop" }],
    hasProductionData: true,
  }, helpers);

  assert.equal(seeded.drafts.length, 0);

  const next = browserNotificationSourceDrafts(seeded.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: {
      refreshToken: 2,
      events: [
        { id: 4, event_type: "market_sale_confirmed", summary: "New sale", itemName: "New Sale" },
        { id: 3, event_type: "market_new_listing", summary: "New listing", itemName: "New Listing" },
        { id: 2, event_type: "market_sale", summary: "Old sale", itemName: "Old Sale" },
      ],
    },
    dealAlerts: {
      refreshToken: 2,
      alerts: [
        { id: 5, itemName: "New Hide", unitPrice: 4, discountPercent: 50, baselineAverage: 8, baselineWindowDays: 7 },
        { id: 1, itemName: "Old Hide", unitPrice: 5, discountPercent: 20, baselineAverage: 8, baselineWindowDays: 7 },
      ],
    },
    productionCrafts: [{ entityId: "new-craft", name: "New Beam", buildingName: "Workshop" }],
    hasProductionData: true,
  }, helpers);

  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), [
    "activity:3",
    "activity:4",
    "deal-alert:5",
    "production-started:claim-1:new-craft",
    "production-completed:claim-1:old-craft",
  ]);
  assert.deepEqual(next.drafts.map((draft) => draft.title), [
    "New market listing",
    "Market sale",
    "Market deal found",
    "Craft started",
    "Craft completed",
  ]);
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
