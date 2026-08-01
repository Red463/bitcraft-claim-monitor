import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

test("Discord notification test endpoint returns and displays sandbox sender results", () => {
  assert.match(server, /const result = await sendDiscordTestNotification\(kind, \{ requestedChannelId: body\.channelId \}\)/);
  assert.match(server, /sandbox: true/);
  assert.match(server, /return send\(res, 200, \{ ok: true, result \}\)/);
  assert.match(admin, /setDiscordToolResults\(\(current\) => \(\{ \.\.\.current, tests: \{ \.\.\.result, __type: "botAction" \} \}\)\)/);
});

test("Discord discovery includes guild emoji metadata for profession matching", () => {
  assert.match(server, /\/guilds\/\$\{encodeURIComponent\(guildId\)\}\/emojis/);
  assert.match(server, /emojis: normalizedEmojis/);
  assert.match(admin, /discoveredEmojis/);
});
