import { Router } from "express";

const router = Router();

const BITJITA_BASE = "https://bitjita.com/api";

async function proxyBitjita(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "BitCraftClaimMonitor/1.0",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bitjita API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

type RawClaim = Record<string, unknown>;
type RawMember = Record<string, unknown>;
type RawBuilding = Record<string, unknown>;
type RawFn = Record<string, unknown>;
type RawTech = Record<string, unknown>;
type RawListing = Record<string, unknown>;
type RawInventoryBuilding = Record<string, unknown>;
type RawInventorySlot = Record<string, unknown>;
type RawConstructionProject = Record<string, unknown>;
type RawItem = Record<string, unknown>;

function normalizeClaim(raw: RawClaim) {
  const suppliesRaw = Number(raw.supplies ?? 0);
  const treasuryRaw = Number(raw.treasury ?? 0);
  const suppliesRunOut = raw.suppliesRunOut as number | undefined;
  return {
    entityId: raw.entityId,
    name: raw.name,
    regionId: String(raw.regionId ?? ""),
    regionName: raw.regionName,
    tier: raw.tier,
    ownerUsername: raw.ownerPlayerUsername,
    ownerEntityId: raw.ownerPlayerEntityId,
    locationX: raw.locationX,
    locationZ: raw.locationZ,
    tileCount: raw.numTiles,
    supplies: suppliesRaw,
    suppliesMax: null,
    suppliesRunOutAt: suppliesRunOut ? new Date(suppliesRunOut).toISOString() : null,
    treasury: treasuryRaw,
    upkeepCost: raw.upkeepCost,
    tileCost: raw.tileCost,
    buildingMaintenance: raw.buildingMaintenance,
    currentResearch: null,
    researchProgress: null,
    memberCount: null,
    citizenCount: null,
    buildingCount: null,
    activeConstruction: null,
    marketListingCount: null,
    empireEntityId: raw.empireEntityId,
    empireName: raw.empireName,
    techResearching: raw.techResearching,
    techStartTimestamp: raw.techStartTimestamp,
  };
}

function normalizeMember(raw: RawMember) {
  return {
    entityId: raw.entityId,
    playerEntityId: raw.playerEntityId,
    username: raw.userName,
    lastLogin: raw.lastLoginTimestamp,
    memberSince: raw.createdAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    inventoryPermission: raw.inventoryPermission,
    buildPermission: raw.buildPermission,
    officerPermission: !!(raw.officerPermission),
    coOwnerPermission: !!(raw.coOwnerPermission),
  };
}

const NAME_TIER_PREFIXES: Array<[RegExp, number]> = [
  [/^(rough|crude)\s/i, 1],
  [/^(simple)\s/i, 2],
  [/^(sturdy)\s/i, 3],
  [/^(fine)\s/i, 4],
  [/^(expert|superior|advanced|master|elite|exquisite|artisan)\s/i, 5],
];

function extractTier(iconAssetName: unknown, buildingName?: unknown): number | null {
  const icon = String(iconAssetName ?? "");
  const iconMatch = icon.match(/T(\d)(?:[^a-zA-Z]|$)/i);
  if (iconMatch) return parseInt(iconMatch[1], 10);
  const name = String(buildingName ?? "");
  for (const [pattern, tier] of NAME_TIER_PREFIXES) {
    if (pattern.test(name)) return tier;
  }
  return null;
}

function normalizeBuilding(raw: RawBuilding) {
  const fn0 = (raw.functions as RawFn[] | undefined)?.[0] ?? {};
  return {
    entityId: raw.entityId,
    name: raw.buildingName,
    nickname: raw.buildingNickname ?? null,
    descriptionId: String(raw.buildingDescriptionId ?? ""),
    tier: extractTier(raw.iconAssetName, raw.buildingName),
    level: fn0.level ?? null,
    functions: [(String(fn0.function_type ?? ""))].filter(Boolean),
    craftingSlots: fn0.crafting_slots ?? 0,
    refiningSlots: fn0.refining_slots ?? 0,
    storageSlots: fn0.storage_slots ?? 0,
    cargoSlots: fn0.cargo_slots ?? 0,
    housingSlots: fn0.housing_slots ?? 0,
    tradeOrders: fn0.trade_orders ?? 0,
    terraformCapable: fn0.terraform ?? false,
    buffIds: null,
    locationX: null,
    locationZ: null,
    iconAssetName: raw.iconAssetName,
  };
}

function normalizeResearch(technologies: RawTech[]) {
  const researched = technologies.filter(t => t.isResearched);
  const available = technologies.filter(t => !t.isResearched);
  return {
    researched,
    available,
    current: null,
    startedAt: null,
    progress: 0,
  };
}

function normalizeMarketListing(raw: RawListing) {
  return {
    entityId: raw.entityId,
    itemName: raw.itemName,
    tier: raw.itemTier ?? null,
    rarity: raw.itemRarityStr ?? null,
    price: raw.price != null ? Number(raw.price) : null,
    quantity: raw.quantity != null ? Number(raw.quantity) : null,
    orderType: raw.side,
    ownerUsername: raw.ownerUsername,
    isCargo: (raw.itemType as number) !== 0,
    updatedAt: raw.timestamp ?? null,
    itemTag: raw.itemTag,
    itemDescription: raw.itemDescription,
    iconAssetName: raw.iconAssetName,
  };
}

function normalizeInventory(buildings: RawInventoryBuilding[], itemLookup: Map<number, RawItem>, cargoLookup: Map<number, RawItem>) {
  return buildings.map(b => {
    const slots = (b.inventory as RawInventorySlot[] | undefined) ?? [];
    const items = slots
      .map(slot => {
        const contents = slot.contents as Record<string, unknown> | undefined;
        if (!contents) return null;
        const isCargo = contents.item_type === "cargo";
        const id = contents.item_id as number;
        const lookup = isCargo ? cargoLookup.get(id) : itemLookup.get(id);
        return {
          name: lookup?.name ?? `Item #${id}`,
          quantity: contents.quantity,
          volume: slot.volume != null ? Number(slot.volume) / 1000 : null,
          tier: lookup?.tier ?? null,
          rarity: lookup?.rarityStr ?? null,
          tag: lookup?.tag ?? null,
          category: lookup?.category ?? null,
          isCargo,
          itemId: id,
        };
      })
      .filter(Boolean);

    return {
      buildingEntityId: b.entityId,
      buildingName: b.buildingNickname ?? b.buildingName,
      items,
      locked: false,
    };
  });
}

function normalizeConstruction(projects: RawConstructionProject[], itemLookup: Map<number, RawItem>, cargoLookup: Map<number, RawItem>) {
  return projects.map(p => {
    const actionsRequired = (p.actionsRequired as number) || 1;
    const progressRaw = (p.progress as number) || 0;
    const progressFraction = progressRaw / actionsRequired;

    const rawItems = (p.items as Array<Record<string, unknown>>) ?? [];
    const rawCargos = (p.cargos as Array<Record<string, unknown>>) ?? [];

    const requiredMaterials = [
      ...rawItems.map(m => {
        const lookup = itemLookup.get(m.item_id as number);
        return { name: lookup?.name ?? `Item #${m.item_id}`, quantity: m.quantity, available: 0 };
      }),
      ...rawCargos.map(m => {
        const lookup = cargoLookup.get(m.item_id as number);
        return { name: lookup?.name ?? `Cargo #${m.item_id}`, quantity: m.quantity, available: 0 };
      }),
    ];

    return {
      entityId: p.entityId,
      buildingEntityId: null,
      buildingName: p.recipeName ?? p.buildingName,
      progress: progressFraction,
      requiredMaterials,
      startedAt: null,
      updatedAt: null,
      actionsRequired: p.actionsRequired,
      progressRaw,
      iconAssetName: p.iconAssetName,
    };
  });
}

function normalizeRegionClaim(raw: RawClaim) {
  return {
    entityId: raw.entityId,
    name: raw.name,
    tier: raw.tier,
    supplies: raw.supplies != null ? Number(raw.supplies) : null,
    treasury: raw.treasury != null ? Number(raw.treasury) : null,
    tileCount: raw.numTiles,
    learnedCount: Array.isArray(raw.learned) ? (raw.learned as unknown[]).length : null,
    ownerUsername: raw.ownerPlayerUsername,
    regionId: String(raw.regionId ?? ""),
    locationX: raw.locationX,
    locationZ: raw.locationZ,
    empireName: raw.empireName,
    empireEntityId: raw.empireEntityId,
  };
}

// GET /api/bitjita/claims/:claimId
router.get("/bitjita/claims/:claimId", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}`) as Record<string, unknown>;
    const raw = (data.claim ?? data) as RawClaim;
    res.json(normalizeClaim(raw));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/members
router.get("/bitjita/claims/:claimId/members", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/members`) as Record<string, unknown>;
    const members = (Array.isArray(data) ? data : (data.members as RawMember[] ?? [])) as RawMember[];
    res.json(members.map(normalizeMember));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim members");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/citizens
router.get("/bitjita/claims/:claimId/citizens", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/citizens`);
    const raw = Array.isArray(data) ? data : (data as Record<string, unknown>).citizens ?? [];
    // Bitjita returns `userName` (capital N) — normalise to `username` for consistency
    const arr = (raw as Record<string, unknown>[]).map(c => ({
      ...c,
      username: c["username"] ?? c["userName"] ?? null,
    }));
    res.json(arr);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim citizens");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/buildings
router.get("/bitjita/claims/:claimId/buildings", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/buildings`);
    const arr = (Array.isArray(data) ? data : (data as Record<string, unknown>).buildings ?? []) as RawBuilding[];
    res.json(arr.map(normalizeBuilding));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim buildings");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/layout
router.get("/bitjita/claims/:claimId/layout", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/layout`);
    res.json(data);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim layout");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/inventories
router.get("/bitjita/claims/:claimId/inventories", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/inventories`) as Record<string, unknown>;
    const buildings = (data.buildings ?? []) as RawInventoryBuilding[];
    const items = (data.items ?? []) as RawItem[];
    const cargos = (data.cargos ?? []) as RawItem[];

    const itemLookup = new Map(items.map(i => [i.id as number, i]));
    const cargoLookup = new Map(cargos.map(c => [c.id as number, c]));

    res.json(normalizeInventory(buildings, itemLookup, cargoLookup));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim inventories");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/construction
router.get("/bitjita/claims/:claimId/construction", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/construction`) as Record<string, unknown>;
    const projects = (data.projects ?? []) as RawConstructionProject[];
    const items = (data.items ?? []) as RawItem[];
    const cargos = (data.cargos ?? []) as RawItem[];

    const itemLookup = new Map(items.map(i => [i.id as number, i]));
    const cargoLookup = new Map(cargos.map(c => [c.id as number, c]));

    res.json(normalizeConstruction(projects, itemLookup, cargoLookup));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim construction");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/recruitment
router.get("/bitjita/claims/:claimId/recruitment", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/recruitment`);
    res.json(data);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim recruitment");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/research
router.get("/bitjita/claims/:claimId/research", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/research`) as Record<string, unknown>;
    const technologies = (data.technologies ?? []) as RawTech[];
    res.json(normalizeResearch(technologies));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim research");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/productions — active crafting jobs with item name resolution
router.get("/bitjita/claims/:claimId/productions", async (req, res) => {
  const { claimId } = req.params;
  try {
    const [craftsRaw, invRaw] = await Promise.all([
      proxyBitjita(`${BITJITA_BASE}/crafts?claimEntityId=${encodeURIComponent(claimId)}&completed=false`) as Promise<Record<string, unknown>>,
      proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/inventories`) as Promise<Record<string, unknown>>,
    ]);

    const craftResults = (craftsRaw.craftResults ?? (Array.isArray(craftsRaw) ? craftsRaw : [])) as Array<Record<string, unknown>>;
    const items = (invRaw.items ?? []) as RawItem[];
    const cargos = (invRaw.cargos ?? []) as RawItem[];
    const itemLookup = new Map(items.map(i => [i.id as number, i]));
    const cargoLookup = new Map(cargos.map(c => [c.id as number, c]));

    const jobs = craftResults.map(c => {
      const craftedArr = (c.craftedItem as Array<Record<string, unknown>>) ?? [];
      const firstItem = craftedArr[0];
      let itemName: string | null = null;
      if (firstItem) {
        const isCargo = (firstItem.item_type as string) === "cargo";
        const id = firstItem.item_id as number;
        const lookup = isCargo ? cargoLookup.get(id) : itemLookup.get(id);
        itemName = lookup ? String(lookup.name) : `Item #${id}`;
      }

      const lvlReq = ((c.levelRequirements as Array<Record<string, unknown>>) ?? [])[0];
      const totalActions = (c.totalActionsRequired as number) ?? 0;
      const progressActions = (c.progress as number) ?? 0;

      return {
        entityId: String(c.entityId ?? ""),
        buildingEntityId: c.buildingEntityId ? String(c.buildingEntityId) : null,
        buildingName: c.buildingName ?? null,
        ownerEntityId: c.ownerEntityId ? String(c.ownerEntityId) : null,
        ownerUsername: c.ownerUsername ?? null,
        itemName,
        craftCount: (c.craftCount as number) ?? null,
        progressActions,
        totalActions,
        progressFraction: totalActions > 0 ? progressActions / totalActions : 0,
        lockExpiration: c.lockExpiration ? String(c.lockExpiration) : null,
        skillId: lvlReq ? (lvlReq.skill_id as number) : null,
        skillLevel: lvlReq ? (lvlReq.level as number) : null,
        recipeId: (c.recipeId as number) ?? null,
      };
    });

    res.json(jobs);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim productions");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/market/listings
router.get("/bitjita/claims/:claimId/market/listings", async (req, res) => {
  const { claimId } = req.params;
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/market/listings?limit=200`) as Record<string, unknown>;
    const listings = (data.listings ?? (Array.isArray(data) ? data : [])) as RawListing[];
    res.json(listings.map(normalizeMarketListing));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim market listings");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/crafts?claimEntityId=...&completed=...
router.get("/bitjita/crafts", async (req, res) => {
  const { claimEntityId, completed } = req.query;
  if (!claimEntityId) {
    res.status(400).json({ error: "claimEntityId is required" });
    return;
  }
  const completedParam = completed === "true" ? "true" : "false";
  try {
    const data = await proxyBitjita(
      `${BITJITA_BASE}/crafts?claimEntityId=${encodeURIComponent(String(claimEntityId))}&completed=${completedParam}`
    );
    res.json(data);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch crafts");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims/:claimId/players — batch-fetch online status for all members
router.get("/bitjita/claims/:claimId/players", async (req, res) => {
  const { claimId } = req.params;
  try {
    // First fetch members to get their playerEntityIds
    const membersRaw = await proxyBitjita(`${BITJITA_BASE}/claims/${claimId}/members`) as Record<string, unknown>;
    const members = (membersRaw.members ?? (Array.isArray(membersRaw) ? membersRaw : [])) as Array<Record<string, unknown>>;

    // Fan out: fetch each player in parallel
    const results = await Promise.allSettled(
      members.map(m => proxyBitjita(`${BITJITA_BASE}/players/${m.playerEntityId}`))
    );

    const players = results.map((r, i) => {
      if (r.status === "rejected") return { entityId: String(members[i].playerEntityId), username: String(members[i].userName), signedIn: null };
      const raw = (r.value as Record<string, unknown>).player as Record<string, unknown> ?? r.value as Record<string, unknown>;
      const signInTs = raw.signInTimestamp ? Number(raw.signInTimestamp) : null;
      const now = Math.floor(Date.now() / 1000);
      return {
        entityId: String(raw.entityId ?? members[i].playerEntityId),
        username: String(raw.username ?? members[i].userName),
        signedIn: raw.signedIn === true,
        signInTimestamp: signInTs && signInTs > 0 ? new Date(signInTs * 1000).toISOString() : null,
        sessionSeconds: signInTs && signInTs > 0 ? now - signInTs : null,
        timePlayed: raw.timePlayed != null ? Number(raw.timePlayed) : null,
        lastLogin: raw.lastLoginTimestamp ?? null,
        locationX: raw.locationX != null ? Number(raw.locationX) : null,
        locationZ: raw.locationZ != null ? Number(raw.locationZ) : null,
      };
    });

    res.json(players);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch claim players");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/bitjita/claims?regionId=...&limit=...&sort=...&order=...
router.get("/bitjita/claims", async (req, res) => {
  const { regionId, limit, sort, order } = req.query;
  if (!regionId) {
    res.status(400).json({ error: "regionId is required" });
    return;
  }
  const params = new URLSearchParams();
  params.set("regionId", String(regionId));
  if (limit) params.set("limit", String(limit));
  if (sort) params.set("sort", String(sort));
  if (order) params.set("order", String(order));
  try {
    const data = await proxyBitjita(`${BITJITA_BASE}/claims?${params.toString()}`) as Record<string, unknown>;
    const claims = (data.claims ?? (Array.isArray(data) ? data : [])) as RawClaim[];
    res.json(claims.map(normalizeRegionClaim));
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch region claims");
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
