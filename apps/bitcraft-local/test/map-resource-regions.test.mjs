import assert from "node:assert/strict";
import test from "node:test";

import { mapResourceRegionCatalog } from "../src/server/mapResourceRegions.mjs";

test("map resource regions include every schema-ready topology source in decimal order", () => {
  const result = mapResourceRegionCatalog({
    providerHealth: {
      sources: {
        "region:24": { ready: true, schemaFingerprint: "fp-24" },
        "region:3": { ready: false, schemaFingerprint: "fp-3" },
        "region:19": { ready: true, schemaFingerprint: "fp-19" },
        "region:7": { ready: true, schemaFingerprint: null },
      },
    },
    regionSnapshot: {
      data: {
        regions: [
          { regionId: "19", regionName: "Zephra" },
          { regionId: "24", regionName: "Aria" },
        ],
      },
      provenance: { receivedAt: "2026-08-12T20:00:00.000Z" },
    },
  });

  assert.deepEqual(result.regionIds, ["19", "24"]);
  assert.deepEqual(result.regions, [
    { regionId: "19", regionName: "Zephra", relayReady: true, freshness: "live" },
    { regionId: "24", regionName: "Aria", relayReady: true, freshness: "live" },
  ]);
  assert.equal(result.provider, "relay");
  assert.equal(result.generatedAt, "2026-08-12T20:00:00.000Z");
  assert.equal(result.freshness, "live");
  assert.deepEqual(result.warnings, []);
});

test("map resource regions use configured fallback only while topology is unavailable", () => {
  const result = mapResourceRegionCatalog({
    providerHealth: {},
    regionSnapshot: null,
    fallbackRegionIds: ["24", "019", "bad", "24"],
  });

  assert.deepEqual(result.regionIds, ["19", "24"]);
  assert.deepEqual(result.regions, [
    { regionId: "19", regionName: "Region 19", relayReady: true, freshness: "stale" },
    { regionId: "24", regionName: "Region 24", relayReady: true, freshness: "stale" },
  ]);
  assert.equal(result.freshness, "stale");
  assert.match(result.warnings[0], /topology readiness is unavailable/i);
});

test("known topology does not broaden to configured fallback regions", () => {
  const result = mapResourceRegionCatalog({
    providerHealth: {
      sources: {
        "region:19": { ready: true, schemaFingerprint: "fp-19" },
      },
    },
    fallbackRegionIds: ["24"],
  });

  assert.deepEqual(result.regionIds, ["19"]);
});
