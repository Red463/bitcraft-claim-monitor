import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { smokeServerEnvironment } from "../../../scripts/smoke-server-environment.mjs";

const script = readFileSync(new URL("../../../scripts/start-bitcraft-local-smoke.mjs", import.meta.url), "utf8");

test("smoke launcher detaches cleanly with preview background collection", () => {
  const environment = smokeServerEnvironment({
    inherited: {},
    repoRoot: path.resolve("C:/workspace/claim-monitor"),
    adminReview: false,
    port: "18449",
  });
  assert.equal(environment.BITCRAFT_PROCESS_ROLE, "all");
  assert.equal(environment.ENABLE_SERVER_POLLING, "false");
  assert.equal(environment.ENABLE_SCHEDULED_JOBS, "false");
  assert.equal(environment.ENABLE_DISCORD_STARTUP, "false");
  assert.match(script, /child\.unref\(\);\s*closeSync\(out\);\s*closeSync\(err\);/);
});

test("smoke launcher force restart uses a bounded Windows process-tree kill", () => {
  assert.match(script, /process\.platform === "win32"/);
  assert.match(script, /execFileWithTimeout\("taskkill\.exe", \["\/PID", String\(pid\), "\/T", "\/F"\], 5_000\)/);
});

test("smoke launcher isolates explicit admin review mode from ordinary smoke startup", () => {
  const repoRoot = path.resolve("C:/workspace/claim-monitor");
  const inherited = { SENTINEL: "preserved", BITCRAFT_SMOKE_ADMIN_BYPASS: "true" };

  const reviewEnvironment = smokeServerEnvironment({ inherited, repoRoot, adminReview: true, port: "18449" });
  assert.equal(reviewEnvironment.SENTINEL, "preserved");
  assert.equal(reviewEnvironment.APP_HOST, "127.0.0.1");
  assert.equal(reviewEnvironment.BITCRAFT_SMOKE_ADMIN_BYPASS, "true");
  assert.equal(reviewEnvironment.BITCRAFT_LOCAL_DATA_DIR, path.join(repoRoot, ".codex-dev", "admin-review-data"));

  const ordinaryEnvironment = smokeServerEnvironment({ inherited, repoRoot, adminReview: false, port: "18449" });
  assert.equal(ordinaryEnvironment.BITCRAFT_SMOKE_ADMIN_BYPASS, "false");
  assert.equal(ordinaryEnvironment.BITCRAFT_LOCAL_DATA_DIR, path.join(repoRoot, ".dev-data"));
});
