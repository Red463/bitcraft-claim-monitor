import { normalizeGameDataItemLists, normalizeGameDataResources } from "./itemProbability.mjs";

const GAME_DATA_RAW_ROOT = "https://raw.githubusercontent.com/BitCraftToolBox/BitCraft_GameData/cereal/cs/static";

export const GAME_DATA_ITEM_LISTS_URL = `${GAME_DATA_RAW_ROOT}/item_list_desc.json`;
export const GAME_DATA_RESOURCES_URL = `${GAME_DATA_RAW_ROOT}/resource_desc.json`;
export const GAME_DATA_SOURCE_URL = "https://github.com/BitCraftToolBox/BitCraft_GameData/tree/cereal/cs/static";

function sourceRevision(response, fallback) {
  return response?.headers?.get?.("etag")
    ?? response?.headers?.get?.("last-modified")
    ?? fallback;
}

async function fetchJsonArray(fetchImpl, url, label, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: { "user-agent": "BitCraft Claim Monitor probability catalogue" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response?.ok) throw new Error(`GameData ${label} request failed with HTTP ${response?.status ?? "unknown"}.`);
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`GameData ${label} payload must be a non-empty array.`);
  }
  return { payload, revision: sourceRevision(response, "revision-unavailable") };
}

export async function fetchGameDataProbabilitySnapshot({
  fetchImpl = fetch,
  timeoutMs = 120_000,
  updatedAt = new Date().toISOString(),
  itemListsUrl = GAME_DATA_ITEM_LISTS_URL,
  resourcesUrl = GAME_DATA_RESOURCES_URL,
  sourceUrl = GAME_DATA_SOURCE_URL,
} = {}) {
  const [itemListsSource, resourcesSource] = await Promise.all([
    fetchJsonArray(fetchImpl, itemListsUrl, "item lists", timeoutMs),
    fetchJsonArray(fetchImpl, resourcesUrl, "resources", timeoutMs),
  ]);
  const itemLists = normalizeGameDataItemLists(itemListsSource.payload);
  const resources = normalizeGameDataResources(resourcesSource.payload);
  if (itemLists.length === 0) throw new Error("GameData item lists normalization produced no rows.");
  if (resources.length === 0) throw new Error("GameData resources normalization produced no rows.");
  return {
    itemLists,
    resources,
    sourceUrl,
    sourceRevision: `item-lists:${itemListsSource.revision} | resources:${resourcesSource.revision}`,
    sources: [
      { sourceKind: "game_data_item_lists", sourceUrl: itemListsUrl, sourceRevision: itemListsSource.revision },
      { sourceKind: "game_data_resources", sourceUrl: resourcesUrl, sourceRevision: resourcesSource.revision },
    ],
    updatedAt,
  };
}
