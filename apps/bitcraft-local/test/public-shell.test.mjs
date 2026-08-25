import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicStorageKey, resolvePublicRoute } from "../src/public/routes.mjs";
import { addRecentSettlement, readRecentSettlements, settlementPreferenceKey } from "../src/public/preferences.mjs";
import { createVisibleRefreshController } from "../src/public/visibleRefresh.mjs";

test("public routes expose only the public claim-monitor feature matrix", () => {
  assert.deepEqual(resolvePublicRoute("/settlements/42/members"), { id: "members", params: { claimId: "42" } });
  assert.deepEqual(resolvePublicRoute("/settlements/42/inventory"), { id: "inventory", params: { claimId: "42" } });
  assert.deepEqual(resolvePublicRoute("/settlements/42/crafts"), { id: "crafts", params: { claimId: "42" } });
  assert.deepEqual(resolvePublicRoute("/calculator"), { id: "calculator", params: {} });
  assert.deepEqual(resolvePublicRoute("/settings"), { id: "settings", params: {} });
  assert.deepEqual(resolvePublicRoute("/leaderboard"), { id: "not-found", params: {} });
  assert.deepEqual(resolvePublicRoute("/map"), { id: "not-found", params: {} });
  assert.deepEqual(resolvePublicRoute("/admin"), { id: "not-found", params: {} });
});

test("recent settlements and view preferences stay in the public claim namespace", () => {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  addRecentSettlement(localStorage, { claimId: "42", name: "Northwatch", regionId: "7" });
  addRecentSettlement(localStorage, { claimId: "19", name: "Riverbend", regionId: "7" });
  addRecentSettlement(localStorage, { claimId: "42", name: "Northwatch Updated", regionId: "7" });

  assert.deepEqual(readRecentSettlements(localStorage), [
    { claimId: "42", name: "Northwatch Updated", regionId: "7" },
    { claimId: "19", name: "Riverbend", regionId: "7" },
  ]);
  assert.equal(settlementPreferenceKey("42", "inventory-filter"), "claim-monitor.public.settlement.42.inventory-filter");
  assert.equal(publicStorageKey("recent-settlements"), "claim-monitor.public.recent-settlements");
  assert.throws(() => settlementPreferenceKey("42/other", "inventory-filter"), /claim/i);
});

test("visible refresh pauses while hidden, catches up once, and does not bypass server cache", async () => {
  let visible = true;
  let scheduled = null;
  let refreshes = 0;
  const controller = createVisibleRefreshController({
    intervalMs: 60_000,
    isVisible: () => visible,
    setInterval: (callback, ms) => {
      scheduled = { callback, ms };
      return 9;
    },
    clearInterval: (id) => {
      assert.equal(id, 9);
      scheduled = null;
    },
    refresh: async () => { refreshes += 1; },
  });

  controller.start();
  assert.equal(scheduled.ms, 60_000);
  await scheduled.callback();
  assert.equal(refreshes, 1);

  visible = false;
  controller.visibilityChanged();
  assert.equal(scheduled, null);
  visible = true;
  controller.visibilityChanged();
  await Promise.resolve();
  assert.equal(refreshes, 2, "one catch-up refresh runs when the page becomes visible");
  assert.equal(scheduled.ms, 60_000);
  controller.stop();
});

test("public shell stays isolated from Timbersteel bootstrap, featurebase, analytics, and app shell imports", () => {
  const root = readFileSync(new URL("../src/public/PublicRoot.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/public/PublicAppShell.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/public/api.ts", import.meta.url), "utf8");
  const joined = `${root}\n${shell}\n${api}`;

  for (const forbidden of ["TimbersteelRoot", "loadBootstrap", "Featurebase", "analytics", "useGameDataGeneration", "Admin", "BotControlApp", "/api/local/"]) {
    assert.equal(joined.includes(forbidden), false, `public shell must not depend on ${forbidden}`);
  }
  assert.doesNotMatch(joined, /from\s+["']\.\.\/AppShell["']/);
  assert.match(api, /\/api\/public\/settlements/);
  assert.match(shell, /catalogKey/);
});
