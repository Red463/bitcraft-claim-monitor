import assert from "node:assert/strict";
import test from "node:test";
import { createPublicApiRouter, createPublicDataService, PublicDataError } from "../src/server/public/publicData.mjs";
import { routeHostProfileRequest } from "../src/server/public/router.mjs";

const normalizers = await import("../src/server/game-data/normalizers.ts");

function recorder() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = null) { this.body = body; },
  };
}

test("enabled public host routes settlement, catalog, recipe, and icon GET requests through isolated handlers", async () => {
  const calls = [];
  const api = createPublicApiRouter({
    data: {
      searchSettlements: async (query) => { calls.push(["search", query]); return { hints: [] }; },
      snapshot: async (claimId, domains) => { calls.push(["snapshot", claimId, domains]); return { claimId }; },
    },
    catalog: {
      search: (query) => { calls.push(["catalog", query]); return { items: [] }; },
      recipe: (kind, id) => { calls.push(["recipe", kind, id]); return { detail: {} }; },
    },
    serveIcon: async (pathname, res) => { calls.push(["icon", pathname]); res.writeHead(200, {}); res.end("icon"); },
    rateLimiter: { take: () => ({ allowed: true, retryAfter: 0 }) },
  });
  const profile = { id: "public", origin: "https://claim-monitor.com", allowsAdmin: false, allowsDiscord: false };
  for (const pathname of [
    "/api/public/settlements/search?q=oak",
    "/api/public/settlements/42?domains=claim%2Cmembers",
    "/api/public/catalog/search?q=log",
    "/api/public/catalog/recipe-detail?kind=item&id=7",
    "/api/public/game-icon/item/7",
  ]) {
    const res = recorder();
    assert.equal(await routeHostProfileRequest({
      profile,
      method: "GET",
      url: new URL(`https://claim-monitor.com${pathname}`),
      res,
      send: (_res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); },
      features: { publicProfileEnabled: true },
      publicRequest: (request) => api({ ...request, address: "203.0.113.1" }),
    }), true);
    assert.equal(res.status, 200);
  }
  assert.deepEqual(calls, [
    ["search", "oak"],
    ["snapshot", "42", "claim,members"],
    ["catalog", "log"],
    ["recipe", "item", "7"],
    ["icon", "/api/public/game-icon/item/7"],
  ]);
});

test("public API maps validation, rate, source, and queue errors without leaking details", async () => {
  const statuses = [
    new PublicDataError("bad input", 400),
    new PublicDataError("limited", 429, { retryAfter: 30 }),
    new PublicDataError("malformed upstream secret", 502),
    new PublicDataError("offline upstream secret", 503, { retryAfter: 1 }),
  ];
  for (const expected of statuses) {
    const api = createPublicApiRouter({
      data: { searchSettlements: async () => { throw expected; } },
      catalog: {},
      serveIcon: async () => {},
      rateLimiter: { take: () => ({ allowed: true, retryAfter: 0 }) },
    });
    const res = recorder();
    assert.equal(await api({ method: "GET", url: new URL("https://claim-monitor.com/api/public/settlements/search?q=oak"), res, address: "ip" }), true);
    assert.equal(res.status, expected.status);
    if (expected.retryAfter) assert.equal(res.headers["retry-after"], String(expected.retryAfter));
    assert.doesNotMatch(String(res.body), /upstream secret/);
  }
});

test("public API maps malformed Relay JSON to a sanitized 502 response", async () => {
  const data = createPublicDataService({
    http: {
      searchClaims: async () => {
        throw Object.assign(new Error("Unexpected token at https://relay.secret/claim?apiKey=hidden"), {
          code: "RELAY_MALFORMED_JSON",
          status: 502,
        });
      },
    },
    normalizers,
  });
  const api = createPublicApiRouter({
    data,
    catalog: {},
    serveIcon: async () => {},
    rateLimiter: { take: () => ({ allowed: true, retryAfter: 0 }) },
  });
  const res = recorder();

  assert.equal(await api({
    method: "GET",
    url: new URL("https://claim-monitor.com/api/public/settlements/search?q=oak"),
    res,
    address: "203.0.113.10",
  }), true);
  assert.equal(res.status, 502);
  assert.deepEqual(JSON.parse(res.body), { error: "Relay returned malformed public data." });
  assert.doesNotMatch(res.body, /relay\.secret|apiKey|hidden|Unexpected token/);
});
