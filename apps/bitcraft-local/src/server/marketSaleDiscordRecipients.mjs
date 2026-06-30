function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function safeJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saleOwnerKeys(metadata = {}) {
  const ids = new Set([
    clean(metadata.ownerEntityId),
    clean(metadata.owner_entity_id),
    clean(metadata.sellerEntityId),
    clean(metadata.seller_entity_id),
    clean(metadata.playerId),
    clean(metadata.player_id),
  ].filter(Boolean));
  const names = new Set([
    cleanLower(metadata.owner),
    cleanLower(metadata.sellerName),
    cleanLower(metadata.seller_name),
    cleanLower(metadata.characterName),
    cleanLower(metadata.character_name),
  ].filter(Boolean));
  return { ids, names };
}

function discordMarketSaleDmEnabled(account = {}) {
  const settings = safeJson(account.settings_json, {});
  return settings.discordMarketSaleDm !== false;
}

export function marketSaleDiscordRecipientDecision(metadata = {}, accounts = []) {
  const { ids, names } = saleOwnerKeys(metadata);
  if (!ids.size && !names.size) return { recipients: [], matched: 0, optedOut: 0 };
  const recipients = [];
  const seen = new Set();
  let matched = 0;
  let optedOut = 0;
  for (const account of accounts ?? []) {
    if (String(account?.character_status ?? "") !== "approved") continue;
    const discordId = clean(account?.discord_id);
    if (!discordId || seen.has(discordId)) continue;
    const characterId = clean(account?.character_player_id);
    const characterName = cleanLower(account?.character_name);
    if ((characterId && ids.has(characterId)) || (characterName && names.has(characterName))) {
      matched += 1;
      if (!discordMarketSaleDmEnabled(account)) {
        optedOut += 1;
        continue;
      }
      seen.add(discordId);
      recipients.push(discordId);
    }
  }
  return { recipients, matched, optedOut };
}

export function linkedDiscordRecipientsForMarketSale(metadata = {}, accounts = []) {
  return marketSaleDiscordRecipientDecision(metadata, accounts).recipients;
}