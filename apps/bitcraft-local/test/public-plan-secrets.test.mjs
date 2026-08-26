import assert from "node:assert/strict";
import test from "node:test";

let secrets = null;
try {
  secrets = await import("../src/public/planSecrets.mjs");
} catch {
  // RED: Task 6 owns the fragment-to-sessionStorage handoff.
}

test("public plan fragment secrets move to per-tab storage, leave the address bar, and become Authorization only", () => {
  assert.ok(secrets, "public plan secret helper must exist");
  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const replacements = [];
  const location = {
    pathname: "/shared-plans/plan-7",
    search: "?mode=compact",
    hash: "#token=one-time-share-secret",
  };
  const history = { replaceState: (...args) => replacements.push(args) };

  assert.equal(secrets.capturePublicPlanFragmentSecret({ location, history, sessionStorage }), "one-time-share-secret");
  assert.deepEqual(replacements, [[null, "", "/shared-plans/plan-7?mode=compact"]]);
  assert.deepEqual(secrets.publicPlanAuthorization("/shared-plans/plan-7", sessionStorage), {
    authorization: "Bearer one-time-share-secret",
  });
  assert.doesNotMatch(JSON.stringify([...values]), /localStorage|https?:/i);

  secrets.clearPublicPlanSecret("/shared-plans/plan-7", sessionStorage);
  assert.deepEqual(secrets.publicPlanAuthorization("/shared-plans/plan-7", sessionStorage), {});
  assert.equal(secrets.capturePublicPlanFragmentSecret({
    location: { pathname: "/plans/plan-7", search: "", hash: "#token=must-not-store" },
    history,
    sessionStorage,
  }), null);
});
