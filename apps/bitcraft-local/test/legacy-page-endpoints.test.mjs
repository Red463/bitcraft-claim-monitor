import assert from "node:assert/strict";
import test from "node:test";

import { legacyPageEndpointMap } from "../src/api/legacyPageEndpoints.ts";

test("migrated Settlement Market has no legacy endpoint map", () => {
  const endpoints = legacyPageEndpointMap("claim-42", "settlement-market");

  assert.deepEqual(endpoints, {});
});

test("migrated Craft Monitor has no legacy endpoint map", () => {
  const endpoints = legacyPageEndpointMap("claim-42", "craft-monitor");

  assert.deepEqual(endpoints, {});
});

test("migrated Research has no legacy endpoint map", () => {
  const endpoints = legacyPageEndpointMap("claim-42", "research");

  assert.deepEqual(endpoints, {});
});

test("legacy endpoint inventory no longer includes Recruitment", () => {
  const endpoints = legacyPageEndpointMap("claim-42");

  assert.equal(endpoints.recruitment, undefined);
  assert.equal(endpoints.layout, undefined);
});

test("global Market does not request monitored claim listings", () => {
  const endpoints = legacyPageEndpointMap("claim-42", "market");

  assert.equal("market" in endpoints, false);
});

for (const panel of ["craftcalc", "sync"]) {
  test(`${panel} does not start an unused legacy settlement request`, () => {
    assert.deepEqual(legacyPageEndpointMap("claim-42", panel), {});
  });
}
