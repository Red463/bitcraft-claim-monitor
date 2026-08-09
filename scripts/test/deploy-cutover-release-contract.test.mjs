import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { releaseVersionAlreadyAnnounced } from "../../apps/bitcraft-local/src/server/appRelease.mjs";

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
const changelog = read("CHANGELOG.md");
const deployment = read("DEPLOYMENT.md");
const envExample = read("deploy/bitcraft-claim-monitor-relay.env.example");
const packageJson = JSON.parse(read("apps/bitcraft-local/package.json"));
const privacy = read("docs/privacy-operations-runbook.md");
const readme = read("README.md");
const updater = read("deploy/update-bitcraft-claim-monitor-relay");
const workflow = read(".github/workflows/cutover-relay-production.yml");

test("canonical cutover is exactly the new-minor 0.52.0-beta.1 release dated 2026-08-09", () => {
  assert.equal(packageJson.version, "0.52.0-beta.1");
  assert.match(changelog, /^## \[0\.52\.0-beta\.1\] - 2026-08-09$/m);
  for (const requirement of [
    /canonical cutover preparation/i,
    /account.*configuration.*migration/i,
    /sign in again|forced re-login/i,
    /privacy/i,
    /single.*Discord|Discord.*single/i,
    /Relay.*redirect|redirected.*Relay/i,
    /maintenance/i,
    /14-day forensic/i,
  ]) assert.match(changelog, requirement);
});

test("Task 4 marker suppresses the ordinary beta.1 update before Relay services start", () => {
  assert.equal(releaseVersionAlreadyAnnounced({ lastAnnounced: "0.52.0-beta.1", appVersion: "0.52.0-beta.1" }), true);
  const cutover = read("deploy/cutover-relay-production.mjs");
  const applyFlow = cutover.slice(
    cutover.indexOf("async function apply("),
    cutover.indexOf("async function abort("),
  );
  const marker = applyFlow.indexOf('invoke(operations, "seedReleaseAnnouncementMarker"');
  const start = applyFlow.indexOf('invoke(operations, "startRelayServices"');
  assert.ok(marker >= 0 && start > marker);
});

test("workflow leaves secrets remote, runs deployment contracts, and budgets the post-admission intensive soak", () => {
  assert.match(workflow, /environment: relay-preview/);
  assert.match(workflow, /environment: relay-cutover/);
  assert.match(workflow, /sudo "\$\(command -v node\)" --test scripts\/test\/deploy-\*\.test\.mjs/);
  assert.match(workflow, /apply:[\s\S]*?timeout-minutes: 75/);
  assert.match(workflow, /Full diagnostics remain on the VPS/);
  assert.doesNotMatch(workflow, /GITHUB_STEP_SUMMARY[^\n]*(?:TOKEN|PRIVATE_KEY|CLIENT_SECRET)/i);
  assert.doesNotMatch(workflow, /cat\s+[^\n]*(?:\.env|privacy-ledger\.key|backup-encryption\.key)/i);
  assert.match(workflow, /skip_soak:[\s\S]*type: boolean[\s\S]*default: false/);
  assert.match(workflow, /inputs\.skip_soak[\s\S]*--skip-soak/);
});

test("routine environment remains preview-safe and documents the exact canonical activation boundary", () => {
  assert.match(envExample, /^BITCRAFT_DEPLOYMENT_MODE=preview$/m);
  assert.match(envExample, /^DISCORD_DELIVERY_MODE=record$/m);
  assert.match(envExample, /^ENABLE_DISCORD_STARTUP=false$/m);
  assert.match(envExample, /routine deployment.*preview/i);
  assert.match(envExample, /BITCRAFT_DEPLOYMENT_MODE=canonical/);
  assert.match(envExample, /DISCORD_DELIVERY_MODE=live/);
  assert.match(envExample, /ENABLE_DISCORD_STARTUP=true/);
  assert.match(envExample, /https:\/\/app\.timbersteeltrade\.com\/api\/local\/auth\/discord\/callback/);
});

test("README and runbook carry every operator and security boundary", () => {
  const combined = `${readme}\n${deployment}`;
  for (const requirement of [
    /preview.*record-only/i,
    /canonical.*live Discord/i,
    /relay-preview/,
    /relay-cutover/,
    /app\.timbersteeltrade\.com/,
    /cutover -> deploy -> backup/,
    /encrypted/i,
    /prepare.*apply.*abort/is,
    /apply.*revision.*success.*failed/is,
    /abort.*revision.*restored.*failed-or-admitted/is,
    /profession repair/i,
    /selective migration/i,
    /10-minute target/i,
    /15-minute.*watchdog/i,
    /30-minute.*intensive/i,
    /24-hour.*follow-up/i,
    /pre-admission.*abort/i,
    /post-admission.*fix-forward/i,
    /14-day.*stopped.*masked/is,
    /separate approval.*final encrypted archive/i,
    /no cleanup command/i,
  ]) assert.match(combined, requirement);
  assert.match(deployment, /verify-canonical-soak\.mjs[^\n]*--profile intensive/);
  assert.match(deployment, /systemd-run[\s\S]*verify-canonical-soak\.mjs[\s\S]*--profile follow-up/);
});

test("restore and privacy instructions bound previous-key retirement and forbid legacy deletion in this release", () => {
  assert.match(privacy, /previous.*verification key/i);
  assert.match(privacy, /remaining.*90-day/i);
  assert.match(privacy, /key ID/i);
  assert.match(deployment, /legacy deletion requires a separate approval/i);
  assert.match(deployment, /final encrypted archive/i);
  assert.match(deployment, /no cleanup command/i);
  assert.doesNotMatch(deployment, /rm -rf .*bitcraft-claim-monitor(?!-relay)/i);
});

test("ordinary deployments syntax-check the soak verifier shipped beside the cutover helper", () => {
  assert.match(updater, /node --check[\s\\\n]+"\$release_dir\/deploy\/verify-canonical-soak\.mjs"/);
});
