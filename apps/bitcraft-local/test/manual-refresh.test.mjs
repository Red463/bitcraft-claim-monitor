import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLIENT_MANUAL_REFRESH_COOLDOWN_MS,
  cooldownRemainingMs,
  createManualRefreshRequest,
  createManualRefreshTaskCoordinator,
  manualRefreshApplies,
  manualRefreshHeaders,
} from "../src/refresh/manualRefresh.mjs";

const REQUEST_A = "2f3f1848-5f2d-43a4-9885-f92e6216b082";
const REQUEST_B = "9de66279-071d-4878-bffc-3d14f0c31720";

test("manual request applies only to the page where it was started", () => {
  const request = createManualRefreshRequest("planning", 2, { id: REQUEST_A, now: () => 1_000 });

  assert.deepEqual(request, { id: REQUEST_A, page: "planning", sequence: 2, requestedAt: 1_000 });
  assert.equal(manualRefreshApplies(request, "planning"), true);
  assert.equal(manualRefreshApplies(request, "production"), false);
  assert.deepEqual(manualRefreshHeaders(request, "planning"), { "x-manual-refresh-id": REQUEST_A });
  assert.deepEqual(manualRefreshHeaders(request, "production"), {});
});

test("manual refresh cooldown counts down from exactly fifteen seconds", () => {
  assert.equal(CLIENT_MANUAL_REFRESH_COOLDOWN_MS, 15_000);
  assert.equal(cooldownRemainingMs(1_000, 1_000), 15_000);
  assert.equal(cooldownRemainingMs(1_000, 15_999), 1);
  assert.equal(cooldownRemainingMs(1_000, 16_000), 0);
  assert.equal(cooldownRemainingMs(null, 16_000), 0);
});

test("coordinator completes only after registration is sealed and every task settles", () => {
  const changes = [];
  const coordinator = createManualRefreshTaskCoordinator({ onStateChange: (state) => changes.push(state) });
  coordinator.beginRequest(REQUEST_A);
  const finishMain = coordinator.beginTask(REQUEST_A, "main");
  const finishPage = coordinator.beginTask(REQUEST_A, "page");

  coordinator.seal(REQUEST_A);
  finishMain();
  assert.equal(coordinator.snapshot().status, "refreshing");
  assert.deepEqual(coordinator.snapshot().pendingTasks, ["page"]);

  finishPage();
  assert.equal(coordinator.snapshot().status, "complete");
  assert.deepEqual(coordinator.snapshot().pendingTasks, []);
  assert.equal(changes.at(-1).status, "complete");
});

test("coordinator ignores stale requests and idempotently finishes tasks", () => {
  const coordinator = createManualRefreshTaskCoordinator();
  coordinator.beginRequest(REQUEST_A);
  const finish = coordinator.beginTask(REQUEST_A, "main");
  coordinator.beginRequest(REQUEST_B);
  finish(new Error("stale failure"));
  coordinator.seal(REQUEST_B);

  assert.deepEqual(coordinator.snapshot(), {
    requestId: REQUEST_B,
    status: "complete",
    pendingTasks: [],
    errors: [],
  });
});

test("coordinator aggregates active request failures without swallowing completion", () => {
  const coordinator = createManualRefreshTaskCoordinator();
  coordinator.beginRequest(REQUEST_A);
  const finish = coordinator.beginTask(REQUEST_A, "planner");
  coordinator.seal(REQUEST_A);
  finish(new Error("planner unavailable"));
  finish(new Error("duplicate finish"));

  assert.deepEqual(coordinator.snapshot(), {
    requestId: REQUEST_A,
    status: "complete",
    pendingTasks: [],
    errors: ["planner unavailable"],
  });
});

test("React context tracks page promises without swallowing rejections", () => {
  const context = readFileSync(new URL("../src/refresh/ManualRefreshContext.tsx", import.meta.url), "utf8");

  assert.match(context, /ManualRefreshProvider/);
  assert.match(context, /useManualRefresh/);
  assert.match(context, /trackPromise/);
  assert.match(context, /coordinator\.trackPromise/);
});
