import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCORD_OAUTH_STATE_COOKIE_NAME,
  DISCORD_OAUTH_STATE_MAX_AGE_SECONDS,
  clearOAuthStateCookie,
  oauthStateCookie,
  readOAuthStateCookie,
  signedOAuthStateValue,
  verifySignedOAuthStateValue,
} from "../src/server/oauthState.mjs";

test("OAuth state constants preserve the existing Discord state cookie policy", () => {
  assert.equal(DISCORD_OAUTH_STATE_COOKIE_NAME, "bitcraft_discord_oauth_state");
  assert.equal(DISCORD_OAUTH_STATE_MAX_AGE_SECONDS, 600);
});

test("signedOAuthStateValue and verifySignedOAuthStateValue round-trip and reject tampering", () => {
  const secret = "state-secret";
  const payload = JSON.stringify({ state: "abc", returnTo: "/?page=market" });
  const signed = signedOAuthStateValue(payload, secret);
  const [encoded, signature] = signed.split(".");

  assert.equal(Buffer.from(encoded, "base64url").toString("utf8"), payload);
  assert.ok(signature);
  assert.equal(verifySignedOAuthStateValue(signed, secret), encoded);
  assert.equal(verifySignedOAuthStateValue(`${encoded}.tampered`, secret), null);
  assert.equal(verifySignedOAuthStateValue(`${encoded}.${signature}.extra`, secret), null);
  assert.equal(verifySignedOAuthStateValue(signed, "wrong-secret"), null);
});

test("OAuth state cookies clamp return paths and read only valid signed payloads", () => {
  const secret = "state-secret";
  const cookie = oauthStateCookie("state-token", "https://evil.example/path", { secret, secure: true });

  assert.equal(
    cookie,
    `bitcraft_discord_oauth_state=${encodeURIComponent(signedOAuthStateValue(JSON.stringify({ state: "state-token", returnTo: "/?page=dashboard" }), secret))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
  );
  assert.deepEqual(
    readOAuthStateCookie({ headers: { cookie } }, secret),
    { state: "state-token", returnTo: "/?page=dashboard" },
  );
  assert.equal(readOAuthStateCookie({ headers: { cookie: "bitcraft_discord_oauth_state=invalid" } }, secret), null);
  assert.equal(readOAuthStateCookie({ headers: {} }, secret), null);
});

test("clearOAuthStateCookie keeps the existing clear-cookie shape", () => {
  assert.equal(
    clearOAuthStateCookie({ secure: false }),
    "bitcraft_discord_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
});
