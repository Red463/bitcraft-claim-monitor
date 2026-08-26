import assert from "node:assert/strict";
import test from "node:test";
import { deriveBotHealth } from "../src/components/bot/botHealth.ts";

test("enabled bot surfaces setup and delivery exceptions without secrets", () => {
  const result = deriveBotHealth({ enabled: true, tokenConfigured: false, gatewayConnected: false, gatewayError: "Invalid token", rulesEnabled: 3, lastDeliveryStatus: "failed", lastDeliveryLabel: "Unknown channel", setupSteps: [] });
  assert.equal(result.cards.find(({ id }) => id === "gateway").tone, "danger");
  assert.deepEqual(result.exceptions.map(({ section }) => section), ["setup", "diagnostics"]);
  assert.match(result.exceptions[0].title, /token/i);
  assert.doesNotMatch(JSON.stringify(result), /Invalid token.*Invalid token/);
});

test("disabled and healthy bots do not imply failures", () => {
  const disabled = deriveBotHealth({ enabled: false, tokenConfigured: false, gatewayConnected: false, gatewayError: null, rulesEnabled: 0, lastDeliveryStatus: null, lastDeliveryLabel: "No delivery", setupSteps: [] });
  assert.equal(disabled.exceptions.length, 0);
  assert.ok(disabled.cards.every(({ tone }) => tone === "neutral"));
  const healthy = deriveBotHealth({ enabled: true, tokenConfigured: true, gatewayConnected: true, gatewayError: null, rulesEnabled: 4, lastDeliveryStatus: "sent", lastDeliveryLabel: "Delivered", setupSteps: [] });
  assert.equal(healthy.exceptions.length, 0);
});

test("non-delivery states are never presented as successful", () => {
  const base = { enabled: true, tokenConfigured: true, gatewayConnected: true, gatewayError: null, rulesEnabled: 2, lastDeliveryLabel: "No message was sent", setupSteps: [] };
  const skipped = deriveBotHealth({ ...base, lastDeliveryStatus: "skipped" });
  const queued = deriveBotHealth({ ...base, lastDeliveryStatus: "queued" });
  assert.equal(skipped.cards.find(({ id }) => id === "delivery").tone, "neutral");
  assert.equal(queued.cards.find(({ id }) => id === "delivery").tone, "warning");
});
