import assert from "node:assert/strict";
import test from "node:test";

import { regionScoreMaxima, settlementRegionScore } from "../src/utils/regionScore.ts";

test("settlementRegionScore weights tier as the dominant regional ranking factor", () => {
  const rows = [
    { name: "Tier Eight", tier: 8, supplies: 1000, treasury: 1000, numTiles: 1000 },
    { name: "Tier Seven Rich", tier: 7, supplies: 100000, treasury: 1000000, numTiles: 10000 },
  ];
  const maxima = regionScoreMaxima(rows);

  assert.equal(settlementRegionScore(rows[0], maxima), 938);
  assert.equal(settlementRegionScore(rows[1], maxima), 888);
  assert.equal(settlementRegionScore(rows[0], maxima) > settlementRegionScore(rows[1], maxima), true);
});

test("settlementRegionScore ignores supplies and uses treasury then tiles as same-tier tie breakers", () => {
  const rows = [
    { name: "Supply Lead", tier: 5, supplies: 90000, treasury: 10000, numTiles: 1000 },
    { name: "Tie Break Lead", tier: 5, supplies: 30000, treasury: 1000000, numTiles: 10000 },
  ];
  const maxima = regionScoreMaxima(rows);

  assert.equal(settlementRegionScore(rows[1], maxima) > settlementRegionScore(rows[0], maxima), true);
});
