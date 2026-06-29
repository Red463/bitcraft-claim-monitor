import assert from "node:assert/strict";
import test from "node:test";

import { discordProfileDisplayName, validAdminUsername, validDiscordId } from "../src/server/authIdentity.mjs";

test("validAdminUsername preserves the public admin username policy", () => {
  assert.equal(validAdminUsername("abc"), true);
  assert.equal(validAdminUsername("Admin_User-123"), true);
  assert.equal(validAdminUsername("ab"), false);
  assert.equal(validAdminUsername("a".repeat(33)), false);
  assert.equal(validAdminUsername("admin user"), false);
  assert.equal(validAdminUsername("admin!"), false);
});

test("validDiscordId accepts only realistic Discord snowflake id strings", () => {
  assert.equal(validDiscordId("123456789012345"), true);
  assert.equal(validDiscordId(123456789012345678), true);
  assert.equal(validDiscordId("12345678901234"), false);
  assert.equal(validDiscordId("12345678901234567890123456"), false);
  assert.equal(validDiscordId("1234abc89012345"), false);
  assert.equal(validDiscordId(null), false);
});

test("discordProfileDisplayName falls back through global name, username, id, and default label", () => {
  assert.equal(discordProfileDisplayName({ global_name: " Global Name ", username: "User", id: "123" }), "Global Name");
  assert.equal(discordProfileDisplayName({ global_name: "", username: " User Name ", id: "123" }), "User Name");
  assert.equal(discordProfileDisplayName({ username: "", id: " 123 " }), "123");
  assert.equal(discordProfileDisplayName({ global_name: " ", username: "", id: "" }), "Discord user");
  assert.equal(discordProfileDisplayName(null), "Discord user");
});
