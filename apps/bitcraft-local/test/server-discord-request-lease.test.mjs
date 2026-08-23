import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { fetchDiscordWithLease } from "../src/server/discordRequestLease.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

test("lost ownership aborts a fake-origin request and the remaining fan-out before fetch", async (t) => {
  const requests = [];
  const fakeDiscord = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const port = await listen(fakeDiscord);
  t.after(() => new Promise((resolve) => fakeDiscord.close(resolve)));
  const origin = `http://127.0.0.1:${port}`;
  const renewals = [true, true, false];
  const deliveryLease = {
    beforeRequest() {
      return renewals.shift() ?? false;
    },
  };

  await fetchDiscordWithLease(`${origin}/recipients/one/channel`, {}, { deliveryLease });
  await fetchDiscordWithLease(`${origin}/recipients/one/message`, {}, { deliveryLease });
  await assert.rejects(
    fetchDiscordWithLease(`${origin}/recipients/two/channel`, {}, { deliveryLease }),
    /lease ownership was lost before network delivery/,
  );

  assert.deepEqual(requests, [
    "/recipients/one/channel",
    "/recipients/one/message",
  ]);
  assert.equal(renewals.length, 0);
});
