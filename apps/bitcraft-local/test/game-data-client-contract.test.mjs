import assert from "node:assert/strict";
import test from "node:test";

import { loadGameData, loadGameDataWithPayloadBytes } from "../src/api/gameData.ts";
import { createPageNavigationCache } from "../src/api/pageNavigationCache.ts";

const claimProvenance = {
  provider: "relay",
  sourceKey: "relay-cache",
  regionId: "19",
  database: null,
  schemaFingerprint: null,
  sourceObservedAt: "2026-08-22T10:00:00.000Z",
  receivedAt: "2026-08-22T10:00:01.000Z",
};

function jsonFetcher(payload) {
  return async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("loadGameData preserves legacy fields and the complete requested-domain quality contract", async () => {
  const domainStatus = {
    claim: {
      generation: 8,
      freshness: "fresh",
      confidence: "joined",
      ageMs: 1_000,
      warnings: [],
      provenance: claimProvenance,
      dependencies: {},
    },
    research: {
      generation: 8,
      freshness: "stale",
      confidence: "partial",
      ageMs: 240_000,
      warnings: ["Research descriptions are partial."],
      provenance: claimProvenance,
      dependencies: {
        catalog: {
          generation: 8,
          sourceKey: "global",
          receivedAt: "2026-08-22T10:00:00.000Z",
        },
      },
    },
    market: {
      generation: null,
      freshness: "unavailable",
      confidence: "unknown",
      ageMs: null,
      warnings: ["market has not loaded yet."],
      provenance: null,
      dependencies: {},
    },
  };
  const responseMeta = {
    coherence: "coherent",
    availableGenerations: [8],
    newestGeneration: 8,
    oldestGeneration: 8,
  };
  const partialErrors = [
    "research: Research descriptions are partial.",
    "market has not loaded yet.",
  ];
  const result = await loadGameData(
    "1369094286777412590",
    ["claim", "research", "market"],
    jsonFetcher({
      claimId: "1369094286777412590",
      regionId: "19",
      generatedAt: "2026-08-22T10:00:02.000Z",
      domains: {
        claim: {
          data: { entityId: "1369094286777412590", name: "Timbersteel", regionId: "19" },
          freshness: "fresh",
          confidence: "joined",
          ageMs: 1_000,
          provenance: claimProvenance,
          warnings: [],
        },
        research: {
          data: { nodes: [{ id: "42" }] },
          freshness: "stale",
          confidence: "partial",
          ageMs: 240_000,
          provenance: claimProvenance,
          warnings: ["Research descriptions are partial."],
        },
      },
      domainStatus,
      meta: responseMeta,
      partialErrors,
    }),
  );

  assert.deepEqual(result.claim, {
    entityId: "1369094286777412590",
    name: "Timbersteel",
    regionId: "19",
  });
  assert.deepEqual(result.research, { nodes: [{ id: "42" }] });
  assert.deepEqual(result.domainStatus, domainStatus);
  assert.deepEqual(result.responseMeta, responseMeta);
  assert.deepEqual(result.partialErrors, partialErrors);
  assert.equal(result.stale, true);
});

test("an unavailable requested domain does not make fresh available data globally stale", async () => {
  const result = await loadGameData(
    "1369094286777412590",
    ["claim", "market"],
    jsonFetcher({
      claimId: "1369094286777412590",
      regionId: "19",
      generatedAt: "2026-08-22T10:00:02.000Z",
      domains: {
        claim: {
          data: { entityId: "1369094286777412590", regionId: "19" },
          freshness: "fresh",
          confidence: "joined",
          ageMs: 1_000,
          provenance: claimProvenance,
          warnings: [],
        },
      },
      domainStatus: {
        claim: {
          generation: 8,
          freshness: "fresh",
          confidence: "joined",
          ageMs: 1_000,
          warnings: [],
          provenance: claimProvenance,
          dependencies: {},
        },
        market: {
          generation: null,
          freshness: "unavailable",
          confidence: "unknown",
          ageMs: null,
          warnings: ["market has not loaded yet."],
          provenance: null,
          dependencies: {},
        },
      },
      meta: {
        coherence: "coherent",
        availableGenerations: [8],
        newestGeneration: 8,
        oldestGeneration: 8,
      },
      partialErrors: ["market has not loaded yet."],
    }),
  );

  assert.equal(result.stale, false);
  assert.deepEqual(result.domainStatus.market.warnings, ["market has not loaded yet."]);
  assert.deepEqual(result.partialErrors, ["market has not loaded yet."]);
});

test("uses the larger of a valid declared length and already-read response text bytes", async () => {
  const payload = {
    claimId: "1369094286777412590",
    regionId: "19",
    generatedAt: "2026-08-22T10:00:02.000Z",
    domains: { claim: { data: { name: "Timbersteel" }, freshness: "fresh" } },
    domainStatus: {},
    meta: { coherence: "coherent" },
    partialErrors: [],
  };
  const text = JSON.stringify(payload);
  const declared = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(text, {
    headers: { "content-length": "999" },
  }));
  const smallerMismatch = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(text, {
    headers: { "content-length": "1" },
  }));
  const fractional = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(text, {
    headers: { "content-length": "12.5" },
  }));
  const invalid = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(text, {
    headers: { "content-length": "unknown" },
  }));
  const observed = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(text));

  assert.equal(declared.payloadBytes, 999);
  assert.equal(smallerMismatch.payloadBytes, new TextEncoder().encode(text).byteLength);
  assert.equal(fractional.payloadBytes, new TextEncoder().encode(text).byteLength);
  assert.equal(invalid.payloadBytes, new TextEncoder().encode(text).byteLength);
  assert.equal(observed.payloadBytes, new TextEncoder().encode(text).byteLength);
  assert.deepEqual(observed.data.claim, { name: "Timbersteel" });
});

test("does not cache an oversized decoded response when compressed wire bytes are small", async () => {
  const oversizedText = "x".repeat(4_194_305);
  const payload = {
    claimId: "1369094286777412590",
    regionId: "19",
    generatedAt: "2026-08-22T10:00:02.000Z",
    domains: { claim: { data: { name: "Timbersteel", oversizedText }, freshness: "fresh" } },
    domainStatus: {},
    meta: { coherence: "coherent" },
    partialErrors: [],
  };
  const result = await loadGameDataWithPayloadBytes("1369094286777412590", ["claim"], async () => new Response(JSON.stringify(payload), {
    headers: { "content-length": "64", "content-encoding": "gzip" },
  }));
  const cache = createPageNavigationCache({ now: () => 0 });
  cache.set("claim-a:dashboard", { claimId: "claim-a", panel: "dashboard", data: result.data, payloadBytes: result.payloadBytes });

  assert.ok(result.payloadBytes > 4_194_304);
  assert.equal(result.data.claim.oversizedText.length, oversizedText.length, "the active decoded response remains usable");
  assert.equal(cache.get("claim-a:dashboard"), undefined, "the oversized decoded response is not retained");
});
