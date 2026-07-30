import type { ItemKind } from "./contracts.ts";

type WireRecord = Record<string, unknown>;
type TimestampUnit = "seconds" | "milliseconds" | "microseconds";
export type CatalogDescriptionKind =
  | "crafting_recipe"
  | "construction_recipe"
  | "building"
  | "skill"
  | "resource"
  | "equipment"
  | "tool"
  | "buff"
  | "claim_tech";

function record(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as WireRecord;
}

function decimalString(value: unknown, label: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new TypeError(`${label} must be a non-negative decimal integer string.`);
}

function optionalDecimalString(value: unknown, label: string): string | undefined {
  return value == null ? undefined : decimalString(value, label);
}

function finiteNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be finite.`);
  return parsed;
}

export function normalizeTimestamp(value: string | number | bigint, unit: TimestampUnit): string {
  let milliseconds: bigint;
  try {
    const integer = typeof value === "bigint" ? value : BigInt(value);
    milliseconds = unit === "seconds" ? integer * 1000n
      : unit === "microseconds" ? integer / 1000n
      : integer;
  } catch {
    throw new TypeError(`Invalid ${unit} timestamp.`);
  }
  const numeric = Number(milliseconds);
  if (!Number.isSafeInteger(numeric) || numeric < 946684800000 || numeric > 4102444800000) {
    throw new RangeError(`${unit} timestamp is outside the supported date range.`);
  }
  return new Date(numeric).toISOString();
}

export function normalizeItemKind(value: unknown): ItemKind {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "item") return "item";
  if (normalized === "cargo") return "cargo";
  throw new TypeError(`Unsupported item kind: ${String(value)}`);
}

function enumLabel(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tag = String((value as WireRecord).tag ?? "").trim();
    return tag || undefined;
  }
  return undefined;
}

function integer(value: unknown, label: string): number {
  const parsed = finiteNumber(value, label);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${label} must be an integer.`);
  return parsed;
}

function records(value: unknown): WireRecord[] {
  return Array.isArray(value)
    ? value.map((entry, index) => record(entry, `array entry ${index}`))
    : [];
}

function normalizeDescriptionStack(value: unknown) {
  const stack = record(value, "catalog item stack");
  return {
    kind: enumLabel(stack.itemType ?? stack.item_type)?.toLowerCase() === "cargo" ? "cargo" : "item",
    id: decimalString(stack.itemId ?? stack.item_id, "catalog stack item id"),
    quantity: decimalString(stack.quantity, "catalog stack quantity"),
    ...(stack.consumptionChance == null ? {} : {
      consumptionChance: finiteNumber(stack.consumptionChance, "catalog stack consumption chance"),
    }),
  };
}

function normalizeLevelRequirement(value: unknown) {
  const requirement = record(value, "catalog level requirement");
  return {
    skillId: decimalString(requirement.skillId ?? requirement.skill_id, "level requirement skill id"),
    level: integer(requirement.level, "level requirement level"),
  };
}

function normalizeToolRequirement(value: unknown) {
  const requirement = record(value, "catalog tool requirement");
  return {
    toolType: integer(requirement.toolType ?? requirement.tool_type, "tool requirement type"),
    level: integer(requirement.level, "tool requirement level"),
    power: integer(requirement.power, "tool requirement power"),
  };
}

function normalizeExperienceStack(value: unknown) {
  const stack = record(value, "catalog experience stack");
  return {
    skillId: decimalString(stack.skillId ?? stack.skill_id, "experience skill id"),
    quantity: finiteNumber(stack.quantity, "experience quantity"),
  };
}

function normalizeStats(value: unknown) {
  return records(value).map((stat) => ({
    stat: enumLabel(stat.id) ?? "Unknown",
    value: finiteNumber(stat.value, "catalog stat value"),
    isPercent: stat.isPct === true,
  }));
}

export function normalizeCatalogDescription(value: unknown, kind: CatalogDescriptionKind) {
  const row = record(value, `Relay ${kind} description`);
  const idValue = kind === "equipment" || kind === "tool"
    ? row.itemId ?? row.item_id
    : row.id;
  const id = decimalString(idValue, `${kind}.id`);
  const base = { kind, id };

  if (kind === "crafting_recipe") {
    const building = row.buildingRequirement == null
      ? null
      : record(row.buildingRequirement, "crafting recipe building requirement");
    return {
      ...base,
      name: String(row.name ?? "").trim(),
      actionsRequired: integer(row.actionsRequired ?? 0, "crafting recipe actions"),
      isPassive: row.isPassive === true,
      buildingRequirement: building ? {
        buildingType: decimalString(building.buildingType, "building requirement type"),
        tier: integer(building.tier, "building requirement tier"),
      } : null,
      levelRequirements: records(row.levelRequirements).map(normalizeLevelRequirement),
      toolRequirements: records(row.toolRequirements).map(normalizeToolRequirement),
      experiencePerProgress: records(row.experiencePerProgress).map(normalizeExperienceStack),
      inputs: records(row.consumedItemStacks).map(normalizeDescriptionStack),
      outputs: records(row.craftedItemStacks).map(normalizeDescriptionStack),
    };
  }
  if (kind === "construction_recipe") {
    return {
      ...base,
      name: String(row.name ?? "").trim(),
      actionsRequired: integer(row.actionsRequired ?? 0, "construction recipe actions"),
      buildingDescriptionId: decimalString(
        row.buildingDescriptionId ?? row.building_description_id,
        "construction recipe building id",
      ),
      levelRequirements: records(row.levelRequirements).map(normalizeLevelRequirement),
      inputs: [
        ...records(row.consumedItemStacks).map(normalizeDescriptionStack),
        ...records(row.consumedCargoStacks).map(normalizeDescriptionStack),
      ],
    };
  }
  if (kind === "building") {
    return {
      ...base,
      name: String(row.name ?? "").trim(),
      description: String(row.description ?? ""),
      iconAssetName: String(row.iconAssetName ?? row.icon_asset_name ?? ""),
      showInCompendium: row.showInCompendium ?? row.show_in_compendium ?? false,
      maxHealth: integer(row.maxHealth ?? 0, "building max health"),
      functions: records(row.functions).map((entry) => ({
        functionType: integer(entry.functionType ?? 0, "building function type"),
        level: integer(entry.level ?? 0, "building function level"),
        craftingSlots: integer(entry.craftingSlots ?? 0, "building crafting slots"),
        storageSlots: integer(entry.storageSlots ?? 0, "building storage slots"),
        refiningSlots: integer(entry.refiningSlots ?? 0, "building refining slots"),
      })),
    };
  }
  if (kind === "skill") {
    return {
      ...base,
      skillType: decimalString(row.skillType ?? row.skill_type, "skill type"),
      name: String(row.name ?? "").trim(),
      description: String(row.description ?? ""),
      iconAssetName: String(row.iconAssetName ?? row.icon_asset_name ?? ""),
      title: String(row.title ?? ""),
      category: enumLabel(row.skillCategory ?? row.skill_category) ?? "Unknown",
      maxLevel: integer(row.maxLevel ?? 0, "skill max level"),
    };
  }
  if (kind === "resource") {
    return {
      ...base,
      name: String(row.name ?? "").trim(),
      description: String(row.description ?? ""),
      iconAssetName: String(row.iconAssetName ?? row.icon_asset_name ?? ""),
      maxHealth: integer(row.maxHealth ?? 0, "resource max health"),
      tier: integer(row.tier ?? 0, "resource tier"),
      tag: String(row.tag ?? ""),
      rarity: enumLabel(row.rarity) ?? "Unknown",
      onDestroyYield: records(row.onDestroyYield).map(normalizeDescriptionStack),
    };
  }
  if (kind === "equipment") {
    const levelRequirement = row.levelRequirement == null
      ? null
      : normalizeLevelRequirement(row.levelRequirement);
    return {
      ...base,
      slots: (Array.isArray(row.slots) ? row.slots : []).map((slot) => enumLabel(slot) ?? "Unknown"),
      levelRequirement,
      stats: normalizeStats(row.stats),
      requiredAchievements: (Array.isArray(row.requiredAchievements) ? row.requiredAchievements : [])
        .map((entry) => decimalString(entry, "equipment achievement id")),
      requiredKnowledges: (Array.isArray(row.requiredKnowledges) ? row.requiredKnowledges : [])
        .map((entry) => decimalString(entry, "equipment knowledge id")),
    };
  }
  if (kind === "tool") {
    return {
      ...base,
      toolType: integer(row.toolType ?? row.tool_type, "tool type"),
      level: integer(row.level, "tool level"),
      power: integer(row.power, "tool power"),
    };
  }
  if (kind === "buff") {
    return {
      ...base,
      buffTypeId: decimalString(row.buffTypeId ?? row.buff_type_id, "buff type id"),
      description: String(row.description ?? ""),
      duration: integer(row.duration ?? 0, "buff duration"),
      beneficial: row.beneficial === true,
      iconAssetName: String(row.iconAssetName ?? row.icon_asset_name ?? ""),
      stats: normalizeStats(row.stats),
    };
  }
  const unlocksTechs = row.unlocksTechs ?? row.unlocks_techs;
  return {
    ...base,
    name: String(row.name ?? "").trim(),
    description: String(row.description ?? ""),
    tier: integer(row.tier ?? 0, "claim technology tier"),
    techType: enumLabel(row.techType ?? row.tech_type) ?? "Unknown",
    suppliesCost: decimalString(row.suppliesCost ?? row.supplies_cost ?? 0, "claim technology supplies cost"),
    researchTime: decimalString(row.researchTime ?? row.research_time ?? 0, "claim technology research time"),
    requirements: (Array.isArray(row.requirements) ? row.requirements : [])
      .map((entry) => decimalString(entry, "claim technology requirement id")),
    inputs: records(row.input).map(normalizeDescriptionStack),
    members: decimalString(row.members ?? 0, "claim technology member cap"),
    area: decimalString(row.area ?? 0, "claim technology area cap"),
    supplies: decimalString(row.supplies ?? 0, "claim technology supply cap"),
    xpToMintHexCoin: decimalString(
      row.xpToMintHexCoin ?? row.xp_to_mint_hex_coin ?? 0,
      "claim technology Hex Coin XP",
    ),
    unlocksTechs: (Array.isArray(unlocksTechs) ? unlocksTechs : [])
      .map((entry) => decimalString(entry, "claim technology unlocked id")),
  };
}

export function normalizeCatalogEntity(value: unknown, kindValue: ItemKind) {
  const row = record(value, `Relay ${kindValue} description`);
  const kind = normalizeItemKind(kindValue);
  const id = decimalString(row.id, `${kind}.id`);
  const name = String(row.name ?? "").trim();
  if (!name) throw new TypeError(`${kind}.name is required.`);
  const wireTier = finiteNumber(row.tier ?? 0, `${kind}.tier`);
  if (!Number.isSafeInteger(wireTier)) {
    throw new TypeError(
      `${kind}.tier must be an integer (received ${String(row.tier)}`
      + ` for ${id} ${name}).`,
    );
  }
  // Live Relay rows use negative sentinel values for catalog entries that are
  // not tiered (both -1 and -2 have been observed).
  const tier = wireTier < 0 ? null : wireTier;
  const itemListId = row.itemListId ?? row.item_list_id;
  return {
    kind,
    id,
    name,
    tag: String(row.tag ?? ""),
    tier,
    ...(enumLabel(row.rarity) ? { rarity: enumLabel(row.rarity) } : {}),
    ...(String(row.iconAssetName ?? row.icon_asset_name ?? "").trim() ? {
      iconAssetName: String(row.iconAssetName ?? row.icon_asset_name).trim(),
    } : {}),
    ...(itemListId == null || decimalString(itemListId, `${kind}.item_list_id`) === "0" ? {} : {
      itemListId: decimalString(itemListId, `${kind}.item_list_id`),
    }),
  };
}

export function normalizeClaim(value: unknown) {
  return normalizeClaimPayload(value).data;
}

export function normalizeClaimPayload(value: unknown) {
  const row = record(value, "Relay claim");
  const data: WireRecord = {
    entityId: decimalString(row.entity_id, "claim.entity_id"),
    name: String(row.name ?? ""),
    regionId: decimalString(row.region, "claim.region"),
  };
  const warnings: string[] = [];
  const optionalFields: Array<[string, string, (field: unknown) => unknown]> = [
    ["owner_player_entity_id", "ownerPlayerEntityId", (field) => decimalString(field, "claim.owner_player_entity_id")],
    ["supplies", "supplies", (field) => decimalString(field, "claim.supplies")],
    ["treasury", "treasury", (field) => decimalString(field, "claim.treasury")],
    ["tier", "tier", (field) => finiteNumber(field, "claim.tier")],
    ["num_tiles", "numTiles", (field) => finiteNumber(field, "claim.num_tiles")],
    ["tile_cost", "tileCost", (field) => finiteNumber(field, "claim.tile_cost")],
    ["upkeep_cost", "upkeepCost", (field) => finiteNumber(field, "claim.upkeep_cost")],
    ["supplies_run_out", "suppliesRunOut", (field) => normalizeTimestamp(decimalString(field, "claim.supplies_run_out"), "milliseconds")],
  ];
  for (const [wireName, domainName, normalize] of optionalFields) {
    if (row[wireName] == null) {
      warnings.push(`Relay claim omitted ${wireName}.`);
    } else {
      data[domainName] = normalize(row[wireName]);
    }
  }
  return { data, warnings };
}

export function normalizeMembers(value: unknown) {
  return normalizeMembersPayload(value).data;
}

export function normalizeMembersPayload(value: unknown) {
  const payload = record(value, "Relay members payload");
  const members = Array.isArray(payload.members) ? payload.members : [];
  const skillNames = record(payload.skill_names ?? {}, "Relay skill names") as Record<string, string>;
  const warnings: string[] = [];
  const data = members.flatMap((value, index) => {
    try {
      const row = record(value, `Relay member ${index}`);
      return [{
        entityId: decimalString(row.entity_id, `members[${index}].entity_id`),
        claimEntityId: decimalString(row.claim_entity_id, `members[${index}].claim_entity_id`),
        playerEntityId: decimalString(row.player_entity_id, `members[${index}].player_entity_id`),
        userName: String(row.user_name ?? ""),
        hexcoins: decimalString(row.hexcoins ?? 0, `members[${index}].hexcoins`),
        buildPermission: Boolean(row.build_permission),
        inventoryPermission: Boolean(row.inventory_permission),
        officerPermission: Boolean(row.officer_permission),
        coOwnerPermission: Boolean(row.co_owner_permission),
        ...(row.last_active_timestamp == null ? {} : {
          lastActiveTimestamp: normalizeTimestamp(decimalString(row.last_active_timestamp, `members[${index}].last_active_timestamp`), "seconds"),
        }),
        ...(row.last_login_timestamp == null ? {} : {
          lastLoginTimestamp: normalizeTimestamp(decimalString(row.last_login_timestamp, `members[${index}].last_login_timestamp`), "seconds"),
        }),
        skills: record(row.skills ?? {}, `members[${index}].skills`) as Record<string, number>,
        skillNames,
      }];
    } catch (error) {
      warnings.push(`members[${index}] ignored: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
  return { data, warnings };
}

export function normalizeCitizensPayload(value: unknown) {
  const members = normalizeMembersPayload(value);
  return {
    data: members.data.map((member) => {
      const skills = Object.fromEntries(Object.entries(member.skills).map(([skillId, level]) => {
        const normalizedLevel = integer(level, `citizen ${member.playerEntityId} skill ${skillId}`);
        if (normalizedLevel < 0) throw new TypeError(`citizen skill ${skillId} cannot be negative`);
        return [skillId, normalizedLevel];
      }));
      const totalLevel = Object.values(skills).reduce((total, level) => total + level, 0);
      return {
        entityId: member.entityId,
        playerEntityId: member.playerEntityId,
        userName: member.userName,
        skills,
        skillNames: member.skillNames,
        totalLevel,
        totalSkillLevel: totalLevel,
      };
    }),
    warnings: [...members.warnings],
  };
}

export function normalizeRegionalPlayers(options: {
  members: unknown[];
  playerRows: unknown[];
  observedAt: string;
}) {
  const observedAtMs = Date.parse(options.observedAt);
  if (!Number.isFinite(observedAtMs)) throw new TypeError("regional player observedAt is invalid");
  const rows = new Map(options.playerRows.map((value) => {
    const row = record(value, "regional player_state row");
    return [decimalString(row.entityId ?? row.entity_id, "regional player entity id"), row] as const;
  }));
  const warnings: string[] = [];
  const data = options.members.map((value, index) => {
    const member = record(value, `regional player member ${index}`);
    const playerEntityId = decimalString(
      member.playerEntityId ?? member.player_entity_id,
      `regional player member ${index} id`,
    );
    const row = rows.get(playerEntityId);
    if (!row) {
      warnings.push(`Regional player_state omitted member ${playerEntityId}.`);
      return {
        entityId: playerEntityId,
        playerEntityId,
        username: String(member.userName ?? member.user_name ?? ""),
        signedIn: false,
        sessionSeconds: null,
        timePlayedSeconds: null,
        timeSignedInSeconds: null,
        ...(member.lastActiveTimestamp == null ? {} : {
          lastActiveTimestamp: String(member.lastActiveTimestamp),
        }),
        ...(member.lastLoginTimestamp == null ? {} : {
          lastLoginTimestamp: String(member.lastLoginTimestamp),
        }),
      };
    }
    const signedIn = row.signedIn === true || row.signed_in === true;
    const signInValue = row.signInTimestamp ?? row.sign_in_timestamp;
    const signInTimestamp = signedIn && integer(signInValue ?? 0, "regional player sign-in timestamp") > 0
      ? normalizeTimestamp(integer(signInValue, "regional player sign-in timestamp"), "seconds")
      : null;
    const sessionSeconds = signInTimestamp
      ? Math.max(0, Math.floor((observedAtMs - Date.parse(signInTimestamp)) / 1000))
      : null;
    return {
      entityId: playerEntityId,
      playerEntityId,
      username: String(member.userName ?? member.user_name ?? ""),
      signedIn,
      sessionSeconds,
      timePlayedSeconds: Math.max(0, integer(row.timePlayed ?? row.time_played ?? 0, "regional player time played")),
      timeSignedInSeconds: Math.max(0, integer(row.timeSignedIn ?? row.time_signed_in ?? 0, "regional player time signed in")),
      ...(signInTimestamp ? { signInTimestamp } : {}),
      ...(member.lastActiveTimestamp == null ? {} : {
        lastActiveTimestamp: String(member.lastActiveTimestamp),
      }),
      ...(member.lastLoginTimestamp == null ? {} : {
        lastLoginTimestamp: String(member.lastLoginTimestamp),
      }),
    };
  });
  return { data, warnings };
}

function snakeCaseEnum(value: unknown, fallback: string): string {
  const label = enumLabel(value) ?? fallback;
  return label
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function normalizeEquippedItem(value: unknown) {
  if (value == null) return null;
  const item = record(value, "regional equipped item");
  const itemId = decimalString(item.itemId ?? item.item_id, "regional equipped item id");
  return {
    id: itemId,
    itemId,
    itemType: normalizeItemKind(enumLabel(item.itemType ?? item.item_type)),
    quantity: decimalString(item.quantity, "regional equipped item quantity"),
    ...(item.durability == null ? {} : {
      durability: decimalString(item.durability, "regional equipped item durability"),
    }),
  };
}

function normalizeRegionalProjectStack(
  value: unknown,
  expectedKind: ItemKind,
  label: string,
) {
  const stack = record(value, label);
  const itemType = normalizeItemKind(enumLabel(stack.itemType ?? stack.item_type));
  if (itemType !== expectedKind) {
    throw new TypeError(`${label} must contain ${expectedKind} identity.`);
  }
  return {
    itemId: decimalString(stack.itemId ?? stack.item_id, `${label} item id`),
    itemType,
    quantity: decimalString(stack.quantity, `${label} quantity`),
  };
}

export function normalizeRegionalResearch(options: {
  claimId: string;
  stateRows: unknown[];
}) {
  const claimId = decimalString(options.claimId, "regional research claim id");
  const warnings: string[] = [];
  let matched: Record<string, unknown> | null = null;
  for (const [index, value] of options.stateRows.entries()) {
    try {
      const row = record(value, `regional claim_tech_state row ${index}`);
      const entityId = decimalString(
        row.entityId ?? row.entity_id,
        `regional claim_tech_state row ${index} entity id`,
      );
      if (entityId !== claimId) {
        warnings.push(`Regional claim_tech_state omitted cross-claim row ${entityId}.`);
        continue;
      }
      if (matched) {
        warnings.push(`Regional claim_tech_state omitted duplicate row for configured claim ${claimId}.`);
        continue;
      }
      matched = row;
    } catch (error) {
      warnings.push(
        `Regional claim_tech_state omitted row ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!matched) {
    warnings.push(`Regional claim_tech_state has no row for configured claim ${claimId}.`);
    return {
      data: {
        claimId,
        learnedTechIds: [],
        researchingTechId: null,
        researchStartedAt: null,
        scheduledId: null,
      },
      warnings,
    };
  }
  const researchingValue = integer(
    matched.researching ?? 0,
    "regional claim_tech_state researching technology id",
  );
  const researchingTechId = researchingValue === 0 ? null : String(researchingValue);
  const startTimestamp = matched.startTimestamp ?? matched.start_timestamp;
  const researchStartedAt = researchingTechId == null
    ? null
    : normalizeTimestamp(
        decimalString(
          record(startTimestamp, "regional claim_tech_state start timestamp")
            .__timestamp_micros_since_unix_epoch__
            ?? record(startTimestamp, "regional claim_tech_state start timestamp").microsSinceUnixEpoch
            ?? record(startTimestamp, "regional claim_tech_state start timestamp").micros_since_unix_epoch,
          "regional claim_tech_state start timestamp",
        ),
        "microseconds",
      );
  const scheduledId = matched.scheduledId ?? matched.scheduled_id;
  return {
    data: {
      claimId,
      learnedTechIds: (Array.isArray(matched.learned) ? matched.learned : [])
        .map((id) => decimalString(id, "regional claim_tech_state learned technology id")),
      researchingTechId,
      researchStartedAt,
      scheduledId: scheduledId == null
        ? null
        : decimalString(scheduledId, "regional claim_tech_state scheduled id"),
    },
    warnings,
  };
}

export function normalizeRegionalRecruitment(options: {
  claimId: string;
  stateRows: unknown[];
}) {
  const claimId = decimalString(options.claimId, "regional recruitment claim id");
  const warnings: string[] = [];
  const recruitment: Array<{
    entityId: string;
    claimEntityId: string;
    remainingStock: string;
    requiredSkillId: string;
    requiredSkillLevel: string;
    requiredApproval: boolean;
    isRecruiting: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const [index, value] of options.stateRows.entries()) {
    try {
      const row = record(value, `regional claim_recruitment_state row ${index}`);
      const claimEntityId = decimalString(
        row.claimEntityId ?? row.claim_entity_id,
        `regional claim_recruitment_state row ${index} claim id`,
      );
      if (claimEntityId !== claimId) {
        warnings.push(`Regional claim_recruitment_state omitted cross-claim row ${claimEntityId}.`);
        continue;
      }
      const entityId = decimalString(
        row.entityId ?? row.entity_id,
        `regional claim_recruitment_state row ${index} entity id`,
      );
      if (seen.has(entityId)) {
        warnings.push(`Regional claim_recruitment_state omitted duplicate row ${entityId}.`);
        continue;
      }
      const remainingStock = decimalString(
        row.remainingStock ?? row.remaining_stock,
        `regional claim_recruitment_state row ${index} remaining stock`,
      );
      const requiredSkillId = decimalString(
        row.requiredSkillId ?? row.required_skill_id,
        `regional claim_recruitment_state row ${index} required skill id`,
      );
      const requiredSkillLevel = decimalString(
        row.requiredSkillLevel ?? row.required_skill_level,
        `regional claim_recruitment_state row ${index} required skill level`,
      );
      const requiredApproval = row.requiredApproval ?? row.required_approval;
      if (typeof requiredApproval !== "boolean") {
        throw new TypeError(
          `regional claim_recruitment_state row ${index} required approval must be boolean`,
        );
      }
      seen.add(entityId);
      recruitment.push({
        entityId,
        claimEntityId,
        remainingStock,
        requiredSkillId,
        requiredSkillLevel,
        requiredApproval,
        isRecruiting: BigInt(remainingStock) > 0n,
      });
    } catch (error) {
      warnings.push(
        `Regional claim_recruitment_state omitted row ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    data: {
      claimId,
      isRecruiting: recruitment.some((posting) => posting.isRecruiting),
      recruitment,
    },
    warnings,
  };
}

export function normalizeRegionalConstruction(options: {
  claimId: string;
  projectRows: unknown[];
}) {
  const claimId = decimalString(options.claimId, "regional construction claim id");
  const projects = [];
  const warnings: string[] = [];
  for (const [index, value] of options.projectRows.entries()) {
    try {
      const row = record(value, `regional project_site_state row ${index}`);
      const entityId = decimalString(
        row.entityId ?? row.entity_id,
        `regional project_site_state row ${index} entity id`,
      );
      const ownerId = decimalString(
        row.ownerId ?? row.owner_id,
        `regional project_site_state row ${index} owner id`,
      );
      if (ownerId !== claimId) {
        warnings.push(
          `Regional project_site_state omitted cross-claim project ${entityId} owned by ${ownerId}.`,
        );
        continue;
      }
      const timestamp = record(
        row.lastHitTimestamp ?? row.last_hit_timestamp,
        `regional project_site_state row ${index} last hit timestamp`,
      );
      const timestampMicros = decimalString(
        timestamp.__timestamp_micros_since_unix_epoch__
          ?? timestamp.microsSinceUnixEpoch
          ?? timestamp.micros_since_unix_epoch,
        `regional project_site_state row ${index} last hit timestamp`,
      );
      projects.push({
        entityId,
        constructionRecipeId: decimalString(
          row.constructionRecipeId ?? row.construction_recipe_id,
          `regional project_site_state row ${index} construction recipe id`,
        ),
        resourcePlacementRecipeId: decimalString(
          row.resourcePlacementRecipeId ?? row.resource_placement_recipe_id,
          `regional project_site_state row ${index} resource placement recipe id`,
        ),
        ownerId,
        items: records(row.items).map((stack, stackIndex) => (
          normalizeRegionalProjectStack(
            stack,
            "item",
            `regional project_site_state row ${index} item ${stackIndex}`,
          )
        )),
        cargos: records(row.cargos).map((stack, stackIndex) => (
          normalizeRegionalProjectStack(
            stack,
            "cargo",
            `regional project_site_state row ${index} cargo ${stackIndex}`,
          )
        )),
        progress: decimalString(
          row.progress,
          `regional project_site_state row ${index} progress`,
        ),
        lastCritOutcome: integer(
          row.lastCritOutcome ?? row.last_crit_outcome,
          `regional project_site_state row ${index} last crit outcome`,
        ),
        direction: integer(
          row.direction,
          `regional project_site_state row ${index} direction`,
        ),
        lastHitAt: normalizeTimestamp(timestampMicros, "microseconds"),
      });
    } catch (error) {
      warnings.push(
        `Regional project_site_state omitted row ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    data: { projects },
    warnings,
  };
}

function normalizeEquipmentSlot(value: unknown) {
  const slot = record(value, "regional equipment slot");
  return {
    primary: snakeCaseEnum(slot.primary, "none"),
    item: normalizeEquippedItem(slot.item),
  };
}

export function normalizeRegionalEquipment(options: {
  members: unknown[];
  equipmentRows: unknown[];
  presetRows: unknown[];
  buffRows: unknown[];
}) {
  const equipmentByPlayer = new Map(options.equipmentRows.map((value) => {
    const row = record(value, "regional equipment_state row");
    return [decimalString(row.entityId ?? row.entity_id, "regional equipment player id"), row] as const;
  }));
  const presetsByPlayer = new Map<string, WireRecord[]>();
  for (const value of options.presetRows) {
    const row = record(value, "regional equipment_preset_state row");
    const playerId = decimalString(
      row.playerEntityId ?? row.player_entity_id,
      "regional equipment preset player id",
    );
    const rows = presetsByPlayer.get(playerId) ?? [];
    rows.push(row);
    presetsByPlayer.set(playerId, rows);
  }
  const buffsByPlayer = new Map(options.buffRows.map((value) => {
    const row = record(value, "regional active_buff_state row");
    return [decimalString(row.entityId ?? row.entity_id, "regional buff player id"), row] as const;
  }));

  return {
    data: {
      members: options.members.map((value, index) => {
        const member = record(value, `regional equipment member ${index}`);
        const playerEntityId = decimalString(
          member.playerEntityId ?? member.player_entity_id,
          `regional equipment member ${index} id`,
        );
        const equipment = equipmentByPlayer.get(playerEntityId);
        const buffState = buffsByPlayer.get(playerEntityId);
        const presets = (presetsByPlayer.get(playerEntityId) ?? [])
          .sort((left, right) => integer(left.index, "equipment preset index") - integer(right.index, "equipment preset index"))
          .map((row) => ({
            entityId: decimalString(row.entityId ?? row.entity_id, "equipment preset entity id"),
            index: integer(row.index, "equipment preset index"),
            active: row.active === true,
            equipmentSlots: records(row.equipmentSlots ?? row.equipment_slots).map(normalizeEquipmentSlot),
          }));
        const buffs = records(buffState?.activeBuffs ?? buffState?.active_buffs).flatMap((row) => {
          const start = record(
            row.buffStartTimestamp ?? row.buff_start_timestamp,
            "active buff start timestamp",
          );
          const startTimestampSeconds = integer(
            start.value,
            "active buff start timestamp",
          );
          const durationSeconds = Math.max(
            0,
            integer(row.buffDuration ?? row.buff_duration ?? 0, "active buff duration"),
          );
          if (startTimestampSeconds <= 0 || durationSeconds <= 0) return [];
          return [{
            buffId: decimalString(row.buffId ?? row.buff_id, "active buff id"),
            startTimestampSeconds: String(startTimestampSeconds),
            startedAt: null,
            durationSeconds,
            values: (Array.isArray(row.values) ? row.values : [])
              .map((entry) => finiteNumber(entry, "active buff value")),
          }];
        });
        return {
          playerEntityId,
          username: String(member.userName ?? member.user_name ?? ""),
          equipment: {
            equipmentSlots: records(equipment?.equipmentSlots ?? equipment?.equipment_slots)
              .map(normalizeEquipmentSlot),
          },
          equipmentPresets: { presets },
          buffs: { buffs },
        };
      }),
    },
    warnings: [],
  };
}

export function normalizeDeposit(value: unknown) {
  const row = record(value, "Relay deposit");
  const explicit = String(row.status ?? "").trim().toLowerCase();
  const status = explicit === "active" ? "active"
    : explicit === "respawning" || row.respawn_at != null ? "respawning"
    : "unknown";
  return {
    entityId: decimalString(row.entity_id, "deposit.entity_id"),
    regionId: decimalString(row.region, "deposit.region"),
    status,
    ...(row.name == null ? {} : { name: String(row.name) }),
    ...(row.north == null ? {} : { north: finiteNumber(row.north, "deposit.north") }),
    ...(row.east == null ? {} : { east: finiteNumber(row.east, "deposit.east") }),
    ...(row.respawn_at == null ? {} : { respawnAt: new Date(String(row.respawn_at)).toISOString() }),
  };
}

export function normalizeDeposits(value: unknown) {
  const payload = record(value, "Relay deposits payload");
  const deposits = Array.isArray(payload.deposits) ? payload.deposits : [];
  return deposits.map(normalizeDeposit);
}

function normalizeStack(value: unknown, label: string) {
  const row = record(value, label);
  return {
    itemId: decimalString(row.item_id, `${label}.item_id`),
    itemType: normalizeItemKind(row.item_type),
    quantity: decimalString(row.quantity, `${label}.quantity`),
  };
}

export function normalizeClaimInventory(value: unknown) {
  const payload = record(value, "Relay claim inventory payload");
  const claim = record(payload.claim, "Relay claim inventory claim");
  const dimensions = (Array.isArray(payload.dimensions) ? payload.dimensions : []).map((value, dimensionIndex) => {
    const dimension = record(value, `Relay inventory dimension ${dimensionIndex}`);
    const dimensionId = decimalString(dimension.dimension_id, `dimensions[${dimensionIndex}].dimension_id`);
    const buildings = (Array.isArray(dimension.buildings) ? dimension.buildings : []).map((value, buildingIndex) => {
      const building = record(value, `Relay inventory building ${buildingIndex}`);
      const stacks = (Array.isArray(building.items) ? building.items : []).map((value, stackIndex) => (
        normalizeStack(value, `dimensions[${dimensionIndex}].buildings[${buildingIndex}].items[${stackIndex}]`)
      ));
      return {
        entityId: decimalString(building.entity_id, `buildings[${buildingIndex}].entity_id`),
        name: String(building.name ?? ""),
        nickname: String(building.nickname ?? ""),
        dimensionId,
        dimensionKind: String(dimension.kind ?? ""),
        items: stacks,
        inventory: stacks.map((contents) => ({ contents })),
      };
    });
    return {
      dimensionId,
      kind: String(dimension.kind ?? ""),
      entrance: dimension.entrance ?? null,
      buildings,
    };
  });
  return {
    claim: {
      entityId: decimalString(claim.entity_id, "inventory.claim.entity_id"),
      name: String(claim.name ?? ""),
      regionId: decimalString(claim.region, "inventory.claim.region"),
    },
    dimensions,
    buildings: dimensions.flatMap((dimension) => dimension.buildings),
  };
}

export function normalizeStorageLogs(value: unknown, options: {
  claimId: string;
  regionId: string;
}) {
  const payload = record(value, "Relay storage-log payload");
  const claimId = decimalString(options.claimId, "storage-log configured claim id");
  const regionId = decimalString(options.regionId, "storage-log configured region id");
  const warnings: string[] = [];
  const data = [];
  const seen = new Set<string>();
  for (const [index, value] of records(payload.logs).entries()) {
    try {
      const row = record(value, `Relay storage-log row ${index}`);
      const id = decimalString(row.id, `storage-log row ${index} id`);
      const rowClaimId = decimalString(
        row.claim_entity_id ?? row.claimEntityId,
        `storage-log row ${index} claim id`,
      );
      if (rowClaimId !== claimId) {
        warnings.push(`Relay storage-log omitted cross-claim row ${id} for claim ${rowClaimId}.`);
        continue;
      }
      const rowRegionId = decimalString(row.region, `storage-log row ${index} region`);
      if (rowRegionId !== regionId) {
        warnings.push(`Relay storage-log omitted cross-region row ${id} for region ${rowRegionId}.`);
        continue;
      }
      if (seen.has(id)) {
        warnings.push(`Relay storage-log omitted duplicate row ${id}.`);
        continue;
      }
      const action = String(row.action ?? "").trim().toLowerCase();
      if (action !== "deposit" && action !== "withdraw") {
        throw new TypeError(`storage-log row ${index} action must be deposit or withdraw`);
      }
      const building = record(row.building, `storage-log row ${index} building`);
      const occurredAtValue = String(row.timestamp ?? "").trim();
      const occurredAtDate = new Date(occurredAtValue);
      if (!occurredAtValue || Number.isNaN(occurredAtDate.getTime())) {
        throw new TypeError(`storage-log row ${index} timestamp must be an ISO date`);
      }
      seen.add(id);
      data.push({
        id,
        claimId: rowClaimId,
        claimName: String(row.claim_name ?? row.claimName ?? ""),
        regionId: rowRegionId,
        buildingId: decimalString(
          building.entity_id ?? building.entityId,
          `storage-log row ${index} building id`,
        ),
        buildingName: String(building.name ?? ""),
        buildingNickname: String(building.nickname ?? ""),
        playerId: decimalString(
          row.player_entity_id ?? row.playerEntityId,
          `storage-log row ${index} player id`,
        ),
        playerName: String(row.player_username ?? row.playerUsername ?? ""),
        action,
        itemId: decimalString(row.item_id ?? row.itemId, `storage-log row ${index} item id`),
        itemType: normalizeItemKind(row.item_type ?? row.itemType),
        quantity: decimalString(row.quantity, `storage-log row ${index} quantity`),
        occurredAt: occurredAtDate.toISOString(),
      });
    } catch (error) {
      warnings.push(
        `Relay storage-log omitted row ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { data, warnings };
}

export function normalizePlayerInventory(value: unknown) {
  const payload = record(value, "Relay player inventory payload");
  const player = record(payload.player, "Relay player inventory player");
  const normalizePlayerTimestamp = (field: unknown, label: string) => (
    field == null ? {} : { [label]: normalizeTimestamp(decimalString(field, label), "seconds") }
  );
  const inventories = (Array.isArray(payload.inventories) ? payload.inventories : []).map((value, inventoryIndex) => {
    const inventory = record(value, `Relay player inventory ${inventoryIndex}`);
    const items = (Array.isArray(inventory.items) ? inventory.items : []).map((value, stackIndex) => (
      normalizeStack(value, `inventories[${inventoryIndex}].items[${stackIndex}]`)
    ));
    const name = String(inventory.name ?? "");
    return {
      entityId: decimalString(inventory.entity_id, `inventories[${inventoryIndex}].entity_id`),
      inventoryName: name,
      name,
      nickname: String(inventory.nickname ?? ""),
      category: String(inventory.category ?? "").trim().toLowerCase(),
      ...(inventory.claim_entity_id == null ? {} : {
        claimEntityId: decimalString(
          inventory.claim_entity_id,
          `inventories[${inventoryIndex}].claim_entity_id`,
        ),
      }),
      ...(inventory.claim_name == null ? {} : { claimName: String(inventory.claim_name) }),
      items,
      pockets: items.map((contents) => ({ contents })),
    };
  });
  return {
    player: {
      entityId: decimalString(player.entity_id, "player.entity_id"),
      username: String(player.username ?? ""),
      regionId: decimalString(player.region, "player.region"),
      signedIn: player.signed_in === true,
      ...normalizePlayerTimestamp(player.last_active_timestamp, "lastActiveTimestamp"),
      ...normalizePlayerTimestamp(player.last_login_timestamp, "lastLoginTimestamp"),
    },
    inventories,
  };
}

export function normalizeClaimCrafts(value: unknown) {
  const payload = record(value, "Relay claim crafts payload");
  const crafts = Array.isArray(payload.crafts) ? payload.crafts : [];
  return {
    craftResults: crafts.map((value, craftIndex) => {
      const row = record(value, `Relay craft ${craftIndex}`);
      return {
        entityId: decimalString(row.entity_id, `crafts[${craftIndex}].entity_id`),
        buildingEntityId: decimalString(row.building_entity_id, `crafts[${craftIndex}].building_entity_id`),
        claimEntityId: decimalString(row.claim_entity_id, `crafts[${craftIndex}].claim_entity_id`),
        ownerEntityId: decimalString(row.owner_entity_id, `crafts[${craftIndex}].owner_entity_id`),
        ownerUsername: String(row.owner_username ?? ""),
        buildingName: String(row.building_name ?? ""),
        completed: row.completed === true,
        craftCount: decimalString(row.craft_count ?? 0, `crafts[${craftIndex}].craft_count`),
        progress: decimalString(row.progress ?? 0, `crafts[${craftIndex}].progress`),
        recipeId: decimalString(row.recipe_id, `crafts[${craftIndex}].recipe_id`),
        totalActionsRequired: decimalString(row.total_actions_required ?? 0, `crafts[${craftIndex}].total_actions_required`),
        craftedItem: (Array.isArray(row.crafted_item) ? row.crafted_item : []).map((value, stackIndex) => (
          normalizeStack(value, `crafts[${craftIndex}].crafted_item[${stackIndex}]`)
        )),
      };
    }),
    items: [],
    cargos: [],
  };
}

export function normalizeClaimCraftPayloads(values: unknown[]) {
  const craftResults = new Map<string, ReturnType<typeof normalizeClaimCrafts>["craftResults"][number]>();
  for (const value of values) {
    for (const craft of normalizeClaimCrafts(value).craftResults) {
      craftResults.set(craft.entityId, craft);
    }
  }
  return {
    craftResults: [...craftResults.values()],
    items: [],
    cargos: [],
  };
}

export function normalizeClaimRegion(value: unknown): string {
  return decimalString(record(value, "Relay claim").region, "claim.region");
}

export { decimalString as normalizeDecimalInteger, optionalDecimalString };
