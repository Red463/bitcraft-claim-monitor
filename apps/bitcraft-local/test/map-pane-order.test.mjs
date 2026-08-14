import assert from "node:assert/strict";
import test from "node:test";

let paneOrderModule = null;
try {
  paneOrderModule = await import("../src/pages/map/mapPaneOrder.mjs");
} catch {
  // RED: the semantic pane-order module has not been added yet.
}

test("native map pane order keeps resources below icons and tooltips above players", () => {
  assert.ok(paneOrderModule, "native map pane-order module must exist");
  const panes = {
    resources: { style: { zIndex: "" } },
    markers: { style: { zIndex: "" } },
    players: { style: { zIndex: "" } },
    tooltips: { style: { zIndex: "" } },
  };

  paneOrderModule.applyNativeMapPaneOrder(panes);

  const applied = [
    Number(panes.resources.style.zIndex),
    Number(panes.markers.style.zIndex),
    Number(panes.players.style.zIndex),
    Number(panes.tooltips.style.zIndex),
  ];
  assert.deepEqual(applied, [550, 600, 700, 750]);
  assert.ok(applied.every((value, index) => index === 0 || applied[index - 1] < value));
});
