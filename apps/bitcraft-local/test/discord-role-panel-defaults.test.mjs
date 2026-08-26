import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultRolePanels } from "../src/discordRolePanelDefaults.mjs";
import { defaultRolePanels } from "../src/server/discordSettings.mjs";

const mojibake = /Ã|Â|Æ/;

test("browser and server role-panel emoji defaults contain no mojibake", () => {
  for (const panels of [createDefaultRolePanels(), defaultRolePanels]) {
    for (const panel of panels) {
      for (const option of panel.options) assert.doesNotMatch(option.emoji, mojibake);
    }
  }
});

test("access role defaults use Discord keycap emoji", () => {
  for (const panels of [createDefaultRolePanels(), defaultRolePanels]) {
    assert.deepEqual(panels[0].options.map(({ emoji }) => emoji), ["1️⃣", "2️⃣"]);
  }
});
