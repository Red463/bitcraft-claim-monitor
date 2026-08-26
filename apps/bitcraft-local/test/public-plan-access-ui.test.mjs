import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createServer as createViteServer } from "vite";

import { React, act, installDom, mount } from "./react-dom-test-harness.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function capturePlanSecret(window, fragment) {
  window.location.hash = fragment;
  return import("../src/public/planSecrets.mjs").then(({ capturePublicPlanFragmentSecret }) => {
    assert.equal(capturePublicPlanFragmentSecret({
      location: window.location,
      history: window.history,
      sessionStorage: window.sessionStorage,
    }), true);
  });
}

test("the mounted shared-plan route performs a token-free bearer read and renders only safe basic plan state", async () => {
  const token = "mounted-reusable-share-secret";
  const dom = installDom("http://localhost/shared-plans/plan-7");
  await capturePlanSecret(dom.window, `#share=${token}`);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    calls.push([String(input), init]);
    return json(200, {
      plan: {
        id: "plan-7",
        title: "Shared bridge plan",
        claimId: "42",
        role: "bearer",
        document: { targets: [{ catalogKey: "items:7", quantity: "1" }, { catalogKey: "cargo:8", quantity: "2" }] },
      },
    });
  };
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  let view;
  try {
    const { PublicAppShell } = await vite.ssrLoadModule("/src/public/PublicAppShell.tsx");
    view = await mount(React.createElement(PublicAppShell, { route: { id: "shared-plan", params: { id: "plan-7" } } }));
    await dom.flush();

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/api/public/shared-plans/plan-7");
    assert.doesNotMatch(calls[0][0], /[?#]|mounted-reusable-share-secret/);
    assert.equal(calls[0][1].headers.authorization, `Bearer ${token}`);
    assert.match(document.body.textContent, /Shared bridge plan/);
    assert.match(document.body.textContent, /Settlement #42/);
    assert.match(document.body.textContent, /2 targets/);
    assert.doesNotMatch(document.body.textContent, new RegExp(token));
    assert.doesNotMatch(document.title, new RegExp(token));
    assert.equal(window.location.hash, "");
  } finally {
    if (view) await view.unmount();
    await vite.close();
    globalThis.fetch = originalFetch;
    dom.restore();
  }
});

test("the mounted invite route never posts before an explicit accept action", async () => {
  const token = "mounted-one-time-invite-secret";
  const dom = installDom("http://localhost/invites/invite-8");
  await capturePlanSecret(dom.window, `#token=${token}`);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    calls.push([path, init]);
    if (path === "/api/public/auth/session") {
      return json(200, {
        user: { id: 8, discordId: "8", username: "invitee", globalName: "Invitee", avatarUrl: null, settings: {}, createdAt: "2026-08-25T00:00:00.000Z", lastLoginAt: null },
        csrfToken: "public-csrf",
        discordLoginEnabled: true,
        legal: { version: "2026-08-25", termsDigest: "terms", privacyDigest: "privacy", acceptedAt: "2026-08-25T09:00:00.000Z", requiresAcceptance: false },
      });
    }
    const posts = calls.filter(([, request]) => request.method === "POST").length;
    if (posts === 1) return json(428, { code: "revision_required", currentRevisions: { access: 7 } });
    return json(200, { plan: { id: "plan-8", title: "Accepted bridge plan", claimId: "42", document: { targets: [] } } });
  };
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  let view;
  try {
    const { PublicAppShell } = await vite.ssrLoadModule("/src/public/PublicAppShell.tsx");
    view = await mount(React.createElement(PublicAppShell, { route: { id: "invite", params: { id: "invite-8" } } }));
    await dom.flush();

    assert.deepEqual(calls.map(([path, init]) => [path, init.method ?? "GET"]), [["/api/public/auth/session", "GET"]]);
    const accept = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Accept invitation"));
    assert.ok(accept && !accept.disabled);

    await act(async () => accept.click());
    await dom.flush();
    const mutations = calls.filter(([, init]) => init.method === "POST");
    assert.equal(mutations.length, 2);
    assert.equal(mutations[0][0], "/api/public/invites/invite-8/accept");
    assert.equal("if-match" in mutations[0][1].headers, false);
    assert.equal(mutations[1][1].headers["if-match"], '"access:7"');
    assert.match(document.body.textContent, /Accepted bridge plan/);
    assert.doesNotMatch(document.body.textContent, new RegExp(token));
    assert.doesNotMatch(document.title, new RegExp(token));
    assert.ok(calls.every(([path]) => !/[?#]/.test(path) && !path.includes(token)));
  } finally {
    if (view) await view.unmount();
    await vite.close();
    globalThis.fetch = originalFetch;
    dom.restore();
  }
});
