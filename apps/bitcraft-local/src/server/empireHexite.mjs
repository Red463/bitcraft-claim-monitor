export const HEXITE_ENERGY_ITEM_ID = 828972621;
export const HEXITE_CAPSULE_CARGO_ID = 2000000;
export const HEXITE_RESERVE_BUILDING_DESCRIPTION_ID = 90001;

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entityId(value) {
  const id = String(value ?? "").trim();
  return id;
}

function normalizedItemType(value) {
  if (value === 0 || String(value).toLowerCase() === "item") return 0;
  if (value === 1 || String(value).toLowerCase() === "cargo") return 1;
  return null;
}

function normalizedBuildingName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createRequestPacer({ requestsPerMinute = 150, now = Date.now, sleep = defaultSleep } = {}) {
  const intervalMs = 60_000 / Math.max(1, number(requestsPerMinute) || 150);
  let nextAllowedAt = 0;
  return async function pace(operation) {
    const waitMs = Math.max(0, nextAllowedAt - now());
    if (waitMs > 0) await sleep(waitMs);
    nextAllowedAt = Math.max(nextAllowedAt, now()) + intervalMs;
    return operation();
  };
}

export async function runWithRetry(operation, { attempts = 3, defaultDelayMs = 1_000, sleep = defaultSleep } = {}) {
  const limit = Math.max(1, Math.floor(number(attempts) || 3));
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= limit) throw error;
      const retryAfterMs = Math.max(0, number(error?.retryAfterMs));
      await sleep(retryAfterMs || Math.max(0, number(defaultDelayMs)));
    }
  }
  throw new Error("Retry loop ended unexpectedly");
}

function contentsSummary(pockets, reserve) {
  let energy = 0;
  let capsules = 0;
  for (const pocket of Array.isArray(pockets) ? pockets : []) {
    const contents = pocket?.contents ?? {};
    const itemId = number(contents.itemId ?? contents.item_id);
    const itemType = normalizedItemType(contents.itemType ?? contents.item_type);
    const quantity = Math.max(0, number(contents.quantity));
    if (itemId === HEXITE_ENERGY_ITEM_ID && itemType === 0) energy += quantity;
    if (itemId === HEXITE_CAPSULE_CARGO_ID && itemType === 1) capsules += quantity;
  }
  return { energy, capsules, reserveCapsules: reserve ? capsules : 0 };
}

function summarizeInventories(rows) {
  const seen = new Set();
  const inventories = [];
  for (const row of rows) {
    if (row.entityId && seen.has(row.entityId)) continue;
    if (row.entityId) seen.add(row.entityId);
    inventories.push(row);
  }
  return {
    energy: inventories.reduce((sum, row) => sum + row.energy, 0),
    capsules: inventories.reduce((sum, row) => sum + row.capsules, 0),
    reserveCapsules: inventories.reduce((sum, row) => sum + row.reserveCapsules, 0),
    inventoryIds: inventories.map((row) => row.entityId).filter(Boolean),
    inventories,
  };
}

export function summarizePlayerHexite(payload) {
  const rows = (Array.isArray(payload?.inventories) ? payload.inventories : []).map((inventory) => ({
    entityId: entityId(inventory?.entityId),
    ...contentsSummary(inventory?.pockets ?? inventory?.inventory, false),
  }));
  return summarizeInventories(rows);
}

export function summarizeClaimHexite(payload) {
  const rows = (Array.isArray(payload?.buildings) ? payload.buildings : []).map((building) => {
    const reserve = number(building?.buildingDescriptionId) === HEXITE_RESERVE_BUILDING_DESCRIPTION_ID
      || normalizedBuildingName(building?.buildingName) === "hexite reserve";
    return {
      entityId: entityId(building?.entityId),
      ...contentsSummary(building?.inventory ?? building?.pockets, reserve),
    };
  });
  return summarizeInventories(rows);
}

function coverage(rows) {
  const values = Array.isArray(rows) ? rows : [];
  return {
    fresh: values.filter((row) => row?.state === "fresh").length,
    reused: values.filter((row) => row?.state === "reused").length,
    missing: values.filter((row) => row?.state === "missing").length,
    total: values.length,
  };
}

export function dedupeEmpireHexiteSources({ players = [], claims = [] } = {}) {
  const seen = new Set();
  const normalize = (source) => {
    const inventoryRows = Array.isArray(source?.inventories) ? source.inventories : null;
    if (!inventoryRows) {
      return {
        state: source?.state ?? "missing",
        energy: number(source?.energy),
        capsules: number(source?.capsules),
        reserveCapsules: number(source?.reserveCapsules),
        ...(source?.error ? { error: String(source.error) } : {}),
      };
    }
    let energy = 0;
    let capsules = 0;
    let reserveCapsules = 0;
    for (const inventory of inventoryRows) {
      const id = String(inventory?.entityId ?? "").trim();
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      energy += number(inventory?.energy);
      capsules += number(inventory?.capsules);
      reserveCapsules += number(inventory?.reserveCapsules);
    }
    return {
      state: source?.state ?? "missing",
      energy,
      capsules,
      reserveCapsules,
      ...(source?.error ? { error: String(source.error) } : {}),
    };
  };
  return {
    players: players.map(normalize),
    claims: claims.map(normalize),
  };
}

export function aggregateEmpireHexite({
  treasury,
  capsuleEnergyCost,
  players = [],
  claims = [],
  sweepStartedAt = null,
  calculatedAt = null,
  refreshing = false,
} = {}) {
  const deduped = dedupeEmpireHexiteSources({ players, claims });
  const playerEnergy = deduped.players.reduce((sum, row) => sum + number(row?.energy), 0);
  const sharedEnergy = deduped.claims.reduce((sum, row) => sum + number(row?.energy), 0);
  const playerCapsules = deduped.players.reduce((sum, row) => sum + number(row?.capsules), 0);
  const sharedCapsules = deduped.claims.reduce((sum, row) => sum + number(row?.capsules), 0);
  const reserveCapsules = deduped.claims.reduce((sum, row) => sum + number(row?.reserveCapsules), 0);
  const treasuryEnergy = number(treasury);
  const totalEnergy = treasuryEnergy + playerEnergy + sharedEnergy;
  const readyTotal = playerCapsules + sharedCapsules;
  const cost = capsuleEnergyCost == null ? null : number(capsuleEnergyCost);
  const hasScan = Boolean(calculatedAt);
  const errors = [...players, ...claims].map((row) => String(row?.error ?? "").trim()).filter(Boolean);

  return {
    estimatedEnergyEquivalent: hasScan && cost != null ? totalEnergy + readyTotal * cost : null,
    capsuleEnergyCost: cost,
    energy: {
      treasury: treasuryEnergy,
      playerInventories: playerEnergy,
      sharedClaimInventories: sharedEnergy,
      total: totalEnergy,
    },
    capsules: {
      playerInventories: playerCapsules,
      sharedClaimInventories: sharedCapsules,
      reserveBuildings: reserveCapsules,
      foundry: null,
      readyTotal,
    },
    coverage: {
      players: coverage(players),
      claims: coverage(claims),
      foundry: "unavailable",
    },
    status: hasScan ? "partial" : "pending",
    sweepStartedAt,
    calculatedAt,
    refreshing: Boolean(refreshing),
    errors,
  };
}

function unavailableEmpireHexite({ treasury, capsuleEnergyCost, sweepStartedAt, error }) {
  const base = aggregateEmpireHexite({ treasury, capsuleEnergyCost, sweepStartedAt });
  return {
    ...base,
    status: "error",
    errors: [String(error ?? "Unable to discover empire sources")],
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return fallback;
  }
}

function publicSweep(row) {
  return row ? {
    id: number(row.id),
    status: String(row.status ?? ""),
    capsuleEnergyCost: row.capsule_energy_cost == null ? null : number(row.capsule_energy_cost),
    totalTargets: number(row.total_targets),
    processedTargets: number(row.processed_targets),
    failureCount: number(row.failure_count),
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    lastError: row.last_error ?? null,
  } : null;
}

function publicTarget(row) {
  return row ? {
    sweepId: number(row.sweep_id),
    empireId: String(row.empire_id ?? ""),
    sourceType: String(row.source_type ?? ""),
    sourceId: String(row.source_id ?? ""),
    state: String(row.state ?? "pending"),
    attemptCount: number(row.attempt_count),
    lastError: row.last_error ?? null,
  } : null;
}

export function createEmpireHexiteRepository(db) {
  const statements = {
    insertSweep: db.prepare(`
      INSERT INTO empire_hexite_sweeps (status, capsule_energy_cost, started_at, updated_at)
      VALUES ('running', ?, ?, ?)
    `),
    insertFailedSweep: db.prepare(`
      INSERT INTO empire_hexite_sweeps (status, started_at, completed_at, last_error, updated_at)
      VALUES ('error', ?, ?, ?, ?)
    `),
    insertSweepEmpire: db.prepare(`
      INSERT OR IGNORE INTO empire_hexite_sweep_empires (sweep_id, empire_id, treasury, updated_at)
      VALUES (?, ?, ?, ?)
    `),
    insertTarget: db.prepare(`
      INSERT OR IGNORE INTO empire_hexite_targets (sweep_id, empire_id, source_type, source_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    sweepById: db.prepare("SELECT * FROM empire_hexite_sweeps WHERE id = ?"),
    activeSweep: db.prepare("SELECT * FROM empire_hexite_sweeps WHERE status = 'running' ORDER BY id DESC LIMIT 1"),
    latestBootstrapFailure: db.prepare(`
      SELECT failed.* FROM empire_hexite_sweeps failed
      WHERE failed.status = 'error' AND failed.total_targets = 0
        AND NOT EXISTS (
          SELECT 1 FROM empire_hexite_sweeps newer
          WHERE newer.id > failed.id AND newer.status <> 'error'
        )
      ORDER BY failed.id DESC LIMIT 1
    `),
    pendingTargets: db.prepare(`
      SELECT * FROM empire_hexite_targets
      WHERE sweep_id = ? AND state = 'pending'
      ORDER BY CASE source_type WHEN 'empire' THEN 0 WHEN 'player' THEN 1 ELSE 2 END, empire_id, source_id
      LIMIT ?
    `),
    cachedSource: db.prepare("SELECT * FROM empire_hexite_sources WHERE source_type = ? AND source_id = ?"),
    claimedInventories: db.prepare(`
      SELECT inventories_json FROM empire_hexite_targets
      WHERE sweep_id = ? AND state IN ('fresh', 'reused')
        AND NOT (source_type = ? AND source_id = ?)
    `),
    markEmpireTargetFresh: db.prepare(`
      UPDATE empire_hexite_targets SET state = 'fresh', attempt_count = attempt_count + 1, last_error = NULL, updated_at = ?
      WHERE sweep_id = ? AND source_type = 'empire' AND source_id = ?
    `),
    markEmpireTargetMissing: db.prepare(`
      UPDATE empire_hexite_targets SET state = 'missing', attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
      WHERE sweep_id = ? AND source_type = 'empire' AND source_id = ?
    `),
    completeEmpire: db.prepare(`
      UPDATE empire_hexite_sweep_empires
      SET treasury = ?, discovery_state = 'fresh', member_count = ?, claim_count = ?, last_error = NULL, updated_at = ?
      WHERE sweep_id = ? AND empire_id = ?
    `),
    failEmpire: db.prepare(`
      UPDATE empire_hexite_sweep_empires
      SET discovery_state = 'missing', last_error = ?, updated_at = ?
      WHERE sweep_id = ? AND empire_id = ?
    `),
    completeTarget: db.prepare(`
      UPDATE empire_hexite_targets
      SET state = 'fresh', energy = ?, capsules = ?, reserve_capsules = ?, inventories_json = ?,
          attempt_count = attempt_count + 1, last_error = NULL, updated_at = ?
      WHERE sweep_id = ? AND source_type = ? AND source_id = ?
    `),
    failTarget: db.prepare(`
      UPDATE empire_hexite_targets
      SET state = ?, energy = ?, capsules = ?, reserve_capsules = ?, inventories_json = ?,
          attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
      WHERE sweep_id = ? AND source_type = ? AND source_id = ?
    `),
    upsertSource: db.prepare(`
      INSERT INTO empire_hexite_sources (
        source_type, source_id, empire_id, energy, capsules, reserve_capsules, inventories_json, scanned_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_type, source_id) DO UPDATE SET
        empire_id = excluded.empire_id,
        energy = excluded.energy,
        capsules = excluded.capsules,
        reserve_capsules = excluded.reserve_capsules,
        inventories_json = excluded.inventories_json,
        scanned_at = excluded.scanned_at,
        updated_at = excluded.updated_at
    `),
    updateSweepProgress: db.prepare(`
      UPDATE empire_hexite_sweeps
      SET total_targets = (SELECT COUNT(*) FROM empire_hexite_targets WHERE sweep_id = ?),
          processed_targets = (SELECT COUNT(*) FROM empire_hexite_targets WHERE sweep_id = ? AND state <> 'pending'),
          failure_count = (SELECT COUNT(*) FROM empire_hexite_targets WHERE sweep_id = ? AND state IN ('reused', 'missing')),
          updated_at = ?
      WHERE id = ?
    `),
    readyEmpires: db.prepare(`
      SELECT se.*
      FROM empire_hexite_sweep_empires se
      WHERE se.sweep_id = ?
        AND se.discovery_state IN ('fresh', 'missing')
        AND NOT EXISTS (
          SELECT 1 FROM empire_hexite_targets target
          WHERE target.sweep_id = se.sweep_id AND target.empire_id = se.empire_id AND target.state = 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM empire_hexite_snapshots snapshot
          WHERE snapshot.empire_id = se.empire_id AND snapshot.sweep_id = se.sweep_id
        )
    `),
    targetsForEmpire: db.prepare(`
      SELECT * FROM empire_hexite_targets
      WHERE sweep_id = ? AND empire_id = ? AND source_type IN ('player', 'claim')
      ORDER BY CASE source_type WHEN 'player' THEN 0 ELSE 1 END, source_id
    `),
    upsertSnapshot: db.prepare(`
      INSERT INTO empire_hexite_snapshots (empire_id, sweep_id, payload_json, calculated_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(empire_id) DO UPDATE SET
        sweep_id = excluded.sweep_id,
        payload_json = excluded.payload_json,
        calculated_at = excluded.calculated_at,
        updated_at = excluded.updated_at
    `),
    snapshotForEmpire: db.prepare("SELECT * FROM empire_hexite_snapshots WHERE empire_id = ?"),
    pendingCount: db.prepare("SELECT COUNT(*) AS count FROM empire_hexite_targets WHERE sweep_id = ? AND state = 'pending'"),
    finishSweep: db.prepare("UPDATE empire_hexite_sweeps SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?"),
  };

  const updateProgress = (sweepId, updatedAt) => {
    statements.updateSweepProgress.run(sweepId, sweepId, sweepId, updatedAt, sweepId);
  };

  const dedupeSummaryForSweep = ({ sweepId, sourceType, sourceId, summary }) => {
    if (!Array.isArray(summary?.inventories)) return summary;
    const seen = new Set();
    for (const row of statements.claimedInventories.all(sweepId, sourceType, sourceId)) {
      for (const inventory of parseJson(row.inventories_json, [])) {
        const id = entityId(inventory?.entityId);
        if (id) seen.add(id);
      }
    }
    const inventories = [];
    for (const inventory of summary.inventories) {
      const id = entityId(inventory?.entityId);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      inventories.push(inventory);
    }
    return {
      energy: inventories.reduce((sum, inventory) => sum + number(inventory?.energy), 0),
      capsules: inventories.reduce((sum, inventory) => sum + number(inventory?.capsules), 0),
      reserveCapsules: inventories.reduce((sum, inventory) => sum + number(inventory?.reserveCapsules), 0),
      inventories,
    };
  };

  return {
    beginSweep({ startedAt, capsuleEnergyCost, empires = [] }) {
      db.exec("BEGIN");
      try {
        const insert = statements.insertSweep.run(capsuleEnergyCost, startedAt, startedAt);
        const sweepId = number(insert.lastInsertRowid);
        const seen = new Set();
        for (const empire of empires) {
          const empireId = String(empire?.entityId ?? empire?.id ?? "").trim();
          if (!empireId || seen.has(empireId)) continue;
          seen.add(empireId);
          const treasury = number(empire?.empireCurrencyTreasury ?? empire?.treasury);
          statements.insertSweepEmpire.run(sweepId, empireId, treasury, startedAt);
          statements.insertTarget.run(sweepId, empireId, "empire", empireId, startedAt);
        }
        updateProgress(sweepId, startedAt);
        db.exec("COMMIT");
        return publicSweep(statements.sweepById.get(sweepId));
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    activeSweep() {
      return publicSweep(statements.activeSweep.get());
    },

    recordBootstrapFailure({ startedAt, completedAt, error }) {
      const message = String(error ?? "Unable to start Hexite sweep");
      statements.insertFailedSweep.run(startedAt, completedAt, message, completedAt);
    },

    latestBootstrapFailure() {
      const failure = publicSweep(statements.latestBootstrapFailure.get());
      return failure ? {
        status: "error",
        startedAt: failure.startedAt,
        completedAt: failure.completedAt,
        lastError: failure.lastError,
      } : null;
    },

    pendingTargets(sweepId, limit = 50) {
      return statements.pendingTargets.all(sweepId, Math.max(1, Math.floor(number(limit) || 50))).map(publicTarget);
    },

    completeEmpireDiscovery({ sweepId, empireId, treasury, playerIds = [], claimIds = [], updatedAt }) {
      db.exec("BEGIN");
      try {
        const players = [...new Set(playerIds.map(String).map((id) => id.trim()).filter(Boolean))];
        const claims = [...new Set(claimIds.map(String).map((id) => id.trim()).filter(Boolean))];
        statements.completeEmpire.run(number(treasury), players.length, claims.length, updatedAt, sweepId, empireId);
        statements.markEmpireTargetFresh.run(updatedAt, sweepId, empireId);
        for (const sourceId of players) statements.insertTarget.run(sweepId, empireId, "player", sourceId, updatedAt);
        for (const sourceId of claims) statements.insertTarget.run(sweepId, empireId, "claim", sourceId, updatedAt);
        updateProgress(sweepId, updatedAt);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    failEmpireDiscovery({ sweepId, empireId, error, updatedAt }) {
      const message = String(error ?? "Unable to discover empire sources");
      db.exec("BEGIN");
      try {
        statements.failEmpire.run(message, updatedAt, sweepId, empireId);
        statements.markEmpireTargetMissing.run(message, updatedAt, sweepId, empireId);
        updateProgress(sweepId, updatedAt);
        db.exec("COMMIT");
      } catch (failure) {
        db.exec("ROLLBACK");
        throw failure;
      }
    },

    completeInventoryTarget({ sweepId, empireId, sourceType, sourceId, summary, updatedAt }) {
      const deduped = dedupeSummaryForSweep({ sweepId, sourceType, sourceId, summary });
      const inventoriesJson = JSON.stringify(Array.isArray(deduped?.inventories) ? deduped.inventories : []);
      const energy = number(deduped?.energy);
      const capsules = number(deduped?.capsules);
      const reserveCapsules = number(deduped?.reserveCapsules);
      const rawInventoriesJson = JSON.stringify(Array.isArray(summary?.inventories) ? summary.inventories : []);
      db.exec("BEGIN");
      try {
        statements.completeTarget.run(energy, capsules, reserveCapsules, inventoriesJson, updatedAt, sweepId, sourceType, sourceId);
        statements.upsertSource.run(
          sourceType,
          sourceId,
          empireId,
          number(summary?.energy),
          number(summary?.capsules),
          number(summary?.reserveCapsules),
          rawInventoriesJson,
          updatedAt,
          updatedAt,
        );
        updateProgress(sweepId, updatedAt);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    failInventoryTarget({ sweepId, sourceType, sourceId, error, updatedAt }) {
      const cached = statements.cachedSource.get(sourceType, sourceId);
      const state = cached ? "reused" : "missing";
      const message = String(error ?? "Unable to scan inventory");
      const deduped = dedupeSummaryForSweep({
        sweepId,
        sourceType,
        sourceId,
        summary: cached ? {
          energy: cached.energy,
          capsules: cached.capsules,
          reserveCapsules: cached.reserve_capsules,
          inventories: parseJson(cached.inventories_json, []),
        } : null,
      });
      db.exec("BEGIN");
      try {
        statements.failTarget.run(
          state,
          number(deduped?.energy),
          number(deduped?.capsules),
          number(deduped?.reserveCapsules),
          JSON.stringify(Array.isArray(deduped?.inventories) ? deduped.inventories : []),
          message,
          updatedAt,
          sweepId,
          sourceType,
          sourceId,
        );
        updateProgress(sweepId, updatedAt);
        db.exec("COMMIT");
      } catch (failure) {
        db.exec("ROLLBACK");
        throw failure;
      }
    },

    publishReadySnapshots(sweepId, calculatedAt) {
      const sweep = statements.sweepById.get(sweepId);
      if (!sweep) return 0;
      let published = 0;
      for (const empire of statements.readyEmpires.all(sweepId)) {
        if (empire.discovery_state === "missing") {
          const payload = unavailableEmpireHexite({
            treasury: empire.treasury,
            capsuleEnergyCost: sweep.capsule_energy_cost,
            sweepStartedAt: sweep.started_at,
            error: empire.last_error,
          });
          statements.upsertSnapshot.run(empire.empire_id, sweepId, JSON.stringify(payload), calculatedAt, calculatedAt);
          published += 1;
          continue;
        }
        const targets = statements.targetsForEmpire.all(sweepId, empire.empire_id);
        const mapped = targets.map((row) => ({
          state: row.state,
          energy: number(row.energy),
          capsules: number(row.capsules),
          reserveCapsules: number(row.reserve_capsules),
          inventories: parseJson(row.inventories_json, []),
          ...(row.last_error ? { error: row.last_error } : {}),
        }));
        const payload = aggregateEmpireHexite({
          treasury: empire.treasury,
          capsuleEnergyCost: sweep.capsule_energy_cost,
          players: mapped.filter((_, index) => targets[index].source_type === "player"),
          claims: mapped.filter((_, index) => targets[index].source_type === "claim"),
          sweepStartedAt: sweep.started_at,
          calculatedAt,
          refreshing: false,
        });
        statements.upsertSnapshot.run(empire.empire_id, sweepId, JSON.stringify(payload), calculatedAt, calculatedAt);
        published += 1;
      }
      return published;
    },

    snapshotForEmpire(empireId) {
      const row = statements.snapshotForEmpire.get(String(empireId));
      return row ? parseJson(row.payload_json, null) : null;
    },

    finishSweepIfComplete(sweepId, completedAt) {
      if (number(statements.pendingCount.get(sweepId)?.count) > 0) return false;
      statements.finishSweep.run(completedAt, completedAt, sweepId);
      return true;
    },

    sweep(sweepId) {
      return publicSweep(statements.sweepById.get(sweepId));
    },
  };
}

function list(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function isoNow(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function createEmpireHexiteRefreshJob({
  repository,
  fetchJson,
  batchSize = 50,
  requestsPerMinute = 150,
  now = () => new Date(),
  sleep = defaultSleep,
} = {}) {
  if (!repository || typeof fetchJson !== "function") throw new Error("Hexite refresh job requires a repository and fetchJson");

  return async function runEmpireHexiteRefresh() {
    const pace = createRequestPacer({ requestsPerMinute, now: () => now().getTime(), sleep });
    const request = (path) => runWithRetry(() => pace(() => fetchJson(path)), { attempts: 3, defaultDelayMs: 1_000, sleep });
    let sweep = repository.activeSweep();

    if (!sweep) {
      const startedAt = isoNow(now);
      let parametersPayload;
      let empiresPayload;
      let capsuleEnergyCost;
      try {
        [parametersPayload, empiresPayload] = await Promise.all([
          request("/parameters"),
          request("/empires"),
        ]);
        capsuleEnergyCost = Number(parametersPayload?.parameters?.hexiteCapsuleCurrencyCost);
        if (!Number.isFinite(capsuleEnergyCost) || capsuleEnergyCost < 0) throw new Error("BitJita parameters did not include a valid Hexite Capsule currency cost");
      } catch (error) {
        repository.recordBootstrapFailure({
          startedAt,
          completedAt: isoNow(now),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      sweep = repository.beginSweep({
        startedAt,
        capsuleEnergyCost,
        empires: list(empiresPayload, "empires"),
      });
    }

    const targets = repository.pendingTargets(sweep.id, batchSize);
    for (const target of targets) {
      const updatedAt = isoNow(now);
      try {
        if (target.sourceType === "empire") {
          const detailPayload = await request(`/empires/${encodeURIComponent(target.empireId)}`);
          const claimsPayload = await request(`/empires/${encodeURIComponent(target.empireId)}/claims`);
          const empire = detailPayload?.empire ?? {};
          repository.completeEmpireDiscovery({
            sweepId: sweep.id,
            empireId: target.empireId,
            treasury: empire.empireCurrencyTreasury,
            playerIds: list(detailPayload, "members").map((member) => member?.entityId),
            claimIds: list(claimsPayload, "claims").map((claim) => claim?.entityId),
            updatedAt,
          });
        } else if (target.sourceType === "player") {
          const payload = await request(`/players/${encodeURIComponent(target.sourceId)}/inventories?q=hexite`);
          repository.completeInventoryTarget({
            sweepId: sweep.id,
            empireId: target.empireId,
            sourceType: "player",
            sourceId: target.sourceId,
            summary: summarizePlayerHexite(payload),
            updatedAt,
          });
        } else if (target.sourceType === "claim") {
          const payload = await request(`/claims/${encodeURIComponent(target.sourceId)}/inventories`);
          repository.completeInventoryTarget({
            sweepId: sweep.id,
            empireId: target.empireId,
            sourceType: "claim",
            sourceId: target.sourceId,
            summary: summarizeClaimHexite(payload),
            updatedAt,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (target.sourceType === "empire") {
          repository.failEmpireDiscovery({ sweepId: sweep.id, empireId: target.empireId, error: message, updatedAt });
        } else {
          repository.failInventoryTarget({
            sweepId: sweep.id,
            empireId: target.empireId,
            sourceType: target.sourceType,
            sourceId: target.sourceId,
            error: message,
            updatedAt,
          });
        }
      }
    }

    const calculatedAt = isoNow(now);
    const published = repository.publishReadySnapshots(sweep.id, calculatedAt);
    const complete = repository.finishSweepIfComplete(sweep.id, calculatedAt);
    const current = repository.sweep(sweep.id);
    return {
      complete,
      continueAfterMs: complete ? 0 : 1_000,
      sweepId: sweep.id,
      stage: complete ? "complete" : "scanning",
      processed: current?.processedTargets ?? 0,
      total: current?.totalTargets ?? 0,
      failures: current?.failureCount ?? 0,
      published,
    };
  };
}
