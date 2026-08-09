import assert from "node:assert/strict";
import test from "node:test";

let deploymentRuntime = null;
try {
  deploymentRuntime = await import("../src/server/deploymentRuntime.mjs");
} catch {
  // The first TDD run proves the deployment runtime guard is absent.
}

const canonicalWorker = {
  NODE_ENV: "production",
  BITCRAFT_DEPLOYMENT_MODE: "canonical",
  BITCRAFT_PROCESS_ROLE: "worker",
  DISCORD_DELIVERY_MODE: "live",
  ENABLE_DISCORD_STARTUP: "true",
  LEGAL_CONFIGURATION_CONFIRMED: "true",
  DISCORD_OAUTH_CLIENT_ID: "123456789012345678",
  DISCORD_OAUTH_CLIENT_SECRET: "oauth-secret",
  DISCORD_BOT_TOKEN: "bot-secret",
};

test("preview defaults to record-only Discord with no gateway", () => {
  assert.ok(deploymentRuntime, "deployment runtime module must exist");
  const { health, ...runtime } = deploymentRuntime.resolveDeploymentRuntime({});
  assert.equal(typeof health, "function");
  assert.deepEqual(runtime, {
    mode: "preview",
    canonicalOrigin: "https://app.timbersteeltrade.com",
    oauthCallbackUrl: "https://app.timbersteeltrade.com/api/local/auth/discord/callback",
    discordDeliveryMode: "record",
    discordGatewayEnabled: false,
    discordReady: false,
  });
});

test("canonical worker requires live Discord, legal confirmation, identity, token, and canonical callback", () => {
  assert.ok(deploymentRuntime, "deployment runtime module must exist");
  const runtime = deploymentRuntime.resolveDeploymentRuntime({
    ...canonicalWorker,
    DISCORD_OAUTH_REDIRECT_URI: "https://app.timbersteeltrade.com/api/local/auth/discord/callback",
  });
  assert.equal(runtime.mode, "canonical");
  assert.equal(runtime.discordDeliveryMode, "live");
  assert.equal(runtime.discordGatewayEnabled, true);
  assert.equal(runtime.discordReady, true);

  for (const [key, value] of [
    ["DISCORD_DELIVERY_MODE", "record"],
    ["ENABLE_DISCORD_STARTUP", "false"],
    ["LEGAL_CONFIGURATION_CONFIRMED", "false"],
    ["DISCORD_OAUTH_CLIENT_ID", ""],
    ["DISCORD_OAUTH_CLIENT_SECRET", ""],
    ["DISCORD_BOT_TOKEN", ""],
    ["DISCORD_OAUTH_REDIRECT_URI", "https://preview.example/api/local/auth/discord/callback"],
  ]) {
    assert.throws(() => deploymentRuntime.resolveDeploymentRuntime({
      ...canonicalWorker,
      DISCORD_OAUTH_REDIRECT_URI: "https://app.timbersteeltrade.com/api/local/auth/discord/callback",
      [key]: value,
    }), /canonical/i, `${key} mismatch must fail startup`);
  }
});

test("canonical web remains HTTP-only and production rejects a combined process role", () => {
  assert.ok(deploymentRuntime, "deployment runtime module must exist");
  const web = deploymentRuntime.resolveDeploymentRuntime({
    ...canonicalWorker,
    BITCRAFT_PROCESS_ROLE: "web",
    ENABLE_DISCORD_STARTUP: "false",
  });
  assert.equal(web.discordGatewayEnabled, false);
  assert.throws(() => deploymentRuntime.resolveDeploymentRuntime({
    ...canonicalWorker,
    BITCRAFT_PROCESS_ROLE: "web",
  }), /worker/i);
  assert.throws(() => deploymentRuntime.resolveDeploymentRuntime({
    ...canonicalWorker,
    BITCRAFT_PROCESS_ROLE: "all",
  }), /separate web and worker/i);
});

test("health exposes only safe deployment readiness metadata", () => {
  assert.ok(deploymentRuntime, "deployment runtime module must exist");
  const runtime = deploymentRuntime.resolveDeploymentRuntime(canonicalWorker);
  assert.deepEqual(runtime.health({ version: "0.52.0-beta.1", buildSha: "0123456789ab" }), {
    ok: true,
    deploymentMode: "canonical",
    canonicalOrigin: "https://app.timbersteeltrade.com",
    discordReady: true,
    version: "0.52.0-beta.1",
    buildSha: "0123456789ab",
  });
});
