export function validAdminUsername(username) {
  return /^[A-Za-z0-9_-]{3,32}$/.test(username);
}

export function validDiscordId(value) {
  return /^\d{15,25}$/.test(String(value ?? "").trim());
}

export function discordProfileDisplayName(profile) {
  for (const value of [profile?.global_name, profile?.username, profile?.id]) {
    const name = String(value ?? "").trim();
    if (name) return name;
  }
  return "Discord user";
}
