import assert from "node:assert/strict";
import test from "node:test";

const { createGameDataCompositionDependencies } = await import(
  new URL("../src/server/game-data/gameDataComposition.ts", import.meta.url).href,
);

function snapshot(generation, sourceKey = "relay-cache") {
  return {
    generation,
    provenance: {
      sourceKey,
      receivedAt: "2026-08-22T09:00:00.000Z",
    },
  };
}

test("production composition seam captures catalog publication lazily and covers only enriched domains", () => {
  let catalogPublication = snapshot(73, "global");
  const reads = [];
  const revisionInputs = [];
  const composition = createGameDataCompositionDependencies({
    claimId: "1369094286777412590",
    repository: {
      read(claimId, domain) {
        reads.push([claimId, domain]);
        return domain === "catalogs" ? catalogPublication : null;
      },
    },
    catalogRepository: {
      getRevision(publication) {
        revisionInputs.push(publication);
        return {
          generation: publication?.generation ?? null,
          sourceGeneration: 902,
          sourceKey: "global",
          receivedAt: "2026-08-22T09:00:00.000Z",
        };
      },
    },
  });

  assert.deepEqual(composition.forDomain("claim"), {});
  assert.deepEqual(reads, []);
  assert.deepEqual(revisionInputs, []);

  // The queued request passed its gate before this newer publication became visible.
  catalogPublication = snapshot(74, "global");
  assert.deepEqual(composition.forDomain("market"), {
    catalog: {
      generation: 74,
      sourceGeneration: 902,
      sourceKey: "global",
      receivedAt: "2026-08-22T09:00:00.000Z",
    },
  });
  assert.equal(revisionInputs[0], catalogPublication);
  assert.deepEqual(reads, [["1369094286777412590", "catalogs"]]);

  const catalogEnrichedDomains = [
    "inventories",
    "crafts",
    "public-crafts",
    "market",
    "equipment",
    "construction",
    "research",
    "recruitment",
  ];
  for (const domain of catalogEnrichedDomains) {
    assert.ok(composition.forDomain(domain).catalog, `${domain} must declare its catalog dependency`);
  }
  for (const domain of ["claim", "members", "skills", "buildings", "contributions", "region"]) {
    assert.equal(composition.forDomain(domain).catalog, undefined, `${domain} must not declare catalog enrichment`);
  }
  assert.equal(revisionInputs.length, 1);
});

test("production composition seam conditionally declares composed snapshot dependencies", () => {
  const composition = createGameDataCompositionDependencies({
    claimId: "1369094286777412590",
    repository: { read: () => snapshot(81, "global") },
    catalogRepository: {
      getRevision: () => ({
        generation: 81,
        sourceGeneration: 911,
        sourceKey: "global",
        receivedAt: "2026-08-22T09:00:00.000Z",
      }),
    },
  });
  const inventoryBankSnapshot = snapshot(81, "region:19");
  const publicCraftSnapshot = snapshot(81, "region:19");

  assert.equal(composition.forDomain("inventories")["inventory-banks"], undefined);
  assert.deepEqual(
    composition.forDomain("inventories", { inventoryBankSnapshot })["inventory-banks"],
    {
      generation: 81,
      sourceKey: "region:19",
      receivedAt: "2026-08-22T09:00:00.000Z",
    },
  );
  assert.equal(composition.forDomain("crafts")["public-crafts"], undefined);
  assert.deepEqual(
    composition.forDomain("crafts", { publicCraftSnapshot })["public-crafts"],
    {
      generation: 81,
      sourceKey: "region:19",
      receivedAt: "2026-08-22T09:00:00.000Z",
    },
  );
});
