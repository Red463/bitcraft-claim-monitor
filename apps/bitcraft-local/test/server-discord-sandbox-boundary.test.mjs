import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

test("only the two authenticated manual test paths use the explicit Discord sandbox sender", () => {
  assert.match(server, /DISCORD_SANDBOX_CHANNEL_ID/);
  assert.match(server, /sendDiscordManualSandboxMessage/);
  assert.match(server, /manualSandboxTest: true/);
  assert.match(server, /eventType: "test_basic"/);
  assert.match(server, /eventType: "craft_plan_report"/);
  assert.doesNotMatch(server, /forceLive|force_live/);
  assert.match(
    server,
    /url\.pathname === "\/api\/local\/admin\/discord\/test"[\s\S]*requestedChannelId: body\.channelId/,
  );
  assert.match(
    server,
    /url\.pathname === "\/api\/local\/admin\/discord\/craft-plan-report\/test"[\s\S]*requestedChannelId: body\.channelId/,
  );
});

test("the Admin craft-plan test does not submit its production rule channel", () => {
  assert.doesNotMatch(
    admin,
    /craft-plan-report\/test"[\s\S]{0,200}JSON\.stringify\(rule\)/,
  );
  assert.match(admin, /sandbox Discord channel/i);
  assert.doesNotMatch(admin, /Record only \(no messages sent\)/);
  assert.match(admin, /manual sandbox tests only/i);
});
