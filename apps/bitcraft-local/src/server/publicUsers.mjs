import { ADMIN_ROLE_LABELS, adminPermissions, normalizeAdminRole } from "./adminPermissions.mjs";

function safeJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function discordAvatarUrl(row) {
  const avatar = String(row?.discord_avatar ?? "").trim();
  const discordId = String(row?.discord_id ?? "").trim();
  return avatar && discordId ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128` : null;
}

export function publicAdminUser(row) {
  if (!row) return null;
  const role = normalizeAdminRole(row.role);
  return {
    id: row.id,
    username: row.username,
    discordId: String(row.discord_id ?? ""),
    discordUsername: String(row.discord_username ?? ""),
    discordGlobalName: String(row.discord_global_name ?? ""),
    avatarUrl: discordAvatarUrl(row),
    role,
    roleLabel: ADMIN_ROLE_LABELS[role],
    permissions: adminPermissions(role),
  };
}

export function publicAppUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    discordId: String(row.discord_id ?? ""),
    username: String(row.discord_username ?? ""),
    globalName: String(row.discord_global_name ?? ""),
    avatarUrl: discordAvatarUrl(row),
    characterPlayerId: String(row.character_player_id ?? ""),
    characterName: String(row.character_name ?? ""),
    characterStatus: String(row.character_status ?? "unlinked"),
    settings: safeJson(row.settings_json, {}),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
