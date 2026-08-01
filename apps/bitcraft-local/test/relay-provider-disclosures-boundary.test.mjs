import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("maintainer README describes live Relay ownership without the retired browser proxy", () => {
  const readme = source("../README.md");

  assert.match(readme, /provider-neutral local routes/i);
  assert.match(readme, /committed Relay generations/i);
  assert.match(readme, /regional craft-progress transactions/i);
  assert.doesNotMatch(readme, /scheduled acquisition jobs/i);
});

test("product contract identifies Relay current data and live contribution attribution", () => {
  const product = source("../PRODUCT.md");

  assert.match(product, /committed Relay generations/i);
  assert.match(product, /provider-neutral local routes/i);
  assert.match(product, /positive regional craft-progress transactions/i);
});
