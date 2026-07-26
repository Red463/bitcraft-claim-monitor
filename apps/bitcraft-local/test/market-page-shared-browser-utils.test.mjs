import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const marketPageSource = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");

test("Market page uses the shared navigation helper without redeclaring it", () => {
  assert.match(
    marketPageSource,
    /import\s+\{\s*updateQueryState\s*\}\s+from\s+"..\/navigation";/,
  );
  assert.doesNotMatch(marketPageSource, /function\s+trackAnalyticsEvent\s*\(/);
  assert.doesNotMatch(marketPageSource, /function\s+updateQueryState\s*\(/);
  assert.doesNotMatch(marketPageSource, /function\s+analyticsSessionId\s*\(/);
});
