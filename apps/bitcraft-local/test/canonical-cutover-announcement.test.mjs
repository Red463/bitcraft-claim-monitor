import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CANONICAL_CUTOVER_ANNOUNCEMENT,
  canonicalCutoverDiscordDelivery,
  claimCanonicalCutoverDelivery,
  enqueueCanonicalCutoverAnnouncement,
  recoverInterruptedCanonicalCutoverDeliveries,
} from "../src/server/canonicalCutoverAnnouncement.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

const REVISION = "a".repeat(40);
const CHANNEL_ID = "666666666";
const MESSAGE = "Claim Monitor has moved to the Relay-backed app at https://app.timbersteeltrade.com. Please sign in again. Existing accounts, character links, access settings, personal preferences, market watches, planning configuration and supported Discord tools were carried across. Relay now provides the live game data and new history. If you notice missing access or settings, contact a settlement administrator with the page and approximate time of the issue.";

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "canonical-cutover-announcement-"));
  const databasePath = path.join(directory, "relay.sqlite");
  const db = new DatabaseSync(databasePath);
  applySchemaBootstrap(db);
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('discord_json', ?, ?)")
    .run(JSON.stringify({ enabled: true, channels: { announcements: CHANNEL_ID } }), "2026-08-09T12:00:00.000Z");
  const outbox = {
    counts: {},
    latestId: 0,
  };
  const state = {
    revision: REVISION,
    preflight: { subscriptions: { subscriptions: { "relay:global:catalogs": 7 } } },
    admission: { formatVersion: 1, revision: REVISION, admittedAt: "2026-08-09T12:05:00.000Z" },
    publicVerification: { health: true, redirect: true },
    postAdmission: { publicVerified: true, intensiveSoakVerified: true },
    intensiveSoak: {
      ok: true,
      profile: "intensive",
      revision: REVISION,
      version: "0.52.0-beta.1",
      deploymentMode: "canonical",
      durationMs: 30 * 60 * 1000,
      sampleCount: 31,
      failedSamples: 0,
      generationAdvanced: true,
      subscriptionCount: 1,
      subscriptionSetHash: "fce01caf4eef1b43a0db5a1a780a8383eb6b03bc87c4ae1a8ad96dd3cc0708c4",
      gatewayCount: 1,
      oldProcessCount: 0,
      outboxUnchanged: true,
      outboxFinal: outbox,
    },
  };
  return { db, databasePath, directory, state };
}

test("cutover announcement uses the exact approved copy, configured announcements channel, and no mentions", () => {
  assert.equal(CANONICAL_CUTOVER_ANNOUNCEMENT, MESSAGE);
  assert.deepEqual(canonicalCutoverDiscordDelivery({
    summary: MESSAGE,
    revision: REVISION,
    settings: { channels: { announcements: CHANNEL_ID } },
  }), {
    channelId: CHANNEL_ID,
    channelKey: "announcements",
    payload: {
      content: MESSAGE,
      allowed_mentions: { parse: [] },
      nonce: REVISION.slice(0, 25),
      enforce_nonce: true,
    },
  });
});

test("admitted, publicly verified, stable 30-minute soak enqueues one revision-bound durable occurrence", () => {
  const current = fixture();
  try {
    current.db.prepare(`
      INSERT INTO discord_notification_outbox
        (source_key, event_type, summary, occurred_at, metadata_json, status,
         attempts, next_attempt_at, created_at, updated_at)
      VALUES ('existing', 'app_update', 'existing', '2026-08-09T11:00:00.000Z', '{}', 'sent', 0,
        '2026-08-09T11:00:00.000Z', '2026-08-09T11:00:00.000Z', '2026-08-09T11:00:00.000Z')
    `).run();
    current.state.intensiveSoak.outboxFinal = { counts: { sent: 1 }, latestId: 1 };
    current.db.close();
    const first = enqueueCanonicalCutoverAnnouncement({
      databasePath: current.databasePath,
      revision: REVISION,
      state: current.state,
      now: () => new Date("2026-08-09T12:35:00.000Z"),
    });
    const second = enqueueCanonicalCutoverAnnouncement({
      databasePath: current.databasePath,
      revision: REVISION,
      state: current.state,
      now: () => new Date("2026-08-09T12:36:00.000Z"),
    });
    assert.deepEqual(first, { inserted: true, sourceKey: `canonical-cutover:${REVISION}`, status: "pending" });
    assert.deepEqual(second, { inserted: false, sourceKey: `canonical-cutover:${REVISION}`, status: "pending" });

    const db = new DatabaseSync(current.databasePath, { readOnly: true });
    const rows = db.prepare("SELECT source_key, event_type, summary, metadata_json, status FROM discord_notification_outbox").all();
    db.close();
    assert.equal(rows.length, 2);
    const announcement = rows.find((row) => row.source_key === `canonical-cutover:${REVISION}`);
    assert.equal(announcement.event_type, "canonical_cutover");
    assert.equal(announcement.summary, MESSAGE);
    assert.equal(announcement.status, "pending");
    assert.deepEqual(JSON.parse(announcement.metadata_json), {
      admittedRevision: REVISION,
      channelKey: "announcements",
      discordChannelId: CHANNEL_ID,
      allowedMentions: { parse: [] },
    });
  } finally {
    rmSync(current.directory, { recursive: true, force: true });
  }
});

test("announcement refuses every pre-admission, public, gateway, outbox, and soak boundary", () => {
  const cases = [
    ["admission", (state) => { delete state.admission; }],
    ["public", (state) => { state.postAdmission.publicVerified = false; }],
    ["preview", (state) => { state.intensiveSoak.deploymentMode = "preview"; }],
    ["30-minute", (state) => { state.intensiveSoak.durationMs -= 1; }],
    ["gateway", (state) => { state.intensiveSoak.gatewayCount = 2; }],
    ["old process", (state) => { state.intensiveSoak.oldProcessCount = 1; }],
    ["generation", (state) => { state.intensiveSoak.generationAdvanced = false; }],
    ["subscription", (state) => { state.intensiveSoak.subscriptionSetHash = "b".repeat(64); }],
    ["outbox", (state) => { state.intensiveSoak.outboxUnchanged = false; }],
    ["failed sample", (state) => { state.intensiveSoak.failedSamples = 1; }],
  ];
  for (const [label, mutate] of cases) {
    const current = fixture();
    try {
      current.db.close();
      mutate(current.state);
      assert.throws(
        () => enqueueCanonicalCutoverAnnouncement({ databasePath: current.databasePath, revision: REVISION, state: current.state }),
        new RegExp(label, "i"),
        label,
      );
      const db = new DatabaseSync(current.databasePath, { readOnly: true });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 0);
      db.close();
    } finally {
      rmSync(current.directory, { recursive: true, force: true });
    }
  }
});

test("announcement refuses a configured-channel change or outbox delta after the soak", () => {
  const current = fixture();
  try {
    current.db.prepare(`
      INSERT INTO discord_notification_outbox
        (source_key, event_type, summary, occurred_at, metadata_json, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES ('unexpected', 'app_update', 'unexpected', '2026-08-09T12:34:00.000Z', '{}', 'sent', 0,
        '2026-08-09T12:34:00.000Z', '2026-08-09T12:34:00.000Z', '2026-08-09T12:34:00.000Z')
    `).run();
    current.db.close();
    assert.throws(
      () => enqueueCanonicalCutoverAnnouncement({ databasePath: current.databasePath, revision: REVISION, state: current.state }),
      /outbox.*changed/i,
    );
  } finally {
    rmSync(current.directory, { recursive: true, force: true });
  }
});

test("announcement atomically refuses an outbox delta at the final insert boundary", () => {
  const current = fixture();
  try {
    current.db.exec(`
      CREATE TRIGGER inject_competing_cutover_outbox_write
      BEFORE INSERT ON discord_notification_outbox
      WHEN NEW.source_key LIKE 'canonical-cutover:%'
      BEGIN
        INSERT INTO discord_notification_outbox
          (source_key, event_type, summary, occurred_at, metadata_json, status,
           attempts, next_attempt_at, created_at, updated_at)
        VALUES ('unexpected-during-gate', 'app_update', 'unexpected',
          '2026-08-09T12:34:59.000Z', '{}', 'sent', 0,
          '2026-08-09T12:34:59.000Z', '2026-08-09T12:34:59.000Z',
          '2026-08-09T12:34:59.000Z');
      END
    `);
    current.db.close();
    assert.throws(
      () => enqueueCanonicalCutoverAnnouncement({ databasePath: current.databasePath, revision: REVISION, state: current.state }),
      /outbox.*changed/i,
    );
    const db = new DatabaseSync(current.databasePath, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 0);
    db.close();
  } finally {
    rmSync(current.directory, { recursive: true, force: true });
  }
});

test("canonical delivery is claimed once and an interrupted attempt becomes terminal skipped", () => {
  const current = fixture();
  try {
    current.db.close();
    enqueueCanonicalCutoverAnnouncement({
      databasePath: current.databasePath,
      revision: REVISION,
      state: current.state,
      now: () => new Date("2026-08-09T12:35:00.000Z"),
    });
    const db = new DatabaseSync(current.databasePath);
    try {
      const id = Number(db.prepare("SELECT id FROM discord_notification_outbox WHERE source_key = ?").get(`canonical-cutover:${REVISION}`).id);
      assert.equal(claimCanonicalCutoverDelivery(db, id, "2026-08-09T12:35:01.000Z"), true);
      assert.equal(claimCanonicalCutoverDelivery(db, id, "2026-08-09T12:35:02.000Z"), false);
      assert.deepEqual({ ...db.prepare("SELECT status, attempts FROM discord_notification_outbox WHERE id = ?").get(id) }, {
        status: "sending",
        attempts: 1,
      });
      assert.equal(recoverInterruptedCanonicalCutoverDeliveries(db, "2026-08-09T12:36:00.000Z"), 1);
      assert.equal(recoverInterruptedCanonicalCutoverDeliveries(db, "2026-08-09T12:37:00.000Z"), 0);
      assert.deepEqual({ ...db.prepare("SELECT status, skipped_at, last_error FROM discord_notification_outbox WHERE id = ?").get(id) }, {
        status: "skipped",
        skipped_at: "2026-08-09T12:36:00.000Z",
        last_error: "Canonical announcement delivery was interrupted; automatic retry is suppressed",
      });
    } finally {
      db.close();
    }
  } finally {
    rmSync(current.directory, { recursive: true, force: true });
  }
});
