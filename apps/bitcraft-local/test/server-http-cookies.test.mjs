import assert from "node:assert/strict";
import test from "node:test";

import { parseCookies, serializeHttpOnlyCookie } from "../src/server/httpCookies.mjs";

test("parseCookies decodes request cookie headers and preserves equals signs in values", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({ headers: { cookie: "alpha=one; empty=; encoded=a%20b; token=a=b=c" } }), {
    alpha: "one",
    empty: "",
    encoded: "a b",
    token: "a=b=c",
  });
});

test("serializeHttpOnlyCookie matches the app session cookie policy", () => {
  assert.equal(
    serializeHttpOnlyCookie("bitcraft_admin_session", "token value", { maxAge: 604800, secure: false }),
    "bitcraft_admin_session=token%20value; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800",
  );
  assert.equal(
    serializeHttpOnlyCookie("bitcraft_user_session", "abc", { maxAge: 2592000, secure: true }),
    "bitcraft_user_session=abc; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000; Secure",
  );
  assert.equal(
    serializeHttpOnlyCookie("bitcraft_discord_oauth_state", "", { maxAge: 0, secure: true }),
    "bitcraft_discord_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure",
  );
});