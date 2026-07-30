import assert from "node:assert/strict";
import test from "node:test";

let poolModule = null;
try {
  poolModule = await import("../src/server/game-data/regionSessionPool.ts");
} catch {
  // The first TDD run proves the adaptive pool module is absent.
}

function harness(options = {}) {
  let nowMs = 0;
  const starts = [];
  const stops = [];
  const sleeps = [];
  const sessions = new Map();
  const pool = new poolModule.AdaptiveRegionSessionPool({
    maxSessions: options.maxSessions ?? 3,
    idleCloseMs: options.idleCloseMs ?? 1_000,
    staggerMs: options.staggerMs ?? 250,
    now: () => nowMs,
    sleep: async (delayMs) => {
      sleeps.push(delayMs);
      nowMs += delayMs;
    },
    createSession: (regionId) => {
      const session = {
        regionId,
        start: async () => {
          starts.push(regionId);
          if (options.failRegion === regionId) throw new Error(`region ${regionId} failed`);
        },
        stop: async () => stops.push(regionId),
        health: () => ({ connected: true, regionId }),
      };
      sessions.set(regionId, session);
      return session;
    },
  });
  return {
    pool,
    starts,
    stops,
    sleeps,
    sessions,
    advance: (delayMs) => { nowMs += delayMs; },
  };
}

test("adaptive region pool pins primary, single-flights opens, and enforces allowed regions", async () => {
  assert.ok(poolModule, "adaptive region-session pool module must exist");
  const state = harness({ maxSessions: 2 });
  await state.pool.start({
    primaryRegionId: "19",
    activeRegionIds: ["19", "20", "21"],
  });

  assert.deepEqual(state.starts, ["19"]);
  const [first, second] = await Promise.all([
    state.pool.acquire("20"),
    state.pool.acquire("20"),
  ]);
  assert.deepEqual(state.starts, ["19", "20"], "concurrent consumers must share one connection");
  assert.equal(state.pool.health().sessions.find((entry) => entry.regionId === "20").leases, 2);

  await assert.rejects(state.pool.acquire("99"), /not configured/i);
  await assert.rejects(state.pool.acquire("21"), /capacity/i);
  await first.release();
  await second.release();
  state.advance(1_001);

  const third = await state.pool.acquire("21");
  assert.deepEqual(state.stops, ["20"], "least-recent idle non-primary session should be evicted");
  assert.deepEqual(state.starts, ["19", "20", "21"]);
  await third.release();
  assert.equal(state.pool.health().sessions.find((entry) => entry.regionId === "19").pinned, true);
});

test("adaptive region pool staggers warmups and closes only idle non-primary sessions", async () => {
  assert.ok(poolModule, "adaptive region-session pool module must exist");
  const state = harness();
  await state.pool.start({
    primaryRegionId: "19",
    activeRegionIds: ["19", "20", "21"],
  });
  await state.pool.warmActiveRegions();

  assert.deepEqual(state.starts, ["19", "20", "21"]);
  assert.deepEqual(state.sleeps, [250, 250]);
  const lease = await state.pool.acquire("20");
  state.advance(1_001);
  assert.deepEqual(await state.pool.sweepIdle(), ["21"]);
  assert.deepEqual(state.stops, ["21"]);

  await lease.release();
  state.advance(1_001);
  assert.deepEqual(await state.pool.sweepIdle(), ["20"]);
  assert.deepEqual(state.stops, ["21", "20"]);
  assert.deepEqual(state.pool.health().sessions.map((entry) => entry.regionId), ["19"]);
});

test("adaptive region pool preserves healthy sessions when an open fails", async () => {
  assert.ok(poolModule, "adaptive region-session pool module must exist");
  const state = harness({ failRegion: "20" });
  await state.pool.start({
    primaryRegionId: "19",
    activeRegionIds: ["19", "20"],
  });

  await assert.rejects(state.pool.acquire("20"), /region 20 failed/);
  assert.deepEqual(state.pool.health().sessions.map((entry) => entry.regionId), ["19"]);
  assert.match(state.pool.health().lastError, /region 20 failed/);
  await state.pool.stop();
  assert.deepEqual(state.stops, ["20", "19"]);
});

test("adaptive region pool counts in-flight opens against its hard connection cap", async () => {
  assert.ok(poolModule, "adaptive region-session pool module must exist");
  const state = harness({ maxSessions: 2 });
  await state.pool.start({
    primaryRegionId: "19",
    activeRegionIds: ["19", "20", "21"],
  });

  const results = await Promise.allSettled([
    state.pool.acquire("20"),
    state.pool.acquire("21"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /capacity/i);
  assert.equal(state.pool.health().sessions.length, 2);
});
