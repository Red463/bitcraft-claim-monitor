import assert from "node:assert/strict";
import test from "node:test";

import { createRelayClaimScopeFence } from "../src/server/relayClaimScopeFence.mjs";

test("claim-scope fence stops every old claim runtime before the caller can start a new provider", async () => {
  const events = [];
  const fence = createRelayClaimScopeFence([
    { stop: async () => events.push("public-crafts stopped") },
    { stop: async () => events.push("regional-market stopped") },
    { stop: async () => events.push("claim-market stopped") },
    { stop: async () => events.push("primary-region stopped") },
  ]);

  assert.equal(await fence.reconcile("1"), false);
  assert.equal(await fence.reconcile("2"), true);
  events.push("new provider attempted");

  assert.deepEqual(events, [
    "public-crafts stopped",
    "regional-market stopped",
    "claim-market stopped",
    "primary-region stopped",
    "new provider attempted",
  ]);
  assert.equal(fence.activeClaimId(), "2");
});

test("claim-scope fence keeps the old claim active when any runtime cannot be fenced", async () => {
  const fence = createRelayClaimScopeFence([
    { stop: async () => {} },
    { stop: async () => { throw new Error("stop failed"); } },
  ]);
  await fence.reconcile("1");

  await assert.rejects(fence.reconcile("2"), /Failed to fence Relay claim 1/);
  assert.equal(fence.activeClaimId(), "1");
});

test("claim-scope fence serializes competing claim changes", async () => {
  const stopped = [];
  const fence = createRelayClaimScopeFence([
    { stop: async () => stopped.push(fence.activeClaimId()) },
  ]);
  await fence.reconcile("1");

  await Promise.all([fence.reconcile("2"), fence.reconcile("3")]);
  assert.deepEqual(stopped, ["1", "2"]);
  assert.equal(fence.activeClaimId(), "3");
});

test("claim switch waits for an old reconciliation then fences everything it started", async () => {
  const events = [];
  let releaseOldReconciliation;
  let oldReconciliationEntered;
  const entered = new Promise((resolve) => { oldReconciliationEntered = resolve; });
  const release = new Promise((resolve) => { releaseOldReconciliation = resolve; });
  const fence = createRelayClaimScopeFence([
    { stop: async () => events.push("old runtime stopped") },
  ]);
  await fence.reconcile("1");

  const oldRun = fence.run("1", async () => {
    events.push("old reconciliation entered");
    oldReconciliationEntered();
    await release;
    events.push("old runtime started");
  });
  await entered;
  const claimSwitch = fence.reconcile("2");
  await Promise.resolve();
  assert.equal(fence.activeClaimId(), "1");

  releaseOldReconciliation();
  assert.equal(await oldRun, true);
  assert.equal(await claimSwitch, true);
  assert.deepEqual(events, [
    "old reconciliation entered",
    "old runtime started",
    "old runtime stopped",
  ]);
  assert.equal(fence.activeClaimId(), "2");
  assert.equal(await fence.run("1", () => assert.fail("retired claim must not run")), false);
});
