import assert from "node:assert/strict";
import test from "node:test";

import { defaultOwnerDiscordIdFromEnv, seedDefaultDiscordOwner } from "../src/server/defaultOwnerAdmin.mjs";

test("defaultOwnerDiscordIdFromEnv preserves the release default and trims overrides", () => {
  assert.equal(defaultOwnerDiscordIdFromEnv({}), "145544610234630144");
  assert.equal(defaultOwnerDiscordIdFromEnv({ DEFAULT_OWNER_DISCORD_ID: " 12345 " }), "12345");
});

test("seedDefaultDiscordOwner skips test runtime and invalid default owner ids", () => {
  const calls = [];
  const db = { prepare: (sql) => ({ get: (...args) => calls.push(["get", sql, args]), run: (...args) => calls.push(["run", sql, args]) }) };
  const statements = { insertDiscordAdmin: { run: (...args) => calls.push(["insert", args]) } };

  seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: "123", isTestRuntime: true });
  seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: "not-a-snowflake", isTestRuntime: false });

  assert.deepEqual(calls, []);
});

test("seedDefaultDiscordOwner does nothing when the owner discord id already exists", () => {
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(["prepare", sql]);
      return { get: (...args) => (calls.push(["get", ...args]), { id: 7 }), run: (...args) => calls.push(["run", ...args]) };
    },
  };
  const statements = { insertDiscordAdmin: { run: (...args) => calls.push(["insert", ...args]) } };

  seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: "123", isTestRuntime: false });

  assert.deepEqual(calls, [
    ["prepare", "SELECT id FROM admin_users WHERE discord_id = ?"],
    ["get", "123"],
  ]);
});

test("seedDefaultDiscordOwner links an existing red463 admin as owner", () => {
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(["prepare", sql]);
      if (sql.startsWith("UPDATE")) return { run: (...args) => calls.push(["run", ...args]) };
      if (sql.includes("discord_id")) return { get: (...args) => (calls.push(["get", ...args]), null) };
      if (sql.includes("username")) return { get: (...args) => (calls.push(["get", ...args]), { id: 11 }) };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const statements = { insertDiscordAdmin: { run: (...args) => calls.push(["insert", ...args]) } };

  seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: "123", isTestRuntime: false, now: () => "now" });

  assert.deepEqual(calls, [
    ["prepare", "SELECT id FROM admin_users WHERE discord_id = ?"],
    ["get", "123"],
    ["prepare", "SELECT id FROM admin_users WHERE username = ?"],
    ["get", "red463"],
    ["prepare", "UPDATE admin_users SET discord_id = ?, discord_username = ?, discord_global_name = ?, role = 'owner', active = 1 WHERE id = ?"],
    ["run", "123", "red463", "red463", 11],
  ]);
});

test("seedDefaultDiscordOwner inserts red463 when no default owner exists", () => {
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(["prepare", sql]);
      return { get: (...args) => (calls.push(["get", ...args]), null) };
    },
  };
  const statements = { insertDiscordAdmin: { run: (...args) => calls.push(["insert", ...args]) } };

  seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: "123", isTestRuntime: false, now: () => "created-at" });

  assert.deepEqual(calls, [
    ["prepare", "SELECT id FROM admin_users WHERE discord_id = ?"],
    ["get", "123"],
    ["prepare", "SELECT id FROM admin_users WHERE username = ?"],
    ["get", "red463"],
    ["insert", "red463", "discord-oauth-admin", "owner", "created-at", "123", "red463", "red463", ""],
  ]);
});