import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/MembersPage.tsx", import.meta.url), "utf8");

test("Member Details reports the projected loadout count instead of a fixed two-slot label", () => {
  assert.match(page, /\{gearPresets\.length\} loadouts?/);
  assert.doesNotMatch(page, />2 preset slots</);
});
