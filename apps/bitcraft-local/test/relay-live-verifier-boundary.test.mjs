import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifierUrl = new URL(
  "../scripts/verify-relay-siege-notifications-live.mjs",
  import.meta.url,
);

test("siege live verifier stays generated-binding, fingerprint, and exact-Empire scoped", () => {
  const source = readFileSync(verifierUrl, "utf8");

  assert.match(source, /discoverRelayTopology/);
  assert.match(source, /bindings\/regional\.js/);
  assert.match(source, /bindings\/global\.js/);
  assert.match(source, /schema-manifest\.json/);
  assert.match(source, /schemas\?*\.regional\?*\.fingerprint|schemas\.regional\.fingerprint/);
  assert.match(source, /schemas\?*\.global\?*\.fingerprint|schemas\.global\.fingerprint/);

  assert.match(source, /equalitySubscriptionQueries/);
  assert.match(source, /empire_notification_state/);
  assert.match(source, /empire_entity_id/);
  assert.doesNotMatch(
    source,
    /SELECT\s+\*\s+FROM\s+empire_notification_state(?:\s*;|\s*["'`])/i,
  );
  assert.doesNotMatch(source, /bitjita/i);
});

test("siege live verifier reports exact paired evidence and unavailable cancellation", () => {
  const source = readFileSync(verifierUrl, "utf8");

  assert.match(source, /pairedStartEvents/);
  assert.match(source, /attackerWinEvents/);
  assert.match(source, /defenderWinEvents/);
  assert.match(source, /cancellationSemantics:\s*"unavailable"/);
});
