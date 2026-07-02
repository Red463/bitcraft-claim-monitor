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

test("VPS update script keeps successful output compact while logging details", () => {
  assert.match(script, /LOG_FILE="\$\{LOG_FILE:-\/tmp\/bitcraft-claim-monitor-update-\$\(date \+%Y%m%d-%H%M%S\)\.log\}"/);
  assert.match(script, /Full log: \$LOG_FILE/);
  assert.match(script, /run_logged\(\)/);
  assert.match(script, /run_logged "Installing dependencies"/);
  assert.match(script, /run_logged "Building app"/);
  assert.match(script, /BUILD_STARTED=/);
  assert.match(script, /Build completed in/);
});

test("VPS update script exposes verbose and public-check controls", () => {
  assert.match(script, /--verbose/);
  assert.match(script, /--no-public-check/);
  assert.match(script, /VERBOSE=1/);
  assert.match(script, /SKIP_PUBLIC_CHECK=1/);
});

test("VPS update script prints concise readiness and failure diagnostics", () => {
  assert.match(script, /service_summary\(\)/);
  assert.match(script, /systemctl show "\$service"/);
  assert.match(script, /journalctl -u "\$service"/);
  assert.match(script, /tail -n 80 "\$LOG_FILE"/);
  assert.match(script, /Health: ok=/);
  assert.match(script, /Public: /);
  assert.match(script, /Updated from/);
  assert.match(script, /Next: open \$PUBLIC_URL/);
});

test("deployment docs use the tracked update helper", () => {
  assert.match(readme, /deploy\/update-bitcraft-monitor/);
  assert.match(deployment, /deploy\/update-bitcraft-monitor/);
  assert.match(deployment, /install -m 755 deploy\/update-bitcraft-monitor \/usr\/local\/bin\/update-bitcraft-monitor/);
  assert.match(deployment, /compact success summary/);
  assert.match(deployment, /full command output is written to/);
  assert.match(deployment, /--verbose/);
  assert.match(deployment, /--no-public-check/);
});

test("VPS update script is checked out with Unix line endings", () => {
  assert.match(gitAttributes, /deploy\/update-bitcraft-monitor\s+text\s+eol=lf/);
});