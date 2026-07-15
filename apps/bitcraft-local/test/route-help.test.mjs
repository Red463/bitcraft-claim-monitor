import assert from "node:assert/strict";
import test from "node:test";
import { activatePagePaletteCommand, buildPagePaletteCommands } from "../src/navigation/paletteCommands.ts";
import { ROUTE_HELP, routeHelpFor } from "../src/navigation/routeHelp.ts";

const routeIds = Object.keys(ROUTE_HELP);
const navItems = routeIds.map((id) => [id, id, null]);

test("every non-sensitive navigation route has concise purpose and next-action help", () => {
  for (const id of routeIds) {
    const help = routeHelpFor(id);
    assert.ok(help?.purpose, `${id} needs a purpose`);
    assert.ok(help?.nextAction, `${id} needs a next action`);
  }
});

test("active route selects its own contextual help", () => {
  assert.deepEqual(routeHelpFor("planning"), {
    purpose: "Turn settlement goals into tracked material and production needs.",
    nextAction: "Review the Needs Board, then open a material to see where to get it.",
  });
});

test("palette page commands are contextual and locked commands cannot activate", () => {
  const commands = buildPagePaletteCommands(navItems, new Set(["dashboard"]));
  const dashboard = commands.find((command) => command.panel === "dashboard");
  const planning = commands.find((command) => command.panel === "planning");
  const activated = [];
  assert.match(dashboard.description, /Scan current settlement attention signals/);
  assert.equal(activatePagePaletteCommand(planning, (panel) => activated.push(panel)), false);
  assert.deepEqual(activated, []);
  assert.match(planning.description, /does not guarantee access/);
  assert.equal(activatePagePaletteCommand(dashboard, (panel) => activated.push(panel)), true);
  assert.deepEqual(activated, ["dashboard"]);
});
