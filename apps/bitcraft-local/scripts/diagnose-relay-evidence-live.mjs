import {
  discoverRelayTopology,
  RelayHttpClient,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";
import { DbConnection } from "../dist-server/game-data/bindings/regional.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const claimId = String(
  process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590",
).trim();
const observationMs = Math.max(
  5_000,
  Number(process.env.RELAY_EVIDENCE_OBSERVATION_MS ?? 120_000),
);

function json(value) {
  return JSON.stringify(value, (_key, entry) => (
    typeof entry === "bigint" ? entry.toString() : entry
  ));
}

function decimal(value) {
  return String(value ?? "").trim();
}

function rows(table) {
  return Array.from(table.iter());
}

function eventEvidence(context) {
  const event = context?.event;
  if (!event || typeof event !== "object") return { tag: "unknown" };
  if (event.tag !== "Reducer") {
    return {
      tag: String(event.tag ?? "unknown"),
      id: event.id ?? null,
    };
  }
  return {
    tag: "Reducer",
    id: event.id ?? null,
    reducer: event.value?.reducer?.name ?? null,
    args: event.value?.reducer?.args ?? null,
    timestamp: event.value?.timestamp ?? null,
    outcome: event.value?.outcome?.tag ?? null,
  };
}

function emit(kind, value) {
  process.stdout.write(`${json({
    observedAt: new Date().toISOString(),
    kind,
    ...value,
  })}\n`);
}

const http = new RelayHttpClient({ baseUrl: relayBaseUrl });
const [topology, claimPayload, membersPayload, craftsPayload] = await Promise.all([
  discoverRelayTopology(relayBaseUrl),
  http.claim(claimId),
  http.members(claimId),
  http.crafts(claimId, false),
]);
const claim = claimPayload?.claim ?? claimPayload;
const regionId = decimal(claim?.region ?? claim?.region_id ?? claim?.regionId);
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error(`Relay region ${regionId || "(unknown)"} source is not ready`);
}

const members = Array.isArray(membersPayload?.members)
  ? membersPayload.members
  : Array.isArray(membersPayload)
    ? membersPayload
    : [];
const crafts = Array.isArray(craftsPayload?.crafts)
  ? craftsPayload.crafts
  : Array.isArray(craftsPayload)
    ? craftsPayload
    : [];
const memberIds = [...new Set(members.map((row) => decimal(
  row.player_entity_id ?? row.playerEntityId,
)).filter(Boolean))];
const craftIds = [...new Set(crafts.map((row) => decimal(
  row.entity_id ?? row.entityId,
)).filter(Boolean))];
if (!memberIds.length) throw new Error("Relay member fixture was empty");

const queries = [
  `SELECT * FROM sell_order_state WHERE claim_entity_id = ${claimId}`,
  `SELECT * FROM closed_listing_state WHERE claim_entity_id = ${claimId}`,
  "SELECT * FROM item_desc WHERE id = 1",
  ...memberIds.map((id) => (
    `SELECT * FROM player_action_state WHERE entity_id = ${id}`
  )),
  ...craftIds.map((id) => (
    `SELECT * FROM progressive_action_state WHERE entity_id = ${id}`
  )),
];

let connection;
let subscription;
let observationTimer;
let settled = false;
let resolveApplied;
let rejectApplied;
const applied = new Promise((resolve, reject) => {
  resolveApplied = resolve;
  rejectApplied = reject;
});

function matchingPlayerActions(db) {
  const craftSet = new Set(craftIds);
  return rows(db.playerActionState).filter((row) => (
    row.target != null && craftSet.has(decimal(row.target))
  ));
}

function attachListeners(db) {
  db.closedListingState.onInsert((context, row) => {
    emit("closed-listing-insert", {
      event: eventEvidence(context),
      row,
    });
  });
  db.closedListingState.onDelete((context, row) => {
    emit("closed-listing-delete", {
      event: eventEvidence(context),
      row,
    });
  });
  db.sellOrderState.onUpdate((context, previous, row) => {
    emit("sell-order-update", {
      event: eventEvidence(context),
      previous,
      row,
    });
  });
  db.sellOrderState.onDelete((context, row) => {
    emit("sell-order-delete", {
      event: eventEvidence(context),
      row,
    });
  });
  db.playerActionState.onInsert((context, row) => {
    if (row.target == null || !craftIds.includes(decimal(row.target))) return;
    emit("craft-player-action-insert", {
      event: eventEvidence(context),
      row,
    });
  });
  db.playerActionState.onUpdate((context, previous, row) => {
    const previousMatches = previous.target != null
      && craftIds.includes(decimal(previous.target));
    const currentMatches = row.target != null
      && craftIds.includes(decimal(row.target));
    if (!previousMatches && !currentMatches) return;
    emit("craft-player-action-update", {
      event: eventEvidence(context),
      previous,
      row,
    });
  });
  db.progressiveActionState.onUpdate((context, previous, row) => {
    emit("craft-progress-update", {
      event: eventEvidence(context),
      progressDelta: Number(row.progress) - Number(previous.progress),
      previous,
      row,
    });
  });
}

connection = DbConnection.builder()
  .withUri(relayWebSocketUri(relayBaseUrl, source.port))
  .withDatabaseName(source.database)
  .onConnect((connected) => {
    connection = connected;
    subscription = connected.subscriptionBuilder()
      .onApplied(() => {
        if (settled) return;
        settled = true;
        attachListeners(connected.db);
        emit("initial-snapshot", {
          claimId,
          regionId,
          database: source.database,
          schemaFingerprint: source.schemaFingerprint,
          memberIds,
          craftIds,
          sellOrders: rows(connected.db.sellOrderState),
          closedListings: rows(connected.db.closedListingState),
          itemOneDescriptions: rows(connected.db.itemDesc),
          progressiveActions: rows(connected.db.progressiveActionState),
          matchingPlayerActions: matchingPlayerActions(connected.db),
        });
        resolveApplied();
      })
      .onError((_context, error) => {
        if (!settled) {
          settled = true;
          rejectApplied(error);
        } else {
          emit("subscription-error", { error: String(error) });
        }
      })
      .subscribe(queries);
  })
  .onConnectError((_context, error) => {
    if (!settled) {
      settled = true;
      rejectApplied(error);
    }
  })
  .onDisconnect((_context, error) => {
    if (error) emit("disconnect", { error: String(error) });
  })
  .build();

try {
  await applied;
  await new Promise((resolve) => {
    observationTimer = setTimeout(resolve, observationMs);
  });
  emit("observation-complete", { observationMs });
} finally {
  clearTimeout(observationTimer);
  subscription?.unsubscribe();
  connection?.disconnect();
}
