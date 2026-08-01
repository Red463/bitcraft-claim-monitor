import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("maintainer README describes live Relay ownership without the retired browser proxy", () => {
  const readme = source("../README.md");

  assert.doesNotMatch(readme, /\/api\/bitjita\/\*/);
  assert.doesNotMatch(readme, /normal browser pages refresh live data.*BitJita/i);
  assert.match(readme, /provider-neutral local routes/i);
  assert.match(readme, /committed Relay generations/i);
  assert.match(readme, /craft-contribution.*completed-sale evidence reconcilers/is);
});

test("product contract identifies Relay current data and narrow evidence reconciliation", () => {
  const product = source("../PRODUCT.md");

  assert.doesNotMatch(product, /combines BitJita public API data/i);
  assert.doesNotMatch(product, /uncertain BitJita data/i);
  assert.match(product, /committed Relay generations/i);
  assert.match(product, /provider-neutral local routes/i);
  assert.match(product, /BitJita.*craft-contribution.*completed-sale evidence/is);
});
