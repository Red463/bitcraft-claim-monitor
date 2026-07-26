import assert from "node:assert/strict";
import test from "node:test";
import * as paletteCommands from "../src/navigation/paletteCommands.ts";
import { ROUTE_HELP, routeHelpFor } from "../src/navigation/routeHelp.ts";

const { activatePagePaletteCommand, buildPagePaletteCommands } = paletteCommands;
const visiblePagePaletteItems = paletteCommands.visiblePagePaletteItems ?? (() => []);
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

test("palette page commands are contextual and restricted commands open their access explanation", () => {
  const commands = buildPagePaletteCommands(navItems, new Set(["dashboard"]));
  const dashboard = commands.find((command) => command.panel === "dashboard");
  const planning = commands.find((command) => command.panel === "planning");
  const activated = [];
  assert.match(dashboard.description, /Scan current settlement attention signals/);
  assert.equal(activatePagePaletteCommand(planning, (panel) => activated.push(panel)), true);
  assert.deepEqual(activated, ["planning"]);
  assert.match(planning.description, /Open to see access requirements/);
  assert.equal(activatePagePaletteCommand(dashboard, (panel) => activated.push(panel)), true);
  assert.deepEqual(activated, ["planning", "dashboard"]);
});

test("page palette candidates hide Admin unless the administrator session is authenticated", () => {
  const candidates = [
    ["admin", "Admin", null],
    ["dashboard", "Dashboard", null],
  ];

  assert.deepEqual(visiblePagePaletteItems(candidates, false).map(([id]) => id), ["dashboard"]);
  assert.deepEqual(visiblePagePaletteItems(candidates, true).map(([id]) => id), ["admin", "dashboard"]);
});
