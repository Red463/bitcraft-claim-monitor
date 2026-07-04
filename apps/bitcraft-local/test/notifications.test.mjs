import assert from "node:assert/strict";
import test from "node:test";

import {
  dealAlertToastDraft,
  dealAlertQueueToastDrafts,
  marketActivityToastDraft,
  marketActivityQueueToastDrafts,
  productionActivityToastDraft,
  productionCraftToastDraft,
  productionCraftQueueToastDrafts,
  selectUnseenNotificationItems,
} from "../src/notifications/notificationSources.ts";
import { browserNotificationSourceDrafts } from "../src/notifications/browserNotificationSourceQueue.ts";
import {
  appendNotificationLog,
  appendToastStack,
  claimNotificationSourceKey,
  createToastNotice,
  dedupeNotifications,
  formatToastMetaLine,
  markNotificationsRead,
  notificationDedupeKey,
} from "../src/notifications/toastNotices.ts";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

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
    metaLabel: "Mosswick",
    soundType: "dealAlerts",
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
    metaLabel: "Mosswick",
    soundType: "dealAlerts",
  });
  assert.equal(productionNotice.destination, "production");
  assert.equal(productionNotice.read, false);
  assert.equal(productionNotice.item, null);
});

test("formatToastMetaLine formats notification labels and local time", () => {
  const productionNotice = createToastNotice({
    id: "notice-1",
    title: "Craft completed",
    body: "Fine Plank by Modular at Carpentry Station",
    kind: "production",
    occurredAt: "2026-07-03T14:14:00",
    metaLabel: "Modular",
  });
  const productionWithoutCrafter = createToastNotice({
    id: "notice-2",
    title: "Craft completed",
    body: "Fine Plank at Settlement production",
    kind: "production",
    occurredAt: "2026-07-03T14:14:00",
  });
  const marketNotice = createToastNotice({
    id: "notice-3",
    title: "Market sale",
    body: "Fine Plank sold",
    kind: "market",
    occurredAt: "2026-07-03T14:14:00",
    metaLabel: "Mosswick",
  });

  assert.equal(formatToastMetaLine(productionNotice, { now: "2026-07-03T14:20:00.000Z" }), "Modular - 14:14");
  assert.equal(formatToastMetaLine(productionWithoutCrafter, { now: "2026-07-03T14:20:00.000Z" }), "14:14");
  assert.equal(formatToastMetaLine(marketNotice, { now: "2026-07-03T14:20:00.000Z" }), "Mosswick - 14:14");
});

test("claimNotificationSourceKey suppresses duplicate source keys across tabs and prunes old claims", () => {
  const storage = memoryStorage({
    "claim-monitor.notifications.claims": JSON.stringify({
      "activity:old": "2026-07-03T08:00:00.000Z",
    }),
  });

  assert.equal(claimNotificationSourceKey("activity:new", {
    storage,
    nowMs: Date.parse("2026-07-03T10:00:00.000Z"),
    ttlMs: 60 * 60 * 1000,
  }), true);
  assert.equal(claimNotificationSourceKey("activity:new", {
    storage,
    nowMs: Date.parse("2026-07-03T10:01:00.000Z"),
    ttlMs: 60 * 60 * 1000,
  }), false);

  const claims = JSON.parse(storage.getItem("claim-monitor.notifications.claims"));
  assert.equal(Object.prototype.hasOwnProperty.call(claims, "activity:new"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(claims, "activity:old"), false);
  assert.equal(claimNotificationSourceKey("", { storage }), true);
});
test("marketActivityToastDraft respects listing and sale settings", () => {
  const listing = {
    id: 42,
    event_type: "market_new_listing",
    occurred_at: "2026-06-28T10:00:00.000Z",
    summary: "New market listing: Oak Plank",
    metadata_json: JSON.stringify({ itemName: "Oak Plank", itemId: 12, itemType: 0, tier: 2, owner: "Modular" }),
  };
  const sale = {
    id: 43,
    event_type: "market_sale_confirmed",
    occurredAt: "2026-06-28T10:05:00.000Z",
    summary: "Market sale confirmed: Oak Plank",
    metadataJson: JSON.stringify({ itemName: "Oak Plank", itemId: 12, itemType: 0, tier: 2, owner: "Mosswick" }),
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
    metaLabel: "Modular",
    soundType: "marketListings",
  });
  assert.deepEqual(marketActivityToastDraft(sale, settings, helpers), {
    title: "Market sale",
    body: "Market sale confirmed: Oak Plank",
    kind: "market",
    occurredAt: "2026-06-28T10:05:00.000Z",
    item: { itemName: "Oak Plank" },
    sourceKey: "activity:43",
    metaLabel: "Mosswick",
    soundType: "marketSales",
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
  assert.deepEqual([...seeded.snapshot.knownIds], ["activity:2", "activity:1"]);

  const next = marketActivityQueueToastDrafts(seeded.snapshot, "claim-1", [
    { id: 5, event_type: "market_sale_confirmed", summary: "New sale", itemName: "New Sale" },
    { id: 4, eventType: "market_new_listing", summary: "New listing", itemName: "New Listing" },
    { id: 3, event_type: "storage", summary: "Ignored storage", itemName: "Storage" },
    { id: 2, event_type: "market_sale", summary: "Old sale", itemName: "Old Sale" },
  ], { marketListings: true, marketSales: true }, helpers);
  assert.equal(next.seeded, false);
  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), ["activity:4", "activity:5"]);
  assert.deepEqual(next.drafts.map((draft) => draft.title), ["New market listing", "Market sale"]);
  assert.deepEqual([...next.snapshot.knownIds], ["activity:2", "activity:1", "activity:5", "activity:4"]);

  const changedClaim = marketActivityQueueToastDrafts(next.snapshot, "claim-2", [
    { id: 7, event_type: "market_new_listing", summary: "Claim two listing", itemName: "Other" },
  ], { marketListings: true, marketSales: true }, helpers);
  assert.equal(changedClaim.seeded, true);
  assert.deepEqual(changedClaim.drafts, []);
  assert.equal(changedClaim.snapshot.claimId, "claim-2");
});


test("marketActivityQueueToastDrafts uses stable source keys for activity rows without ids", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: event.itemName }),
    key: (event) => event.source_key ?? `activity:${event.id}`,
  };
  const result = marketActivityQueueToastDrafts({ claimId: "claim-1", knownIds: new Set(["activity:old"]) }, "claim-1", [
    { source_key: "activity:new-listing", event_type: "market_new_listing", summary: "New listing", itemName: "New Listing" },
    { source_key: "activity:new-sale", event_type: "market_sale", summary: "New sale", itemName: "New Sale" },
  ], { marketListings: true, marketSales: true }, helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["activity:new-sale", "activity:new-listing"]);
  assert.deepEqual([...result.snapshot.knownIds], ["activity:old", "activity:new-listing", "activity:new-sale"]);
});
test("marketActivityQueueToastDrafts records disabled market events without replaying them later", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: event.itemName }),
    key: (event) => `activity:${event.id}`,
  };
  const previous = { claimId: "claim-1", knownIds: new Set(["activity:1"]) };
  const result = marketActivityQueueToastDrafts(previous, "claim-1", [
    { id: 3, event_type: "market_sale", summary: "Sale enabled", itemName: "Sale" },
    { id: 2, event_type: "market_new_listing", summary: "Listing disabled", itemName: "Listing" },
  ], { marketListings: false, marketSales: true }, helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["activity:3"]);
  assert.deepEqual([...result.snapshot.knownIds], ["activity:1", "activity:3", "activity:2"]);
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

test("dealAlertQueueToastDrafts ignores deal alerts without stable ids", () => {
  const result = dealAlertQueueToastDrafts(new Set(["1"]), [
    { itemName: "Missing Id Hide", unitPrice: 4, discountPercent: 40, baselineAverage: 8, baselineWindowDays: 7 },
    { id: "", itemName: "Empty Id Hide", unitPrice: 4, discountPercent: 40, baselineAverage: 8, baselineWindowDays: 7 },
    { id: 2, itemName: "Valid Hide", unitPrice: 3, discountPercent: 50, baselineAverage: 8, baselineWindowDays: 7 },
  ]);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["deal-alert:2"]);
  assert.deepEqual([...result.knownIds], ["1", "2"]);
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
    sellerName: "MarketSeller",
  });

  const fallbackDraft = dealAlertToastDraft({
    id: 8,
    itemName: "Iron Ore",
    unitPrice: 3,
    marketClaimName: "Timbersteel Trade",
    discountPercent: 30,
    baselineAverage: 5,
    baselineWindowDays: 7,
    createdAt: "2026-06-28T11:05:00.000Z",
  });

  assert.equal(fallbackDraft.metaLabel, "Iron Ore");
  assert.deepEqual(draft, {
    title: "Market deal found",
    body: "Leather: 6g at Timbersteel Trade (40% below 10g 7-day average)",
    kind: "market",
    item: { name: "Leather", itemName: "Leather", tier: 2, rarity: "Common", iconAssetName: "leather.png" },
    occurredAt: "2026-06-28T11:00:00.000Z",
    sourceKey: "deal-alert:7",
    metaLabel: "MarketSeller",
    soundType: "dealAlerts",
  });
});
test("productionActivityToastDraft formats production activity with crafter, building, and event time", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: (event) => ({ itemName: JSON.parse(event.metadata_json).itemName, iconAssetName: JSON.parse(event.metadata_json).iconAssetName }),
    key: (event) => event.source_key,
  };
  const event = {
    event_type: "production_completed",
    source_key: "production_completed:craft-1",
    summary: "Craft completed: Fine Cloth",
    occurred_at: "2026-07-03T10:42:00.000Z",
    metadata_json: JSON.stringify({ itemName: "Fine Cloth", iconAssetName: "fine_cloth.png", crafterName: "Mosswick", buildingName: "Tailoring Station" }),
  };

  assert.deepEqual(productionActivityToastDraft(event, { production: true }, helpers), {
    title: "Craft completed",
    body: "Fine Cloth by Mosswick at Tailoring Station",
    kind: "production",
    occurredAt: "2026-07-03T10:42:00.000Z",
    metaLabel: "Mosswick",
    item: { itemName: "Fine Cloth", iconAssetName: "fine_cloth.png" },
    sourceKey: "production_completed:craft-1",
    soundType: "productionCompleted",
  });
});
test("productionActivityToastDraft uses the craft metadata key for source dedupe", () => {
  const helpers = {
    summary: (event) => event.summary,
    item: () => null,
    key: (event) => event.source_key ?? `activity:${event.id}`,
  };
  const event = {
    id: 42,
    event_type: "production_started",
    source_key: "",
    summary: "Craft started: Simple Plank",
    occurred_at: "2026-07-04T08:43:00.000Z",
    metadata_json: JSON.stringify({ key: "craft-1", label: "Simple Plank", crafterName: "Mosswick", buildingName: "Exquisite Carpentry Station" }),
  };

  const draft = productionActivityToastDraft(event, { production: true }, helpers);

  assert.equal(draft.sourceKey, "production_started:craft-1");
});
test("productionCraftToastDraft builds started and completed notices", () => {
  const job = { entityId: "craft-1", buildingName: "Carpentry Station", crafterName: "Modular", recipeId: "recipe-1" };
  const helpers = {
    displayName: () => "Fine Plank",
    item: () => ({ itemName: "Fine Plank", tier: 4 }),
  };

  assert.deepEqual(productionCraftToastDraft("started", "claim-1", "craft-1", job, helpers, "2026-07-03T09:58:00.000Z"), {
    title: "Craft started",
    body: "Fine Plank by Modular at Carpentry Station",
    kind: "production",
    item: { itemName: "Fine Plank", tier: 4 },
    occurredAt: "2026-07-03T09:58:00.000Z",
    metaLabel: "Modular",
    sourceKey: "production_started:craft-1",
    soundType: "productionStarted",
  });
  assert.deepEqual(productionCraftToastDraft("completed", "claim-1", "craft-1", job, helpers, "2026-07-03T10:42:00.000Z"), {
    title: "Craft completed",
    body: "Fine Plank by Modular at Carpentry Station",
    kind: "production",
    item: { itemName: "Fine Plank", tier: 4 },
    occurredAt: "2026-07-03T10:42:00.000Z",
    metaLabel: "Modular",
    sourceKey: "production_completed:craft-1",
    soundType: "productionCompleted",
  });
});

test("productionCraftToastDraft omits missing crafter and falls back to settlement production", () => {
  const helpers = {
    displayName: () => "Simple Plank",
    item: () => null,
  };

  const draft = productionCraftToastDraft("started", "claim-1", "craft-1", { entityId: "craft-1" }, helpers, "2026-07-03T09:58:00.000Z");
  assert.equal(draft.body, "Simple Plank at Settlement production");
  assert.equal(Object.prototype.hasOwnProperty.call(draft, "metaLabel"), false);
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


test("productionCraftQueueToastDrafts falls back when craft ids are blank", () => {
  const helpers = {
    displayName: (job) => job.name,
    item: (job) => ({ itemName: job.name }),
  };
  const initial = productionCraftQueueToastDrafts(null, "claim-1", [
    { entityId: "", id: " ", craftId: "", buildingName: "Workshop", recipeId: "recipe-1", itemId: "item-1", name: "Old Beam" },
  ], helpers);

  assert.deepEqual([...initial.snapshot.jobs.keys()], ["Workshop-recipe-1"]);

  const next = productionCraftQueueToastDrafts(initial.snapshot, "claim-1", [
    { entityId: "", id: " ", craftId: "", buildingName: "Workshop", recipeId: "recipe-2", itemId: "item-2", name: "New Beam" },
  ], helpers);

  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), [
    "production_started:Workshop-recipe-2",
    "production_completed:Workshop-recipe-1",
  ]);
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
    "production_started:new-1",
    "production_started:new-2",
    "production_completed:old-1",
    "production_completed:old-3",
  ]);
  assert.deepEqual(result.drafts.map((draft) => draft.title), ["Craft started", "Craft started", "Craft completed", "Craft completed"]);
  assert.deepEqual([...result.snapshot.jobs.keys()], ["old-2", "new-1", "new-2", "new-3"]);
});
test("productionCraftQueueToastDrafts keeps resolved item metadata for completed fallback toasts", () => {
  const catalog = new Set(["Fine Cloth"]);
  const helpers = {
    displayName: (job) => job.name,
    item: (job) => catalog.has(job.name) ? ({ itemName: job.name, iconAssetName: `${job.name}.png` }) : null,
  };
  const initial = productionCraftQueueToastDrafts(null, "claim-1", [
    { entityId: "old-1", name: "Fine Cloth", buildingName: "Tailoring Station" },
  ], helpers);
  catalog.clear();

  const completed = productionCraftQueueToastDrafts(initial.snapshot, "claim-1", [], helpers);

  assert.deepEqual(completed.drafts[0].item, { itemName: "Fine Cloth", iconAssetName: "Fine Cloth.png" });
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
    "production_started:new-craft",
  ]);
  assert.deepEqual(next.drafts.map((draft) => draft.title), [
    "New market listing",
    "Market sale",
    "Market deal found",
    "Craft started",
  ]);
});


test("browserNotificationSourceDrafts does not emit browser fallback completions when activity feed is available", () => {
  const helpers = {
    activity: {
      summary: (event) => event.summary,
      item: (event) => ({ itemName: event.itemName }),
      key: (event) => event.source_key ?? `activity:${event.id}`,
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
    notificationActivity: { refreshToken: 1, events: [] },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [{ entityId: "old-craft", name: "Craft", buildingName: "Scholar Station", crafterName: "Modular" }],
    hasProductionData: true,
  }, helpers);

  const next = browserNotificationSourceDrafts(seeded.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 2, events: [] },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: true,
  }, helpers);

  assert.deepEqual(next.drafts, []);
});

test("browserNotificationSourceDrafts surfaces fresh production activity on the first fetch", () => {
  const helpers = {
    activity: {
      summary: (event) => event.summary,
      item: (event) => ({ itemName: event.itemName }),
      key: (event) => event.source_key ?? `activity:${event.id}`,
    },
    production: {
      displayName: (job) => job.name,
      item: (job) => ({ itemName: job.name }),
    },
  };
  const enabledSettings = { marketListings: true, marketSales: true, production: true };
  const result = browserNotificationSourceDrafts(null, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: {
      refreshToken: 1,
      events: [
        { id: 2, event_type: "production_started", summary: "Craft started: Fresh Starbulb Products", itemName: "Fresh Starbulb Products", occurred_at: new Date(Date.now() - 60_000).toISOString() },
        { id: 1, event_type: "production_started", summary: "Craft started: Old Beam", itemName: "Old Beam", occurred_at: new Date(Date.now() - 60 * 60_000).toISOString() },
      ],
    },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["activity:2"]);
  assert.deepEqual(result.drafts.map((draft) => draft.title), ["Craft started"]);
  assert.equal(result.drafts[0].kind, "production");
});

test("browserNotificationSourceDrafts surfaces fresh market activity on the first fetch", () => {
  const helpers = {
    activity: {
      summary: (event) => event.summary,
      item: (event) => ({ itemName: event.itemName }),
      key: (event) => event.source_key ?? `activity:${event.id}`,
    },
    production: {
      displayName: (job) => job.name,
      item: (job) => ({ itemName: job.name }),
    },
  };
  const enabledSettings = { marketListings: true, marketSales: true, production: true };
  const result = browserNotificationSourceDrafts(null, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: {
      refreshToken: 1,
      events: [
        { id: 3, event_type: "market_new_listing", summary: "New market listing: Fresh Plank", itemName: "Fresh Plank", occurred_at: new Date(Date.now() - 60_000).toISOString() },
        { id: 2, event_type: "market_sale", summary: "Market sale: Recent sale", itemName: "Recent Sale", occurred_at: new Date(Date.now() - 90_000).toISOString() },
        { id: 1, event_type: "market_new_listing", summary: "New market listing: Old Beam", itemName: "Old Beam", occurred_at: new Date(Date.now() - 60 * 60_000).toISOString() },
      ],
    },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(result.drafts.map((draft) => draft.sourceKey), ["activity:2", "activity:3"]);
  assert.deepEqual(result.drafts.map((draft) => draft.title), ["Market sale", "New market listing"]);
  assert.equal(result.drafts[1].kind, "market");
});
test("browserNotificationSourceDrafts queues production activity rows without current craft payload", () => {
  const helpers = {
    activity: {
      summary: (event) => event.summary,
      item: (event) => ({ itemName: event.itemName }),
      key: (event) => event.source_key ?? `activity:${event.id}`,
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
        { id: 1, event_type: "production_started", source_key: "production_started:old-craft", summary: "Craft started: Old Beam", itemName: "Old Beam" },
      ],
    },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.equal(seeded.drafts.length, 0);

  const next = browserNotificationSourceDrafts(seeded.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: {
      refreshToken: 2,
      events: [
        { id: 2, event_type: "production_started", source_key: "production_started:new-craft", summary: "Craft started: New Beam", itemName: "New Beam" },
        { id: 1, event_type: "production_started", source_key: "production_started:old-craft", summary: "Craft started: Old Beam", itemName: "Old Beam" },
      ],
    },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(next.drafts.map((draft) => draft.sourceKey), ["production_started:new-craft"]);
  assert.deepEqual(next.drafts.map((draft) => draft.title), ["Craft started"]);
  assert.equal(next.drafts[0].kind, "production");
});
test("browserNotificationSourceDrafts scopes deal-alert dedupe to the signed-in user", () => {
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
  const userA = browserNotificationSourceDrafts(null, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 1,
      userKey: "discord-a",
      alerts: [{ id: 2, itemName: "User A Hide", unitPrice: 5, discountPercent: 20, baselineAverage: 8, baselineWindowDays: 7 }],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  const userBBaseline = browserNotificationSourceDrafts(userA.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 2,
      userKey: "discord-b",
      alerts: [{ id: 1, itemName: "User B Old Hide", unitPrice: 6, discountPercent: 20, baselineAverage: 9, baselineWindowDays: 7 }],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(userBBaseline.drafts, []);

  const userBNext = browserNotificationSourceDrafts(userBBaseline.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 3,
      userKey: "discord-b",
      alerts: [
        { id: 2, itemName: "User B New Hide", unitPrice: 4, discountPercent: 45, baselineAverage: 8, baselineWindowDays: 7 },
        { id: 1, itemName: "User B Old Hide", unitPrice: 6, discountPercent: 20, baselineAverage: 9, baselineWindowDays: 7 },
      ],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(userBNext.drafts.map((draft) => draft.sourceKey), ["deal-alert:2"]);
  assert.equal(userBNext.drafts[0].body.includes("User B New Hide"), true);
});

test("browserNotificationSourceDrafts records disabled deal alerts without replaying them later", () => {
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
  const marketDisabledSettings = { marketListings: false, marketSales: false, production: true };
  const seeded = browserNotificationSourceDrafts(null, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 1,
      alerts: [{ id: 1, itemName: "Old Hide", unitPrice: 5, discountPercent: 20, baselineAverage: 8, baselineWindowDays: 7 }],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  const disabled = browserNotificationSourceDrafts(seeded.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: marketDisabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 2,
      alerts: [
        { id: 2, itemName: "Suppressed Hide", unitPrice: 4, discountPercent: 40, baselineAverage: 8, baselineWindowDays: 7 },
        { id: 1, itemName: "Old Hide", unitPrice: 5, discountPercent: 20, baselineAverage: 8, baselineWindowDays: 7 },
      ],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(disabled.drafts, []);

  const reenabled = browserNotificationSourceDrafts(disabled.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: {
      refreshToken: 3,
      alerts: [
        { id: 3, itemName: "New Hide", unitPrice: 3, discountPercent: 50, baselineAverage: 8, baselineWindowDays: 7 },
        { id: 2, itemName: "Suppressed Hide", unitPrice: 4, discountPercent: 40, baselineAverage: 8, baselineWindowDays: 7 },
      ],
    },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  assert.deepEqual(reenabled.drafts.map((draft) => draft.sourceKey), ["deal-alert:3"]);
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

test("browserNotificationSourceDrafts preserves production snapshot when the current page has no craft payload", () => {
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
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [{ entityId: "old-craft", name: "Old Beam", buildingName: "Workshop" }],
    hasProductionData: true,
  }, helpers);

  const noCraftPayloadPage = browserNotificationSourceDrafts(seeded.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [],
    hasProductionData: false,
  }, helpers);

  const refreshedProductionPage = browserNotificationSourceDrafts(noCraftPayloadPage.snapshots, {
    claimId: "claim-1",
    appToastSettings: enabledSettings,
    userToastSettings: enabledSettings,
    notificationActivity: { refreshToken: 0, events: [] },
    dealAlerts: { refreshToken: 0, alerts: [] },
    productionCrafts: [
      { entityId: "old-craft", name: "Old Beam", buildingName: "Workshop" },
      { entityId: "new-craft", name: "New Beam", buildingName: "Workshop" },
    ],
    hasProductionData: true,
  }, helpers);

  assert.deepEqual(noCraftPayloadPage.drafts, []);
  assert.deepEqual([...noCraftPayloadPage.snapshots.production.jobs.keys()], ["old-craft"]);
  assert.deepEqual(refreshedProductionPage.drafts.map((draft) => draft.sourceKey), ["production_started:new-craft"]);
});

