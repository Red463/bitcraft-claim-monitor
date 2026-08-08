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

test("game icon sources prefer the Relay catalog asset, then the same-origin metadata fallback", () => {
  assert.deepEqual(
    gameAssets.gameIconSources({ id: "42", itemType: 0, iconAssetName: "Items/Basic Axe.webp" }),
    ["/game-icons/GeneratedIcons/Items/Basic%20Axe.webp", "/api/local/game-icon/item/42"],
  );
  assert.deepEqual(
    gameAssets.gameIconSources({ itemId: "42", item_type: 1, iconAssetName: "\uFFEE" }),
    ["/api/local/game-icon/cargo/42"],
  );
  assert.deepEqual(gameAssets.gameIconSources({ id: "not-decimal", itemType: "item" }), []);
});

test("game icon identity stays atomic at one record level and supports Inventory display types", () => {
  assert.deepEqual(
    gameAssets.gameIconSources({ itemId: "42", type: "Cargo" }),
    ["/api/local/game-icon/cargo/42"],
  );
  assert.deepEqual(
    gameAssets.gameIconSources({ id: "42", contents: { itemId: "84", itemType: "cargo" } }),
    ["/api/local/game-icon/cargo/84"],
  );
  assert.deepEqual(
    gameAssets.gameIconSources({ id: "42", contents: { itemType: "cargo" } }),
    [],
  );
  assert.deepEqual(
    gameAssets.gameIconSources({ itemType: "item", contents: { itemId: "84" } }),
    [],
  );
  assert.deepEqual(
    gameAssets.gameIconSources({ id: "42", type: "Item" }),
    ["/api/local/game-icon/item/42"],
  );
});
