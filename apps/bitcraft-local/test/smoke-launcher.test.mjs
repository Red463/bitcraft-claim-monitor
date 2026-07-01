import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../../scripts/start-bitcraft-local-smoke.mjs", import.meta.url), "utf8");

test("smoke launcher detaches cleanly and disables background work", () => {
  assert.match(script, /BITCRAFT_PROCESS_ROLE:\s*"web"/);
  assert.match(script, /ENABLE_SERVER_POLLING:\s*"false"/);
  assert.match(script, /ENABLE_SCHEDULED_JOBS:\s*"false"/);
  assert.match(script, /ENABLE_DISCORD_STARTUP:\s*"false"/);
  assert.match(script, /child\.unref\(\);\s*closeSync\(out\);\s*closeSync\(err\);/);
});

test("smoke launcher force restart uses a bounded Windows process-tree kill", () => {
  assert.match(script, /process\.platform === "win32"/);
  assert.match(script, /execFileWithTimeout\("taskkill\.exe", \["\/PID", String\(pid\), "\/T", "\/F"\], 5_000\)/);
});