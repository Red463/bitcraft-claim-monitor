import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const marketPageSource = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");

test("Market page uses shared browser analytics and navigation helpers", () => {
  assert.match(
    marketPageSource,
    /import\s+\{\s*updateQueryState\s*\}\s+from\s+"..\/navigation";/,
  );
  assert.match(
    marketPageSource,
    /import\s+\{\s*trackAnalyticsEvent\s*\}\s+from\s+"..\/utils\/analytics";/,
  );
  assert.doesNotMatch(marketPageSource, /function\s+trackAnalyticsEvent\s*\(/);
  assert.doesNotMatch(marketPageSource, /function\s+updateQueryState\s*\(/);
  assert.doesNotMatch(marketPageSource, /function\s+analyticsSessionId\s*\(/);
});
