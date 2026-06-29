export const fallbackDefaultOwnerDiscordId = "145544610234630144";

export function defaultOwnerDiscordIdFromEnv(env = process.env) {
  return String(env.DEFAULT_OWNER_DISCORD_ID ?? fallbackDefaultOwnerDiscordId).trim();
}

export function seedDefaultDiscordOwner({
  db,
  statements,
  defaultOwnerDiscordId = defaultOwnerDiscordIdFromEnv(),
  isTestRuntime = false,
  now = () => new Date().toISOString(),
}) {
  if (isTestRuntime || !/^\d+$/.test(defaultOwnerDiscordId)) return;
  if (db.prepare("SELECT id FROM admin_users WHERE discord_id = ?").get(defaultOwnerDiscordId)) return;
  const existingRed = db.prepare("SELECT id FROM admin_users WHERE username = ?").get("red463");
  if (existingRed) {
    db.prepare("UPDATE admin_users SET discord_id = ?, discord_username = ?, discord_global_name = ?, role = 'owner', active = 1 WHERE id = ?")
      .run(defaultOwnerDiscordId, "red463", "red463", existingRed.id);
    return;
  }
  statements.insertDiscordAdmin.run("red463", "discord-oauth-admin", "owner", now(), defaultOwnerDiscordId, "red463", "red463", "");
}