import assert from "node:assert/strict";
import test from "node:test";

import { collectGameIconEntries } from "../scripts/game-icon-catalog.mjs";

test("game icon catalog includes resource and enemy descriptions and deduplicates shared paths", () => {
  const entries = collectGameIconEntries({
    entities: [
      { kind: "item", id: "42", iconAssetName: "Items/Shared" },
    ],
    descriptions: {
      resource: [
        { kind: "resource", id: "700", iconAssetName: "GeneratedIcons/Other/LostShipment" },
        { kind: "resource", id: "701", iconAssetName: "Items/Shared" },
      ],
      enemy: [
        { kind: "enemy", id: "8", iconAssetName: "GeneratedIcons/Other/Animals/DeerMale" },
      ],
    },
  });

  assert.deepEqual(entries, [
    ["/game-icons/GeneratedIcons/Items/Shared.webp", ["item:42", "resource:701"]],
    ["/game-icons/GeneratedIcons/Other/Animals/DeerMale.webp", ["enemy:8"]],
    ["/game-icons/GeneratedIcons/Other/LostShipment.webp", ["resource:700"]],
  ]);
});

test("game icon catalog rejects invalid identities and icon paths", () => {
  assert.deepEqual(collectGameIconEntries({
    entities: [{ kind: "item", id: "", iconAssetName: "Items/NoId" }],
    descriptions: {
      resource: [
        { kind: "resource", id: "1", iconAssetName: "https://example.invalid/icon" },
      ],
    },
  }), []);
});
