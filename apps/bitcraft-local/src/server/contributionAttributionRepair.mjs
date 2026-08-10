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
    }
    if (String(event.received_at) < current.firstSeen) current.firstSeen = String(event.received_at);
    durable.set(key, current);
  }
  const before = (row) => row ? {
    contributionKey: String(row.contribution_key),
    attributionConfidence: String(row.attribution_confidence),
    contributedProgress: String(row.contributed_progress),
    contributedXp: String(row.contributed_xp),
    contributionCount: String(row.contribution_count),
  } : null;
  const after = (row) => ({
    contributionKey: row.contributionKey,
    attributionConfidence: row.attributionConfidence,
    contributedProgress: row.contributedProgress,
    contributedXp: row.contributedXp,
    contributionCount: row.contributionCount,
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
  const current = createContributionAttributionManifest(db, manifest.claimId);
  if (current.selectionHash !== manifest.selectionHash || JSON.stringify(current.counts) !== JSON.stringify(manifest.counts)) {
    throw new Error("Contribution attribution repair selection changed since dry-run; refusing apply");
  }
  const selected = select(db, manifest.claimId);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM production_contributions WHERE claim_id = ?").run(manifest.claimId);
    const insert = db.prepare(`
      INSERT INTO production_contributions (
        contribution_key, claim_id, craft_entity_id, contributor_entity_id,
        contributor_name, attribution_confidence, profession, craft_label,
        structure_name, item_tier, contributed_progress, contributed_xp,
        contribution_count, first_contributed_at, last_contributed_at,
        first_seen, updated_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
