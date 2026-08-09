import { createHash } from "node:crypto";

import { professionNameForSkillId, productionSkillIdValue } from "./productionActivity.mjs";

function parseRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function decimalIdOrNull(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function unclassified(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized.toLowerCase() === "unknown";
}

function evidenceByCraft(db, claimId) {
  const evidence = new Map();
  const rows = db.prepare("SELECT data_json FROM domain_payload_current WHERE claim_id = ? AND domain = 'crafts'").all(claimId);
  for (const row of rows) {
    const payload = parseRecord(row.data_json);
    for (const craft of Array.isArray(payload.craftResults) ? payload.craftResults : []) {
      const craftEntityId = decimalIdOrNull(craft?.entityId ?? craft?.craftEntityId);
      const skillId = decimalIdOrNull(productionSkillIdValue(craft));
      const profession = professionNameForSkillId(skillId);
      if (!craftEntityId || !skillId || !profession) continue;
      const current = evidence.get(craftEntityId);
      evidence.set(craftEntityId, current && current.skillId !== skillId ? null : { skillId, profession });
    }
  }
  return evidence;
}

function selectionHash(selection) {
  return createHash("sha256").update(JSON.stringify(selection)).digest("hex");
}

function selectRepairCandidates(db, claimId) {
  const evidence = evidenceByCraft(db, claimId);
  let unverifiableAggregates = 0;
  let unverifiableEvents = 0;
  const aggregates = db.prepare(`
    SELECT contribution_key, craft_entity_id, profession
    FROM production_contributions
    WHERE claim_id = ?
    ORDER BY contribution_key
  `).all(claimId).flatMap((row) => {
    if (!unclassified(row.profession)) return [];
    const craftEntityId = decimalIdOrNull(row.craft_entity_id);
    const exact = evidence.get(craftEntityId);
    if (!exact) {
      unverifiableAggregates += 1;
      return [];
    }
    return [{ id: String(row.contribution_key), before: row.profession == null ? null : String(row.profession), after: exact.profession, craftEntityId, skillId: exact.skillId }];
  });
  const events = db.prepare(`
    SELECT source_key, craft_entity_id, raw_json
    FROM production_contribution_events
    WHERE claim_id = ?
    ORDER BY source_key
  `).all(claimId).flatMap((row) => {
    const raw = parseRecord(row.raw_json);
    if (!unclassified(raw.profession)) return [];
    const craftEntityId = decimalIdOrNull(row.craft_entity_id);
    const exact = evidence.get(craftEntityId);
    if (!exact) {
      unverifiableEvents += 1;
      return [];
    }
    return [{ id: String(row.source_key), before: raw.profession == null ? null : String(raw.profession), after: exact.profession, craftEntityId, skillId: exact.skillId }];
  });
  return { aggregates, events, unverifiableAggregates, unverifiableEvents };
}

export function createContributionProfessionManifest(db, claimIdValue) {
  const claimId = decimalIdOrNull(claimIdValue);
  if (!claimId) throw new TypeError("claim id must be a decimal integer");
  const selected = selectRepairCandidates(db, claimId);
  const selection = { aggregates: selected.aggregates, events: selected.events };
  return {
    schemaVersion: 1,
    claimId,
    selection,
    counts: {
      aggregates: selection.aggregates.length,
      events: selection.events.length,
      unverifiableAggregates: selected.unverifiableAggregates,
      unverifiableEvents: selected.unverifiableEvents,
    },
    selectionHash: selectionHash(selection),
  };
}

export function applyContributionProfessionRepair(db, manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || selectionHash(manifest.selection) !== manifest.selectionHash) {
    throw new Error("Profession repair manifest is invalid");
  }
  const current = createContributionProfessionManifest(db, manifest.claimId);
  if (current.selectionHash !== manifest.selectionHash || JSON.stringify(current.counts) !== JSON.stringify(manifest.counts)) {
    throw new Error("Profession repair selection changed since dry-run; refusing apply");
  }
  const updateAggregate = db.prepare("UPDATE production_contributions SET profession = ?, raw_json = ? WHERE contribution_key = ?");
  const readAggregate = db.prepare("SELECT raw_json FROM production_contributions WHERE contribution_key = ?");
  const updateEvent = db.prepare("UPDATE production_contribution_events SET raw_json = ? WHERE source_key = ?");
  const readEvent = db.prepare("SELECT raw_json FROM production_contribution_events WHERE source_key = ?");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of current.selection.aggregates) {
      const raw = parseRecord(readAggregate.get(row.id)?.raw_json);
      updateAggregate.run(row.after, JSON.stringify({ ...raw, profession: row.after }), row.id);
    }
    for (const row of current.selection.events) {
      const raw = parseRecord(readEvent.get(row.id)?.raw_json);
      updateEvent.run(JSON.stringify({ ...raw, profession: row.after }), row.id);
    }
    const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
    if (integrity !== "ok") throw new Error(`SQLite integrity_check failed: ${integrity ?? "no result"}`);
    db.exec("COMMIT");
    return { ...current, integrity };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
