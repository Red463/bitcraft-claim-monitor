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
    maxBytes: 16,
    appIdentifier: "Claim Monitor tests",
    ...overrides,
  });
}

test("public game icon route resolves item and cargo metadata before returning bounded images", async () => {
  const requests = [];
  const iconBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
  const iconService = service(async (input, init) => {
    const url = String(input);
    requests.push({ url, accept: init?.headers?.accept });
    if (url === "https://bitjita.com/api/items/42") return Response.json({ item: { iconAssetName: "GeneratedIcons/Items/Test.webp" } });
    if (url === "https://bitjita.com/api/cargo/42") return Response.json({ cargo: { iconUrl: "https://cdn.bitjita.com/cargo/Test.webp" } });
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
    "https://cdn.bitjita.com/cargo/Test.webp",
  ]);
  assert.deepEqual(requests.map(({ accept }) => accept), ["application/json", "image/*", "application/json", "image/*"]);
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
    });
    assert.equal(await iconService.fetchIcon("item", "42"), null);
  }
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
