import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const claimId = "1369094286777412590";

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function availablePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(origin, child) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/local/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for server health");
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

test("server collection paginates listings and protects production mutations", async (t) => {
  const requestedPages = [];
  const listings = [
    { entityId: "listing-1", itemName: "Bronze Ingot", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 10, itemType: "item", quantity: 12, price: 4, side: "sell" },
    { entityId: "listing-2", itemName: "Oak Plank", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 20, itemType: "item", quantity: 8, price: 6, side: "sell" },
  ];
  let currentListings = listings;
  let trades = [];
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === `/api/claims/${claimId}`) return json(res, { claim: { entityId: claimId, supplies: 500, treasury: 300 } });
    if (url.pathname === `/api/claims/${claimId}/members`) return json(res, { members: [] });
    if (url.pathname === `/api/claims/${claimId}/buildings`) return json(res, { buildings: [] });
    if (url.pathname === `/api/claims/${claimId}/market/listings`) {
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return json(res, { listings: [currentListings[page - 1]], totalPages: 2, page });
    }
    if (url.pathname === "/api/market/player/player-1/trades") return json(res, { trades });
    return json(res, { error: "not found" }, 404);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  const appPort = await availablePort();
  const dataDir = path.join(appDir, `.test-data-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ENABLE_SERVER_POLLING: "false",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);

  const setup = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "admin", password: "correct horse battery", setupKey: "test-setup-key" }),
  });
  assert.equal(setup.status, 200);
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  assert.ok(auth.csrfToken);

  const poll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(poll.status, 200);

  currentListings = [{ ...listings[0], quantity: 9 }, listings[1]];
  trades = [
    { id: "fill-1", orderEntityId: "listing-1", itemId: 10, itemType: "item", sellerEntityId: "player-1", quantity: 1, price: 4, totalPrice: 4 },
    { id: "fill-2", orderEntityId: "listing-1", itemId: 10, itemType: "item", sellerEntityId: "player-1", quantity: 2, price: 4, totalPrice: 8 },
  ];
  const secondPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(secondPoll.status, 200);

  const history = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.deepEqual(requestedPages.sort(), [1, 1, 2, 2]);
  assert.equal(history.liveListings.length, 2);
  assert.equal(history.totals.newListings, 2);
  assert.equal(history.totals.confirmedSales, 1);
  assert.equal(history.totals.confirmedUnits, 3);
  assert.equal(history.totals.trackedValue, 12);
  assert.equal(history.topItems[0].unitsSold, 3);
  assert.equal(history.events.some((event) => event.event_type === "partial_sale"), true);

  currentListings = [{ ...listings[0], quantity: 8 }, listings[1]];
  const thirdPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(thirdPoll.status, 200);
  const afterOldFills = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.equal(afterOldFills.totals.confirmedUnits, 3);
  assert.equal(afterOldFills.events.some((event) => event.event_type === "partial_quantity_drop"), true);

  const browserSnapshot = await fetch(`${origin}/api/local/snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimId, claim: {}, market: { listings: [] } }),
  });
  assert.equal(browserSnapshot.status, 403);

  const forgedSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin: "https://attacker.example", "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({}),
  });
  assert.equal(forgedSettings.status, 403);
});
