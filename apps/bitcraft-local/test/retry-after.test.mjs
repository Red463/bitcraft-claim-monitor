import assert from "node:assert/strict";
import test from "node:test";

import { parseRetryAfterMs } from "../src/server/retryAfter.mjs";

test("parseRetryAfterMs supports seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("12", 1_000), 12_000);
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 1970 00:00:21 GMT", 1_000), 20_000);
  assert.equal(parseRetryAfterMs(null, 1_000), 0);
});
