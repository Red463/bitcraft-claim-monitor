import assert from "node:assert/strict";
import test from "node:test";

import { createNoBitjitaFetch } from "./support/noBitjitaFetch.mjs";

test("migration fetch transport rejects BitJita hosts and permits provider-neutral local routes", async () => {
  const requested = [];
  const guardedFetch = createNoBitjitaFetch(async (input) => {
    requested.push(String(input));
    return new Response("ok");
  });

  await assert.rejects(
    () => guardedFetch("https://bitjita.com/api/claims/1"),
    /Forbidden BitJita test request/,
  );
  await assert.rejects(
    () => guardedFetch("https://cdn.bitjita.com/icons/item.webp"),
    /Forbidden BitJita test request/,
  );
  assert.equal((await guardedFetch("/api/local/game-data")).status, 200);
  assert.deepEqual(requested, ["/api/local/game-data"]);
});
