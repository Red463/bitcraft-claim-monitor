import assert from "node:assert/strict";
import test from "node:test";

let fallbackModule = null;
try {
  fallbackModule = await import("../src/server/gameIconFallback.mjs");
} catch {
  // The RED run proves the focused fallback boundary does not exist yet.
}

function responseRecorder() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = null) { this.body = body; },
  };
}

function service(fetcher, overrides = {}) {
  assert.ok(fallbackModule, "game icon fallback module must exist");
  return fallbackModule.createGameIconFallbackService({
    fetcher,
    metadataOrigin: "https://bitjita.com",
    approvedHosts: ["bitjita.com", "cdn.bitjita.com"],
    timeoutMs: 50,
    maxBytes: 256,
    appIdentifier: "Claim Monitor tests",
    ...overrides,
  });
}

test("public game icon route resolves item and cargo metadata before returning bounded images", async () => {
  const requests = [];
  const iconBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
  const iconService = service(async (input, init) => {
    const url = String(input);
    requests.push({ url, accept: init?.headers?.accept, redirect: init?.redirect });
    if (url === "https://bitjita.com/api/items/42") return Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test" } });
    if (url === "https://bitjita.com/api/cargo/42") return Response.json({ cargo: { iconUrl: "https://cdn.bitjita.com/cargo/Test.png" } });
    return new Response(iconBytes, { headers: { "content-type": "image/webp", "content-length": String(iconBytes.length) } });
  });

  for (const kind of ["item", "cargo"]) {
    const res = responseRecorder();
    assert.equal(await fallbackModule.serveGameIconRequest(`/api/local/game-icon/${kind}/42`, res, iconService), true);
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/webp");
    assert.match(res.headers["cache-control"], /^public, max-age=/);
    assert.deepEqual(new Uint8Array(res.body), iconBytes);
  }

  assert.deepEqual(requests.map(({ url }) => url), [
    "https://bitjita.com/api/items/42",
    "https://bitjita.com/GeneratedIcons/Items/Test.webp",
    "https://bitjita.com/api/cargo/42",
    "https://cdn.bitjita.com/cargo/Test.png",
  ]);
  assert.deepEqual(requests.map(({ accept }) => accept), ["application/json", "image/*", "application/json", "image/*"]);
  assert.deepEqual(requests.map(({ redirect }) => redirect), ["error", "error", "error", "error"]);
});

test("public game icon route rejects malformed item type and decimal identity", async () => {
  const iconService = service(async () => { throw new Error("fetch must not run"); });
  for (const pathname of [
    "/api/local/game-icon/items/42",
    "/api/local/game-icon/item/-1",
    "/api/local/game-icon/cargo/4.2",
    "/api/local/game-icon/item/",
  ]) {
    const res = responseRecorder();
    assert.equal(await fallbackModule.serveGameIconRequest(pathname, res, iconService), true);
    assert.equal(res.status, 400);
  }
});

test("game icon fallback refuses metadata icons outside the approved BitJita hosts", async () => {
  const requests = [];
  const iconService = service(async (input) => {
    requests.push(String(input));
    return Response.json({ item: { iconUrl: "https://attacker.example/secret.webp" } });
  });
  assert.equal(await iconService.fetchIcon("item", "42"), null);
  assert.deepEqual(requests, ["https://bitjita.com/api/items/42"]);
});

test("game icon fallback rejects non-image content and oversized image responses", async () => {
  for (const imageResponse of [
    new Response("not an image", { headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array(17), { headers: { "content-type": "image/webp", "content-length": "17" } }),
    new Response(new Uint8Array(17), { headers: { "content-type": "image/webp" } }),
  ]) {
    let requestCount = 0;
    const iconService = service(async () => {
      requestCount += 1;
      return requestCount === 1
        ? Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test.webp" } })
        : imageResponse;
    }, { maxBytes: 16 });
    assert.equal(await iconService.fetchIcon("item", "42"), null);
  }
});

test("game icon fallback byte-bounds metadata before parsing JSON", async () => {
  const requests = [];
  const oversizedMetadata = JSON.stringify({
    item: { iconAssetName: "GeneratedIcons/Items/Test.webp", description: "x".repeat(128) },
  });
  const iconService = service(async (input) => {
    requests.push(String(input));
    return new Response(oversizedMetadata, { headers: { "content-type": "application/json" } });
  }, { maxBytes: 64 });

  assert.equal(await iconService.fetchIcon("item", "42"), null);
  assert.deepEqual(requests, ["https://bitjita.com/api/items/42"]);
});

test("game icon fallback normalizes invalid limits and caps timeout and response bytes", async () => {
  const requestedTimeouts = [];
  let requestCount = 0;
  const invalidLimitService = service(async () => {
    requestCount += 1;
    return requestCount === 1
      ? Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test.webp" } })
      : new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } });
  }, {
    timeoutMs: Number.NaN,
    maxBytes: Number.NaN,
  });
  assert.ok(await invalidLimitService.fetchIcon("item", "42"));

  requestCount = 0;
  const boundedService = service(async () => {
    requestCount += 1;
    return requestCount === 1
      ? Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test.webp" } })
      : new Response(new Uint8Array(1024 * 1024 + 1), { headers: { "content-type": "image/webp" } });
  }, {
    timeoutMs: Number.POSITIVE_INFINITY,
    maxBytes: Number.POSITIVE_INFINITY,
    timeoutSignal: (timeoutMs) => {
      requestedTimeouts.push(timeoutMs);
      return new AbortController().signal;
    },
  });
  assert.equal(await boundedService.fetchIcon("item", "42"), null);
  assert.deepEqual(requestedTimeouts, [15_000, 15_000]);
});

test("game icon fallback coalesces in-flight work and reuses a bounded response cache", async () => {
  const requests = [];
  const iconService = service(async (input) => {
    const url = String(input);
    requests.push(url);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (url.includes("/api/items/")) return Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test" } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
  }, { cacheTtlMs: 1_000, cacheMaxEntries: 2 });

  const [first, second] = await Promise.all([
    iconService.fetchIcon("item", "42"),
    iconService.fetchIcon("item", "42"),
  ]);
  const cached = await iconService.fetchIcon("item", "42");

  assert.deepEqual(first, second);
  assert.deepEqual(cached, first);
  assert.deepEqual(requests, [
    "https://bitjita.com/api/items/42",
    "https://bitjita.com/GeneratedIcons/Items/Test.webp",
  ]);
});

test("game icon fallback times out and maps unavailable metadata or images to 404", async () => {
  const timeoutService = service(async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }), { timeoutMs: 5 });
  assert.equal(await timeoutService.fetchIcon("item", "42"), null);

  for (const fetcher of [
    async () => new Response("missing", { status: 404 }),
    async (input) => String(input).includes("/api/items/")
      ? Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Missing.webp" } })
      : new Response("missing", { status: 404 }),
  ]) {
    const res = responseRecorder();
    assert.equal(await fallbackModule.serveGameIconRequest("/api/local/game-icon/item/42", res, service(fetcher)), true);
    assert.equal(res.status, 404);
  }
});
