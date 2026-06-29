import assert from "node:assert/strict";
import test from "node:test";

import { processRoleCapabilities, resolveProcessRole } from "../src/server/processRole.mjs";

test("resolveProcessRole keeps local development as combined web and worker", () => {
  assert.equal(resolveProcessRole({}, { isProduction: false }), "all");
});
test("resolveProcessRole defaults production to web-only", () => {
  assert.equal(resolveProcessRole({}, { isProduction: true }), "web");
});

test("resolveProcessRole honors explicit web and worker roles", () => {
  assert.equal(resolveProcessRole({ BITCRAFT_PROCESS_ROLE: "web" }, { isProduction: true }), "web");
  assert.equal(resolveProcessRole({ BITCRAFT_PROCESS_ROLE: "worker" }, { isProduction: true }), "worker");
});

test("processRoleCapabilities keeps public web requests separate from background jobs", () => {
  assert.deepEqual(processRoleCapabilities("web"), {
    serveHttp: true,
    runBackgroundJobs: false,
  });
  assert.deepEqual(processRoleCapabilities("worker"), {
    serveHttp: false,
    runBackgroundJobs: true,
  });
  assert.deepEqual(processRoleCapabilities("all"), {
    serveHttp: true,
    runBackgroundJobs: true,
  });
});
