const EMPIRE_PERMISSION_KEYS = [
  "supplyNode",
  "collectHexiteCapsule",
  "buildWatchtower",
  "flagWatchtowerToSiege",
  "approveEmpireSubmissions",
  "promoteLesserRanks",
  "craftHexiteCapsule",
  "count",
  "harvestEmpireResources",
  "withdrawEmpireCurrency",
];

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function regionRows(data, key, regionId) {
  return list(record(data)[key]).filter((row) => text(row?.regionId) === regionId);
}

function regionalMetadata(data, regionId) {
  return list(record(data).regions).find((row) => text(row?.regionId) === regionId) ?? null;
}

export function empireSnapshotStatus(snapshot, regionIdValue, options = {}) {
  const source = record(snapshot);
  const data = record(source.data);
  const selectedRegionId = text(regionIdValue);
  const primaryRegionId = text(data.primaryRegionId);
  const requiredRegionIds = [...new Set([primaryRegionId, selectedRegionId].filter(Boolean))];
  const metadata = new Map(
    list(data.regions).map((row) => [text(row?.regionId), record(row)]),
  );
  const now = options.now ?? Date.now;
  const nowMs = typeof now === "function" ? Number(now()) : Number(now);
  const staleAfterMs = Math.max(1_000, number(options.staleAfterMs) || 60_000);
  const errors = [];
  const received = [];
  const hasRequiredRegionalMetadata = requiredRegionIds.every((regionId) => metadata.has(regionId));
  let stale = false;
  let partial = !hasRequiredRegionalMetadata && text(source.confidence) !== "authoritative";
  const snapshotError = text(source.lastError);
  const taggedSnapshotError = /^Region (\d+):\s*(.+)$/.exec(snapshotError);
  const snapshotErrorAffectsView = (
    !taggedSnapshotError
    || requiredRegionIds.includes(taggedSnapshotError[1])
  );
  if (snapshotError && (!hasRequiredRegionalMetadata || snapshotErrorAffectsView)) {
    stale = true;
    partial = true;
    errors.push(snapshotError);
  }
  for (const regionId of requiredRegionIds) {
    const region = metadata.get(regionId);
    if (!region) {
      stale = true;
      partial = true;
      errors.push(`Region ${regionId} has not loaded.`);
      continue;
    }
    const lastError = text(region.lastError);
    if (lastError) {
      stale = true;
      partial = true;
      errors.push(`Region ${regionId}: ${lastError}`);
    }
    const receivedAt = text(region.receivedAt);
    const receivedAtMs = Date.parse(receivedAt);
    if (!Number.isFinite(receivedAtMs) || !Number.isFinite(nowMs)) {
      stale = true;
      partial = true;
      errors.push(`Region ${regionId} has no valid receive time.`);
    } else {
      const ageMs = Math.max(0, nowMs - receivedAtMs);
      received.push({ receivedAt, receivedAtMs, ageMs });
      if (ageMs > staleAfterMs) {
        stale = true;
        partial = true;
        errors.push(`Region ${regionId} data is ${ageMs}ms old.`);
      }
    }
    const warnings = list(region.warnings).map(String);
    if (warnings.length) {
      partial = true;
      errors.push(...warnings.map((warning) => `Region ${regionId}: ${warning}`));
    }
  }
  const oldest = received.sort((left, right) => left.receivedAtMs - right.receivedAtMs)[0] ?? null;
  return {
    stale,
    partial,
    ageMs: oldest?.ageMs ?? null,
    updatedAt: oldest?.receivedAt ?? null,
    errors: [...new Set(errors)],
  };
}

function permissionMap(values) {
  const permissions = list(values);
  return Object.fromEntries(
    EMPIRE_PERMISSION_KEYS.map((key, index) => [key, permissions[index] === true]),
  );
}

function claimLookup(regionalClaims) {
  return new Map(
    list(record(regionalClaims).claims).map((claim) => [text(claim?.entityId), claim]),
  );
}

function normalizedClaim(settlement, regionalClaim) {
  const source = record(regionalClaim);
  return {
    claimId: text(settlement?.claimEntityId),
    name: text(source.name ?? settlement?.claimName) || "Unknown claim",
    ownerName: text(source.ownerPlayerUsername ?? settlement?.claimOwnerName) || "Unknown",
    ownerEntityId: text(source.ownerPlayerEntityId ?? settlement?.claimOwnerEntityId),
    regionId: text(settlement?.regionId),
    locationX: source.locationX ?? settlement?.locationX ?? null,
    locationZ: source.locationZ ?? settlement?.locationZ ?? null,
    locationDimension: source.locationDimension ?? settlement?.locationDimension ?? null,
    tier: source.tier ?? null,
    supplies: source.supplies ?? null,
    treasury: source.treasury ?? null,
    numTiles: source.numTiles ?? null,
    updatedAt: null,
  };
}

function memberView(member) {
  const permissions = permissionMap(member?.permissions);
  return {
    entityId: text(member?.entityId),
    username: text(member?.username) || "Unknown",
    rank: member?.rank ?? null,
    rankTitle: text(member?.rankTitle) || "Citizen",
    lastLoginTimestamp: member?.lastLoginTimestamp ?? null,
    signedIn: member?.signedIn === true,
    hasStorage: false,
    canAddHexite: permissions.supplyNode || permissions.craftHexiteCapsule,
    permissions,
    donatedShards: member?.donatedShards ?? "0",
    donatedEmpireCurrency: member?.donatedEmpireCurrency ?? "0",
    timePlayedSeconds: member?.timePlayedSeconds ?? null,
  };
}

function inactivityForMembers(members, inactiveDays, now) {
  const leaders = members.filter((member) => number(member?.rank) === 0);
  const threshold = now() - Math.max(1, number(inactiveDays) || 14) * 86_400_000;
  const loginTimes = leaders
    .map((member) => Date.parse(text(member?.lastLoginTimestamp)))
    .filter(Number.isFinite);
  const latest = loginTimes.length ? Math.max(...loginTimes) : null;
  const activeLeaderCount = leaders.filter((member) => (
    member?.signedIn === true
    || Date.parse(text(member?.lastLoginTimestamp)) >= threshold
  )).length;
  return {
    inactiveRisk: leaders.length > 0 && activeLeaderCount === 0,
    leaderCount: leaders.length,
    activeLeaderCount,
    lastLeaderLogin: latest == null ? null : new Date(latest).toISOString(),
    inactivityReason: leaders.length
      ? activeLeaderCount
        ? "Current leader activity found"
        : `No leader sign-in within ${Math.max(1, number(inactiveDays) || 14)} days`
      : "No current rank-zero leader row is available.",
  };
}

function activityForMembers(members, now) {
  const dayAgo = now() - 86_400_000;
  const weekAgo = now() - 7 * 86_400_000;
  const lastLogin = (member) => Date.parse(text(member?.lastLoginTimestamp));
  return {
    onlineNow: members.filter((member) => member?.signedIn === true).length,
    activeToday: members.filter((member) => member?.signedIn === true || lastLogin(member) >= dayAgo).length,
    activeThisWeek: members.filter((member) => member?.signedIn === true || lastLogin(member) >= weekAgo).length,
  };
}

function towerView(node, empire, allEmpires, inactivity) {
  const activeSieges = list(node?.sieges).filter((siege) => siege?.active === true);
  const empireNames = new Map(allEmpires.map((row) => [text(row?.entityId), text(row?.name)]));
  const activeSiegeParticipants = activeSieges.map((siege) => ({
    ...siege,
    empireName: empireNames.get(text(siege?.empireEntityId)) || "Unknown empire",
    attacker: siege?.role === "attacker" ? true : siege?.role === "defender" ? false : null,
  }));
  return {
    id: text(node?.entityId),
    towerId: text(node?.entityId),
    empireId: text(empire?.entityId),
    empireName: text(empire?.name),
    nickname: text(node?.nickname) || "Watchtower",
    locationX: node?.locationX ?? null,
    locationZ: node?.locationZ ?? null,
    locationDimension: node?.locationDimension ?? null,
    energy: node?.energy ?? "0",
    upkeep: node?.upkeep ?? "0",
    active: node?.active === true,
    coveredChunks: number(node?.coveredChunks),
    underSiege: activeSieges.length > 0,
    siegeCount: activeSieges.length,
    activeSiegeParticipants,
    ...inactivity,
  };
}

function regionProjection(data, regionId, options = {}) {
  const allEmpires = list(record(data).empires);
  const members = list(record(data).members);
  const settlements = regionRows(data, "settlements", regionId);
  const claimMembers = regionRows(data, "claimMembers", regionId);
  const nodes = regionRows(data, "nodes", regionId);
  const localEmpireIds = new Set([
    ...settlements.map((row) => text(row?.empireEntityId)),
    ...nodes.map((row) => text(row?.empireEntityId)),
  ]);
  const empires = allEmpires.filter((empire) => localEmpireIds.has(text(empire?.entityId)));
  const claims = claimLookup(options.regionalClaims);
  const now = options.now ?? Date.now;
  const byEmpire = empires.map((empire) => {
    const entityId = text(empire?.entityId);
    const empireMembers = members.filter((member) => text(member?.empireEntityId) === entityId);
    const empireSettlements = settlements.filter((row) => text(row?.empireEntityId) === entityId);
    const empireNodes = nodes.filter((row) => text(row?.empireEntityId) === entityId);
    const empireClaimIds = new Set(empireSettlements.map((row) => text(row?.claimEntityId)));
    const storageMemberIds = new Set(
      claimMembers
        .filter((member) => (
          empireClaimIds.has(text(member?.claimEntityId))
          && member?.inventoryPermission === true
        ))
        .map((member) => text(member?.playerEntityId)),
    );
    const projectedMembers = empireMembers
      .map((member) => ({
        ...memberView(member),
        hasStorage: storageMemberIds.has(text(member?.entityId)),
      }))
      .sort((left, right) => (
        Number(right.signedIn) - Number(left.signedIn)
        || (Date.parse(text(right.lastLoginTimestamp)) || 0)
          - (Date.parse(text(left.lastLoginTimestamp)) || 0)
        || text(left.username).localeCompare(text(right.username))
      ));
    const leader = empireMembers.find((member) => number(member?.rank) === 0) ?? null;
    const inactivity = inactivityForMembers(empireMembers, options.inactiveDays ?? 14, now);
    const normalizedClaims = empireSettlements.map((settlement) => (
      normalizedClaim(settlement, claims.get(text(settlement?.claimEntityId)))
    ));
    const projected = {
      ...empire,
      entityId,
      leader: text(leader?.username) || "Unknown",
      leaderEntityId: text(leader?.entityId),
      memberCount: empireMembers.length,
      regionalClaims: empireSettlements.length,
      regionalClaimNames: normalizedClaims.map((claim) => claim.name).slice(0, 8),
      claims: normalizedClaims,
      ...inactivity,
    };
    return {
      empire: projected,
      members: projectedMembers,
      rawMembers: empireMembers,
      claims: normalizedClaims,
      towers: empireNodes.map((node) => towerView(node, projected, allEmpires, inactivity)),
    };
  });
  return { byEmpire, metadata: regionalMetadata(data, regionId), now };
}

export function empireOverviewView(data, regionIdValue, options = {}) {
  const regionId = text(regionIdValue);
  const { byEmpire, metadata } = regionProjection(data, regionId, options);
  const empires = byEmpire
    .filter(({ empire }) => number(empire.regionalClaims) > 0)
    .map(({ empire }) => ({
      ...empire,
      ...(options.hexiteForEmpire
        ? { hexiteReserves: options.hexiteForEmpire(empire.entityId, empire, metadata?.receivedAt ?? null) }
        : {}),
    }))
    .sort((left, right) => (
      number(right.regionalClaims) - number(left.regionalClaims)
      || number(right.memberCount) - number(left.memberCount)
      || text(left.name).localeCompare(text(right.name))
    ));
  const largest = [...empires].sort((left, right) => (
    number(right.memberCount) - number(left.memberCount)
    || number(right.regionalClaims) - number(left.regionalClaims)
  ))[0] ?? null;
  return {
    regionId,
    fetchedAt: metadata?.receivedAt ?? null,
    totalRegionalClaims: empires.reduce((total, empire) => total + number(empire.regionalClaims), 0),
    empireClaimCount: empires.reduce((total, empire) => total + number(empire.regionalClaims), 0),
    empires,
    summary: {
      empires: empires.length,
      regionalClaims: empires.reduce((total, empire) => total + number(empire.regionalClaims), 0),
      totalMembers: empires.reduce((total, empire) => total + number(empire.memberCount), 0),
      largestEmpireName: largest?.name ?? null,
    },
    errors: list(metadata?.warnings).map(String),
  };
}

export function empireDetailsView(data, regionIdValue, empireIdValue, inactiveDays = 14, options = {}) {
  const regionId = text(regionIdValue);
  const empireId = text(empireIdValue);
  const { byEmpire, metadata, now } = regionProjection(data, regionId, {
    ...options,
    inactiveDays,
  });
  const selected = byEmpire.find(({ empire }) => empire.entityId === empireId);
  if (!selected) return null;
  const errors = list(metadata?.warnings).map(String);
  return {
    empire: {
      ...selected.empire,
      ...(options.hexiteForEmpire
        ? { hexiteReserves: options.hexiteForEmpire(empireId, selected.empire, metadata?.receivedAt ?? null) }
        : {}),
    },
    members: selected.members,
    claims: selected.claims,
    towers: selected.towers,
    activity: activityForMembers(selected.rawMembers, now),
    errors,
    partial: errors.length > 0,
    fetchedAt: metadata?.receivedAt ?? null,
  };
}

export function empireWatchtowersView(data, regionIdValue, inactiveDays = 14, options = {}) {
  const regionId = text(regionIdValue);
  const { byEmpire, metadata } = regionProjection(data, regionId, {
    ...options,
    inactiveDays,
  });
  const empires = byEmpire.map(({ empire, members, claims, towers }) => ({
    ...empire,
    members,
    accessMembers: members.filter((member) => member.hasStorage || member.canAddHexite),
    claims,
    towers,
  }));
  const towers = byEmpire.flatMap((entry) => entry.towers);
  return {
    regionId,
    inactiveDays: Math.max(1, number(inactiveDays) || 14),
    fetchedAt: metadata?.receivedAt ?? null,
    empires,
    towers,
    summary: {
      towerCount: towers.length,
      inactiveRiskEmpires: empires.filter((empire) => empire.inactiveRisk === true).length,
      underSiege: towers.filter((tower) => tower.underSiege === true).length,
      activeTowers: towers.filter((tower) => tower.active === true).length,
    },
    errors: list(metadata?.warnings).map(String),
    partial: list(metadata?.warnings).length > 0,
    unclaimedAvailable: false,
  };
}

export function empireClaimMembersView(data, claimIdValue, options = {}) {
  const claimId = text(claimIdValue);
  const settlement = list(record(data).settlements)
    .find((row) => text(row?.claimEntityId) === claimId);
  if (!settlement) return null;
  const regionId = text(settlement.regionId);
  const regionalClaim = claimLookup(options.regionalClaims).get(claimId);
  const claim = normalizedClaim(settlement, regionalClaim);
  const empireMembers = list(record(data).members);
  const empireMemberById = new Map(empireMembers.map((member) => [text(member?.entityId), member]));
  const members = regionRows(data, "claimMembers", regionId)
    .filter((member) => text(member?.claimEntityId) === claimId)
    .map((member) => {
      const playerId = text(member?.playerEntityId);
      const empireMember = empireMemberById.get(playerId);
      const empirePermissions = permissionMap(empireMember?.permissions);
      const isOwner = playerId === text(settlement?.claimOwnerEntityId);
      return {
        entityId: playerId,
        username: text(member?.username ?? empireMember?.username) || "Unknown",
        rankTitle: null,
        claimMemberTitle: null,
        empireRankTitle: text(empireMember?.rankTitle) || null,
        lastLoginTimestamp: empireMember?.lastLoginTimestamp ?? null,
        signedIn: empireMember?.signedIn === true,
        hasStorage: member?.inventoryPermission === true,
        canAddHexite: empirePermissions.supplyNode || empirePermissions.craftHexiteCapsule,
        permissions: {
          inventoryPermission: member?.inventoryPermission === true,
          buildPermission: member?.buildPermission === true,
          officerPermission: member?.officerPermission === true,
          coOwnerPermission: member?.coOwnerPermission === true,
        },
        claimRole: isOwner ? "Owner" : member?.coOwnerPermission === true ? "Co-owner" : "Member",
        isClaimOwner: isOwner,
        isClaimCoOwner: member?.coOwnerPermission === true,
      };
    })
    .sort((left, right) => (
      Number(right.isClaimOwner) - Number(left.isClaimOwner)
      || Number(right.isClaimCoOwner) - Number(left.isClaimCoOwner)
      || Number(right.signedIn) - Number(left.signedIn)
      || text(left.username).localeCompare(text(right.username))
    ));
  return {
    claim,
    members,
    errors: [],
    fetchedAt: regionalMetadata(data, regionId)?.receivedAt ?? null,
  };
}
