import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_DATA_ITEM_LISTS_URL,
  GAME_DATA_RESOURCES_URL,
  fetchGameDataProbabilitySnapshot,
} from "../src/server/gameDataProbabilitySource.mjs";

function response(payload, { ok = true, status = 200, etag = null } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => name.toLowerCase() === "etag" ? etag : null },
    json: async () => payload,
  };
}

test("hybrid probability fetch validates both GameData files and records their revisions", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === GAME_DATA_ITEM_LISTS_URL) return response([{ id: 1, possibilities: [{ probability: 1, items: [] }] }], { etag: "lists-1" });
    if (url === GAME_DATA_RESOURCES_URL) return response([{ id: 2, name: "Bush", max_health: 10, on_destroy_yield: [] }], { etag: "resources-1" });
    throw new Error(`Unexpected URL ${url}`);
  };

  const snapshot = await fetchGameDataProbabilitySnapshot({ fetchImpl, updatedAt: "2026-07-21T12:00:00.000Z" });
  assert.deepEqual(new Set(calls), new Set([GAME_DATA_ITEM_LISTS_URL, GAME_DATA_RESOURCES_URL]));
  assert.equal(snapshot.itemLists.length, 1);
  assert.equal(snapshot.resources.length, 1);
  assert.equal(snapshot.sourceRevision, "item-lists:lists-1 | resources:resources-1");
  assert.equal(snapshot.updatedAt, "2026-07-21T12:00:00.000Z");
  assert.deepEqual(snapshot.sources, [
    { sourceKind: "game_data_item_lists", sourceUrl: GAME_DATA_ITEM_LISTS_URL, sourceRevision: "lists-1" },
    { sourceKind: "game_data_resources", sourceUrl: GAME_DATA_RESOURCES_URL, sourceRevision: "resources-1" },
  ]);
});

test("hybrid probability fetch rejects an incomplete source instead of returning a partial snapshot", async () => {
  const fetchImpl = async (url) => url === GAME_DATA_ITEM_LISTS_URL
    ? response([{ id: 1, possibilities: [] }])
    : response({ error: "bad" });

  await assert.rejects(fetchGameDataProbabilitySnapshot({ fetchImpl }), /resources.*array/i);
});

test("hybrid probability fetch reports HTTP failures with the affected source", async () => {
  const fetchImpl = async (url) => url === GAME_DATA_ITEM_LISTS_URL
    ? response([], { ok: false, status: 503 })
    : response([]);

  await assert.rejects(fetchGameDataProbabilitySnapshot({ fetchImpl }), /item lists.*503/i);
});
