import assert from "node:assert/strict";
import test from "node:test";

let presetsModule = null;
try {
  presetsModule = await import(
    new URL("../src/server/game-data/researchTierPresets.ts", import.meta.url).href,
  );
} catch {
  // The first TDD run proves Relay-backed research presets are absent.
}

test("research tier presets merge typed exact catalog inputs without an upstream request", () => {
  assert.ok(presetsModule, "research tier preset module must exist");
  const entities = new Map([
    ["items:10", {
      targetId: "10",
      kind: "items",
      itemType: 0,
      name: "Sturdy Research Notes",
      tier: 3,
      rarity: "Common",
      tag: "Research",
      iconAssetName: "Items/ResearchNotes",
    }],
    ["cargo:10", {
      targetId: "10",
      kind: "cargo",
      itemType: 1,
      name: "Sturdy Research Crate",
      tier: 3,
      rarity: "Uncommon",
      tag: "Packaged",
      iconAssetName: "Cargo/ResearchCrate",
    }],
  ]);
  const result = presetsModule.buildResearchTierPresets({
    technologies: [{
      id: "300",
      name: "Tier 3",
      tier: 3,
      techType: "TierUpgrade",
      inputs: [
        { kind: "item", id: "10", quantity: "9007199254740993" },
        { kind: "cargo", id: "10", quantity: "2" },
      ],
    }, {
      id: "301",
      name: "Tier 3 Township",
      tier: 3,
      techType: "Settlement",
      inputs: [
        { kind: "item", id: "10", quantity: "7" },
      ],
    }, {
      id: "302",
      name: "Town Bank",
      tier: 3,
      techType: "TownBank",
      inputs: [{ kind: "item", id: "10", quantity: "999" }],
    }],
  }, (key) => entities.get(key) ?? null);

  assert.deepEqual(result, {
    presets: [{
      key: "tier-3",
      label: "T3",
      tier: 3,
      source: "relay-research",
      items: [{
        id: "10",
        kind: "items",
        itemType: 0,
        quantity: "9007199254741000",
        name: "Sturdy Research Notes",
        tier: 3,
        rarityStr: "Common",
        tag: "Research",
        iconAssetName: "Items/ResearchNotes",
      }, {
        id: "10",
        kind: "cargo",
        itemType: 1,
        quantity: "2",
        name: "Sturdy Research Crate",
        tier: 3,
        rarityStr: "Uncommon",
        tag: "Packaged",
        iconAssetName: "Cargo/ResearchCrate",
      }],
    }],
    warnings: [],
  });
});

test("research tier presets expose missing local catalog identities", () => {
  assert.ok(presetsModule, "research tier preset module must exist");
  const result = presetsModule.buildResearchTierPresets({
    technologies: [{
      id: "400",
      name: "Tier 4",
      tier: 4,
      techType: "TierUpgrade",
      inputs: [{ kind: "item", id: "44", quantity: "3" }],
    }],
  }, () => null);

  assert.deepEqual(result, {
    presets: [{
      key: "tier-4",
      label: "T4",
      tier: 4,
      source: "relay-research",
      items: [{
        id: "44",
        kind: "items",
        itemType: 0,
        quantity: "3",
        name: "Item #44",
        tier: null,
        rarityStr: null,
        tag: null,
        iconAssetName: null,
      }],
    }],
    warnings: ["Research tier preset T4 is missing local catalog identity items:44."],
  });
});
