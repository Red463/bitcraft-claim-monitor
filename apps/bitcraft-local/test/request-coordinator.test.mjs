import assert from "node:assert/strict";
import test from "node:test";

import { createRequestCoordinator } from "../src/server/requestCoordinator.mjs";

test("request coordinator shares identical work and limits distinct concurrency", async () => {
  const coordinator = createRequestCoordinator({ concurrency: 8 });
  let active = 0;
  let maximum = 0;
  let releases = [];
  const load = (value) => coordinator.run(value, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => releases.push(resolve));
    active -= 1;
    return value;
  });

  const sharedA = load("shared");
  const sharedB = load("shared");
  const distinct = Array.from({ length: 11 }, (_, index) => load(`key-${index}`));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 8);
  while (releases.length) {
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setImmediate(resolve));
  }
  const values = await Promise.all([sharedA, sharedB, ...distinct]);
  assert.equal(values[0], "shared");
  assert.equal(values[1], "shared");
  assert.equal(maximum, 8);
  assert.equal(coordinator.stats().inflightReuse, 1);
});

test("request coordinator clears failed work so it can be retried", async () => {
  const coordinator = createRequestCoordinator({ concurrency: 1 });
  await assert.rejects(coordinator.run("retry", async () => { throw new Error("first"); }), /first/);
  assert.equal(await coordinator.run("retry", async () => "second"), "second");
});
