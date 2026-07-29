import assert from "node:assert/strict";
import test from "node:test";

let gameAssets = null;
try {
  gameAssets = await import("../src/utils/gameAssets.mjs");
} catch {
  // The first TDD run proves the resolver module is not present yet.
}

test("game icon resolver returns only normalized same-origin asset paths", () => {
  assert.ok(gameAssets, "game asset resolver module must exist");
  assert.equal(typeof gameAssets.gameIconUrl, "function");

  assert.equal(
    gameAssets.gameIconUrl({ iconAssetName: "Items/Basic Axe.webp" }),
    "/game-icons/GeneratedIcons/Items/Basic%20Axe.webp",
  );
  assert.equal(
    gameAssets.gameIconUrl({ icon_asset_name: "GeneratedIcons\\Cargo\\Stone Block" }),
    "/game-icons/GeneratedIcons/Cargo/Stone%20Block.webp",
  );
  assert.equal(gameAssets.gameIconUrl({ iconAssetName: "../../secrets" }), null);
  assert.equal(gameAssets.gameIconUrl({ iconAssetName: "https://bitjita.com/icon.webp" }), null);
  assert.equal(gameAssets.gameIconUrl({ iconAssetName: "\uFFEE" }), null);
});
