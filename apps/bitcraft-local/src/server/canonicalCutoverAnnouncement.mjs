import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const CANONICAL_CUTOVER_ANNOUNCEMENT = "Claim Monitor has moved to the Relay-backed app at https://app.timbersteeltrade.com. Please sign in again. Existing accounts, character links, access settings, personal preferences, market watches, planning configuration and supported Discord tools were carried across. Relay now provides the live game data and new history. If you notice missing access or settings, contact a settlement administrator with the page and approximate time of the issue.";

const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const INTENSIVE_SOAK_MS = 30 * 60 * 1000;

function outboxSnapshot(db) {
  const counts = Object.fromEntries(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM discord_notification_outbox
    GROUP BY status
    ORDER BY status
  `).all().map((row) => [String(row.status), Number(row.count)]));
  const latestId = Number(db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM discord_notification_outbox").get().id);
  return { counts, latestId };
}

function canonical(value) {
  return JSON.stringify(value);
}

function expectedOutboxAfterAnnouncement(snapshot) {
  const counts = { ...(snapshot?.counts ?? {}) };
  counts.pending = Number(counts.pending ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

function validateExistingAnnouncement(existing, revision) {
  if (existing.event_type !== "canonical_cutover" || existing.summary !== CANONICAL_CUTOVER_ANNOUNCEMENT) {
    throw new Error("Canonical cutover announcement source key is occupied by a different notification");
  }
  let metadata;
  try {
    metadata = JSON.parse(String(existing.metadata_json ?? ""));
  } catch {
    throw new Error("Canonical cutover announcement metadata is invalid");
  }
  if (metadata?.admittedRevision !== revision
    || metadata?.channelKey !== "announcements"
    || !/^\d+$/.test(String(metadata?.discordChannelId ?? ""))
    || canonical(metadata?.allowedMentions) !== canonical({ parse: [] })) {
    throw new Error("Canonical cutover announcement metadata does not match the admitted delivery");
  }
}

function requireAnnouncementState(state, revision) {
  if (!state?.admission || state.admission.formatVersion !== 1 || state.admission.revision !== revision) {
    throw new Error("Cutover announcement requires the matching admission marker");
  }
  if (state.postAdmission?.publicVerified !== true || !state.publicVerification) {
    throw new Error("Cutover announcement requires successful canonical public verification");
  }
  const override = state.operatorOverrides?.skipIntensiveSoak;
  if (state.postAdmission?.intensiveSoakSkipped === true
    && override?.approved === true
    && override.revision === revision) {
    const local = state.localVerification;
    const publicVerification = state.publicVerification;
    if (local?.health?.deploymentMode !== "canonical"
      || local.health.version !== "0.52.0-beta.1"
      || !/^\d+$/.test(String(local.gatewayPid ?? ""))) {
      throw new Error("Cutover announcement soak override requires verified local canonical health and one gateway");
    }
    if (publicVerification?.health !== true
      || publicVerification.redirect !== true
      || publicVerification.securityHeaders !== true) {
      throw new Error("Cutover announcement soak override requires successful public canonical verification");
    }
    const expected = state.preflight?.subscriptions?.subscriptions ?? {};
    for (const [key, generation] of Object.entries(expected)) {
      if (Number(local.subscriptions?.subscriptions?.[key] ?? 0) <= Number(generation)
        || Number(publicVerification.subscriptions?.subscriptions?.[key] ?? 0) <= Number(generation)) {
        throw new Error("Cutover announcement soak override requires provider generation advancement");
      }
    }
    if (!Object.keys(expected).length) throw new Error("Cutover announcement soak override requires the exact subscription set");
    return { operatorSkipped: true, outboxFinal: null };
  }
  const soak = state.intensiveSoak;
  if (state.postAdmission?.intensiveSoakVerified !== true || soak?.ok !== true || soak.profile !== "intensive") {
    throw new Error("Cutover announcement requires a successful 30-minute intensive soak");
  }
  if (soak.revision !== revision || soak.version !== "0.52.0-beta.1" || soak.durationMs < INTENSIVE_SOAK_MS) {
    throw new Error("Cutover announcement requires matching 30-minute release evidence");
  }
  if (soak.deploymentMode !== "canonical") throw new Error("Cutover announcement must never run in preview mode");
  if (soak.failedSamples !== 0) throw new Error("Cutover announcement refuses a failed sample");
  if (soak.generationAdvanced !== true) throw new Error("Cutover announcement requires provider generation advancement");
  const expectedSubscriptionKeys = Object.keys(state.preflight?.subscriptions?.subscriptions ?? {}).sort();
  const expectedSubscriptionSetHash = createHash("sha256").update(expectedSubscriptionKeys.join("\n"), "utf8").digest("hex");
  if (!expectedSubscriptionKeys.length
    || soak.subscriptionCount !== expectedSubscriptionKeys.length
    || soak.subscriptionSetHash !== expectedSubscriptionSetHash) {
    throw new Error("Cutover announcement requires the exact preflight subscription set");
  }
  if (soak.gatewayCount !== 1) throw new Error("Cutover announcement requires exactly one live Discord gateway");
  if (soak.oldProcessCount !== 0) throw new Error("Cutover announcement requires no old process health");
  if (soak.outboxValidated !== true || !soak.outboxBaseline || !soak.outboxFinal) {
    throw new Error("Cutover announcement requires a validated Discord outbox baseline");
  }
  return soak;
}

function readAnnouncementsChannel(db) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'discord_json'").get();
  let settings;
  try {
    settings = JSON.parse(String(row?.value ?? ""));
  } catch {
    throw new Error("Configured Discord announcements channel is invalid");
  }
  const channelId = String(settings?.channels?.announcements ?? "").trim();
  if (settings?.enabled !== true || !/^\d+$/.test(channelId)) {
    throw new Error("Configured Discord announcements channel is unavailable");
  }
  return channelId;
}

export function canonicalCutoverDiscordDelivery({ summary, revision, settings }) {
  if (summary !== CANONICAL_CUTOVER_ANNOUNCEMENT) throw new Error("Canonical cutover announcement copy does not match the approved message");
  if (!REVISION_PATTERN.test(String(revision ?? ""))) throw new Error("Canonical cutover delivery requires the admitted revision");
  const channelId = String(settings?.channels?.announcements ?? "").trim();
  if (!/^\d+$/.test(channelId)) throw new Error("Configured Discord announcements channel is unavailable");
  return {
    channelId,
    channelKey: "announcements",
    payload: {
      content: CANONICAL_CUTOVER_ANNOUNCEMENT,
      allowed_mentions: { parse: [] },
      nonce: revision.slice(0, 25),
      enforce_nonce: true,
    },
  };
}

export function claimCanonicalCutoverDelivery(db, id, claimedAt) {
  const result = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'sending', attempts = attempts + 1, locked_at = ?, updated_at = ?
    WHERE id = ?
      AND event_type = 'canonical_cutover'
      AND status IN ('pending', 'failed')
  `).run(claimedAt, claimedAt, id);
  return Number(result.changes) === 1;
}

export function recoverInterruptedCanonicalCutoverDeliveries(db, recoveredAt) {
  const result = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'skipped', skipped_at = ?,
        last_error = 'Canonical announcement delivery was interrupted; automatic retry is suppressed',
        updated_at = ?
    WHERE event_type = 'canonical_cutover' AND status = 'sending'
  `).run(recoveredAt, recoveredAt);
  return Number(result.changes);
}

export function enqueueCanonicalCutoverAnnouncement({
  databasePath,
  revision,
  state,
  now = () => new Date(),
}) {
  if (!REVISION_PATTERN.test(String(revision ?? ""))) throw new Error("Canonical cutover revision must be a full lowercase SHA");
  const sourceKey = `canonical-cutover:${revision}`;
  const db = new DatabaseSync(databasePath, { timeout: 5_000 });
  let transactionOpen = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const existing = db.prepare(`
      SELECT event_type, summary, metadata_json, status
      FROM discord_notification_outbox
      WHERE source_key = ?
    `).get(sourceKey);
    if (existing) {
      validateExistingAnnouncement(existing, revision);
      db.exec("COMMIT");
      transactionOpen = false;
      return { inserted: false, sourceKey, status: String(existing.status) };
    }

    const soak = requireAnnouncementState(state, revision);
    const verifiedOutbox = soak.operatorSkipped ? outboxSnapshot(db) : soak.outboxFinal;
    if (canonical(outboxSnapshot(db)) !== canonical(verifiedOutbox)) {
      throw new Error("Discord outbox changed after the successful intensive soak");
    }
    const channelId = readAnnouncementsChannel(db);
    const occurredAt = now().toISOString();
    const metadata = {
      admittedRevision: revision,
      channelKey: "announcements",
      discordChannelId: channelId,
      allowedMentions: { parse: [] },
    };
    const result = db.prepare(`
      INSERT INTO discord_notification_outbox
        (source_key, event_type, summary, occurred_at, metadata_json, status,
         attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, 'canonical_cutover', ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run(sourceKey, CANONICAL_CUTOVER_ANNOUNCEMENT, occurredAt, JSON.stringify(metadata), occurredAt, occurredAt, occurredAt);
    const finalSnapshot = outboxSnapshot(db);
    if (Number(result.changes) !== 1
      || canonical(finalSnapshot.counts) !== canonical(expectedOutboxAfterAnnouncement(verifiedOutbox))
      || finalSnapshot.latestId !== Number(result.lastInsertRowid)) {
      throw new Error("Discord outbox changed at the canonical announcement boundary");
    }
    db.exec("COMMIT");
    transactionOpen = false;
    return { inserted: true, sourceKey, status: "pending" };
  } catch (error) {
    if (transactionOpen) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
