import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("favorite quote benchmark tool reproduces parity and request/payload comparison", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/benchmark-favorite-quotes.mjs", import.meta.url)),
    "--samples=1",
    "--orders-per-favorite=4",
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.fixture, {
    favorites: 20,
    orders: 80,
    regionId: "19",
    samples: 1,
    concurrency: 1,
    cache: "cold",
  });
  assert.equal(summary.parity, true);
  assert.equal(summary.old.requestsPerCycle, 20);
  assert.equal(summary.new.requestsPerCycle, 1);
  assert.ok(summary.old.payloadBytes > summary.new.payloadBytes);
  assert.ok(Number.isFinite(summary.old.meanCpuMs));
  assert.ok(Number.isFinite(summary.new.p95CpuMs));
});
