import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createServer as createViteServer } from "vite";

import { loadBootstrap } from "../src/api/bootstrap.ts";
import { React, act, installDom, mount } from "./react-dom-test-harness.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const bootstrapFixture = {
  config: { claimId: "55", refreshSeconds: 30, theme: {} },
  auth: {
    authenticated: true,
    user: { id: 1, discordId: "2", username: "tester", globalName: "Tester", avatarUrl: null, characterPlayerId: "", characterName: "", characterStatus: "unlinked", settings: {} },
    csrfToken: "bootstrap-csrf",
    discordLoginEnabled: true,
    featurebaseJwt: null,
    legal: { version: "v1", termsDigest: "terms", privacyDigest: "privacy", acceptedAt: "now", requiresAcceptance: false },
  },
  legal: { version: "v1", effectiveDate: "2026-01-01", acceptanceRequired: false, operator: {} },
  build: { version: "test", buildSha: "build-a" },
};

function responseFor(url) {
  if (url === "/api/local/bootstrap") return bootstrapFixture;
  if (url.includes("/market/regions")) return { regions: [{ regionId: "19", regionName: "Region 19" }] };
  if (url === "/api/local/market/deal-watches") return { watches: [], settings: {} };
  if (url === "/api/local/config") return bootstrapFixture.config;
  if (url === "/api/local/auth/me") return bootstrapFixture.auth;
  return {};
}

test("direct and refreshed Deal Watch descendants reuse bootstrap auth without auth/me requests", async () => {
  const dom = installDom("http://localhost/?page=market&tab=deal-watch");
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return new Response(JSON.stringify(responseFor(url)), { status: 200, headers: { "content-type": "application/json" } });
  };
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const bootstrap = await loadBootstrap(globalThis.fetch);
    const [{ Market }, { PageRefreshProvider }] = await Promise.all([
      vite.ssrLoadModule("/src/pages/MarketPage.tsx"),
      vite.ssrLoadModule("/src/refresh/ManualRefreshContext.tsx"),
    ]);
    const marketProps = {
      claimId: bootstrap.config.claimId,
      access: null,
      locationSearch: dom.window.location.search,
      fallbackRegionId: "19",
      auth: bootstrap.auth,
      onQueryStateChange() {},
      onNavigate() {},
      onShowMap() {},
      onDiscordLogin() {},
    };
    const coordinator = { trackPromise: (_cycleId, _taskKey, promise) => promise };
    const route = (sequence) => React.createElement(PageRefreshProvider, {
      page: "market",
      cycle: { id: `market-${sequence}`, page: "market", sequence, reason: "manual", requestedAt: sequence },
      coordinator,
    }, React.createElement(Market, marketProps));
    const view = await mount(route(0));
    await dom.flush();
    await view.render(route(1));
    await dom.flush();

    assert.equal(requests.filter((url) => url === "/api/local/bootstrap").length, 1);
    assert.equal(requests.filter((url) => url === "/api/local/auth/me").length, 0);
    assert.ok(requests.filter((url) => url === "/api/local/market/deal-watches").length >= 2, "refresh still reloads deal data");
    await view.unmount();
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
    dom.restore();
  }
});

test("the /bot descendant route uses bootstrap config without a compatibility config request", async () => {
  const dom = installDom("http://localhost/bot");
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return new Response(JSON.stringify(responseFor(url)), { status: 200, headers: { "content-type": "application/json" } });
  };
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const bootstrap = await loadBootstrap(globalThis.fetch);
    const { default: App, BotControlApp } = await vite.ssrLoadModule("/src/AppShell.tsx");
    const view = await mount(React.createElement(React.Suspense, { fallback: null }, React.createElement(App, { initialBootstrap: bootstrap })));
    await dom.flush();
    await act(async () => {
      for (let attempt = 0; attempt < 50 && !document.querySelector(".bot-control-page"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });

    assert.equal(requests.filter((url) => url === "/api/local/bootstrap").length, 1);
    assert.equal(requests.filter((url) => url === "/api/local/config").length, 0);
    await view.unmount();

    requests.length = 0;
    const legacyView = await mount(React.createElement(React.Suspense, { fallback: null }, React.createElement(BotControlApp)));
    await dom.flush();
    assert.equal(requests.filter((url) => url === "/api/local/config").length, 1, "the compatibility config request remains when bootstrap config is absent");
    await legacyView.unmount();
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
    dom.restore();
  }
});
