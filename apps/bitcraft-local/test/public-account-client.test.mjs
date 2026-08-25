import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptPublicLegal,
  loadPublicLegal,
  loadPublicSession,
  logoutPublicSession,
  reviewPublicDeletion,
  startPublicDiscordLogin,
  startPublicPrivacyReauthentication,
} from "../src/public/accountApi.ts";

function fetchRecorder(responseBody = { ok: true }) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (input, init) => {
      calls.push([input, init]);
      return { ok: true, status: 200, json: async () => responseBody };
    },
  };
}

test("public account client uses only public endpoints and no-store same-origin credentials", async () => {
  const fetch = fetchRecorder({ user: null });
  await loadPublicSession(fetch.fetchImpl);
  await loadPublicLegal(fetch.fetchImpl);
  assert.deepEqual(fetch.calls.map(([input]) => input), [
    "/api/public/auth/session",
    "/api/public/legal",
  ]);
  for (const [, init] of fetch.calls) {
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
  }
});

test("public account mutations carry exact JSON bodies and the public session CSRF token", async () => {
  const fetch = fetchRecorder({ authorizeUrl: "https://discord.com/oauth2/authorize" });
  await startPublicDiscordLogin({ acceptedTerms: true, ageConfirmed: true, returnTo: "/settings" }, fetch.fetchImpl);
  await acceptPublicLegal("public-csrf", fetch.fetchImpl);
  await startPublicPrivacyReauthentication("public-csrf", fetch.fetchImpl);
  await reviewPublicDeletion("public-csrf", fetch.fetchImpl);
  await logoutPublicSession("public-csrf", fetch.fetchImpl);

  assert.deepEqual(fetch.calls.map(([input]) => input), [
    "/api/public/auth/discord/start",
    "/api/public/auth/legal/accept",
    "/api/public/auth/privacy/reauth/start",
    "/api/public/auth/privacy/deletion-preflight",
    "/api/public/auth/logout",
  ]);
  assert.deepEqual(JSON.parse(fetch.calls[0][1].body), { acceptedTerms: true, ageConfirmed: true, returnTo: "/settings" });
  for (const [, init] of fetch.calls.slice(1)) assert.equal(init.headers["x-csrf-token"], "public-csrf");
  assert.equal(JSON.parse(fetch.calls[1][1].body).acceptedTerms, true);
  assert.equal(JSON.parse(fetch.calls[1][1].body).ageConfirmed, true);
});

test("public account client surfaces sanitized API errors", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: "Reauthentication required", code: "recent_discord_reauthentication_required" }) });
  await assert.rejects(() => reviewPublicDeletion("csrf", fetchImpl), /Reauthentication required/);
});
