import assert from "node:assert/strict";
import test from "node:test";

const { RelayPlayerDataService } = await import(
  new URL("../src/server/game-data/playerDataService.ts", import.meta.url).href,
);

function relayPayload() {
  return {
    player: {
      entity_id: "101",
      username: "Ada",
      region: "19",
      signed_in: true,
    },
    inventories: [{
      entity_id: "501",
      name: "Toolbelt",
      category: "toolbelt",
      items: [{ item_id: "42", item_type: "Item", quantity: "1" }],
    }],
  };
}

function serviceFixture(overrides = {}) {
  let now = Date.parse("2026-07-30T12:00:00.000Z");
  let calls = 0;
  const service = new RelayPlayerDataService({
    http: {
      async playerInventory() {
        calls += 1;
        return relayPayload();
      },
    },
    readMembers: () => [{ playerEntityId: "101", userName: "Ada" }],
    getEntity: (key) => key === "items:42"
      ? { kind: "item", id: "42", name: "Fine Pickaxe", tag: "Tool", tier: 3 }
      : null,
    getDescription: (kind, id) => kind === "tool" && id === "42"
      ? { toolType: 4, level: 3, power: 25 }
      : null,
    now: () => now,
    ttlMs: 15_000,
    ...overrides,
  });
  return {
    service,
    calls: () => calls,
    advance(milliseconds) {
      now += milliseconds;
    },
  };
}

test("player data service authorizes monitored members and enriches Toolbelt items", async () => {
  const fixture = serviceFixture();
  const envelope = await fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  });

  assert.equal(envelope.freshness, "fresh");
  assert.equal(envelope.confidence, "authoritative");
  assert.equal(envelope.ageMs, 0);
  assert.equal(envelope.provenance.sourceKey, "relay-cache");
  assert.deepEqual(envelope.data.items["42"], {
    kind: "item",
    id: "42",
    name: "Fine Pickaxe",
    tag: "Tool",
    tier: 3,
    itemId: "42",
    itemType: "item",
    toolType: 4,
    toolLevel: 3,
    toolPower: 25,
  });
  assert.equal(envelope.data.inventories[0].pockets[0].contents.quantity, "1");
  assert.equal(fixture.calls(), 1);
});

test("player data service uses a short memory cache and coalesces concurrent Relay requests", async () => {
  let resolveRequest;
  let calls = 0;
  const pending = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const fixture = serviceFixture({
    http: {
      playerInventory() {
        calls += 1;
        return pending;
      },
    },
  });

  const first = fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  });
  const second = fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  });
  assert.equal(calls, 1);
  resolveRequest(relayPayload());
  await Promise.all([first, second]);

  fixture.advance(14_999);
  const cached = await fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  });
  assert.equal(cached.ageMs, 14_999);
  assert.equal(calls, 1);
});

test("player data service serves stale last-good data when Relay becomes unavailable", async () => {
  let fail = false;
  const fixture = serviceFixture({
    http: {
      async playerInventory() {
        if (fail) throw new Error("Relay offline");
        return relayPayload();
      },
    },
  });
  const request = {
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  };
  await fixture.service.inventory(request);
  fixture.advance(15_001);
  fail = true;

  const stale = await fixture.service.inventory(request);
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.ageMs, 15_001);
  assert.match(stale.warnings[0], /Relay offline/);
  assert.equal(stale.data.player.entityId, "101");
});

test("player data service rejects cross-claim and non-member access before Relay", async () => {
  const fixture = serviceFixture();
  await assert.rejects(fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "999",
    playerId: "101",
    forceRefresh: false,
  }), (error) => error.statusCode === 403);
  await assert.rejects(fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "999",
    forceRefresh: false,
  }), (error) => error.statusCode === 403);
  assert.equal(fixture.calls(), 0);
});

test("player data service reports unavailable before any successful Relay response", async () => {
  const fixture = serviceFixture({
    http: {
      async playerInventory() {
        throw new Error("Relay offline");
      },
    },
  });
  await assert.rejects(fixture.service.inventory({
    configuredClaimId: "1369094286777412590",
    claimId: "1369094286777412590",
    playerId: "101",
    forceRefresh: false,
  }), (error) => error.statusCode === 503 && /has not loaded/.test(error.message));
});
