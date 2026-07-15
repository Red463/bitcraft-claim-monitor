import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigationSource = readFileSync(new URL("../src/navigation.ts", import.meta.url), "utf8");
const routeIds = [...navigationSource.matchAll(/\["([a-zA-Z]+)",\s*"[^"]+",/g)].map((match) => match[1]).filter((id) => id !== "admin");
const navItems = routeIds.map((id) => [id, id, null]);

let routeHelpModule = {};
let paletteCommandsModule = {};
try {
  routeHelpModule = await import("../src/navigation/routeHelp.ts");
  paletteCommandsModule = await import("../src/navigation/paletteCommands.ts");
} catch {
  // RED starts before the focused executable seams exist.
}

test("every non-sensitive navigation route has concise purpose and next-action help", () => {
  assert.equal(typeof routeHelpModule.routeHelpFor, "function");
  for (const id of routeIds) {
    const help = routeHelpModule.routeHelpFor(id);
    assert.ok(help?.purpose, `${id} needs a purpose`);
    assert.ok(help?.nextAction, `${id} needs a next action`);
  }
});

test("active route selects its own contextual help", () => {
  assert.deepEqual(routeHelpModule.routeHelpFor?.("planning"), {
    purpose: "Turn settlement goals into tracked material and production needs.",
    nextAction: "Review the Needs Board, then open a material to see where to get it.",
  });
});

test("palette page commands are contextual and locked commands cannot activate", () => {
  assert.equal(typeof paletteCommandsModule.buildPagePaletteCommands, "function");
  assert.equal(typeof paletteCommandsModule.activatePagePaletteCommand, "function");
  const commands = paletteCommandsModule.buildPagePaletteCommands(navItems, new Set(["dashboard"]));
  const dashboard = commands.find((command) => command.panel === "dashboard");
  const planning = commands.find((command) => command.panel === "planning");
  const activated = [];
  assert.match(dashboard.description, /Scan current settlement attention signals/);
  assert.equal(paletteCommandsModule.activatePagePaletteCommand(planning, (panel) => activated.push(panel)), false);
  assert.deepEqual(activated, []);
  assert.match(planning.description, /does not guarantee access/);
  assert.equal(paletteCommandsModule.activatePagePaletteCommand(dashboard, (panel) => activated.push(panel)), true);
  assert.deepEqual(activated, ["dashboard"]);
});
