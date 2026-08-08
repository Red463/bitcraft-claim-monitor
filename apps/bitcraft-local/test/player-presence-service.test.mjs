import assert from "node:assert/strict";
import test from "node:test";

let presenceModule = null;
try {
  presenceModule = await import(
    new URL("../src/server/game-data/playerPresenceService.ts", import.meta.url).href,
  );
} catch {
  // The red run proves the focused player-presence service is absent.
}

const detail = (entityId, overrides = {}) => ({
  player: {
    entity_id: entityId,
    username: `Player ${entityId}`,
    region: 14,
    signed_in: false,
    last_active_timestamp: 1785409200,
    ...overrides,
  },
});

test("omitted monitored members are enriched with exact Relay player presence", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  const requested = [];
  const service = new presenceModule.RelayPlayerPresenceService({
    http: {
      player: async (entityId) => {
        requested.push(entityId);
        return detail(entityId);
      },
    },
  });

  const players = await service.enrich([{
    playerEntityId: "1224979098660030450",
    username: "Allusion",
    signedIn: null,
    presenceRegionId: null,
    presenceSource: "unavailable",
    lastLoginTimestamp: "2026-07-30T10:00:00.000Z",
  }, {
    playerEntityId: "1224979098660030451",
    username: "Regional",
    signedIn: true,
    presenceRegionId: "19",
    presenceSource: "regional",
  }]);

  assert.deepEqual(requested, ["1224979098660030450"]);
  assert.deepEqual(players[0], {
    playerEntityId: "1224979098660030450",
    username: "Allusion",
    signedIn: false,
    presenceRegionId: "14",
    presenceSource: "relay-player",
    lastActiveTimestamp: "2026-07-30T11:00:00.000Z",
    lastLoginTimestamp: "2026-07-30T10:00:00.000Z",
  });
  assert.equal(players[1].presenceSource, "regional");
});

test("player enrichment keeps the newest valid last-active timestamp across member and Relay sources", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  const service = new presenceModule.RelayPlayerPresenceService({
    http: { player: async (entityId) => detail(entityId) },
  });

  const players = await service.enrich([{
    playerEntityId: "1224979098660030450",
    presenceSource: "unavailable",
    signedIn: null,
    lastActiveTimestamp: "2026-07-30T12:00:00.000Z",
  }, {
    playerEntityId: "1224979098660030451",
    presenceSource: "unavailable",
    signedIn: null,
    lastActiveTimestamp: "not-a-timestamp",
  }, {
    playerEntityId: "1224979098660030452",
    presenceSource: "unavailable",
    signedIn: null,
    lastActiveTimestamp: null,
  }]);

  assert.deepEqual(players.map((player) => player.lastActiveTimestamp), [
    "2026-07-30T12:00:00.000Z",
    "2026-07-30T11:00:00.000Z",
    "2026-07-30T11:00:00.000Z",
  ]);
});

test("player presence cache is reused before 60 seconds and expires at 60 seconds", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  let now = 1_000;
  let calls = 0;
  const service = new presenceModule.RelayPlayerPresenceService({
    http: { player: async (entityId) => { calls += 1; return detail(entityId); } },
    now: () => now,
  });
  const unavailable = [{
    playerEntityId: "1224979098660030450",
    presenceSource: "unavailable",
    signedIn: null,
  }];

  await service.enrich(unavailable);
  now += 59_999;
  await service.enrich(unavailable);
  assert.equal(calls, 1);
  now += 1;
  await service.enrich(unavailable);
  assert.equal(calls, 2);
});

test("player presence enrichment caps Relay HTTP concurrency at four", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  let active = 0;
  let maximum = 0;
  const releases = [];
  const service = new presenceModule.RelayPlayerPresenceService({
    http: {
      player: async (entityId) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => releases.push(resolve));
        active -= 1;
        return detail(entityId);
      },
    },
  });
  const promise = service.enrich(Array.from({ length: 9 }, (_, index) => ({
    playerEntityId: String(100 + index),
    presenceSource: "unavailable",
    signedIn: null,
  })));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 4);
  while (releases.length) {
    releases.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  await promise;
  assert.equal(maximum, 4);
});

test("HTTP and malformed player failures preserve unavailable presence without false offline", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  const failures = [
    new Error("Relay HTTP 503"),
    detail("999", { region: null }),
  ];
  for (const response of failures) {
    const service = new presenceModule.RelayPlayerPresenceService({
      http: {
        player: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      },
    });
    const [player] = await service.enrich([{
      playerEntityId: "1224979098660030450",
      signedIn: null,
      presenceRegionId: null,
      presenceSource: "unavailable",
    }]);
    assert.equal(player.signedIn, null);
    assert.equal(player.presenceRegionId, null);
    assert.equal(player.presenceSource, "unavailable");
  }
});

test("bounded Relay player lookup resolves contribution names and falls back to the exact id", async () => {
  assert.ok(presenceModule, "expected the player-presence service module");
  const service = new presenceModule.RelayPlayerPresenceService({
    http: {
      player: async (entityId) => detail(entityId, {
        username: entityId === "1224979098660030450" ? "Relay Owner" : "",
      }),
    },
  });

  assert.equal(await service.resolvePlayerName("1224979098660030450"), "Relay Owner");
  assert.equal(
    await service.resolvePlayerName("1224979098660030451"),
    "Player 1224979098660030451",
  );
});
