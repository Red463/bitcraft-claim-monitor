import { createHash } from "node:crypto";

import { addDecimal, canonicalNonNegativeDecimal } from "./game-data/exactDecimal.ts";

const EXACT_CONFIDENCES = new Set(["authoritative", "matched_action"]);

function decimalId(value, label) {
  const valueText = String(value ?? "").trim();
  if (!/^\d+$/.test(valueText)) throw new TypeError(`${label} must be a decimal integer`);
  return BigInt(valueText).toString();
}

function decimalIdOrNull(value) {
  const valueText = String(value ?? "").trim();
  return /^\d+$/.test(valueText) ? BigInt(valueText).toString() : null;
}

function parseRecord(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hash(selection) {
  return createHash("sha256").update(JSON.stringify(selection)).digest("hex");
}

function aggregateKey(claimId, craftEntityId, contributorEntityId) {
  return `${claimId}:${craftEntityId}:${contributorEntityId}`;
}

function select(db, claimId) {
  const stored = db.prepare(`
    SELECT * FROM production_contributions WHERE claim_id = ? ORDER BY contribution_key
  `).all(claimId);
  const byIdentity = new Map(stored.flatMap((row) => {
    const craftEntityId = decimalIdOrNull(row.craft_entity_id);
    const contributorEntityId = decimalIdOrNull(row.contributor_entity_id);
    return craftEntityId && contributorEntityId
      ? [[aggregateKey(claimId, craftEntityId, contributorEntityId), row]]
      : [];
  }));
  const durable = new Map();
  const events = db.prepare(`
    SELECT * FROM production_contribution_events WHERE claim_id = ? ORDER BY occurred_at, source_key
  `).all(claimId);
  for (const event of events) {
    if (!EXACT_CONFIDENCES.has(String(event.attribution_confidence))) continue;
    const craftEntityId = decimalId(event.craft_entity_id, "Event craft entity id");
    const contributorEntityId = decimalId(event.contributor_entity_id, "Event contributor entity id");
    const key = aggregateKey(claimId, craftEntityId, contributorEntityId);
    const raw = parseRecord(event.raw_json);
    const progress = decimalId(event.contributed_progress, "Event contribution progress");
    const xp = canonicalNonNegativeDecimal(event.contributed_xp, "Event contribution XP");
    const current = durable.get(key) ?? {
      contributionKey: key,
      claimId,
      craftEntityId,
      contributorEntityId,
      contributorName: String(raw.contributorName ?? `Player ${contributorEntityId}`).trim() || `Player ${contributorEntityId}`,
      attributionConfidence: String(event.attribution_confidence),
      profession: String(raw.profession ?? "").trim() || null,
      craftLabel: String(raw.craftLabel ?? "Craft contribution").trim() || "Craft contribution",
      structureName: String(raw.structureName ?? "Unknown structure").trim() || "Unknown structure",
      itemTier: String(raw.itemTier ?? "").trim() || null,
      contributedProgress: "0",
      contributedXp: "0",
      contributionCount: "0",
      firstContributedAt: String(event.occurred_at),
      lastContributedAt: String(event.occurred_at),
      firstSeen: String(event.received_at),
      updatedAt: String(event.received_at),
      rawJson: String(event.raw_json),
    };
    if (current.attributionConfidence !== "authoritative" && event.attribution_confidence === "authoritative") {
      current.attributionConfidence = "authoritative";
    }
    current.contributedProgress = (BigInt(current.contributedProgress) + BigInt(progress)).toString();
    current.contributedXp = addDecimal(current.contributedXp, xp);
    current.contributionCount = (BigInt(current.contributionCount) + 1n).toString();
    if (String(event.occurred_at) < current.firstContributedAt) current.firstContributedAt = String(event.occurred_at);
    if (String(event.occurred_at) >= current.lastContributedAt) {
      current.lastContributedAt = String(event.occurred_at);
      current.updatedAt = String(event.received_at);
      current.rawJson = String(event.raw_json);
      current.contributorName = String(raw.contributorName ?? `Player ${contributorEntityId}`).trim() || `Player ${contributorEntityId}`;
      current.profession = String(raw.profession ?? "").trim() || null;
      current.craftLabel = String(raw.craftLabel ?? "Craft contribution").trim() || "Craft contribution";
      current.structureName = String(raw.structureName ?? "Unknown structure").trim() || "Unknown structure";
      current.itemTier = String(raw.itemTier ?? "").trim() || null;
    }
    if (String(event.received_at) < current.firstSeen) current.firstSeen = String(event.received_at);
    durable.set(key, current);
  }
  const before = (row) => row ? {
    contributionKey: String(row.contribution_key),
    claimId: String(row.claim_id),
    craftEntityId: String(row.craft_entity_id),
    contributorEntityId: row.contributor_entity_id == null ? null : String(row.contributor_entity_id),
    contributorName: String(row.contributor_name),
    attributionConfidence: String(row.attribution_confidence),
    profession: row.profession == null ? null : String(row.profession),
    craftLabel: row.craft_label == null ? null : String(row.craft_label),
    structureName: row.structure_name == null ? null : String(row.structure_name),
    itemTier: row.item_tier == null ? null : String(row.item_tier),
    contributedProgress: String(row.contributed_progress),
    contributedXp: String(row.contributed_xp),
    contributionCount: String(row.contribution_count),
    firstContributedAt: row.first_contributed_at == null ? null : String(row.first_contributed_at),
    lastContributedAt: row.last_contributed_at == null ? null : String(row.last_contributed_at),
    firstSeen: row.first_seen == null ? null : String(row.first_seen),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
    rawJson: String(row.raw_json),
  } : null;
  const after = (row) => ({
    contributionKey: row.contributionKey,
    claimId: row.claimId,
    craftEntityId: row.craftEntityId,
    contributorEntityId: row.contributorEntityId,
    contributorName: row.contributorName,
    attributionConfidence: row.attributionConfidence,
    profession: row.profession,
    craftLabel: row.craftLabel,
    structureName: row.structureName,
    itemTier: row.itemTier,
    contributedProgress: row.contributedProgress,
    contributedXp: row.contributedXp,
    contributionCount: row.contributionCount,
    firstContributedAt: row.firstContributedAt,
    lastContributedAt: row.lastContributedAt,
    firstSeen: row.firstSeen,
    updatedAt: row.updatedAt,
    rawJson: row.rawJson,
  });
  const rebuild = [...durable.values()].map((row) => ({ before: before(byIdentity.get(row.contributionKey)), after: after(row) }));
  const remove = stored
    .filter((row) => String(row.attribution_confidence) === "owner_fallback")
    .filter((row) => {
      const craftEntityId = decimalIdOrNull(row.craft_entity_id);
      const contributorEntityId = decimalIdOrNull(row.contributor_entity_id);
      return !craftEntityId || !contributorEntityId
        || !durable.has(aggregateKey(claimId, craftEntityId, contributorEntityId));
    })
    .map((row) => ({ before: before(row), after: null }));
  return { rebuild, remove, eventsPreserved: events.length, durable: [...durable.values()] };
}

function assertManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || hash(manifest.selection) !== manifest.selectionHash) {
    throw new Error("Contribution attribution repair manifest is invalid");
  }
}

export function createContributionAttributionManifest(db, claimIdValue) {
  const claimId = decimalId(claimIdValue, "Claim id");
  const selected = select(db, claimId);
  const selection = {
    rebuild: selected.rebuild,
    remove: selected.remove,
  };
  return {
    schemaVersion: 1,
    claimId,
    selection,
    counts: {
      aggregatesRebuilt: selection.rebuild.length,
      unsupportedOwnerFallbackAggregates: selection.remove.length,
      eventsPreserved: selected.eventsPreserved,
    },
    selectionHash: hash(selection),
  };
}

export function applyContributionAttributionRepair(db, manifest) {
  assertManifest(manifest);
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = createContributionAttributionManifest(db, manifest.claimId);
    if (current.selectionHash !== manifest.selectionHash || JSON.stringify(current.counts) !== JSON.stringify(manifest.counts)) {
      throw new Error("Contribution attribution repair selection changed since dry-run; refusing apply");
    }
    const selected = select(db, manifest.claimId);
    const remove = db.prepare("DELETE FROM production_contributions WHERE contribution_key = ? AND claim_id = ?");
    for (const row of current.selection.remove) remove.run(row.before.contributionKey, manifest.claimId);
    const insert = db.prepare(`
      INSERT INTO production_contributions (
        contribution_key, claim_id, craft_entity_id, contributor_entity_id,
        contributor_name, attribution_confidence, profession, craft_label,
        structure_name, item_tier, contributed_progress, contributed_xp,
        contribution_count, first_contributed_at, last_contributed_at,
        first_seen, updated_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(contribution_key) DO UPDATE SET
        contributor_name = excluded.contributor_name,
        attribution_confidence = excluded.attribution_confidence,
        profession = excluded.profession,
        craft_label = excluded.craft_label,
        structure_name = excluded.structure_name,
        item_tier = excluded.item_tier,
        contributed_progress = excluded.contributed_progress,
        contributed_xp = excluded.contributed_xp,
        contribution_count = excluded.contribution_count,
        first_contributed_at = excluded.first_contributed_at,
        last_contributed_at = excluded.last_contributed_at,
        first_seen = excluded.first_seen,
        updated_at = excluded.updated_at,
        raw_json = excluded.raw_json
    `);
    for (const row of selected.durable) {
      insert.run(
        row.contributionKey, row.claimId, row.craftEntityId, row.contributorEntityId,
        row.contributorName, row.attributionConfidence, row.profession, row.craftLabel,
        row.structureName, row.itemTier, row.contributedProgress, row.contributedXp,
        row.contributionCount, row.firstContributedAt, row.lastContributedAt,
        row.firstSeen, row.updatedAt, row.rawJson,
      );
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
