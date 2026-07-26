import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  marketViewLocation,
  settlementMarketViewLocation,
} from "../src/navigation/routeState.ts";
import { localHistoryIncludeForPanel } from "../src/api/localHistoryInclude.ts";
import {
  ACCESS_TAB_GROUPS,
  normalizeAccessControlConfig,
  resetLegacyMarketAccessRules,
} from "../src/access/accessControl.mjs";

test("global Market canonicalizes current and legacy tool tabs", () => {
  assert.deepEqual(marketViewLocation(null), {
    page: "market",
    view: "overview",
    canonicalTab: "overview",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("pricing"), {
    page: "market",
    view: "browse",
    canonicalTab: "browse",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("buyOrders"), {
    page: "market",
    view: "buy-orders",
    canonicalTab: "buy-orders",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("deal-watchlist"), {
    page: "market",
    view: "deal-watch",
    canonicalTab: "deal-watch",
    shouldReplace: true,
  });
});

test("legacy local Market tabs redirect to Settlement Market", () => {
  assert.deepEqual(marketViewLocation("live"), {
    page: "settlement-market",
    view: "live",
    canonicalTab: "live",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("analytics"), {
    page: "settlement-market",
    view: "analytics",
    canonicalTab: "analytics",
    shouldReplace: true,
  });
  assert.deepEqual(settlementMarketViewLocation(null), {
    page: "settlement-market",
    view: "live",
    canonicalTab: "live",
    shouldReplace: true,
  });
});

test("only Settlement Market requests monitored market history", () => {
  assert.equal(localHistoryIncludeForPanel("market"), "activity");
  assert.equal(localHistoryIncludeForPanel("settlement-market"), "activity,market");
  assert.equal(localHistoryIncludeForPanel("dashboard"), "activity,market,dashboard");
});

test("global Market and Deal Watch use only regions reported active", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const dealWatch = readFileSync(new URL("../src/pages/market/DealWatchlist.tsx", import.meta.url), "utf8");
  assert.match(marketPage, /const activeRegions = useActiveRegions\(\);/);
  assert.match(dealWatch, /const activeRegions = useActiveRegions\(\);/);
  assert.doesNotMatch(marketPage, /useActiveRegions\(fallbackRegionId\)/);
  assert.doesNotMatch(dealWatch, /useActiveRegions\(defaultRegion\)/);
});

test("market access reset preserves unrelated rules and exposes new public tabs", () => {
  assert.deepEqual(ACCESS_TAB_GROUPS.market.map((tab) => tab.id), [
    "overview",
    "browse",
    "deals",
    "buy-orders",
    "deal-watch",
    "stalls",
  ]);
  assert.deepEqual(ACCESS_TAB_GROUPS["settlement-market"].map((tab) => tab.id), [
    "live",
    "analytics",
  ]);

  const reset = resetLegacyMarketAccessRules({
    rules: {
      "page:market": { mode: "verified" },
      "tab:market:live": { mode: "discord" },
      "page:map": { mode: "verified" },
    },
  });
  assert.deepEqual(reset, { rules: { "page:map": { mode: "verified" } } });
  assert.deepEqual(normalizeAccessControlConfig(reset), {
    rules: { "page:map": { mode: "verified", allowedDiscordIds: [] } },
  });
});
