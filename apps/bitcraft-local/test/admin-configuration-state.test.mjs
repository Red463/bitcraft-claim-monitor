import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIGURATION_SECTIONS,
  configurationSectionForSetting,
  shouldConfirmConfigurationNavigation,
} from "../src/components/admin/adminConfigurationState.ts";

test("configuration is split into five stable categories", () => {
  assert.deepEqual(CONFIGURATION_SECTIONS.map(({ id }) => id), ["general", "privacy", "notifications", "integrations", "branding"]);
});

test("shared settings map to the category that owns their controls", () => {
  assert.equal(configurationSectionForSetting("refreshSeconds"), "general");
  assert.equal(configurationSectionForSetting("visitorSecurity"), "privacy");
  assert.equal(configurationSectionForSetting("toastSettings"), "notifications");
  assert.equal(configurationSectionForSetting("excludedMemberIds"), "integrations");
  assert.equal(configurationSectionForSetting("branding"), "branding");
});

test("only a dirty move to another category requires confirmation", () => {
  assert.equal(shouldConfirmConfigurationNavigation({ dirty: true, current: "general", next: "privacy" }), true);
  assert.equal(shouldConfirmConfigurationNavigation({ dirty: true, current: "general", next: "general" }), false);
  assert.equal(shouldConfirmConfigurationNavigation({ dirty: false, current: "general", next: "privacy" }), false);
});
