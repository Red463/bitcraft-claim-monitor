import assert from "node:assert/strict";
import test from "node:test";

import { resolveDiscordOAuthConfig } from "../src/server/discordOAuthConfig.mjs";

test("resolveDiscordOAuthConfig prefers environment client id and secret before stored settings", () => {
  assert.deepEqual(resolveDiscordOAuthConfig({
    env: {
      DISCORD_OAUTH_CLIENT_ID: " env-client ",
      DISCORD_OAUTH_CLIENT_SECRET: " env-secret ",
      DISCORD_OAUTH_REDIRECT_URI: " https://claim.example/oauth ",
    },
    discordSettings: { applicationId: "settings-client" },
    storedClientSecret: "stored-secret",
    origin: "https://fallback.example",
  }), {
    clientId: "env-client",
    clientSecret: "env-secret",
    redirectUri: "https://claim.example/oauth",
    enabled: true,
  });
});

test("resolveDiscordOAuthConfig falls back to dashboard settings, stored secret, and origin callback", () => {
  assert.deepEqual(resolveDiscordOAuthConfig({
    env: {},
    discordSettings: { applicationId: " settings-client " },
    storedClientSecret: " stored-secret ",
    origin: "https://claim.example",
  }), {
    clientId: "settings-client",
    clientSecret: "stored-secret",
    redirectUri: "https://claim.example/api/local/auth/discord/callback",
    enabled: true,
  });
});

test("resolveDiscordOAuthConfig disables Discord login when either id or secret is missing", () => {
  assert.equal(resolveDiscordOAuthConfig({
    env: { DISCORD_OAUTH_CLIENT_ID: "client" },
    discordSettings: {},
    storedClientSecret: "",
    origin: "https://claim.example",
  }).enabled, false);

  assert.equal(resolveDiscordOAuthConfig({
    env: { DISCORD_OAUTH_CLIENT_SECRET: "secret" },
    discordSettings: {},
    storedClientSecret: "",
    origin: "https://claim.example",
  }).enabled, false);
});
