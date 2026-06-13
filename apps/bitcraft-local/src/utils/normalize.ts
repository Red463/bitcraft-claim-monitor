import { toNumber, unwrap, type AnyRecord } from "../main-app-data.ts";

export function normalizePlayer(player: AnyRecord): AnyRecord {
  const signInTs = toNumber(player.signInTimestamp);
  const now = Math.floor(Date.now() / 1000);
  const signedIn = Boolean(player.signedIn ?? player.online ?? player.isOnline ?? (signInTs > 0));
  const timePlayedSeconds = toNumber(
    player.timePlayed ??
    player.totalTimePlayed ??
    player.totalPlayed ??
    player.totalPlayedSeconds ??
    player.time_played ??
    player.total_time_played,
  );
  const timeSignedInSeconds = toNumber(
    player.timeSignedIn ??
    player.totalTimeSignedIn ??
    player.totalSignedIn ??
    player.totalSignedInSeconds ??
    player.time_signed_in ??
    player.total_time_signed_in,
  );
  return {
    ...player,
    entityId: String(player.entityId ?? player.playerEntityId ?? player.playerId ?? ""),
    username: player.username ?? player.userName,
    signedIn,
    sessionSeconds: signInTs > 0 ? Math.max(0, now - signInTs) : null,
    timePlayedSeconds: timePlayedSeconds > 0 ? timePlayedSeconds : null,
    timeSignedInSeconds: timeSignedInSeconds > 0 ? timeSignedInSeconds : null,
  };
}

export function normalizeData(raw: AnyRecord | null) {
  const claim = raw?.claim?.claim ?? raw?.claim ?? {};
  const members = unwrap<AnyRecord[]>(raw?.members, "members", []);
  const citizens = unwrap<AnyRecord[]>(raw?.citizens, "citizens", []);
  const buildings = unwrap<AnyRecord[]>(raw?.buildings, "buildings", []);
  const inventories = raw?.inventories ?? {};
  const construction = raw?.construction ?? {};
  const research = unwrap<AnyRecord[]>(raw?.research, "technologies", []);
  const recruitment = unwrap<AnyRecord[]>(raw?.recruitment, "recruitment", []);
  const market = unwrap<AnyRecord[]>(raw?.market, "listings", []);
  const crafts = unwrap<AnyRecord[]>(raw?.crafts, "craftResults", []);
  const players = unwrap<AnyRecord[]>(raw?.players, "players", []);
  const region = unwrap<AnyRecord[]>(raw?.region, "claims", []);
  const layout = raw?.layout ?? {};
  const skills = raw?.skills ?? {};
  const contributions = raw?.contributions ?? {};
  const marketApi = raw?.marketApi ?? { histories: [], trades: [] };
  const regionStatus = unwrap<AnyRecord[]>(raw?.regionStatus, "regions", []);
  const tradeVolume = raw?.tradeVolume ?? {};
  return { claim, members, citizens, buildings, inventories, construction, research, recruitment, market, crafts, players, region, layout, skills, contributions, marketApi, regionStatus, tradeVolume };
}
