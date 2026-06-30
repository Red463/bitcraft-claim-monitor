function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
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

export function linkedDiscordRecipientsForMarketSale(metadata = {}, accounts = []) {
  const { ids, names } = saleOwnerKeys(metadata);
  if (!ids.size && !names.size) return [];
  const recipients = [];
  const seen = new Set();
  for (const account of accounts ?? []) {
    if (String(account?.character_status ?? "") !== "approved") continue;
    const discordId = clean(account?.discord_id);
    if (!discordId || seen.has(discordId)) continue;
    const characterId = clean(account?.character_player_id);
    const characterName = cleanLower(account?.character_name);
    if ((characterId && ids.has(characterId)) || (characterName && names.has(characterName))) {
      seen.add(discordId);
      recipients.push(discordId);
    }
  }
  return recipients;
}
