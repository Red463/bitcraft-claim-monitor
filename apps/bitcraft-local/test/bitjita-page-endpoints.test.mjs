import assert from "node:assert/strict";
import test from "node:test";

import { marketEndpointMap } from "../src/api/bitjitaEndpoints.ts";

test("Settlement Market requests the monitored claim listing feed", () => {
  const endpoints = marketEndpointMap("claim-42", "settlement-market");

  assert.equal(endpoints.market, "/claims/claim-42/market/listings?limit=200");
});

test("migrated Craft Monitor has no legacy endpoint map", () => {
  const endpoints = marketEndpointMap("claim-42", "craft-monitor");

  assert.deepEqual(endpoints, {});
});

test("migrated Research has no legacy endpoint map", () => {
  const endpoints = marketEndpointMap("claim-42", "research");

  assert.deepEqual(endpoints, {});
});

test("legacy endpoint inventory no longer includes Recruitment", () => {
  const endpoints = marketEndpointMap("claim-42");

  assert.equal(endpoints.recruitment, undefined);
});

test("global Market does not request monitored claim listings", () => {
  const endpoints = marketEndpointMap("claim-42", "market");

  assert.equal("market" in endpoints, false);
});
