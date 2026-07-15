import assert from "node:assert/strict";
import test from "node:test";

let botSectionState = {};
try {
  botSectionState = await import("../src/components/bot/botSectionState.ts");
} catch {
  // RED starts before the executable persistence seam exists.
}

test("Bot section persistence uses a stable key and restores only stable section IDs", () => {
  assert.equal(botSectionState.BOT_SECTION_STORAGE_KEY, "bot.section");
  assert.equal(botSectionState.restoreBotSection("diagnostics"), "diagnostics");
  assert.equal(botSectionState.restoreBotSection("tools"), "tools");
  assert.equal(botSectionState.restoreBotSection("removed-section"), "setup");
  assert.equal(botSectionState.restoreBotSection(null), "setup");
});
