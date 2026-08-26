import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

import {
  discoverRelayTopology,
  RelayGlobalCatalogSession,
} from "../dist-server/game-data/index.js";
import { buildWorkstationPresets } from "../src/server/craftPlanWorkstationPresets.mjs";
import { createProviderCatalogRepository } from "../src/server/catalogRepository.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { gameIconUrl } from "../src/utils/gameAssets.mjs";

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
  if (snapshot.foundryWarnings.length) {
    throw new Error(
      `Relay global Empire Foundry rows were malformed: ${snapshot.foundryWarnings.join("; ")}`,
    );
  }
  const foundryCapsules = snapshot.foundries.reduce(
    (total, row) => total + BigInt(row.hexiteCapsules),
    0n,
  ).toString();
  const entityIconUrls = snapshot.entities
    .map((entity) => gameIconUrl(entity))
    .filter(Boolean);
  const uniqueEntityIconUrls = new Set(entityIconUrls);
  const missingEntityIconCount = snapshot.entities.length - entityIconUrls.length;
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
  const verificationDb = new DatabaseSync(":memory:");
  applySchemaBootstrap(verificationDb);
  verificationDb.exec("PRAGMA foreign_keys = ON;");
  const repository = createProviderCatalogRepository(verificationDb);
  const applyStartedAt = performance.now();
  repository.replaceCatalogSnapshot({
    entities: snapshot.entities,
    descriptions: snapshot.descriptions,
  }, {
    provider: "relay",
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    generation: snapshot.generation,
    receivedAt: snapshot.receivedAt,
  });
  const applyDurationMs = Math.round((performance.now() - applyStartedAt) * 100) / 100;
  const projectionCounts = Object.fromEntries([
    "game_catalog_recipes",
    "game_catalog_item_lists",
    "game_catalog_resources",
    "game_catalog_effort_weights",
  ].map((table) => [
    table,
    Number(verificationDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count),
  ]));
  if (
    projectionCounts.game_catalog_recipes === 0
    || projectionCounts.game_catalog_item_lists !== descriptionCounts.item_list
    || projectionCounts.game_catalog_resources !== descriptionCounts.resource
    || projectionCounts.game_catalog_effort_weights === 0
  ) {
    throw new Error(`Relay live catalog projection was incomplete: ${JSON.stringify(projectionCounts)}`);
  }
  const integrity = verificationDb.prepare("PRAGMA quick_check").get().quick_check;
  if (integrity !== "ok") throw new Error(`Relay live catalog projection failed quick_check: ${integrity}`);
  verificationDb.close();
  console.log(JSON.stringify({
    ok: true,
    uri: relayUrl.origin,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    receivedAt: snapshot.receivedAt,
    itemCount,
    cargoCount,
    uniqueEntityIconCount: uniqueEntityIconUrls.size,
    missingEntityIconCount,
    sharedEntityIconCount: entityIconUrls.length - uniqueEntityIconUrls.size,
    sampleEntityIconUrls: [...uniqueEntityIconUrls].slice(0, 5),
    empireFoundryCount: snapshot.foundries.length,
    completedFoundryCapsules: foundryCapsules,
    descriptionCounts,
    workstationPresetCount: workstationPresets.length,
    workstationCount,
    projectionCounts,
    applyDurationMs,
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
