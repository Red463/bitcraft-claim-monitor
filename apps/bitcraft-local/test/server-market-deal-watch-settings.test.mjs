import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMarketDealWatchSettings } from "../src/server/marketDealWatchSettings.mjs";

test("market deal-watch settings normalize defaults and clamp dashboard values", () => {
  assert.deepEqual(normalizeMarketDealWatchSettings(null), {
    maxWatchesPerUser: 10,
    thresholdPercent: 30,
    minActiveListings: 3,
    discordDmEnabled: true,
  });

  assert.deepEqual(normalizeMarketDealWatchSettings({
    maxWatchesPerUser: "0",
    thresholdPercent: "0",
    minActiveListings: "0",
    discordDmEnabled: false,
  }), {
    maxWatchesPerUser: 10,
    thresholdPercent: 30,
    minActiveListings: 3,
    discordDmEnabled: false,
  });

  assert.deepEqual(normalizeMarketDealWatchSettings({
    maxWatchesPerUser: "200.9",
    thresholdPercent: "99",
    minActiveListings: "250.4",
    discordDmEnabled: true,
  }), {
    maxWatchesPerUser: 100,
    thresholdPercent: 95,
    minActiveListings: 100,
    discordDmEnabled: true,
  });
});

test("market deal-watch settings ignore arrays and malformed numbers", () => {
  assert.deepEqual(normalizeMarketDealWatchSettings([]), {
    maxWatchesPerUser: 10,
    thresholdPercent: 30,
    minActiveListings: 3,
    discordDmEnabled: true,
  });

  assert.deepEqual(normalizeMarketDealWatchSettings({
    maxWatchesPerUser: "not-a-number",
    thresholdPercent: "not-a-number",
    minActiveListings: "not-a-number",
  }), {
    maxWatchesPerUser: 10,
    thresholdPercent: 30,
    minActiveListings: 3,
    discordDmEnabled: true,
  });
});

test("market deal-watch settings migrate the legacy confirmed-sales threshold", () => {
  assert.deepEqual(normalizeMarketDealWatchSettings({
    minConfirmedSales: 6,
  }), {
    maxWatchesPerUser: 10,
    thresholdPercent: 30,
    minActiveListings: 6,
    discordDmEnabled: true,
  });
});
