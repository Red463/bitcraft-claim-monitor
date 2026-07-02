import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../deploy/update-bitcraft-monitor", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../../DEPLOYMENT.md", import.meta.url), "utf8");
const gitAttributes = readFileSync(new URL("../../.gitattributes", import.meta.url), "utf8");

test("VPS update script reports code changes and waits for service health", () => {
  assert.match(script, /git -C "\$APP_DIR" rev-parse --short HEAD/);
  assert.match(script, /Previous revision/);
  assert.match(script, /Current revision/);
  assert.match(script, /git -C "\$APP_DIR" diff --stat/);
  assert.match(script, /wait_for_service\(\)/);
  assert.match(script, /wait_for_health\(\)/);
  assert.match(script, /curl -fsS --max-time 3 "\$HEALTH_URL"/);
  assert.match(script, /Waiting for web health/);
});

test("deployment docs use the tracked update helper", () => {
  assert.match(readme, /deploy\/update-bitcraft-monitor/);
  assert.match(deployment, /deploy\/update-bitcraft-monitor/);
  assert.match(deployment, /install -m 755 deploy\/update-bitcraft-monitor \/usr\/local\/bin\/update-bitcraft-monitor/);
});

test("VPS update script is checked out with Unix line endings", () => {
  assert.match(gitAttributes, /deploy\/update-bitcraft-monitor\s+text\s+eol=lf/);
});