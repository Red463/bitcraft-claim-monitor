import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCORD_OAUTH_STATE_COOKIE_NAME,
  DISCORD_OAUTH_STATE_MAX_AGE_SECONDS,
  clearOAuthStateCookie,
  oauthStateCookie,
  readOAuthStateCookie,
  resolveOAuthStateSecret,
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
  const legal = {
    version: "2026-07-25",
    termsDigest: "terms",
    privacyDigest: "privacy",
    ageConfirmed: true,
    acceptedAt: "2026-07-25T12:00:00.000Z",
  };
  const cookie = oauthStateCookie("state-token", "https://evil.example/path", {
    secret,
    secure: true,
    purpose: "login",
    legal,
    now: () => new Date("2026-07-25T12:00:00.000Z"),
  });
  const payload = {
    state: "state-token",
    returnTo: "/?page=dashboard",
    purpose: "login",
    legal,
    createdAt: "2026-07-25T12:00:00.000Z",
  };

  assert.equal(
    cookie,
    `bitcraft_discord_oauth_state=${encodeURIComponent(signedOAuthStateValue(JSON.stringify(payload), secret))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
  );
  assert.deepEqual(
    readOAuthStateCookie({ headers: { cookie } }, secret, { now: () => new Date("2026-07-25T12:09:59.000Z") }),
    payload,
  );
  assert.equal(readOAuthStateCookie(
    { headers: { cookie } },
    secret,
    { now: () => new Date("2026-07-25T12:10:01.000Z") },
  ), null);
  assert.equal(readOAuthStateCookie({ headers: { cookie: "bitcraft_discord_oauth_state=invalid" } }, secret), null);
  assert.equal(readOAuthStateCookie({ headers: {} }, secret), null);
});


test("resolveOAuthStateSecret reuses stored secrets and persists generated secrets", () => {
  const storedWrites = [];
  assert.equal(resolveOAuthStateSecret({
    getSecret: { get: () => ({ value: " stored-secret " }) },
    upsertSecret: { run: (...args) => storedWrites.push(args) },
    randomBytes: () => Buffer.from("unused"),
    now: () => new Date("2026-06-29T10:00:00.000Z"),
  }), "stored-secret");
  assert.deepEqual(storedWrites, []);

  const generatedWrites = [];
  const generated = resolveOAuthStateSecret({
    getSecret: { get: () => null },
    upsertSecret: { run: (...args) => generatedWrites.push(args) },
    randomBytes: (size) => {
      assert.equal(size, 32);
      return { toString: (encoding) => `generated-${encoding}` };
    },
    now: () => new Date("2026-06-29T10:00:00.000Z"),
  });

  assert.equal(generated, "generated-base64url");
  assert.deepEqual(generatedWrites, [
    ["discord_oauth_state_secret", "generated-base64url", "2026-06-29T10:00:00.000Z"],
  ]);
});
test("clearOAuthStateCookie keeps the existing clear-cookie shape", () => {
  assert.equal(
    clearOAuthStateCookie({ secure: false }),
    "bitcraft_discord_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
});
