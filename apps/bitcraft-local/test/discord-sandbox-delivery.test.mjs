import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import * as delivery from "../src/server/discordDeliveryMode.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

const sandboxChannelId = "123456789012345678";
const settings = { enabled: true, botToken: "test-token" };

test("manual sandbox delivery posts once to the configured channel", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `message-${requests.length}`, channel_id: sandboxChannelId }));
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await delivery.sendDiscordManualSandboxMessage({
    apiOrigin: `http://127.0.0.1:${port}`,
    configuredChannelId: sandboxChannelId,
    fetchImpl: fetch,
    payload: {
      content: "<@&987654321098765432> manual test",
      allowed_mentions: { roles: ["987654321098765432"], parse: ["roles"] },
    },
    requestedChannelId: sandboxChannelId,
    settings,
  });
  assert.equal(response.channel_id, sandboxChannelId);

  assert.equal(requests.length, 1);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.path, `/channels/${sandboxChannelId}/messages`);
    assert.equal(request.authorization, "Bot test-token");
    assert.deepEqual(request.body.allowed_mentions, { parse: [] });
  }
});

test("manual sandbox delivery rejects absent, invalid, and mismatched channels without HTTP", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("unexpected HTTP");
  };
  const common = {
    apiOrigin: "http://127.0.0.1:1",
    fetchImpl,
    payload: { content: "manual test" },
    settings,
  };

  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({ ...common, configuredChannelId: "" }),
    /sandbox channel/i,
  );
  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({ ...common, configuredChannelId: "invalid" }),
    /sandbox channel/i,
  );
  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({ ...common, configuredChannelId: "9999999999999999999999999" }),
    /sandbox channel/i,
  );
  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({
      ...common,
      configuredChannelId: sandboxChannelId,
      requestedChannelId: "987654321098765432",
    }),
    /does not match/i,
  );
  assert.equal(fetchCalls, 0);
});

test("manual sandbox delivery still requires an enabled integration and bot token", async () => {
  const common = {
    apiOrigin: "http://127.0.0.1:1",
    configuredChannelId: sandboxChannelId,
    fetchImpl: async () => {
      throw new Error("unexpected HTTP");
    },
    payload: { content: "manual test" },
  };
  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({ ...common, settings: { enabled: false, botToken: "token" } }),
    /fully configured/i,
  );
  await assert.rejects(
    delivery.sendDiscordManualSandboxMessage({ ...common, settings: { enabled: true, botToken: "" } }),
    /fully configured/i,
  );
});
