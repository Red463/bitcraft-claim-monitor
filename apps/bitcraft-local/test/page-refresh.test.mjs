import assert from "node:assert/strict";
import test from "node:test";

import {
  createDelayedRefreshTask,
  createPageRefreshController,
  createPageRefreshCycle,
  createPageRefreshTaskCoordinator,
  pageRefreshHeaders,
  pageRefreshPolicy,
} from "../src/refresh/pageRefresh.mjs";
import { createGameDataGenerationWatcher } from "../src/refresh/generationWatcher.mjs";

function createFakeClock(start = 0) {
  let now = start;
  let nextId = 1;
  const timers = new Map();
  const activeIntervals = new Set();
  const setTimeout = (callback, delay = 0) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(delay)), callback });
    return id;
  };
  const clearTimeout = (id) => {
    activeIntervals.delete(id);
    timers.delete(id);
  };
  const setInterval = (callback, delay) => {
    const id = nextId++;
    const tick = () => {
      if (!activeIntervals.has(id)) return;
      callback();
      if (activeIntervals.has(id)) timers.set(id, { at: now + delay, callback: tick });
    };
    activeIntervals.add(id);
    timers.set(id, { at: now + delay, callback: tick });
    return id;
  };
  const advance = (elapsed) => {
    const target = now + elapsed;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { now: () => now, setTimeout, clearTimeout, setInterval, clearInterval: clearTimeout, advance };
}

test("route policy keeps only Craft Monitor near-live and demand pages manual", () => {
  assert.equal(pageRefreshPolicy("craft-monitor").mode, "near-live");
  assert.equal(pageRefreshPolicy("craft-monitor").coalesceMs, 2_000);
  assert.equal(pageRefreshPolicy("craftcalc").mode, "manual");
  assert.equal(pageRefreshPolicy("sync").mode, "manual");

  for (const page of [
    "dashboard", "members", "skills", "leaderboard", "planning", "inventory",
    "construction", "research", "market", "settlement-market", "region",
    "empires", "map", "activity", "publiccrafts",
  ]) {
    assert.equal(pageRefreshPolicy(page).mode, "interval", page);
  }
});

test("delayed refresh tasks enroll immediately and cancellation settles as an abort", async () => {
  const clock = createFakeClock();
  let starts = 0;
  const delayed = createDelayedRefreshTask(() => {
    starts += 1;
    return Promise.resolve("done");
  }, 250, clock);

  assert.equal(starts, 0);
  clock.advance(249);
  assert.equal(starts, 0);
  clock.advance(1);
  assert.equal(await delayed.promise, "done");
  assert.equal(starts, 1);

  const cancelled = createDelayedRefreshTask(() => Promise.resolve("late"), 250, clock);
  cancelled.cancel();
  await assert.rejects(cancelled.promise, (error) => error?.name === "AbortError");
  clock.advance(250);
});

test("Craft Monitor coalesces generation changes and queues one trailing cycle", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "craft-monitor",
    intervalMs: 30_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `cycle-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  controller.start();
  assert.deepEqual(cycles.map(({ reason }) => reason), ["initial"]);
  controller.complete(cycles[0].id, true);

  controller.invalidateNearLive();
  controller.invalidateNearLive();
  clock.advance(1_999);
  assert.equal(cycles.length, 1);
  clock.advance(1);
  assert.deepEqual(cycles.map(({ reason }) => reason), ["initial", "near-live"]);

  controller.invalidateNearLive();
  controller.invalidateNearLive();
  clock.advance(2_000);
  assert.equal(cycles.length, 2, "single flight blocks another start");
  controller.complete(cycles[1].id, true);
  assert.equal(cycles.length, 3, "one trailing cycle starts after completion");
  assert.equal(cycles[2].reason, "near-live");
});

test("Craft Monitor failures retry with bounded 5-30 second exponential backoff", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "craft-monitor",
    intervalMs: 30_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `backoff-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  controller.start();
  for (const delay of [5_000, 10_000, 20_000, 30_000, 30_000]) {
    controller.complete(cycles.at(-1).id, false);
    clock.advance(delay - 1);
    assert.equal(cycles.length, id);
    clock.advance(1);
    assert.equal(cycles.at(-1).reason, "near-live");
  }

  controller.complete(cycles.at(-1).id, true);
  clock.advance(30_000);
  assert.equal(cycles.length, id, "success clears the failure retry");
});

test("interval pages ignore generations, pause while hidden, and catch up once visible", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "dashboard",
    intervalMs: 30_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `interval-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  controller.start();
  controller.complete(cycles[0].id, true);
  controller.invalidateNearLive();
  clock.advance(29_999);
  assert.equal(cycles.length, 1, "Relay generations do not refresh interval pages");
  controller.setVisible(false);
  clock.advance(1);
  assert.equal(cycles.length, 1, "hidden tabs do not fetch");
  controller.setVisible(true);
  assert.deepEqual(cycles.map(({ reason }) => reason), ["initial", "visibility-catch-up"]);
  controller.setVisible(true);
  assert.equal(cycles.length, 2, "visibility catch-up is emitted once");
});

test("manual pages run initially and on demand without an interval", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "craftcalc",
    intervalMs: 15_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `manual-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  controller.start();
  controller.complete(cycles[0].id, true);
  clock.advance(60_000);
  assert.equal(cycles.length, 1);
  controller.requestManual();
  assert.equal(cycles.at(-1).reason, "manual");
});

test("whole-page completion waits for every task and timestamps only full success", () => {
  let now = 10_000;
  const completions = [];
  const coordinator = createPageRefreshTaskCoordinator({
    now: () => now,
    onComplete: (cycle, succeeded) => completions.push([cycle.id, succeeded]),
  });
  const initial = createPageRefreshCycle("dashboard", 1, "initial", { createId: () => "initial", now: () => 1_000 });

  coordinator.beginCycle(initial);
  const finishMain = coordinator.beginTask(initial.id, "main-data");
  const finishHistory = coordinator.beginTask(initial.id, "local-history");
  coordinator.seal(initial.id);
  finishMain();
  assert.equal(coordinator.snapshot().status, "refreshing");
  assert.equal(coordinator.snapshot().lastSuccessfulAt, null);
  finishHistory();
  assert.equal(coordinator.snapshot().status, "complete");
  assert.equal(coordinator.snapshot().lastSuccessfulAt, 10_000);
  assert.equal(coordinator.snapshot().visibleProgress, false);
  assert.deepEqual(completions, [["initial", true]]);

  now = 20_000;
  const interval = createPageRefreshCycle("dashboard", 2, "interval", { createId: () => "interval", now: () => 2_000 });
  coordinator.beginCycle(interval);
  const finishInterval = coordinator.beginTask(interval.id, "main-data");
  assert.equal(coordinator.snapshot().visibleProgress, false, "automatic progress is silent");
  coordinator.seal(interval.id);
  finishInterval(new Error("history unavailable"));
  assert.equal(coordinator.snapshot().lastSuccessfulAt, 10_000, "failed cycle retains the last whole-page timestamp");
  assert.deepEqual(completions.at(-1), ["interval", false]);
});

test("only manual cycles attach the compatibility refresh header", () => {
  const manual = createPageRefreshCycle("planning", 3, "manual", { createId: () => "manual-id", now: () => 1_000 });
  const interval = createPageRefreshCycle("planning", 4, "interval", { createId: () => "interval-id", now: () => 2_000 });

  assert.deepEqual(pageRefreshHeaders(manual, "planning"), { "x-manual-refresh-id": "manual-id" });
  assert.deepEqual(pageRefreshHeaders(interval, "planning"), {});
  assert.deepEqual(pageRefreshHeaders(manual, "dashboard"), {});
});

test("route changes start a page-scoped initial cycle and cleanup cancels stale timers", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "dashboard",
    intervalMs: 30_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `route-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  controller.start();
  controller.complete(cycles[0].id, true);
  controller.setPage("craft-monitor");
  assert.deepEqual(cycles.at(-1), {
    id: "route-2",
    page: "craft-monitor",
    sequence: 2,
    reason: "initial",
    requestedAt: 0,
  });
  controller.complete(cycles.at(-1).id, true);
  controller.invalidateNearLive();
  controller.stop();
  clock.advance(60_000);
  assert.equal(cycles.length, 2);
});

test("generation watcher combines SSE with a 1000 ms poll and deduplicates generations", async () => {
  const clock = createFakeClock();
  const observed = [];
  const sources = [];
  let polledGeneration = 1;
  let visible = true;
  let fetchCalls = 0;
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      sources.push(this);
    }
    close() { this.closed = true; }
  }
  const watcher = createGameDataGenerationWatcher({
    claimId: "20",
    domains: ["crafts", "members"],
    fetch: async () => { fetchCalls += 1; return { ok: true, json: async () => ({ generation: polledGeneration }) }; },
    EventSource: FakeEventSource,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    isVisible: () => visible,
    onGeneration: (generation) => observed.push(generation),
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(observed, [1]);
  assert.match(sources[0].url, /domains=crafts%2Cmembers/);
  sources[0].onmessage({ data: JSON.stringify({ generation: 2 }) });
  sources[0].onmessage({ data: JSON.stringify({ generation: 2 }) });
  assert.deepEqual(observed, [1, 2]);
  polledGeneration = 3;
  clock.advance(999);
  assert.deepEqual(observed, [1, 2]);
  clock.advance(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(observed, [1, 2, 3]);

  visible = false;
  polledGeneration = 4;
  clock.advance(1_000);
  await Promise.resolve();
  assert.equal(fetchCalls, 2, "hidden tabs pause fallback polling");
  visible = true;
  clock.advance(1_000);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(observed, [1, 2, 3, 4]);

  watcher.stop();
  assert.equal(sources[0].closed, true);
  polledGeneration = 4;
  clock.advance(2_000);
  await Promise.resolve();
  assert.deepEqual(observed, [1, 2, 3, 4]);
});

test("hidden Craft Monitor defers generation invalidation to one visible catch-up", () => {
  const clock = createFakeClock();
  const cycles = [];
  let id = 0;
  const controller = createPageRefreshController({
    page: "craft-monitor",
    intervalMs: 30_000,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `hidden-live-${++id}`,
    onCycle: (cycle) => cycles.push(cycle),
  });
  controller.start();
  controller.complete(cycles[0].id, true);
  controller.setVisible(false);
  controller.invalidateNearLive();
  clock.advance(10_000);
  assert.equal(cycles.length, 1);
  controller.setVisible(true);
  assert.deepEqual(cycles.map(({ reason }) => reason), ["initial", "visibility-catch-up"]);
  controller.complete(cycles.at(-1).id, true);
  clock.advance(2_000);
  assert.equal(cycles.length, 2);
});

test("tracked non-OK HTTP responses fail the whole-page cycle", async () => {
  const coordinator = createPageRefreshTaskCoordinator();
  const cycle = createPageRefreshCycle("market", 1, "manual", { createId: () => "http-failure" });
  coordinator.beginCycle(cycle);
  const response = { ok: false, status: 503 };
  const tracked = coordinator.trackPromise(cycle.id, "market-overview", Promise.resolve(response));
  coordinator.seal(cycle.id);

  assert.equal(await tracked, response, "callers still receive and parse the response");
  assert.equal(coordinator.snapshot().status, "complete");
  assert.equal(coordinator.snapshot().lastSuccessfulAt, null);
  assert.deepEqual(coordinator.snapshot().errors, ["market-overview HTTP 503"]);
});

test("hidden initial and navigation starts defer to one visible catch-up", () => {
  const clock = createFakeClock();
  const cycles = [];
  const controller = createPageRefreshController({
    page: "dashboard",
    intervalMs: 30_000,
    visible: false,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createId: () => `hidden-start-${cycles.length + 1}`,
    onCycle: (cycle) => cycles.push(cycle),
  });

  assert.equal(controller.start(), null);
  assert.equal(controller.setPage("members"), null);
  assert.equal(cycles.length, 0);
  controller.setVisible(true);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].page, "members");
  assert.equal(cycles[0].reason, "visibility-catch-up");
});

test("duplicate task keys wait for every request and obsolete aborts do not fail the cycle", async () => {
  let resolveFirst;
  let rejectSecond;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const second = new Promise((_resolve, reject) => { rejectSecond = reject; });
  const coordinator = createPageRefreshTaskCoordinator({ now: () => 42_000 });
  const cycle = createPageRefreshCycle("market", 1, "interval", { createId: () => "duplicates" });
  coordinator.beginCycle(cycle);
  const trackedFirst = coordinator.trackPromise(cycle.id, "market-detail", first);
  const trackedSecond = coordinator.trackPromise(cycle.id, "market-detail", second);
  coordinator.seal(cycle.id);

  resolveFirst("ok");
  await trackedFirst;
  assert.equal(coordinator.snapshot().status, "refreshing");
  const abort = new Error("obsolete filter request");
  abort.name = "AbortError";
  rejectSecond(abort);
  await assert.rejects(trackedSecond, { name: "AbortError" });
  assert.equal(coordinator.snapshot().status, "complete");
  assert.deepEqual(coordinator.snapshot().errors, []);
  assert.equal(coordinator.snapshot().lastSuccessfulAt, 42_000);
});
