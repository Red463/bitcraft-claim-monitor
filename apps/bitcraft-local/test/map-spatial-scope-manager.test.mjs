import assert from "node:assert/strict";
import test from "node:test";

import { RelayMapSpatialScopeManager } from "../src/server/game-data/mapSpatialScopeManager.ts";

test("identical map scopes share one session and retain last-good until idle close", async () => {
  const sessions = [];
  const timers = [];
  const manager = new RelayMapSpatialScopeManager({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({ regions: new Map([["19", { ready: true, port: 4019, database: "relay-region-19", schemaFingerprint: "regional-v1" }]]) }),
    createSession: (options) => {
      const session = { options, stopped: false, async start(config) { this.config = config; }, health() { return { connected: true, applied: true }; }, async stop() { this.stopped = true; } };
      sessions.push(session);
      return session;
    },
    idleCloseMs: 1000,
    setTimer: (callback) => { timers.push(callback); return callback; },
    clearTimer() {},
  });
  const request = { relayBaseUrl: "https://relay.example", claimId: "99999999", scope: { claimId: "99999999", regionId: "19", playerIds: ["101"], resourceIds: ["2"], enemyTypes: ["8"] } };
  const first = await manager.acquire(request);
  const second = await manager.acquire(request);
  assert.equal(sessions.length, 1);
  sessions[0].options.onSnapshot({ data: { regionId: "19", players: [], resources: [], enemies: [], banks: [], waystones: [] }, warnings: [], generation: 4, receivedAt: "2026-08-11T12:00:00.000Z", database: "relay-region-19", regionId: "19", schemaFingerprint: "regional-v1" });
  assert.equal(first.snapshot()?.generation, 4);
  await first.release();
  await second.release();
  assert.equal(timers.length, 1);
  await timers[0]();
  assert.equal(sessions[0].stopped, true);
});

test("different requested type scopes never share cached spatial rows", async () => {
  let sessions = 0;
  const manager = new RelayMapSpatialScopeManager({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({ regions: new Map([["19", { ready: true, port: 4019, database: "relay-region-19", schemaFingerprint: "regional-v1" }]]) }),
    createSession: () => ({ async start() { sessions += 1; }, health() { return {}; }, async stop() {} }),
  });
  await manager.acquire({ relayBaseUrl: "https://relay.example", claimId: "99999999", scope: { claimId: "99999999", regionId: "19", playerIds: [], resourceIds: ["2"], enemyTypes: [] } });
  await manager.acquire({ relayBaseUrl: "https://relay.example", claimId: "99999999", scope: { claimId: "99999999", regionId: "19", playerIds: [], resourceIds: ["30"], enemyTypes: [] } });
  assert.equal(sessions, 2);
  await manager.stop();
});

test("disconnected scopes retain static last-good rows but withhold player positions", async () => {
  let connected = true;
  let session;
  const manager = new RelayMapSpatialScopeManager({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({ regions: new Map([["19", { ready: true, port: 4019, database: "relay-region-19", schemaFingerprint: "regional-v1" }]]) }),
    createSession: (options) => (session = { options, async start() {}, health() { return { connected, applied: true, lastError: connected ? null : "closed" }; }, async stop() {} }),
  });
  const lease = await manager.acquire({ relayBaseUrl: "https://relay.example", claimId: "99999999", scope: { claimId: "99999999", regionId: "19", playerIds: ["101"], resourceIds: ["2"], enemyTypes: [] } });
  session.options.onSnapshot({ data: { regionId: "19", players: [{ playerEntityId: "101" }], resources: [{ entityId: "100" }], enemies: [], banks: [], waystones: [] }, warnings: [], generation: 4, receivedAt: "2026-08-11T12:00:00.000Z", database: "relay-region-19", regionId: "19", schemaFingerprint: "regional-v1" });
  connected = false;
  assert.deepEqual(lease.snapshot().data.players, []);
  assert.equal(lease.snapshot().data.resources[0].entityId, "100");
  assert.match(lease.snapshot().warnings.join(" "), /player positions.*withheld/i);
  await manager.stop();
});

test("failed live scopes reconnect with the same bounded scope", async () => {
  const sessions = [];
  const timers = [];
  const manager = new RelayMapSpatialScopeManager({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({ regions: new Map([["19", { ready: true, port: 4019, database: "relay-region-19", schemaFingerprint: "regional-v1" }]]) }),
    createSession: (options) => {
      const session = { options, config: null, stopped: false, async start(config) { this.config = config; }, health() { return { connected: !this.stopped, applied: !this.stopped }; }, async stop() { this.stopped = true; } };
      sessions.push(session);
      return session;
    },
    reconnectDelayMs: () => 25,
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return callback; },
    clearTimer() {},
  });
  await manager.acquire({ relayBaseUrl: "https://relay.example", claimId: "99999999", scope: { claimId: "99999999", regionId: "19", playerIds: ["101"], resourceIds: ["2"], enemyTypes: ["8"] } });
  sessions[0].options.onFailure("closed");
  assert.equal(timers[0].delay, 25);
  await timers[0].callback();
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].stopped, true);
  assert.deepEqual(sessions[1].config.scope.resourceIds, ["2"]);
  assert.deepEqual(sessions[1].config.scope.enemyTypes, ["8"]);
  await manager.stop();
});
