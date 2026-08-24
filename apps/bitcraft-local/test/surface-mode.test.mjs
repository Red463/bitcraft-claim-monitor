import assert from "node:assert/strict";
import test from "node:test";
import { surfaceModeForPanel } from "../src/ui/surfaceMode.ts";

test("every maintained route maps to one contextual surface mode", () => {
  const expected = {
    dashboard: "operations", leaderboard: "operations", members: "operations",
    skills: "operations", "craft-monitor": "operations", planning: "operations",
    inventory: "operations", construction: "operations", research: "operations",
    region: "operations", empires: "operations", activity: "operations",
    market: "market", "settlement-market": "market", map: "map",
    publiccrafts: "public", craftcalc: "public", sync: "public", admin: "admin",
  };
  for (const [panel, mode] of Object.entries(expected)) {
    assert.equal(surfaceModeForPanel(panel), mode, panel);
  }
});
