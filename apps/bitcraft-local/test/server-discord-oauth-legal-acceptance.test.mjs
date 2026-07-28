import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applyDatabaseConnectionPragmas } from "../src/server/databasePragmas.mjs";
import * as discordOAuthFlow from "../src/server/discordOAuthFlow.mjs";
import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  applyAdditiveColumnMigrations,
  applyLegacySchemaCleanup,
  applySchemaIndexStatements,
  applySettlementStateMigration,
} from "../src/server/schemaMigrations.mjs";

test("Discord OAuth persists legal acceptance with the schema-approved source", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());

  applyDatabaseConnectionPragmas(db);
  applySchemaBootstrap(db);
  applySettlementStateMigration(db);
  applyLegacySchemaCleanup(db);
  applyAdditiveColumnMigrations(db);
  applySchemaIndexStatements(db);
  const statements = createPreparedStatements(db);

  const userId = Number(db.prepare(`
    INSERT INTO user_accounts (discord_id, character_status, settings_json, created_at)
    VALUES ('123456789012345678', 'unlinked', '{}', '2026-07-28T12:00:00.000Z')
    RETURNING id
  `).get().id);
  const legal = {
    version: "2026-07-28",
    termsDigest: "terms-digest",
    privacyDigest: "privacy-digest",
    acceptedAt: "2026-07-28T12:00:01.000Z",
  };

  assert.equal(typeof discordOAuthFlow.recordDiscordOAuthLegalAcceptance, "function");
  discordOAuthFlow.recordDiscordOAuthLegalAcceptance({ statements, userId, legal });

  const savedAcceptance = db.prepare(`
    SELECT legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    FROM user_legal_acceptances
    WHERE user_id = ?
  `).get(userId);
  assert.deepEqual(
    { ...savedAcceptance },
    {
      legal_version: legal.version,
      terms_digest: legal.termsDigest,
      privacy_digest: legal.privacyDigest,
      age_confirmed: 1,
      accepted_at: legal.acceptedAt,
      source: "oauth",
    },
  );
});
