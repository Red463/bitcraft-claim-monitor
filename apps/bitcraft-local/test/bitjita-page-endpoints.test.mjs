import assert from "node:assert/strict";
import test from "node:test";

import { marketEndpointMap } from "../src/api/bitjitaEndpoints.mjs";

test("Settlement Market requests the monitored claim listing feed", () => {
  const endpoints = marketEndpointMap("claim-42", "settlement-market");

  assert.equal(endpoints.market, "/claims/claim-42/market/listings?limit=200");
});

test("global Market does not request monitored claim listings", () => {
  const endpoints = marketEndpointMap("claim-42", "market");

  assert.equal("market" in endpoints, false);
});
