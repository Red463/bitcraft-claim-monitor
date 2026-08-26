import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { sendJson } from "../src/server/httpResponses.mjs";
import { HeavyRouteCapacityError, createHeavyRouteGate, createRoutePerformanceTelemetry, sendHeavyRouteCapacityResponse } from "../src/server/routePerformance.mjs";

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Map();
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) this.headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  write() {
    return true;
  }

  end() {
    this.emit("finish");
    return this;
  }
}

function observe(telemetry, rawUrl, { contentLength, body = "", projectionMs } = {}) {
  const response = new FakeResponse();
  const request = { url: rawUrl, headers: { cookie: "session=private-cookie" } };
  const measurement = telemetry.observe(request, response);
  if (projectionMs !== undefined) measurement.recordProjection(projectionMs);
  response.writeHead(200, contentLength === undefined ? { "content-type": "application/json" } : { "content-length": contentLength });
  response.end(body);
}

test("route telemetry records declared content length and keeps projection timing separate", () => {
  let now = 1_000;
  const telemetry = createRoutePerformanceTelemetry({ maxEntries: 10, now: () => now });
  const response = new FakeResponse();
  const measurement = telemetry.observe({ url: "/api/local/game-data?claimId=145544610234630144" }, response);
  now += 40;
  measurement.recordProjection(7);
  response.writeHead(200, { "content-length": "321" });
  response.end("ignored");

  const route = telemetry.snapshot().routes[0];
  assert.equal(route.path, "/api/local/game-data");
  assert.deepEqual(route.durationMs, { p50: 40, p95: 40, p99: 40 });
  assert.deepEqual(route.projectionMs, { p50: 7, p95: 7, p99: 7 });
  assert.deepEqual(route.responseBytes, { p50: 321, p95: 321, p99: 321 });
});

test("route telemetry counts JSON body bytes when no content length is declared", () => {
  const telemetry = createRoutePerformanceTelemetry({ maxEntries: 10, now: () => 5_000 });
  const json = JSON.stringify({ ok: true, label: "Timbersteel" });
  observe(telemetry, "/api/local/market/order-book?itemId=987&claimId=123", { body: json });

  assert.equal(telemetry.snapshot().routes[0].responseBytes.p99, Buffer.byteLength(json));
});

test("route telemetry retains only bounded normalized paths and never request secrets", () => {
  const telemetry = createRoutePerformanceTelemetry({ maxEntries: 2, now: () => 8_000 });
  observe(telemetry, "/api/local/market/order-book/987?claimId=123&cookie=private-cookie");
  observe(telemetry, "/api/local/history?claimId=456");
  observe(telemetry, "/api/local/game-data?claimId=789");

  const snapshot = telemetry.snapshot();
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.sampleCount, 2);
  assert.deepEqual(snapshot.routes.map((route) => route.path).sort(), ["/api/local/game-data", "/api/local/history"]);
  assert.doesNotMatch(serialized, /987|123|456|789|private-cookie|claimId|itemId/);
});

test("route telemetry reports only named would-limit counters", () => {
  const telemetry = createRoutePerformanceTelemetry({ maxEntries: 2 });
  telemetry.recordRateLimitDecision({ name: "gameDataRead", reportOnly: true, wouldLimit: true, address: "203.0.113.90", query: "claimId=123" });
  telemetry.recordRateLimitDecision({ name: "gameDataRead", reportOnly: true, wouldLimit: true, cookie: "session=private" });

  assert.deepEqual(telemetry.snapshot().rateLimits, {
    gameDataRead: { reportOnly: true, wouldLimit: 2 },
  });
  assert.doesNotMatch(JSON.stringify(telemetry.snapshot()), /203\.0\.113\.90|claimId|session=private/);
});

test("heavy route gate caps eight active projections, queues sixteen, then rejects with bounded retry metadata", async () => {
  const gate = createHeavyRouteGate({ maxConcurrent: 8, maxQueued: 16 });
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;
  const project = () => gate.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await blocker;
    active -= 1;
    return "projected";
  });

  const accepted = Array.from({ length: 24 }, project);
  await Promise.resolve();
  assert.deepEqual(gate.snapshot(), { active: 8, queued: 16, rejected: 0, maxConcurrent: 8, maxQueued: 16 });
  await assert.rejects(project(), (error) => {
    assert.equal(error instanceof HeavyRouteCapacityError, true);
    assert.equal(error.statusCode, 503);
    assert.equal(error.retryAfter, 1);
    return true;
  });
  assert.equal(gate.snapshot().rejected, 1);

  release();
  assert.deepEqual(await Promise.all(accepted), Array(24).fill("projected"));
  assert.equal(maximumActive, 8);
  assert.deepEqual(gate.snapshot(), { active: 0, queued: 0, rejected: 1, maxConcurrent: 8, maxQueued: 16 });
});

test("separate heavy route gates admit game-data and market projections independently", async () => {
  const gameDataGate = createHeavyRouteGate({ maxConcurrent: 1, maxQueued: 0 });
  const marketGate = createHeavyRouteGate({ maxConcurrent: 1, maxQueued: 0 });
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const game = gameDataGate.run(() => blocker);
  const market = marketGate.run(() => blocker);
  await Promise.resolve();

  assert.equal(gameDataGate.snapshot().active, 1);
  assert.equal(marketGate.snapshot().active, 1);
  release();
  await Promise.all([game, market]);
});

test("a saturated heavy route returns a bounded JSON 503 response over HTTP", async (t) => {
  const gate = createHeavyRouteGate({ maxConcurrent: 1, maxQueued: 0 });
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const occupied = gate.run(() => blocker);
  await Promise.resolve();

  const server = createServer(async (_req, res) => {
    try {
      await gate.run(() => ({ ok: true }));
      sendJson(res, 200, { ok: true });
    } catch (error) {
      if (!sendHeavyRouteCapacityResponse(error, res, sendJson)) throw error;
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/local/game-data`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "1");
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), {
    error: "Server projection capacity is temporarily full.",
    source: "projection-capacity",
    retryAfter: 1,
  });

  release();
  await occupied;
});
