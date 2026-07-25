import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("market history returns a bounded year of daily aggregates", () => {
  assert.match(server, /const MARKET_DAILY_HISTORY_LIMIT = 365;/);
  assert.match(server, /GROUP BY day\s*ORDER BY day DESC\s*LIMIT \?\s*`\)\.all\(\.\.\.tradeArgs, MARKET_DAILY_HISTORY_LIMIT\)\.reverse\(\);/s);
  assert.doesNotMatch(server, /GROUP BY day\s*ORDER BY day DESC\s*LIMIT 30/s);
});
