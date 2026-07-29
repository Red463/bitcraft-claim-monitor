import assert from "node:assert/strict";
import test from "node:test";

const {
  normalizeClaim,
  normalizeClaimPayload,
  normalizeDeposit,
  normalizeDeposits,
  normalizeClaimCrafts,
  normalizeClaimCraftPayloads,
  normalizeClaimInventory,
  normalizeCatalogDescription,
  normalizeCatalogEntity,
  normalizeItemKind,
  normalizeMembers,
  normalizeMembersPayload,
  normalizeCitizensPayload,
  normalizeRegionalPlayers,
  normalizeTimestamp,
} = await import(new URL("../src/server/game-data/normalizers.ts", import.meta.url).href);

test("Relay claim normalization preserves 64-bit IDs as decimal strings", () => {
  assert.deepEqual(normalizeClaim({
    entity_id: "1369094286777412590",
    name: "Timbersteel Trade",
    region: 19,
    owner_player_entity_id: "1369094286756659093",
    supplies: 55837,
    treasury: 2703,
    tier: 5,
    num_tiles: 1806,
    tile_cost: 0.0125,
    upkeep_cost: 22.575,
    supplies_run_out: 1794254519732,
  }), {
    entityId: "1369094286777412590",
    name: "Timbersteel Trade",
    regionId: "19",
    ownerPlayerEntityId: "1369094286756659093",
    supplies: "55837",
    treasury: "2703",
    tier: 5,
    numTiles: 1806,
    tileCost: 0.0125,
    upkeepCost: 22.575,
    suppliesRunOut: "2026-11-09T20:01:59.732Z",
  });
});

test("Relay member normalization maps snake case without converting identifiers to numbers", () => {
  const members = normalizeMembers({
    count: 1,
    members: [{
      entity_id: "1369094286777413408",
      claim_entity_id: "1369094286777412590",
      player_entity_id: "1369094286756659093",
      user_name: "Modular",
      hexcoins: 100638,
      build_permission: true,
      inventory_permission: true,
      officer_permission: true,
      co_owner_permission: true,
      last_active_timestamp: 1785350252,
      last_login_timestamp: 1785330174,
      skills: { "2": 67 },
    }],
    skill_names: { "2": "Forestry" },
  });

  assert.deepEqual(members, [{
    entityId: "1369094286777413408",
    claimEntityId: "1369094286777412590",
    playerEntityId: "1369094286756659093",
    userName: "Modular",
    hexcoins: "100638",
    buildPermission: true,
    inventoryPermission: true,
    officerPermission: true,
    coOwnerPermission: true,
    lastActiveTimestamp: "2026-07-29T18:37:32.000Z",
    lastLoginTimestamp: "2026-07-29T13:02:54.000Z",
    skills: { "2": 67 },
    skillNames: { "2": "Forestry" },
  }]);
});

test("Relay member skills become citizen levels with exact player identity", () => {
  assert.deepEqual(normalizeCitizensPayload({
    skill_names: { 2: "Forestry", 15: "Construction" },
    members: [{
      entity_id: "1369094286777413408",
      claim_entity_id: "1369094286777412590",
      player_entity_id: "1369094286756659093",
      user_name: "Modular",
      hexcoins: 98736,
      skills: { 2: 67, 15: 39 },
    }],
  }).data, [{
    entityId: "1369094286777413408",
    playerEntityId: "1369094286756659093",
    userName: "Modular",
    skills: { 2: 67, 15: 39 },
    skillNames: { 2: "Forestry", 15: "Construction" },
    totalLevel: 106,
    totalSkillLevel: 106,
  }]);
});

test("regional player rows preserve exact IDs and derive bounded session activity", () => {
  assert.deepEqual(normalizeRegionalPlayers({
    members: [{
      playerEntityId: "1369094286756659093",
      userName: "Modular",
      lastActiveTimestamp: "2026-07-29T19:00:00.000Z",
    }, {
      playerEntityId: "1224979098736429551",
      userName: "Texian1836",
      lastLoginTimestamp: "2026-07-29T18:50:00.000Z",
    }],
    playerRows: [{
      entityId: 1369094286756659093n,
      timePlayed: 100000,
      sessionStartTimestamp: 1785352200,
      timeSignedIn: 80000,
      signInTimestamp: 1785352200,
      signedIn: true,
      travelerTasksExpiration: 0,
    }],
    observedAt: "2026-07-29T19:15:00.000Z",
  }), {
    data: [{
      entityId: "1369094286756659093",
      playerEntityId: "1369094286756659093",
      username: "Modular",
      signedIn: true,
      sessionSeconds: 300,
      timePlayedSeconds: 100000,
      timeSignedInSeconds: 80000,
      signInTimestamp: "2026-07-29T19:10:00.000Z",
      lastActiveTimestamp: "2026-07-29T19:00:00.000Z",
    }, {
      entityId: "1224979098736429551",
      playerEntityId: "1224979098736429551",
      username: "Texian1836",
      signedIn: false,
      sessionSeconds: null,
      timePlayedSeconds: null,
      timeSignedInSeconds: null,
      lastLoginTimestamp: "2026-07-29T18:50:00.000Z",
    }],
    warnings: ["Regional player_state omitted member 1224979098736429551."],
  });
});

test("timestamp normalization requires an explicit unit", () => {
  assert.equal(normalizeTimestamp(1785350252, "seconds"), "2026-07-29T18:37:32.000Z");
  assert.equal(normalizeTimestamp(1794254519732, "milliseconds"), "2026-11-09T20:01:59.732Z");
  assert.equal(normalizeTimestamp(1785350252000000n, "microseconds"), "2026-07-29T18:37:32.000Z");
  assert.throws(() => normalizeTimestamp(1785350252, "milliseconds"), /outside the supported date range/i);
});

test("item and cargo identities remain disjoint", () => {
  assert.equal(normalizeItemKind("Item"), "item");
  assert.equal(normalizeItemKind("Cargo"), "cargo");
  assert.throws(() => normalizeItemKind("Unknown"), /unsupported item kind/i);
});

test("typed global item and cargo rows normalize into provider-neutral catalog entities", () => {
  assert.deepEqual(normalizeCatalogEntity({
    id: 42,
    name: "Timber",
    tag: "Wood",
    tier: 2,
    rarity: { tag: "Common" },
    iconAssetName: "Items/Timber",
    itemListId: 17,
  }, "item"), {
    kind: "item",
    id: "42",
    name: "Timber",
    tag: "Wood",
    tier: 2,
    rarity: "Common",
    iconAssetName: "Items/Timber",
    itemListId: "17",
  });
  assert.deepEqual(normalizeCatalogEntity({
    id: 42,
    name: "Timber Crate",
    tag: "Packaged",
    tier: 2,
    rarity: { tag: "Common" },
    iconAssetName: "GeneratedIcons/Cargo/Timber Crate",
  }, "cargo"), {
    kind: "cargo",
    id: "42",
    name: "Timber Crate",
    tag: "Packaged",
    tier: 2,
    rarity: "Common",
    iconAssetName: "GeneratedIcons/Cargo/Timber Crate",
  });
  assert.deepEqual(normalizeCatalogEntity({
    id: 853965214,
    name: "Deed: Pet Buttons",
    tag: "Deed",
    tier: -1,
    rarity: { tag: "Common" },
    iconAssetName: "Items/Deed Pet Buttons",
    itemListId: 0,
  }, "item"), {
    kind: "item",
    id: "853965214",
    name: "Deed: Pet Buttons",
    tag: "Deed",
    tier: null,
    rarity: "Common",
    iconAssetName: "Items/Deed Pet Buttons",
  });
  assert.equal(normalizeCatalogEntity({
    id: 1541856987,
    name: "Nubi Berry Mash Knowledge",
    tag: "Knowledge",
    tier: -2,
  }, "item").tier, null);
  assert.throws(
    () => normalizeCatalogEntity({ id: 1.5, name: "Invalid" }, "item"),
    /decimal integer/i,
  );
});

test("typed recipe and skill descriptions are projected without wire DTOs", () => {
  assert.deepEqual(normalizeCatalogDescription({
    id: 77,
    name: "Saw Timber",
    actionsRequired: 12,
    isPassive: false,
    buildingRequirement: { buildingType: 9, tier: 2 },
    levelRequirements: [{ skillId: 5, level: 20 }],
    toolRequirements: [{ toolType: 4, level: 3, power: 25 }],
    experiencePerProgress: [{ skillId: 5, quantity: 2.5 }],
    consumedItemStacks: [{
      itemId: 42,
      quantity: 3,
      itemType: { tag: "Item" },
      consumptionChance: 1,
    }],
    craftedItemStacks: [{
      itemId: 43,
      quantity: 1,
      itemType: { tag: "Cargo" },
    }],
  }, "crafting_recipe"), {
    kind: "crafting_recipe",
    id: "77",
    name: "Saw Timber",
    actionsRequired: 12,
    isPassive: false,
    buildingRequirement: { buildingType: "9", tier: 2 },
    levelRequirements: [{ skillId: "5", level: 20 }],
    toolRequirements: [{ toolType: 4, level: 3, power: 25 }],
    experiencePerProgress: [{ skillId: "5", quantity: 2.5 }],
    inputs: [{ kind: "item", id: "42", quantity: "3", consumptionChance: 1 }],
    outputs: [{ kind: "cargo", id: "43", quantity: "1" }],
  });
  assert.deepEqual(normalizeCatalogDescription({
    id: 5,
    skillType: 10,
    name: "Forestry",
    description: "Work with trees",
    iconAssetName: "Skills/Forestry",
    title: "Forester",
    skillCategory: { tag: "Profession" },
    maxLevel: 100,
  }, "skill"), {
    kind: "skill",
    id: "5",
    skillType: "10",
    name: "Forestry",
    description: "Work with trees",
    iconAssetName: "Skills/Forestry",
    title: "Forester",
    category: "Profession",
    maxLevel: 100,
  });
});

test("deposit status is unknown unless Relay explicitly proves active or respawning", () => {
  assert.equal(normalizeDeposit({ entity_id: "1", region: 19 }).status, "unknown");
  assert.equal(normalizeDeposit({ entity_id: "2", region: 19, status: "unknown" }).status, "unknown");
  assert.equal(normalizeDeposit({ entity_id: "3", region: 19, status: "active" }).status, "active");
  assert.equal(normalizeDeposit({ entity_id: "4", region: 19, respawn_at: "2026-08-04T23:48:26.148Z" }).status, "respawning");
});

test("partial Relay payloads preserve valid rows and report missing or malformed fields", () => {
  const claim = normalizeClaimPayload({
    entity_id: "1369094286777412590",
    name: "Timbersteel Trade",
    region: 19,
  });
  assert.deepEqual(claim.data, {
    entityId: "1369094286777412590",
    name: "Timbersteel Trade",
    regionId: "19",
  });
  assert.ok(claim.warnings.some((warning) => warning.includes("supplies")));

  const members = normalizeMembersPayload({
    members: [
      {
        entity_id: "1",
        claim_entity_id: "1369094286777412590",
        player_entity_id: "2",
        user_name: "Valid partial member",
      },
      {
        entity_id: "not-an-id",
        claim_entity_id: "1369094286777412590",
        player_entity_id: "3",
      },
    ],
  });
  assert.equal(members.data.length, 1);
  assert.equal(members.data[0].userName, "Valid partial member");
  assert.ok(members.warnings.some((warning) => warning.includes("members[1]")));
});

test("claim inventory normalization preserves item/cargo collisions and exact quantities", () => {
  const inventory = normalizeClaimInventory({
    claim: { entity_id: "1369094286777412590", name: "Timbersteel Trade", region: 19 },
    dimensions: [{
      dimension_id: "77",
      kind: "Claim",
      buildings: [{
        entity_id: "1369094286778488967",
        name: "Simple Chest",
        nickname: "Materials",
        items: [
          { item_id: 42, item_type: "Item", quantity: "9007199254740993" },
          { item_id: 42, item_type: "Cargo", quantity: 2 },
        ],
      }],
    }],
  });

  assert.deepEqual(inventory.buildings[0].inventory.map((slot) => slot.contents), [
    { itemId: "42", itemType: "item", quantity: "9007199254740993" },
    { itemId: "42", itemType: "cargo", quantity: "2" },
  ]);
  assert.equal(inventory.buildings[0].entityId, "1369094286778488967");
});

test("claim craft and deposit payloads normalize into provider domain shapes", () => {
  const crafts = normalizeClaimCrafts({
    crafts: [{
      entity_id: "1369094286813753789",
      building_entity_id: "1369094286799387835",
      claim_entity_id: "1369094286777412590",
      owner_entity_id: "864691128504576674",
      completed: false,
      craft_count: 125,
      progress: 2580,
      recipe_id: 209007,
      total_actions_required: 8125,
      crafted_item: [{ item_id: 2090008, item_type: "Item", quantity: 1 }],
    }],
  });
  assert.equal(crafts.craftResults[0].entityId, "1369094286813753789");
  assert.deepEqual(crafts.craftResults[0].craftedItem[0], {
    itemId: "2090008",
    itemType: "item",
    quantity: "1",
  });

  const deposits = normalizeDeposits({
    deposits: [
      { entity_id: "1", region: 19, status: "unknown" },
      { entity_id: "2", region: 19, respawn_at: "2026-08-04T23:48:26.148Z" },
    ],
  });
  assert.deepEqual(deposits.map((deposit) => deposit.status), ["unknown", "respawning"]);
});

test("claim craft payloads merge incomplete and completed rows without losing exact identities", () => {
  const crafts = normalizeClaimCraftPayloads([
    {
      crafts: [{
        entity_id: "1369094286813753789",
        building_entity_id: "1369094286799387835",
        claim_entity_id: "1369094286777412590",
        owner_entity_id: "864691128504576674",
        completed: false,
        craft_count: "9007199254740993",
        progress: 2,
        recipe_id: 209007,
        total_actions_required: 8125,
        crafted_item: [{ item_id: 42, item_type: "Cargo", quantity: 1 }],
      }],
    },
    {
      crafts: [{
        entity_id: "1369094287235049109",
        building_entity_id: "1369094286803079588",
        claim_entity_id: "1369094286777412590",
        owner_entity_id: "1224979098736429551",
        completed: true,
        craft_count: 1,
        progress: 1,
        recipe_id: 210017,
        total_actions_required: 1,
        crafted_item: [{ item_id: 42, item_type: "Item", quantity: 100 }],
      }],
    },
  ]);

  assert.equal(crafts.craftResults.length, 2);
  assert.equal(crafts.craftResults[0].craftCount, "9007199254740993");
  assert.equal(crafts.craftResults[0].craftedItem[0].itemType, "cargo");
  assert.equal(crafts.craftResults[1].completed, true);
});
