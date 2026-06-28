import assert from "node:assert/strict";
import test from "node:test";

import { BODY_LIMITS, RequestBodyTooLargeError, readJson, readRawBody } from "../src/server/httpBodies.mjs";

async function* chunks(parts) {
  for (const part of parts) yield Buffer.from(part);
}

test("readRawBody joins streamed request chunks within the configured limit", async () => {
  const body = await readRawBody(chunks(["hello", " ", "world"]), 64);

  assert.equal(body.toString("utf8"), "hello world");
});

test("readRawBody rejects oversized bodies with the app 413 error shape", async () => {
  await assert.rejects(
    readRawBody(chunks(["12345", "67890"]), 8),
    (error) => {
      assert.equal(error instanceof RequestBodyTooLargeError, true);
      assert.equal(error.statusCode, 413);
      assert.equal(error.message, "Request body is too large; maximum size is 8 bytes");
      return true;
    },
  );
});

test("readJson parses JSON payloads and treats empty bodies as empty objects", async () => {
  assert.deepEqual(await readJson(chunks(['{"ok":true}']), BODY_LIMITS.json), { ok: true });
  assert.deepEqual(await readJson(chunks([]), BODY_LIMITS.json), {});
});

test("BODY_LIMITS preserves the public route body size policies", () => {
  assert.equal(BODY_LIMITS.auth, 8 * 1024);
  assert.equal(BODY_LIMITS.analytics, 8 * 1024);
  assert.equal(BODY_LIMITS.json, 64 * 1024);
  assert.equal(BODY_LIMITS.settings, 256 * 1024);
  assert.equal(BODY_LIMITS.branding, 2 * 1024 * 1024);
  assert.equal(BODY_LIMITS.snapshot, 1024 * 1024);
  assert.equal(BODY_LIMITS.discordInteraction, 256 * 1024);
});
