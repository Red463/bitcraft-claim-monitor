import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    hash: "#share=one-time-share-secret",
  };
  const history = { replaceState: (...args) => replacements.push(args) };

  assert.equal(secrets.capturePublicPlanFragmentSecret({ location, history, sessionStorage }), true);
  assert.deepEqual(replacements, [[null, "", "/shared-plans/plan-7?mode=compact"]]);
  assert.deepEqual(secrets.publicPlanAuthorization("/shared-plans/plan-7", sessionStorage), {
    authorization: "Bearer one-time-share-secret",
  });
  assert.doesNotMatch(JSON.stringify([...values]), /localStorage|https?:/i);

  secrets.clearPublicPlanSecret("/shared-plans/plan-7", sessionStorage);
  assert.deepEqual(secrets.publicPlanAuthorization("/shared-plans/plan-7", sessionStorage), {});
  assert.equal(secrets.capturePublicPlanFragmentSecret({
    location: { pathname: "/invites/invite-8", search: "", hash: "#token=one-time-invite-secret" },
    history,
    sessionStorage,
  }), true);
  assert.deepEqual(secrets.publicPlanAuthorization("/invites/invite-8", sessionStorage), {
    authorization: "Bearer one-time-invite-secret",
  });
  assert.equal(secrets.capturePublicPlanFragmentSecret({
    location: { pathname: "/plans/plan-7", search: "", hash: "#token=must-not-store" },
    history,
    sessionStorage,
  }), false);
});

test("public plan fragment cleanup failure stops before session storage", () => {
  assert.ok(secrets, "public plan secret helper must exist");
  const replacements = [];
  const writes = [];
  const location = {
    pathname: "/shared-plans/plan-9",
    search: "",
    hash: "#share=cleanup-failure-secret",
  };
  const result = secrets.capturePublicPlanFragmentSecret({
    location,
    history: { replaceState: (...args) => { replacements.push(args); throw new Error("history disabled"); } },
    sessionStorage: { setItem: (...args) => writes.push(args) },
  });

  assert.equal(result, false);
  assert.deepEqual(replacements, [[null, "", "/shared-plans/plan-9"]], "address cleanup is attempted once");
  assert.deepEqual(writes, [], "an unclean address must never gain a stored bearer");
  assert.equal(location.hash, "#share=cleanup-failure-secret", "the fragment remains only because the browser rejected cleanup");
});

test("successful public plan fragment cleanup survives later session storage failure", () => {
  assert.ok(secrets, "public plan secret helper must exist");
  const replacements = [];
  const result = secrets.capturePublicPlanFragmentSecret({
    location: {
      pathname: "/invites/invite-9",
      search: "",
      hash: "#token=must-leave-the-address-bar",
    },
    history: { replaceState: (...args) => replacements.push(args) },
    sessionStorage: { setItem: () => { throw new Error("storage disabled"); } },
  });

  assert.equal(result, false, "fragment capture reports only storage success, never the plaintext token");
  assert.deepEqual(replacements, [[null, "", "/invites/invite-9"]]);
  assert.doesNotMatch(JSON.stringify({ result, replacements }), /must-leave-the-address-bar/);
});

test("the production entrypoint captures plan fragments before host-profile requests", () => {
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /import \{ capturePublicPlanFragmentSecret \} from "\.\/public\/planSecrets\.mjs"/);
  const capture = main.indexOf("capturePublicPlanFragmentSecret({");
  const profileRequest = main.indexOf("loadHostProfile(fetch");
  const render = main.indexOf("createRoot(document");
  assert.ok(capture >= 0 && capture < profileRequest, "fragment capture must precede the first normal host-profile request");
  assert.ok(capture < render, "fragment capture must precede React effects and analytics-capable route rendering");
  assert.match(main.slice(capture, profileRequest), /location: window\.location[\s\S]*history: window\.history[\s\S]*sessionStorage: window\.sessionStorage/);
});
