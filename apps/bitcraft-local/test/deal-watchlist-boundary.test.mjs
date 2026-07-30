import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("DealWatchlist owns standalone watch management on the live Relay market generation", () => {
  const dealWatchlist = readFileSync(new URL("../src/pages/market/DealWatchlist.tsx", import.meta.url), "utf8");

  assert.match(dealWatchlist, /export function DealWatchlist\b/);
  assert.match(dealWatchlist, /fetch\(`\$\{LOCAL_API\}\/market\/deal-watches`/);
  assert.match(dealWatchlist, /marketDealWatchSearchUrl\(\{\s*claimId,/);
  assert.match(dealWatchlist, /marketRegionScopeUrl\(claimId\)/);
  assert.match(dealWatchlist, /useGameDataGeneration\(claimId, \["catalogs", "regional-market"\]\)/);
  assert.match(dealWatchlist, /setActiveRegions\(\(current\) => current\.length/);
  assert.match(dealWatchlist, /setWatchState\(\(current\) => \(\{\s*\.\.\.current,/);
  assert.doesNotMatch(dealWatchlist, /useActiveRegions\(|\/regions\/active/);
  assert.doesNotMatch(dealWatchlist, /\/api\/bitjita|const API\b/);
  assert.match(dealWatchlist, /method: "POST"/);
  assert.match(dealWatchlist, /thresholdPercent/);
  assert.match(dealWatchlist, /Watch item/);
  assert.match(dealWatchlist, /Disable/);
  assert.match(dealWatchlist, /Remove/);
  assert.match(dealWatchlist, /Sign in with Discord/);
});
