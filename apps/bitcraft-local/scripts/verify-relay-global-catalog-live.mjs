import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  RelayGlobalCatalogSession,
} from "../dist-server/game-data/index.js";
import { buildWorkstationPresets } from "../src/server/craftPlanWorkstationPresets.mjs";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_GLOBAL_VERIFY_TIMEOUT_MS ?? 45_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

const topology = await discoverRelayTopology(relayBaseUrl);
if (!topology.global?.ready) {
  throw new Error("Relay global source is not ready");
}
if (!topology.global.schemaFingerprint) {
  throw new Error("Relay global source did not publish a schema fingerprint");
}

const relayUrl = new URL(relayBaseUrl);
relayUrl.protocol = relayUrl.protocol === "https:" ? "wss:" : "ws:";
relayUrl.port = String(topology.global.port);
relayUrl.pathname = "/";
relayUrl.search = "";
relayUrl.hash = "";

let session;
let timeout;
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      const health = session?.health();
      reject(new Error(
        `Timed out waiting for Relay global catalog snapshot after ${timeoutMs}ms`
        + (health?.lastError ? `: ${health.lastError}` : ""),
      ));
    }, timeoutMs);

    session = new RelayGlobalCatalogSession({
      onSnapshot: resolve,
    });
    void session.start({
      uri: relayUrl.href.replace(/\/$/, ""),
      database: topology.global.database,
      schemaFingerprint: topology.global.schemaFingerprint,
      manifest,
      generation: 1,
    }).catch(reject);
  });

  const itemCount = snapshot.entities.filter(({ kind }) => kind === "item").length;
  const cargoCount = snapshot.entities.filter(({ kind }) => kind === "cargo").length;
  if (!itemCount || !cargoCount) {
    throw new Error(
      `Relay catalog snapshot was incomplete: ${itemCount} items, ${cargoCount} cargo`,
    );
  }
  const descriptionCounts = Object.fromEntries(
    Object.entries(snapshot.descriptions).map(([kind, rows]) => [kind, rows.length]),
  );
  const emptyDescriptionKinds = Object.entries(descriptionCounts)
    .filter(([, count]) => count === 0)
    .map(([kind]) => kind);
  if (emptyDescriptionKinds.length) {
    throw new Error(
      `Relay catalog description tables were unexpectedly empty: ${emptyDescriptionKinds.join(", ")}`,
    );
  }
  const workstationPresets = buildWorkstationPresets({
    buildings: snapshot.descriptions.building,
  });
  const constructionRecipeBuildingIds = new Set(
    snapshot.descriptions.construction_recipe
      .map((recipe) => String(recipe.buildingDescriptionId ?? "")),
  );
  const workstationCount = workstationPresets
    .reduce((total, preset) => total + preset.workstations.length, 0);
  const missingWorkstationRecipeIds = workstationPresets
    .flatMap((preset) => preset.workstations)
    .map((workstation) => String(workstation.id))
    .filter((buildingId) => !constructionRecipeBuildingIds.has(buildingId));
  if (!workstationCount || missingWorkstationRecipeIds.length) {
    throw new Error(
      `Relay workstation catalog join was incomplete: ${workstationCount} workstations, `
      + `${missingWorkstationRecipeIds.length} missing construction recipes`
      + (missingWorkstationRecipeIds.length
        ? ` (${missingWorkstationRecipeIds.slice(0, 10).join(", ")})`
        : ""),
    );
  }
  console.log(JSON.stringify({
    ok: true,
    uri: relayUrl.origin,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    receivedAt: snapshot.receivedAt,
    itemCount,
    cargoCount,
    descriptionCounts,
    workstationPresetCount: workstationPresets.length,
    workstationCount,
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
