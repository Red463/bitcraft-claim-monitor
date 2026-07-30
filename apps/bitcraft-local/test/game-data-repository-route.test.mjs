import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const { applySchemaBootstrap } = await import(
  new URL("../src/server/schemaBootstrap.mjs", import.meta.url).href,
);
const { applyAdditiveColumnMigrations } = await import(
  new URL("../src/server/schemaMigrations.mjs", import.meta.url).href,
);
const { createCurrentStateRepository } = await import(
  new URL("../src/server/game-data/currentStateRepository.ts", import.meta.url).href,
);
const { gameDataResponse } = await import(
  new URL("../src/server/game-data/gameDataRoute.ts", import.meta.url).href,
);

function relayProvenance(receivedAt, sourceObservedAt = receivedAt) {
  return {
    provider: "relay",
    sourceKey: "relay-cache",
    regionId: "19",
    database: null,
    schemaFingerprint: null,
    sourceObservedAt,
    receivedAt,
  };
}

test("generation commit atomically replaces only the submitted domains", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const repository = createCurrentStateRepository(db);

  await repository.commitGeneration({
    claimId: "1369094286777412590",
    generation: 1,
    domains: {
      claim: {
        data: { entityId: "1369094286777412590", name: "First", regionId: "19" },
        confidence: "joined",
        provenance: relayProvenance("2026-07-29T10:00:00.000Z"),
        warnings: [],
      },
      members: {
        data: [{ playerEntityId: "1", userName: "First member" }],
        confidence: "joined",
        provenance: relayProvenance("2026-07-29T10:00:00.000Z"),
        warnings: [],
      },
    },
  });
  await repository.commitGeneration({
    claimId: "1369094286777412590",
    generation: 2,
    domains: {
      claim: {
        data: { entityId: "1369094286777412590", name: "Second", regionId: "19" },
        confidence: "joined",
        provenance: relayProvenance("2026-07-29T10:01:00.000Z"),
        warnings: [],
      },
    },
  });

  assert.equal(repository.read("1369094286777412590", "claim").generation, 2);
  assert.equal(repository.read("1369094286777412590", "claim").data.name, "Second");
  assert.equal(repository.read("1369094286777412590", "members").generation, 1);
  assert.equal(repository.read("1369094286777412590", "members").data[0].userName, "First member");
  assert.equal(repository.nextGeneration("1369094286777412590"), 3);
  db.close();
});

test("repository resumes generations after a process restart", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const firstProcess = createCurrentStateRepository(db);
  await firstProcess.commitGeneration({
    claimId: "1369094286777412590",
    generation: 41,
    domains: {
      claim: {
        data: { entityId: "1369094286777412590", regionId: "19" },
        confidence: "joined",
        provenance: relayProvenance("2026-07-29T10:00:00.000Z"),
        warnings: [],
      },
    },
  });

  const restartedProcess = createCurrentStateRepository(db);
  assert.equal(restartedProcess.nextGeneration("1369094286777412590"), 42);
  db.close();
});

test("repository persists provider health for the separate web process", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const repository = createCurrentStateRepository(db);
  await repository.recordHealth({
    provider: "relay",
    running: true,
    topologyReady: true,
    cacheReady: true,
    generation: 9,
    lastRefreshAt: "2026-07-29T19:00:00.000Z",
    lastError: null,
    sources: {
      global: {
        ready: true,
        database: "relay-global",
        schemaFingerprint: "global-fingerprint",
      },
      "region:19": {
        ready: true,
        database: "relay-region-19",
        schemaFingerprint: "regional-fingerprint",
      },
    },
  }, "2026-07-29T19:00:01.000Z");

  assert.deepEqual(repository.readHealth(), {
    provider: "relay",
    running: true,
    topologyReady: true,
    cacheReady: true,
    generation: 9,
    lastRefreshAt: "2026-07-29T19:00:00.000Z",
    lastError: null,
    sources: {
      global: {
        ready: true,
        database: "relay-global",
        schemaFingerprint: "global-fingerprint",
      },
      "region:19": {
        ready: true,
        database: "relay-region-19",
        schemaFingerprint: "regional-fingerprint",
      },
    },
  });
  db.close();
});

test("game-data route rejects other claims and returns 503 before any requested domain has loaded", () => {
  const repository = { read: () => null };
  assert.deepEqual(gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "999",
    domains: ["claim"],
    repository,
    now: new Date("2026-07-29T11:00:00.000Z"),
  }), {
    status: 403,
    body: { error: "Requested claim is not the configured monitored claim." },
  });

  const unavailable = gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    domains: ["claim", "members"],
    repository,
    now: new Date("2026-07-29T11:00:00.000Z"),
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body.partialErrors, [
    "claim has not loaded yet.",
    "members has not loaded yet.",
  ]);
});

test("game-data route serves last-good data as stale with age and partial errors", () => {
  const rows = new Map([
    ["claim", {
      data: { entityId: "1369094286777412590", name: "Timbersteel Trade", regionId: "19" },
      confidence: "joined",
      generation: 4,
      lastError: "Relay HTTP 503",
      provenance: relayProvenance("2026-07-29T10:00:00.000Z"),
      warnings: [],
    }],
  ]);
  const result = gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    domains: ["claim", "members"],
    repository: { read: (_claimId, domain) => rows.get(domain) ?? null },
    now: new Date("2026-07-29T10:02:00.000Z"),
    freshForMs: 60_000,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.regionId, "19");
  assert.equal(result.body.domains.claim.freshness, "stale");
  assert.equal(result.body.domains.claim.ageMs, 120_000);
  assert.equal(result.body.domains.claim.data.name, "Timbersteel Trade");
  assert.deepEqual(result.body.partialErrors, [
    "claim: Relay HTTP 503",
    "members has not loaded yet.",
  ]);
});

test("game-data route surfaces partial-domain warnings to browser status", () => {
  const result = gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    domains: ["players"],
    repository: {
      read: () => ({
        data: [{ playerEntityId: "1", signedIn: false }],
        confidence: "partial",
        generation: 5,
        lastError: null,
        provenance: {
          ...relayProvenance("2026-07-29T20:45:00.000Z"),
          sourceKey: "region:19",
        },
        warnings: ["Regional player_state omitted member 1."],
      }),
    },
    now: new Date("2026-07-29T20:45:10.000Z"),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.partialErrors, [
    "players: Regional player_state omitted member 1.",
  ]);
});

test("game-data route composes requested domains through a provider-neutral local projection", () => {
  const result = gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    domains: ["inventories"],
    repository: {
      read: () => ({
        data: { buildings: [{ entityId: "1" }] },
        confidence: "joined",
        generation: 6,
        lastError: null,
        provenance: relayProvenance("2026-07-29T21:00:00.000Z"),
        warnings: [],
      }),
    },
    transformData: (domain, data) => ({
      ...data,
      projectedBy: domain,
    }),
    now: new Date("2026-07-29T21:00:01.000Z"),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.domains.inventories.data, {
    buildings: [{ entityId: "1" }],
    projectedBy: "inventories",
  });
});

test("game-data route surfaces projection warnings and partial confidence", () => {
  const result = gameDataResponse({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    domains: ["construction"],
    repository: {
      read: () => ({
        data: { projects: [{ entityId: "9", constructionRecipeId: "404" }] },
        confidence: "authoritative",
        generation: 7,
        lastError: null,
        provenance: relayProvenance("2026-07-29T21:00:00.000Z"),
        warnings: [],
      }),
    },
    transformDomain: (_domain, data) => ({
      data: { ...data, projects: [] },
      confidence: "partial",
      warnings: ["Construction project 9 is missing global recipe 404."],
    }),
    now: new Date("2026-07-29T21:00:01.000Z"),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.domains.construction.data, { projects: [] });
  assert.equal(result.body.domains.construction.confidence, "partial");
  assert.deepEqual(result.body.domains.construction.warnings, [
    "Construction project 9 is missing global recipe 404.",
  ]);
  assert.deepEqual(result.body.partialErrors, [
    "construction: Construction project 9 is missing global recipe 404.",
  ]);
});
