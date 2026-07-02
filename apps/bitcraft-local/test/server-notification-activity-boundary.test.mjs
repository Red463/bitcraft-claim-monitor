import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("notification activity exposes production events to browser notifications", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /const notableTypes = \[[^\]]*"production_started"[^\]]*"production_completed"[^\]]*\]/s);
});