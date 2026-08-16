import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = JSON.parse(await readFile(
  new URL("fixtures/map-global-player-live-fixture.json", import.meta.url),
  "utf8",
));

test("failed global-player evidence stays redacted and keeps the production gate closed", () => {
  if (fixture.verified) return;
  assert.match(fixture.verificationGate, /do not directly match global mobile_entity_state/i);
  assert.equal(fixture.identity, null);
  assert.equal(fixture.mobile, null);
  assert.equal(fixture.failedEvidence.selectedCount, 100);
  assert.equal(fixture.failedEvidence.matchingUsernameAndSignedInCount, 100);
  assert.equal(fixture.failedEvidence.matchingMobileCount, 0);
  assert.equal(fixture.failedEvidence.matchingOverworldMobileCount, 0);
  assert.doesNotMatch(JSON.stringify(fixture), /"username"\s*:\s*"(?!VerifiedPlayer)/i);
});

test("accepted live global-player fixture proves the complete coordinate contract", {
  skip: fixture.verified ? false : fixture.verificationGate,
}, () => {
  assert.equal(fixture.verified, true);
  assert.match(fixture.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(fixture.source.globalDatabase, /^bitcraft-live-global$/);
  assert.match(fixture.source.globalSchemaFingerprint, /^[a-f0-9]{64}$/);

  assert.equal(fixture.identity.entityId, fixture.lowercaseIdentity.entityId);
  assert.equal(fixture.identity.entityId, fixture.signedIn.entityId);
  assert.equal(fixture.identity.entityId, fixture.mobile.entityId);
  assert.equal(fixture.lowercaseIdentity.usernameLowercase, fixture.identity.username.toLocaleLowerCase());
  assert.equal(fixture.mobile.dimension, "1");
  assert.equal(fixture.mobile.mapX, fixture.mobile.locationX / 1000);
  assert.equal(fixture.mobile.mapZ, fixture.mobile.locationZ / 1000);
  assert.equal(fixture.mobile.insideWorldBounds, true);
  assert.match(fixture.mobile.regionId, /^(?:0|[1-9]\d*)$/);
  assert.ok(fixture.worldRegions.some((region) => region.regionId === fixture.mobile.regionId && region.containsPoint));

  assert.deepEqual(fixture.transitions, {
    logoutObserved: true,
    mobileDeletionObserved: true,
    deselectionRemovesPosition: true,
    disconnectRemovesPosition: true,
  });
  assert.deepEqual(fixture.measurements.map((measurement) => measurement.selectedCount), [1, 20, 100]);
  assert.ok(fixture.measurements.every((measurement) => (
    Number.isInteger(measurement.rowCount)
    && measurement.rowCount >= 0
    && Number.isInteger(measurement.payloadBytes)
    && measurement.payloadBytes >= 0
  )));
});
