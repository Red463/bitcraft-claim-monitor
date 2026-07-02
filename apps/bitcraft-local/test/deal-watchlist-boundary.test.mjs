import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("DealWatchlist owns standalone watch management and direct creation", () => {
  const dealWatchlist = readFileSync(new URL("../src/pages/market/DealWatchlist.tsx", import.meta.url), "utf8");

  assert.match(dealWatchlist, /export function DealWatchlist\b/);
  assert.match(dealWatchlist, /fetch\(`\$\{LOCAL_API\}\/market\/deal-watches`/);
  assert.match(dealWatchlist, /fetch\(`\$\{API\}\/market\?q=/);
  assert.match(dealWatchlist, /method: "POST"/);
  assert.match(dealWatchlist, /thresholdPercent/);
  assert.match(dealWatchlist, /Watch item/);
  assert.match(dealWatchlist, /Disable/);
  assert.match(dealWatchlist, /Remove/);
  assert.match(dealWatchlist, /Sign in with Discord/);
});