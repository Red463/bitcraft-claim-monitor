import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bed,
  Bell,
  Box,
  Building2,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  CircleHelp,
  Command,
  Crown,
  Database,
  Download,
  ExternalLink,
  Factory,
  FileText,
  FlaskConical,
  Flame,
  Globe2,
  Hammer,
  Home,
  KeyRound,
  Lock,
  LogOut,
  HardDrive,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  Swords,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  User,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import packageJson from "../package.json";
import "./styles.css";

const DEFAULT_CLAIM_ID = "1369094286777412590";
const DEFAULT_SYNC_URL = "https://bitcraftsync.app/s/MUFJw3#claims=1369094286777412590&players=1369094286756659093%2C576460752388321942%2C864691128512324120&shopping=i.2036617800%3A20&p.exc=1369094286756659093%3A1369094286764705296%2C1369094286756792917%3B864691128512324120%3A1369094286778153104%2C1369094286772328807%2C1369094286761962469%3B576460752388321942%3A1369094286783870822&crafts=1&crafts.pf=includedPlayers";
const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor";
const DISCORD_URL = "https://discord.gg/ET4bteqbG5";
const APP_VERSION = packageJson.version;

type AnyRecord = Record<string, any>;
type LoadState<T> = { data: T | null; error: string | null; loading: boolean };
type ActivePanel = (typeof NAV)[number][0];
type LocalHistoryState = { market: AnyRecord | null; activity: AnyRecord[]; activityTotal: number; error: string | null; refreshToken: number };
type MapFocus = { name: string; locationX: number; locationZ: number } | null;
type ToastKind = "market" | "production";
type ToastNotice = { id: string; title: string; body: string; kind: ToastKind; occurredAt?: string; read?: boolean; destination?: ActivePanel };
type WatchEntry = { id: string; type: "market" | "material" | "craft"; label: string; itemId?: string; itemType?: number; tier?: number };
type BrandingAsset = { fileName: string; contentType: string; updatedAt: string; url: string };
type AnalyticsConsent = "accepted" | "declined" | null;
type UserToastSettings = { marketListings: boolean; marketSales: boolean; production: boolean };
type DiscordSettings = {
  enabled: boolean;
  applicationId: string;
  publicKey: string;
  guildId: string;
  channelId: string;
  minSaleValue: number;
  supplyRunwayDaysThreshold: number;
  productionMinXp: number;
  productionMinProgressPct: number;
  productionUsers: string;
  supplyReportIntervalDays: number;
  channels: Record<string, string>;
  notificationChannels: Record<string, string>;
  craftChannels: Record<string, string>;
  notify: { marketListings: boolean; marketSales: boolean; production: boolean; productionStarted: boolean; productionCompleted: boolean; lowSupplies: boolean; appUpdates: boolean; supplyReports: boolean };
  botToken?: string;
  clearBotToken?: boolean;
  botTokenConfigured?: boolean;
  botTokenSource?: string | null;
  interactionUrl?: string;
};
type AppSettings = {
  claimId: string;
  syncUrl: string;
  theme: typeof DEFAULT_THEME;
  refreshSeconds: number;
  defaultPage: ActivePanel;
  defaultRegion: string;
  toastSettings: { marketListings: boolean; marketSales: boolean; production: boolean };
  branding: { logo?: BrandingAsset; favicon?: BrandingAsset };
  snapshotRetentionDays: number;
  browserSnapshotsEnabled: boolean;
  discord: DiscordSettings;
};

const NAV = [
  ["overview", "Overview", Shield],
  ["members", "Members", Users],
  ["skills", "Professions", Swords],
  ["production", "Production", Factory],
  ["publiccrafts", "Public Craft Finder", Search],
  ["inventory", "Inventory", Package],
  ["construction", "Construction", Hammer],
  ["buildings", "Structures", Home],
  ["research", "Research", FlaskConical],
  ["market", "Market", CircleDollarSign],
  ["empire", "Region", Globe2],
  ["map", "Map", MapIcon],
  ["sync", "Sync", Share2],
  ["activity", "Activity", Activity],
  ["admin", "Admin", KeyRound],
] as const;

const DEFAULT_THEME = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
};

const DEFAULT_CRAFT_CHANNELS: Record<string, string> = {
  forestry: "1509932116077711411",
  carpentry: "1509932154442875201",
  masonry: "1509932188446101585",
  mining: "1509932207060291797",
  smithing: "1509932228090658936",
  scholar: "1509932259262595245",
  hunting: "1510275986766434325",
  leatherworking: "1509932280829710547",
  tailoring: "1509932306486398976",
  farming: "1509932539626786926",
  fishing: "1509932564641747074",
  cooking: "1509932588180181033",
  foraging: "1509932609378058412",
};

const DEFAULT_DISCORD_CHANNELS: Record<string, string> = {
  notifications: "",
  modNotes: "1509972023927902218",
  ...DEFAULT_CRAFT_CHANNELS,
};

const DEFAULT_NOTIFICATION_CHANNELS: Record<string, string> = {
  marketListings: "notifications",
  marketSales: "notifications",
  lowSupplies: "notifications",
  appUpdates: "notifications",
  supplyReport: "modNotes",
  productionStarted: "profession",
  productionCompleted: "profession",
};

const DISCORD_CHANNEL_FIELDS = Object.keys(DEFAULT_DISCORD_CHANNELS);

const DEFAULT_SETTINGS: AppSettings = {
  claimId: DEFAULT_CLAIM_ID,
  syncUrl: DEFAULT_SYNC_URL,
  theme: DEFAULT_THEME,
  refreshSeconds: 30,
  defaultPage: "overview",
  defaultRegion: "",
  toastSettings: { marketListings: true, marketSales: true, production: true },
  branding: {},
  snapshotRetentionDays: 365,
  browserSnapshotsEnabled: true,
  discord: {
    enabled: false,
    applicationId: "",
    publicKey: "",
    guildId: "",
    channelId: "",
    minSaleValue: 0,
    supplyRunwayDaysThreshold: 7,
    productionMinXp: 40000,
    productionMinProgressPct: 1,
    productionUsers: "",
    supplyReportIntervalDays: 3,
    channels: DEFAULT_DISCORD_CHANNELS,
    notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
    craftChannels: DEFAULT_CRAFT_CHANNELS,
    notify: { marketListings: true, marketSales: true, production: true, productionStarted: true, productionCompleted: true, lowSupplies: false, appUpdates: true, supplyReports: true },
    botTokenConfigured: false,
    botTokenSource: null,
    interactionUrl: "/api/discord/interactions",
  },
};

const DEFAULT_USER_TOAST_SETTINGS: UserToastSettings = { marketListings: true, marketSales: true, production: true };

function normalizeAppSettings(config: Partial<AppSettings> | AnyRecord | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(config ?? {}),
    theme: { ...DEFAULT_THEME, ...((config as AnyRecord)?.theme ?? {}) },
    toastSettings: { ...DEFAULT_SETTINGS.toastSettings, ...((config as AnyRecord)?.toastSettings ?? {}) },
    branding: (config as AnyRecord)?.branding ?? {},
    discord: {
      ...DEFAULT_SETTINGS.discord,
      ...((config as AnyRecord)?.discord ?? {}),
      channels: { ...DEFAULT_DISCORD_CHANNELS, ...((config as AnyRecord)?.discord?.channels ?? {}), notifications: (config as AnyRecord)?.discord?.channelId ?? (config as AnyRecord)?.discord?.channels?.notifications ?? "" },
      notificationChannels: { ...DEFAULT_NOTIFICATION_CHANNELS, ...((config as AnyRecord)?.discord?.notificationChannels ?? {}) },
      craftChannels: { ...DEFAULT_CRAFT_CHANNELS, ...((config as AnyRecord)?.discord?.channels ?? {}), ...((config as AnyRecord)?.discord?.craftChannels ?? {}) },
      notify: { ...DEFAULT_SETTINGS.discord.notify, ...((config as AnyRecord)?.discord?.notify ?? {}) },
    },
  } as AppSettings;
}

const THEME_FIELDS: Array<[keyof typeof DEFAULT_THEME, string, string]> = [
  ["bg", "Background", "--bg"],
  ["sidebar", "Sidebar", "--sidebar"],
  ["panel", "Panel", "--panel"],
  ["panel2", "Panel 2", "--panel-2"],
  ["border", "Border", "--border"],
  ["muted", "Muted Text", "--muted"],
  ["text", "Text", "--text"],
  ["gold", "Accent", "--gold"],
  ["good", "Positive", "--good"],
  ["danger", "Danger", "--danger"],
];

function endpointMap(claimId: string) {
  return {
    claim: `/claims/${claimId}`,
    members: `/claims/${claimId}/members`,
    citizens: `/claims/${claimId}/citizens`,
    buildings: `/claims/${claimId}/buildings`,
    inventories: `/claims/${claimId}/inventories`,
    construction: `/claims/${claimId}/construction`,
    research: `/claims/${claimId}/research`,
    recruitment: `/claims/${claimId}/recruitment`,
    market: `/claims/${claimId}/market/listings?limit=200`,
    crafts: `/crafts?claimEntityId=${claimId}&completed=false`,
    layout: `/claims/${claimId}/layout`,
    skills: `/skills`,
  } as const;
}

const SKILL_NAMES: Record<number, string> = {
  2: "Forestry",
  3: "Carpentry",
  4: "Masonry",
  5: "Mining",
  6: "Smithing",
  7: "Scholar",
  8: "Leatherworking",
  9: "Hunting",
  10: "Tailoring",
  11: "Farming",
  12: "Fishing",
  13: "Cooking",
  14: "Foraging",
  15: "Construction",
  17: "Taming",
  18: "Slayer",
  19: "Merchanting",
  21: "Sailing",
};

const SKILL_IDS = Object.keys(SKILL_NAMES).map(Number).sort((a, b) => a - b);
const PROFESSION_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
const ADVENTURE_SKILL_IDS = [13, 15, 17, 18, 19, 21];
const MAP_DEFAULT_LAYERS = ["roadsLayer", ...Array.from({ length: 11 }, (_, tier) => `claimT${tier}Layer`)];
const TIER_COLORS: Record<number, string> = {
  1: "#838e9e",
  2: "#be6327",
  3: "#00f630",
  4: "#2d6bff",
  5: "#a349af",
  6: "#d12234",
  7: "#c09015",
  8: "#5ae2e2",
  9: "#1f1f1f",
  10: "#deffff",
};
const TOOL_TAG_BY_TYPE: Record<number, string> = {
  1: "Forester Tool",
  2: "Carpenter Tool",
  3: "Mason Tool",
  4: "Miner Tool",
  5: "Blacksmith Tool",
  6: "Leatherworker Tool",
  7: "Hunter Tool",
  8: "Tailor Tool",
  9: "Farmer Tool",
  10: "Fisher Tool",
  11: "Cook Tool",
  12: "Forager Tool",
  13: "Scholar Tool",
  14: "Tool",
};

function bitjitaSkillRows(skills: AnyRecord, category: "Profession" | "Adventure"): AnyRecord[] {
  const key = category === "Profession" ? "profession" : "adventure";
  return Array.isArray(skills?.[key]) ? skills[key] : [];
}

function skillNameFromRows(rows: AnyRecord[], id: number): string {
  return String(rows.find((skill) => toNumber(skill.id) === id)?.name ?? SKILL_NAMES[id] ?? `Skill ${id}`);
}

function unwrap<T>(payload: any, key: string, fallback: T): T {
  if (Array.isArray(payload)) return payload as T;
  return (payload?.[key] ?? fallback) as T;
}

function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(`claim-monitor.${key}`);
      return saved == null ? initialValue : JSON.parse(saved) as T;
    } catch {
      return initialValue;
    }
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem(`claim-monitor.${key}`, JSON.stringify(value));
    } catch {
      // Storage can be blocked without affecting the dashboard.
    }
  }, [key, value]);
  return [value, setValue];
}

function hasPersistedState(key: string): boolean {
  try {
    return window.localStorage.getItem(`claim-monitor.${key}`) != null;
  } catch {
    return false;
  }
}

function clearBrowserLocalSettings() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("claim-monitor.")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked without affecting the dashboard.
  }
}

function legacyDefaultWatchlist(): WatchEntry[] {
  try {
    const saved = window.localStorage.getItem("claim-monitor.overview.watchlists");
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed?.default) ? parsed.default : [];
  } catch {
    return [];
  }
}

function urlPanel(): ActivePanel | null {
  const panel = new URLSearchParams(window.location.search).get("page");
  return NAV.some(([id]) => id === panel) ? panel as ActivePanel : null;
}

function urlMapFocus(): MapFocus {
  const params = new URLSearchParams(window.location.search);
  const x = params.get("mapX");
  const z = params.get("mapZ");
  if (x == null || z == null) return null;
  return {
    name: params.get("mapName") ?? "Map focus",
    locationX: toNumber(x),
    locationZ: toNumber(z),
  };
}

function updateQueryState(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const ANALYTICS_CONSENT_COOKIE = "claim_monitor_analytics_consent";
const ANALYTICS_VISITOR_COOKIE = "claim_monitor_analytics_visitor";
const ANALYTICS_SESSION_KEY = "claim-monitor.analytics.session";
let analyticsConsent: AnalyticsConsent = null;

function getCookie(name: string): string {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function readAnalyticsConsent(): AnalyticsConsent {
  const consent = getCookie(ANALYTICS_CONSENT_COOKIE);
  return consent === "accepted" || consent === "declined" ? consent : null;
}

function cookieSuffix(maxAge: number): string {
  return `; Path=/; SameSite=Lax; Max-Age=${maxAge}${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

function setAnalyticsPreference(consent: Exclude<AnalyticsConsent, null>) {
  analyticsConsent = consent;
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${consent}${cookieSuffix(180 * 24 * 60 * 60)}`;
  if (consent === "declined") {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${cookieSuffix(0)}`;
    window.sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
  } else if (!getCookie(ANALYTICS_VISITOR_COOKIE)) {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${crypto.randomUUID()}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
}

function analyticsSessionId(): string | null {
  if (analyticsConsent !== "accepted") return null;
  let visitorId = getCookie(ANALYTICS_VISITOR_COOKIE);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${visitorId}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
  let sessionId = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) ?? "";
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function trackAnalyticsEvent(eventName: string, properties?: Record<string, string | number | boolean>, durationSeconds?: number, pageOverride?: ActivePanel) {
  const sessionId = analyticsSessionId();
  if (!sessionId) return;
  const page = pageOverride ?? urlPanel() ?? "overview";
  if (page === "admin") return;
  void fetch(`${LOCAL_API}/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ sessionId, eventName, page, properties, durationSeconds }),
  }).catch(() => undefined);
}

function catalogEntries(catalog: unknown): AnyRecord[] {
  if (Array.isArray(catalog)) return catalog;
  return Object.entries(catalog ?? {}).map(([id, item]) => ({ id, ...(item as AnyRecord) }));
}

function playerInventoryItems(payload: AnyRecord | null | undefined, inventoryName?: string): AnyRecord[] {
  const lookup = new Map(catalogEntries(payload?.items).map((item) => [String(item.id), item]));
  return (payload?.inventories ?? [])
    .filter((inventory: AnyRecord) => !inventoryName || inventory.inventoryName === inventoryName)
    .flatMap((inventory: AnyRecord) => (inventory.pockets ?? inventory.inventory ?? []).flatMap((slot: AnyRecord) => {
      const contents = slot.contents ?? {};
      const itemId = contents.itemId ?? contents.item_id;
      const itemType = contents.itemType ?? contents.item_type;
      if (itemId == null || itemType === 1 || itemType === "cargo") return [];
      const item = lookup.get(String(itemId));
      return item ? [{ ...item, quantity: toNumber(contents.quantity), inventoryName: inventory.inventoryName ?? "Inventory" }] : [];
    }));
}

function playerToolbeltTools(payload: AnyRecord | null | undefined): AnyRecord[] {
  return playerInventoryItems(payload, "Toolbelt").filter((item) => String(item.tag ?? item.tags ?? "").includes("Tool"));
}

function bitjitaIconUrl(item: AnyRecord | null | undefined): string | null {
  const raw = String(item?.iconAssetName ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!raw || raw === "\uFFEE") return null;
  const path = raw.startsWith("Items/") ? `GeneratedIcons/${raw}` : raw;
  return `https://bitjita.com/${path}.webp`;
}

function isMarketableItem(item: AnyRecord): boolean {
  const name = String(item.name ?? "");
  const hasOrders = item.hasSellOrders === true || item.hasBuyOrders === true || toNumber(item.sellOrders) > 0 || toNumber(item.buyOrders) > 0;
  return Boolean(item.id && name) && !/\b(Output|Input)\b/i.test(name) && hasOrders;
}

function equipmentSlots(payload: AnyRecord | null | undefined): AnyRecord[] {
  if (Array.isArray(payload?.equipmentSlots)) return payload.equipmentSlots;
  if (Array.isArray(payload?.equipment)) return payload.equipment;
  return [];
}

const VISIBLE_EQUIPMENT_SLOTS = [
  "head_clothing",
  "torso_clothing",
  "hand_clothing",
  "belt_clothing",
  "leg_clothing",
  "feet_clothing",
  "head_artifact",
  "hand_artifact",
] as const;

const EQUIPMENT_SLOT_LABELS: Record<string, string> = {
  head_clothing: "Head",
  torso_clothing: "Torso",
  hand_clothing: "Hands",
  belt_clothing: "Belt",
  leg_clothing: "Legs",
  feet_clothing: "Feet",
  head_artifact: "Heart",
  hand_artifact: "Jewellery",
};

function slotKey(slot: AnyRecord): string {
  return String(slot.primary ?? slot.secondary ?? "").toLowerCase();
}

function visibleEquipmentSlots(slots: AnyRecord[]): AnyRecord[] {
  const bySlot = new Map(slots.map((slot) => [slotKey(slot), slot]));
  const visible = VISIBLE_EQUIPMENT_SLOTS.map((key) => ({ primary: key, ...(bySlot.get(key) ?? {}) }));
  const unexpectedEquipped = slots.filter((slot) => slot.item && !VISIBLE_EQUIPMENT_SLOTS.includes(slotKey(slot) as typeof VISIBLE_EQUIPMENT_SLOTS[number]));
  return [...visible, ...unexpectedEquipped];
}

function equipmentSignature(slots: AnyRecord[]): string {
  return slots
    .map((slot: AnyRecord) => `${slot.primary}:${slot.item?.id ?? "empty"}`)
    .sort()
    .join("|");
}

function equipmentPresets(payload: AnyRecord | null | undefined, fallbackSlots: AnyRecord[]): AnyRecord[] {
  const presets = Array.isArray(payload?.presets) ? payload.presets : [];
  const activePreset = presets.find((preset: AnyRecord) => preset.active);
  const currentSlots = fallbackSlots.length ? fallbackSlots : activePreset ? equipmentSlots(activePreset) : [];
  const currentSignature = equipmentSignature(currentSlots);
  const alternatePreset = presets.find((preset: AnyRecord) => {
    const slots = equipmentSlots(preset);
    return slots.some((slot: AnyRecord) => slot.item) && equipmentSignature(slots) !== currentSignature;
  });
  return [1, 2].map((index) => {
    const preset = index === 2 ? alternatePreset : activePreset;
    const slots = index === 1 ? currentSlots : preset ? equipmentSlots(preset) : [];
    const presetTwoActive = Boolean(alternatePreset?.active);
    return {
      id: String(index === 1 ? "current-equipment" : preset?.entityId ?? preset?.id ?? `preset-${index}`),
      label: `Preset ${index}`,
      active: index === 2 ? presetTwoActive : !presetTwoActive,
      reported: index === 1 ? currentSlots.length > 0 : Boolean(preset),
      slots,
    };
  });
}

function equippedCount(slots: AnyRecord[]): number {
  return slots.filter((slot) => slot.item).length;
}

function craftDisplayName(job: AnyRecord, craftsPayload?: AnyRecord): string {
  const itemId = String(job.craftedItem?.[0]?.item_id ?? "");
  const item = [...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].find((candidate: AnyRecord) => String(candidate.id) === itemId);
  return String(item?.name ?? job.recipeName ?? `${job.buildingName ?? "Settlement"} craft`);
}

function useBitjitaData(refreshToken: number, claimId: string, activePanel: ActivePanel): LoadState<AnyRecord> {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null,
    error: null,
    loading: true,
  });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        async function request(path: string) {
          const response = await fetch(`${API}${path}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
          return response.json();
        }
        async function requestAllMarketListings() {
          const first = await request(`/claims/${claimId}/market/listings?page=1&limit=200`);
          const totalPages = Math.max(toNumber(first.totalPages) || 1, 1);
          const remaining = totalPages > 1
            ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => request(`/claims/${claimId}/market/listings?page=${index + 2}&limit=200`)))
            : [];
          return { ...first, listings: [first, ...remaining].flatMap((page) => page.listings ?? []) };
        }
        const requestedEndpoints: Record<string, string> = activePanel === "activity" ? {} : endpointMap(claimId);
        const entries = await Promise.all(
          Object.entries(requestedEndpoints).map(async ([key, path]) => {
            return [key, key === "market" ? await requestAllMarketListings() : await request(path)] as const;
          }),
        );
        const raw = Object.fromEntries(entries);
        const claim = raw.claim?.claim ?? raw.claim;
        const members = unwrap<AnyRecord[]>(raw.members, "members", []);
        const memberIds = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean);
        const crafts = unwrap<AnyRecord[]>(raw.crafts, "craftResults", []);
        const readsPlayerDetail = activePanel !== "activity";
        const readsProductionDetail = activePanel === "production" || activePanel === "overview";
        const readsRegionDetail = activePanel === "overview" || activePanel === "empire";
        const [playerResults, contributionResults, regionPayload, tradeVolumePayload] = await Promise.all([
          readsPlayerDetail ? Promise.allSettled(memberIds.map(async (id) => {
            const payload = await request(`/players/${id}`);
            return payload.player ?? payload;
          })) : Promise.resolve([]),
          readsProductionDetail ? Promise.allSettled(crafts.filter((craft) => craft.entityId).map(async (craft) => ({
            craftId: String(craft.entityId),
            payload: await request(`/crafts/${craft.entityId}/contributions`),
          }))) : Promise.resolve([]),
          readsRegionDetail ? request("/regions/status").catch(() => ({ regions: [] })) : Promise.resolve({ regions: [] }),
          readsRegionDetail ? request(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(claim?.regionId ?? ""))}`).catch(() => ({ buckets: [], items: [], regions: [] })) : Promise.resolve({ buckets: [], items: [], regions: [] }),
        ]);
        raw.region = readsRegionDetail && claim?.regionId
          ? await fetch(`${LOCAL_API}/region/claims?regionId=${encodeURIComponent(String(claim.regionId))}`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error(`region claims HTTP ${response.status}`)))
            .catch(() => ({ claims: [] }))
          : { claims: [] };
        raw.players = playerResults
          .filter((result): result is PromiseFulfilledResult<AnyRecord> => result.status === "fulfilled")
          .map((result) => normalizePlayer(result.value));
        raw.marketApi = { histories: [], trades: [] };
        raw.contributions = Object.fromEntries(contributionResults
          .filter((result): result is PromiseFulfilledResult<{ craftId: string; payload: AnyRecord }> => result.status === "fulfilled")
          .map((result) => [result.value.craftId, result.value.payload.contributions ?? []]));
        raw.regionStatus = regionPayload;
        raw.tradeVolume = tradeVolumePayload;
        React.startTransition(() => setState({ loading: false, error: null, data: raw }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ loading: false, error: err instanceof Error ? err.message : String(err), data: prev.data }));
        }
      }
    }
    load();
    return () => controller.abort();
  }, [activePanel, claimId, refreshToken]);

  return state;
}

function useLocalHistory(refreshToken: number, claimId: string): LocalHistoryState {
  const [state, setState] = React.useState<LocalHistoryState>({ market: null, activity: [], activityTotal: 0, error: null, refreshToken: 0 });
  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [marketRes, activityRes] = await Promise.all([
          fetch(`${LOCAL_API}/market/history?claimId=${claimId}&limit=120`, { signal: controller.signal }),
          fetch(`${LOCAL_API}/activity?claimId=${claimId}&limit=2000`, { signal: controller.signal }),
        ]);
        if (!marketRes.ok) throw new Error(`market history HTTP ${marketRes.status}`);
        if (!activityRes.ok) throw new Error(`activity history HTTP ${activityRes.status}`);
        const market = await marketRes.json();
        const activity = await activityRes.json();
        setState((prev) => ({ market, activity: activity.events ?? [], activityTotal: toNumber(activity.total ?? activity.events?.length), error: null, refreshToken: prev.refreshToken + 1 }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [claimId, refreshToken]);
  return state;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function safeDisplayJson(value: unknown): AnyRecord {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits });
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const numeric = Number(text);
  const millis = text.length >= 16 ? numeric / 1000 : text.length <= 10 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampMs(value: unknown): number {
  const date = parseDateValue(value);
  return date ? date.getTime() : 0;
}

function dateLabel(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleString();
}

function timeAgo(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return String(value);
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}

function liveDaysSince(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return "-";
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "-";
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return days === 0 ? "<1 day" : `${days} day${days === 1 ? "" : "s"}`;
}

/*
 * BitJita active market listings expose their original listing time as
 * `timestamp`; persisted first-seen time is used for older/fallback payloads.
 */
function listingDate(listing: AnyRecord, firstSeen: unknown): unknown {
  return listing.timestamp ?? firstSeen;
}

function formatDuration(seconds: unknown): string {
  const total = toNumber(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatEquipmentSlot(value: unknown): string {
  const key = String(value ?? "equipment").toLowerCase();
  return EQUIPMENT_SLOT_LABELS[key] ?? key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDaysAndHours(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "Unknown";
  const wholeDays = Math.floor(days);
  const hours = Math.floor((days - wholeDays) * 24);
  return wholeDays > 0 ? `${wholeDays}d ${hours}h` : `${hours}h`;
}

function claimSupplyCap(claim: AnyRecord): number {
  const direct = toNumber(claim.maxSupplies ?? claim.suppliesMax ?? claim.supplyCap ?? claim.maxSupply);
  if (direct > 0) return direct;
  const maxSupplyTechs = (claim.researchedTechs ?? []).filter((tech: AnyRecord) => tech.techType === "max_supplies");
  return maxSupplyTechs.reduce((max: number, tech: AnyRecord) => {
    const match = String(tech.name ?? "").match(/(\d[\d,]*)\s*max supplies/i);
    const value = match ? toNumber(match[1].replaceAll(",", "")) : 0;
    return Math.max(max, value);
  }, 0);
}

function summarizePassiveCrafts(payload: AnyRecord): AnyRecord[] {
  const catalog = new Map(
    [...(payload.items ?? []), ...(payload.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]),
  );
  const summaries = new Map<string, AnyRecord>();
  for (const craft of payload.craftResults ?? []) {
    const output = craft.craftedItem?.[0] ?? {};
    const item = catalog.get(String(output.item_id)) ?? {};
    const outputName = item.name ?? "crafted item";
    const recipe = String(craft.recipeName ?? "Craft {0}")
      .replace(/\s*\{\d+\}/g, ` ${outputName}`)
      .replace(/\s+/g, " ")
      .trim();
    const key = [recipe, craft.buildingName, craft.status, item.id ?? output.item_id].join("|");
    const current = summaries.get(key);
    const timestamp = parseDateValue(craft.timestamp)?.getTime() ?? 0;
    if (current) {
      current.quantity += toNumber(output.quantity) || 1;
      if (timestamp > current.sortTimestamp) {
        current.timestamp = craft.timestamp;
        current.sortTimestamp = timestamp;
      }
      continue;
    }
    summaries.set(key, {
      recipe,
      status: craft.status ?? "unknown",
      structure: craft.buildingName ?? "Unknown structure",
      timestamp: craft.timestamp,
      sortTimestamp: timestamp,
      quantity: toNumber(output.quantity) || 1,
      tier: item.tier,
    });
  }
  return Array.from(summaries.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp).slice(0, 8);
}

function normalizePlayer(player: AnyRecord): AnyRecord {
  const signInTs = toNumber(player.signInTimestamp);
  const now = Math.floor(Date.now() / 1000);
  return {
    ...player,
    entityId: String(player.entityId ?? ""),
    username: player.username ?? player.userName,
    signedIn: player.signedIn === true,
    sessionSeconds: signInTs > 0 ? Math.max(0, now - signInTs) : null,
  };
}

function normalizeData(raw: AnyRecord | null) {
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

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, warn, onClick }: { label: string; value: React.ReactNode; icon: React.ReactNode; warn?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp className={`stat ${warn ? "warn" : ""} ${onClick ? "clickable-stat" : ""}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong><LiveValue value={value} /></strong>
    </Comp>
  );
}

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="toolbar-button" onClick={onClick}>{children}</button>;
}

function Overview({ data, onNavigate, logo, watches, onToggleWatch }: { data: ReturnType<typeof normalizeData>; onNavigate: (panel: ActivePanel, marketTab?: string) => void; logo?: BrandingAsset; watches: WatchEntry[]; onToggleWatch: (watch: WatchEntry) => void }) {
  const { claim, members, buildings, market, construction, crafts, research, recruitment } = data;
  const supplies = toNumber(claim.supplies);
  const supplyCap = claimSupplyCap(claim);
  const treasury = toNumber(claim.treasury);
  const upkeep = toNumber(claim.upkeepCost);
  const suppliesPerDay = (upkeep || toNumber(claim.tileCost) * toNumber(claim.numTiles)) * 24;
  const runOut = claim.suppliesRunOut ? dateLabel(claim.suppliesRunOut) : "Unknown";
  const runOutDate = parseDateValue(claim.suppliesRunOut);
  const onlineCount = data.players.filter((player) => player.signedIn).length;
  const regionStatus = data.regionStatus.find((region) => String(region.regionId) === String(claim.regionId));
  const marketDay = [...(data.tradeVolume.buckets ?? [])].sort((a: AnyRecord, b: AnyRecord) => String(b.bucket).localeCompare(String(a.bucket)))[0];
  const activeCrafts = crafts.filter((job) => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    return total > 0 && progress < total && hasRecentCraftContribution(data.contributions[String(job.entityId)] ?? []);
  }).length;
  const constructionProjects = Array.isArray(construction) ? construction : (construction.projects ?? []);
  const activeProjects = constructionProjects.filter((project: AnyRecord) => toNumber(project.progress) < toNumber(project.actionsRequired || 0)).length;
  const researched = research.filter((item) => item.isResearched).length;
  const supplyDays = runOutDate && runOutDate.getTime() > Date.now()
    ? (runOutDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : suppliesPerDay > 0 ? supplies / suppliesPerDay : 0;
  const supplyPct = supplyCap > 0 ? Math.max(2, Math.min(100, (supplies / supplyCap) * 100)) : Math.max(4, Math.min(100, supplyDays ? (Math.min(supplyDays, 14) / 14) * 100 : 0));
  const health = supplies < 2000 ? "Needs Attention" : activeProjects || activeCrafts ? "Active" : "Stable";
  const attention = [
    supplies < 2000 ? { icon: <AlertTriangle />, title: "Low supplies", body: `${formatNumber(supplies)} supplies remaining`, panel: "inventory" as ActivePanel } : null,
    activeProjects ? { icon: <Hammer />, title: "Construction active", body: `${activeProjects} project${activeProjects === 1 ? "" : "s"} in progress`, panel: "construction" as ActivePanel } : null,
    crafts.length ? { icon: <Factory />, title: "Production queue", body: `${activeCrafts} active in 30s, ${crafts.length} total job${crafts.length === 1 ? "" : "s"}`, panel: "production" as ActivePanel } : null,
    !market.length ? { icon: <ShoppingCart />, title: "No market listings", body: "No current settlement market activity", panel: "market" as ActivePanel } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; title: string; body: string; panel: ActivePanel }>;
  return (
    <div className="panel">
      <section className="overview-hero">
        <div>
          <span className="overview-kicker">Settlement Command Center</span>
          <div className="overview-title">{logo ? <img className="overview-logo" src={`${logo.url}?v=${encodeURIComponent(logo.updatedAt)}`} alt="" /> : null}<h2>{claim.name ?? "Claim"}</h2><span className={`health-pill ${health === "Needs Attention" ? "warn" : health === "Active" ? "active" : ""}`}>{health}</span></div>
          <p><TierBadge tier={claim.tier} /> {claim.regionName ?? "Unknown region"} <span className="metadata-divider" /> Owner {claim.ownerPlayerUsername ?? "Unknown"}</p>
        </div>
        <div className="hero-metrics">
          <button onClick={() => onNavigate("members")}><strong><LiveValue value={onlineCount} /></strong><span>Online</span></button>
          <button onClick={() => onNavigate("buildings")}><strong><LiveValue value={buildings.length} /></strong><span>Structures</span></button>
          <button onClick={() => onNavigate("market")}><strong><LiveValue value={market.length} /></strong><span>Market</span></button>
        </div>
      </section>

      <div className="overview-pulse">
        <div><span>Members</span><strong><LiveValue value={members.length} /></strong><small>{onlineCount} online now</small></div>
        <div><span>Supply Status</span><strong><LiveValue value={formatDaysAndHours(supplyDays)} /></strong><small>{formatNumber(supplies)} stored</small></div>
        <div><span>Work in Progress</span><strong><LiveValue value={activeCrafts + activeProjects} /></strong><small>{activeCrafts} crafts active in 30s / {activeProjects} builds</small></div>
        <div><span>Market Presence</span><strong><LiveValue value={market.length} /></strong><small>{marketDay ? `${formatNumber(marketDay.totalValue)}g regional daily value` : "No regional trade figure"}</small></div>
      </div>

      <div className="ops-grid">
        <section className="ops-card">
          <header><Box /><span>Supply Runway</span><strong>{formatDaysAndHours(supplyDays)}</strong></header>
          <div className="progress"><div style={{ width: `${supplyPct}%` }} /></div>
          <Info label="Current stock" value={formatNumber(supplies)} />
          {supplyCap > 0 ? <Info label="Storage cap" value={formatNumber(supplyCap)} /> : null}
          <Info label="Supplies per day" value={formatNumber(suppliesPerDay, 2)} />
          <Info label="Runs out" value={runOut} />
        </section>
        <section className="ops-card" title="Runway uses current supplies and the claim upkeep rate returned by BitJita.">
          <header><CircleDollarSign /><span>Treasury</span><strong>{formatNumber(treasury)}g</strong></header>
          <Info label="Supply upkeep per hour" value={formatNumber(upkeep, 2)} />
          <Info label="Supply upkeep per day" value={formatNumber(suppliesPerDay, 2)} />
          <Info label="Tiles" value={formatNumber(claim.numTiles)} />
        </section>
        <section className="ops-card">
          <header><Factory /><span>Work Queue</span><strong>{activeCrafts + activeProjects}</strong></header>
          <button className="ops-link" onClick={() => onNavigate("production")}><span>Production</span><strong>{activeCrafts} active in 30s / {crafts.length} jobs</strong></button>
          <button className="ops-link" onClick={() => onNavigate("construction")}><span>Construction</span><strong>{activeProjects} projects</strong></button>
          <button className="ops-link" onClick={() => onNavigate("research")}><span>Research</span><strong>{researched} complete</strong></button>
        </section>
      </div>

      <div className="overview-layout">
        <section className="attention-panel">
          <h3><AlertTriangle size={17} /> What Needs Attention</h3>
          {attention.length ? attention.map((item) => (
            <button key={item.title} onClick={() => onNavigate(item.panel)}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </button>
          )) : <p className="legend">No urgent settlement issues detected from the current snapshot.</p>}
        </section>
        <section className="detail-grid overview-details">
          {[
            ["Entity ID", claim.entityId],
            ["Region", `${claim.regionName ?? "Unknown"} (${claim.regionId ?? "?"})`],
            ["Empire", claim.empireName ?? "None"],
            ["Location", `${claim.locationX ?? "?"}, ${claim.locationZ ?? "?"}`],
            ["Members", `${members.length} total`],
            ["Market Listings", market.length],
            ["Region Online", regionStatus ? formatNumber(regionStatus.signedInPlayers) : "-"],
            ["Region Trade / Day", marketDay ? `${formatNumber(marketDay.totalValue)}g` : "-"],
            ["Recruitment Rules", recruitment.length ? `${recruitment.length} active` : "None"],
          ].map(([label, value]) => <Info key={label} label={label} value={value} />)}
        </section>
      </div>
      <WatchlistPanel data={data} watches={watches} onToggleWatch={onToggleWatch} onNavigate={onNavigate} />
    </div>
  );
}

function Info({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="info-row"><span>{label}</span><strong><LiveValue value={value ?? "-"} /></strong></div>;
}

function LiveValue({ value }: { value: React.ReactNode }) {
  const signature = String(value);
  const previous = React.useRef(signature);
  const [changed, setChanged] = React.useState<"" | "increased" | "decreased">("");
  const [visible, setVisible] = React.useState<React.ReactNode>(value);
  React.useEffect(() => {
    if (previous.current === signature) {
      setVisible(value);
      return;
    }
    const priorSignature = previous.current;
    previous.current = signature;
    const numeric = (entry: string) => {
      const match = entry.match(/^([\d,]+(?:\.\d+)?)(g)?$/);
      return match ? { amount: Number(match[1].replaceAll(",", "")), decimals: match[1].includes(".") ? match[1].split(".")[1].length : 0, suffix: match[2] ?? "" } : null;
    };
    const previousValue = numeric(priorSignature);
    const nextValue = numeric(signature);
    setChanged(previousValue && nextValue && nextValue.amount < previousValue.amount ? "decreased" : "increased");
    const timer = window.setTimeout(() => setChanged(""), 900);
    let frame = 0;
    if (previousValue && nextValue && previousValue.amount !== nextValue.amount) {
      const start = performance.now();
      const run = (time: number) => {
        const progress = Math.min(1, (time - start) / 380);
        const eased = 1 - Math.pow(1 - progress, 3);
        const amount = previousValue.amount + (nextValue.amount - previousValue.amount) * eased;
        setVisible(`${formatNumber(amount, nextValue.decimals)}${nextValue.suffix}`);
        if (progress < 1) frame = window.requestAnimationFrame(run);
        else setVisible(value);
      };
      frame = window.requestAnimationFrame(run);
    } else setVisible(value);
    return () => {
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [signature, value]);
  return <span className={`live-value ${changed}`}>{visible}</span>;
}

function TierBadge({ tier }: { tier: unknown }) {
  const value = toNumber(tier);
  if (value < 1 || value > 10) return <span>-</span>;
  return <span className={`tier-badge tier-${value}`}>T{value}</span>;
}

function ItemIcon({ item }: { item: AnyRecord }) {
  const url = bitjitaIconUrl(item);
  const [failed, setFailed] = React.useState(false);
  const fallback = String(item.name ?? "?").trim().slice(0, 2).toUpperCase();
  React.useEffect(() => setFailed(false), [url]);
  return (
    <span className="item-thumb" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{fallback}</span>}
    </span>
  );
}

function ItemLabel({ item, name, meta }: { item: AnyRecord; name?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <span className="item-label">
      <ItemIcon item={item} />
      <span>
        <strong>{name ?? item.name ?? item.itemName ?? "Unknown"}</strong>
        {meta ? <small className="muted-line">{meta}</small> : null}
      </span>
    </span>
  );
}

function TierMaterialIcon({ item, tier }: { item: AnyRecord; tier: unknown }) {
  const value = toNumber(tier);
  if (value < 1 || value > 10) return <b>Other</b>;
  return (
    <span className={`tier-framed tier-${value}`} title={`Tier ${value}`}>
      <ItemIcon item={item} />
      <b>T{value}</b>
    </span>
  );
}

function WatchlistPanel({ data, watches, onToggleWatch, onNavigate }: { data: ReturnType<typeof normalizeData>; watches: WatchEntry[]; onToggleWatch: (watch: WatchEntry) => void; onNavigate: (panel: ActivePanel, marketTab?: string) => void }) {
  const [marketValues, setMarketValues] = React.useState<Record<string, AnyRecord>>({});
  const materials = CORE_MATERIAL_GROUPS.map((group) => {
    const itemLookup = new Map([...(data.inventories.items ?? []), ...(data.inventories.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
    const quantity = (data.inventories.buildings ?? []).flatMap((building: AnyRecord) => building.inventory ?? []).reduce((total: number, slot: AnyRecord) => {
      const item = itemLookup.get(String(slot.contents?.item_id)) ?? {};
      return group.matcher(item) ? total + toNumber(slot.contents?.quantity) : total;
    }, 0);
    return { group, quantity };
  });
  React.useEffect(() => {
    const selected = watches.filter((watch) => watch.type === "market" && watch.itemId);
    if (!selected.length) return;
    const controller = new AbortController();
    Promise.all(selected.map(async (watch) => {
      const type = watch.itemType === 1 ? "cargo" : "items";
      const response = await fetch(`${API}/market/${type}/${watch.itemId}/price-history?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(data.claim.regionId ?? "19"))}`, { signal: controller.signal });
      return [watch.id, response.ok ? await response.json() : null] as const;
    })).then((values) => setMarketValues(Object.fromEntries(values))).catch(() => undefined);
    return () => controller.abort();
  }, [data.claim.regionId, watches]);
  const isWatched = (id: string) => watches.some((watch) => watch.id === id);
  return (
    <section className="watchlist-panel">
      <div className="split-header">
        <h3><Pin size={17} /> Watchlist</h3>
        <div className="watch-add">
          {materials.map(({ group }) => {
            const watch = { id: `material-${group.label}`, type: "material" as const, label: group.label };
            return <button key={group.label} className={isWatched(watch.id) ? "active" : ""} onClick={() => onToggleWatch(watch)} title={`${isWatched(watch.id) ? "Remove" : "Pin"} ${group.label}`}>{group.label}</button>;
          })}
        </div>
      </div>
      {!watches.length ? <p className="legend">Pin a core material here or pin a market item in Price Finder to monitor it from Overview.</p> : (
        <div className="watch-grid">
          {watches.map((watch) => {
            const material = materials.find((entry) => `material-${entry.group.label}` === watch.id);
            const price = marketValues[watch.id]?.priceStats?.avg24h ?? marketValues[watch.id]?.priceStats?.avg7d;
            return (
              <article key={watch.id}>
                <button className="watch-remove" onClick={() => onToggleWatch(watch)} title="Remove from watchlist"><PinOff size={13} /></button>
                <span>{watch.type === "market" ? "Market price" : watch.type === "craft" ? "Production" : "Inventory"}</span>
                <strong>{watch.label}</strong>
                <b>{watch.type === "material" ? formatNumber(material?.quantity ?? 0) : watch.type === "market" ? (price == null ? "No recent sales" : `${formatNumber(Math.round(price))}g avg`) : "Tracked craft"}</b>
                <button className="watch-link" onClick={() => {
                  if (watch.type === "market") {
                    updateQueryState({ item: watch.itemId ?? null, itemName: watch.label, itemType: String(watch.itemType ?? 0), region: String(data.claim.regionId ?? "19") });
                    onNavigate("market", "pricing");
                  } else onNavigate(watch.type === "craft" ? "production" : "inventory");
                }}>View</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Members({ data, selectedMemberId, onSelectMember }: { data: ReturnType<typeof normalizeData>; selectedMemberId: string; onSelectMember: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<AnyRecord | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const citizenMap = new Map(data.citizens.map((c) => [String(c.userName ?? c.username ?? ""), c]));
  const playerMap = new Map(data.players.map((p) => [String(p.username ?? ""), p]));
  const merged: AnyRecord[] = data.members.map((member: AnyRecord) => {
    const username = member.userName ?? member.username ?? "";
    return {
      ...member,
      username,
      citizen: citizenMap.get(String(username)) ?? null,
      player: playerMap.get(String(username)) ?? null,
    };
  });
  const filtered = merged.filter((member) => String(member.username).toLowerCase().includes(searchTerm.toLowerCase()));
  const onlineCount = merged.filter((member) => member.player?.signedIn).length;
  const selectedMember = merged.find((member) => String(member.playerEntityId) === selectedId);
  React.useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      return;
    }
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);
    Promise.all([
      fetch(`${API}/players/${selectedId}/buffs`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/equipment`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/equipment/presets`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/inventories`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/housing`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/passive-crafts?status=all`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/market-collections`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/traveler-tasks`, { signal: controller.signal }).then((response) => response.json()),
    ]).then(([buffs, equipment, equipmentPresetData, inventories, housing, passiveCrafts, collections, tasks]) => {
      setProfile({ buffs, equipment, equipmentPresets: equipmentPresetData, inventories, housing, passiveCrafts, collections, tasks });
    }).catch((error) => {
      if (!controller.signal.aborted) setProfileError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!controller.signal.aborted) setProfileLoading(false);
    });
    return () => controller.abort();
  }, [selectedId]);
  const passiveCraftSummaries = profile ? summarizePassiveCrafts(profile.passiveCrafts) : [];
  const currentEquipmentSlots = profile ? equipmentSlots(profile.equipment) : [];
  const gearPresets = profile ? equipmentPresets(profile.equipmentPresets, currentEquipmentSlots) : [];
  const activeGearSlots = gearPresets.find((preset) => preset.active)?.slots ?? currentEquipmentSlots;

  return (
    <div className="panel">
      <div className="split-header">
        <Header title="Settlement Roster">Member permissions and online status</Header>
        <p className="online-summary"><strong>{onlineCount} online</strong> / {merged.length} members</p>
      </div>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search username" />
        <span>{filtered.length} members found</span>
      </div>
      <DataTable
        rows={filtered}
        onRowClick={(member) => { setSelectedId(String(member.playerEntityId)); trackAnalyticsEvent("member_details_opened"); }}
        rowClassName={(member) => String(member.playerEntityId) === selectedId ? "selected-row" : "clickable-row"}
        columns={[
          ["", (m) => <span className={`online-dot ${m.player?.signedIn ? "is-online" : ""}`} title={m.player?.signedIn ? `Online ${formatDuration(m.player.sessionSeconds)}` : "Offline"} />],
          ["Username", (m) => <strong>{m.username}</strong>],
          ["Role", (m) => <span className={`role-badge ${m.coOwnerPermission ? "owner" : m.officerPermission ? "officer" : ""}`}>{m.coOwnerPermission ? "Co-owner" : m.officerPermission ? "Officer" : "Member"}</span>],
          ["Total Levels", (m) => formatNumber(m.citizen?.totalLevel ?? m.citizen?.totalSkillLevel)],
          ["Session / Last Login", (m) => m.player?.signedIn ? <span className="online-text">Playing {formatDuration(m.player.sessionSeconds)}</span> : timeAgo(m.lastLoginTimestamp)],
          ["Permissions", (m) => <span className="permission-icons"><Hammer className={m.buildPermission ? "enabled" : ""} /><Package className={m.inventoryPermission ? "enabled blue" : ""} /></span>],
          ["Details", (m) => <button className="mini-action" onClick={(event) => { event.stopPropagation(); setSelectedId(String(m.playerEntityId)); onSelectMember(String(m.playerEntityId)); trackAnalyticsEvent("member_details_opened"); }}>View</button>],
        ]}
      />
      {selectedMember ? (
        <section className="member-detail">
          <div className="split-header">
            <h3><User size={17} /> {selectedMember.username} Public Profile</h3>
            <div className="profile-actions">
              <button className={`mini-action ${selectedMemberId === selectedId ? "active" : ""}`} onClick={() => onSelectMember(selectedMemberId === selectedId ? "All" : String(selectedMember.playerEntityId))}><Factory size={13} /> {selectedMemberId === selectedId ? "Clear Production Filter" : "Use for Production"}</button>
              <button className="mini-action" onClick={() => setSelectedId(null)}>Close</button>
            </div>
          </div>
          {profileLoading ? <p className="legend">Loading public player data...</p> : profileError ? <p className="error">{profileError}</p> : profile ? (
            <>
              <div className="metric-grid">
                <MiniStat icon={<Activity />} label="Active Buffs" value={(profile.buffs.buffs ?? []).length} />
                <MiniStat icon={<Wrench />} label="Toolbelt Tools" value={playerToolbeltTools(profile.inventories).length} />
                <MiniStat icon={<Shield />} label="Active Gear" value={equippedCount(activeGearSlots)} />
                <MiniStat icon={<Home />} label="Housing" value={(profile.housing ?? []).length} />
              </div>
              <section className="equipment-panel">
                <h3><Wrench size={17} /> Toolbelt Tools</h3>
                <div className="equipment-grid">
                  {playerToolbeltTools(profile.inventories).map((item: AnyRecord) => (
                    <article className="equipment-card" key={item.id}>
                      <small>{item.inventoryName}</small>
                      <div className="equipment-card-main">
                        <ItemIcon item={item} />
                        <strong>{item.name}</strong>
                        {item.tier ? <TierBadge tier={item.tier} /> : null}
                      </div>
                      <span className="item-meta-line">{item.tag ?? "Tool"}{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.quantity > 1 ? `${formatNumber(item.quantity)} held` : ""}</span>
                      {item.toolPower ? <p>Power {formatNumber(item.toolPower)} - removes {formatNumber(item.toolPower)} effort per action</p> : null}
                    </article>
                  ))}
                </div>
                {playerToolbeltTools(profile.inventories).length === 0 ? <p className="legend">No profession tools in this member's public Toolbelt inventory.</p> : null}
              </section>
              <section className="equipment-panel">
                <div className="profile-section-heading">
                  <h3><Shield size={17} /> Gear Presets</h3>
                  <span>2 preset slots</span>
                </div>
                <div className="gear-preset-list">
                  {gearPresets.map((preset) => {
                    const filledSlots = preset.slots.filter((slot: AnyRecord) => slot.item);
                    const displaySlots = visibleEquipmentSlots(preset.slots);
                    return (
                      <article className={`gear-preset ${preset.active ? "active" : ""}`} key={preset.id}>
                        <div className="gear-preset-header">
                          <strong>{preset.label}</strong>
                          <span>{preset.active ? "Current" : preset.reported ? `${formatNumber(filledSlots.length)} equipped` : "Not reported"}</span>
                        </div>
                        <div className="equipment-grid">
                          {displaySlots.map((slot: AnyRecord, index: number) => (
                            <article className={`equipment-card ${slot.item ? "" : "empty-slot"}`} key={`${preset.id}-${slot.primary ?? slot.secondary ?? slot.item?.id ?? index}`}>
                              <small>{formatEquipmentSlot(slot.primary)}</small>
                              {slot.item ? (
                                <>
                                  <div className="equipment-card-main">
                                    <ItemIcon item={slot.item} />
                                    <strong>{slot.item.name}</strong>
                                    {slot.item.tier ? <TierBadge tier={slot.item.tier} /> : null}
                                  </div>
                                  <span className="item-meta-line">{slot.item.tags ?? "Equipment"}{slot.item.rarityString ? <RarityBadge rarity={slot.item.rarityString} /> : null}</span>
                                  {(slot.item.stats ?? []).length ? <p>{slot.item.stats.slice(0, 3).map((stat: AnyRecord) => `${stat.name} ${formatNumber(stat.value, 2)}${stat.suffix ?? ""}`).join(" | ")}</p> : null}
                                </>
                              ) : (
                                <div className="equipment-card-main">
                                  <span className="empty-slot-icon"><Shield size={15} /></span>
                                  <strong>Empty</strong>
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                        {!preset.reported ? <p className="legend">BitJita has not reported gear for this preset slot, so empty visible slots are shown as placeholders.</p> : null}
                      </article>
                    );
                  })}
                </div>
                {!gearPresets.length ? <p className="legend">No equipped gear reported by the API.</p> : null}
              </section>
              <div className="two-col public-profile-grid">
                <section className="profile-history-panel">
                  <div className="profile-section-heading">
                    <h3><Factory size={17} /> Passive Crafts</h3>
                    <span>{formatNumber((profile.passiveCrafts.craftResults ?? []).length)} records</span>
                  </div>
                  <div className="passive-craft-list">
                    {passiveCraftSummaries.map((craft) => (
                      <article className="passive-craft-card" key={`${craft.recipe}-${craft.structure}-${craft.status}`}>
                        <div>
                          <strong>{craft.recipe}</strong>
                          {craft.tier ? <TierBadge tier={craft.tier} /> : null}
                        </div>
                        <p>
                          <span className={`status-pill ${craft.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(craft.status)}</span>
                          <b>{formatNumber(craft.quantity)} crafted</b>
                        </p>
                        <small>{craft.structure} - {timeAgo(craft.timestamp)}</small>
                      </article>
                    ))}
                    {!passiveCraftSummaries.length ? <p className="legend">No passive crafts reported for this member.</p> : null}
                  </div>
                </section>
                <section className="profile-history-panel">
                  <h3><Star size={17} /> Quests</h3>
                  <DataTable rows={(profile.tasks.tasks ?? []).slice(0, 8)} columns={[
                    ["Quest", (row) => row.description ?? "-"],
                    ["Status", (row) => row.completed ? "Complete" : "Open"],
                  ]} />
                </section>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Skills({ data }: { data: ReturnType<typeof normalizeData> }) {
  type SortKey = "name" | "total" | "highest" | number;
  const [searchTerm, setSearchTerm] = React.useState("");
  const [focusSkill, setFocusSkill] = usePersistedState<number>("skills.focus", PROFESSION_IDS[0]);
  const [sortKey, setSortKey] = usePersistedState<SortKey>("skills.sort", "total");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("skills.direction", "desc");
  const citizens = data.citizens;
  const professionRows = bitjitaSkillRows(data.skills, "Profession");
  const adventureRows = bitjitaSkillRows(data.skills, "Adventure");
  const professionIds = professionRows.length ? professionRows.map((skill) => toNumber(skill.id)).filter(Boolean) : PROFESSION_IDS;
  const adventureSkillIds = adventureRows.length ? adventureRows.map((skill) => toNumber(skill.id)).filter(Boolean) : ADVENTURE_SKILL_IDS;
  const skillLabel = (id: number) => skillNameFromRows([...professionRows, ...adventureRows], id);
  const focusedProfession = professionIds.includes(focusSkill) ? focusSkill : professionIds[0];
  const getName = (c: AnyRecord) => c.userName ?? c.username ?? "Unknown";
  const getSkill = (c: AnyRecord, id: number) => toNumber(c.skills?.[String(id)]);
  const getTotal = (c: AnyRecord) => professionIds.reduce((total, id) => total + getSkill(c, id), 0);
  const getHighest = (c: AnyRecord) => Math.max(...professionIds.map((id) => getSkill(c, id)), 0);
  React.useEffect(() => {
    if (focusSkill !== focusedProfession) setFocusSkill(focusedProfession);
  }, [focusSkill, focusedProfession, setFocusSkill]);
  React.useEffect(() => {
    if (typeof sortKey === "number" && !professionIds.includes(sortKey)) setSortKey("total");
  }, [professionIds, sortKey, setSortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => dir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = citizens.filter((citizen) => getName(citizen).toLowerCase().includes(searchTerm.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "name") {
      return sortDir === "asc" ? getName(a).localeCompare(getName(b)) : getName(b).localeCompare(getName(a));
    }
    const va = sortKey === "total" ? getTotal(a) : sortKey === "highest" ? getHighest(a) : getSkill(a, sortKey);
    const vb = sortKey === "total" ? getTotal(b) : sortKey === "highest" ? getHighest(b) : getSkill(b, sortKey);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  const settlementTotalLevel = citizens.reduce((sum, c) => sum + getTotal(c), 0);
  const settlementBest = Math.max(...citizens.map(getHighest), 0);
  const averageTotal = citizens.length ? settlementTotalLevel / citizens.length : 0;
  const topMember = [...citizens].sort((a, b) => getTotal(b) - getTotal(a))[0];
  const topMemberName = topMember ? getName(topMember) : "-";
  const focusRows = [...citizens].sort((a, b) => getSkill(b, focusedProfession) - getSkill(a, focusedProfession)).slice(0, 5);
  const focusAverage = citizens.length ? citizens.reduce((sum, c) => sum + getSkill(c, focusedProfession), 0) / citizens.length : 0;
  const focusTier = Math.max(...citizens.map((c) => skillTier(getSkill(c, focusedProfession))), 0);
  const focusT3 = citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) >= 3).length;
  const focusT5 = citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) >= 5).length;
  const summarizeCoverage = (ids: number[]) => ids.map((id) => {
    const levels = citizens.map((c) => getSkill(c, id));
    const max = Math.max(...levels, 0);
    const avg = citizens.length ? levels.reduce((sum, level) => sum + level, 0) / citizens.length : 0;
    const tier = skillTier(max);
    const specialists = levels.filter((level) => skillTier(level) >= 5).length;
    return { id, name: skillLabel(id), max, avg, tier, specialists };
  }).sort((a, b) => b.max - a.max || b.avg - a.avg);
  const coverage = summarizeCoverage(professionIds);
  const adventureSkills = summarizeCoverage(adventureSkillIds);
  const sortIcon = (key: SortKey) => sortKey !== key ? <ArrowUpDown size={11} /> : sortDir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />;

  return (
    <div className="panel">
      <Header title="Member Professions">{citizens.length} citizens - {professionIds.length} professions tracked separately from adventure skills</Header>
      <div className="summary-grid skills-summary">
        <MiniStat icon={<TrendingUp />} label="Profession Levels" value={formatNumber(settlementTotalLevel)} />
        <MiniStat icon={<Star />} label="Highest Profession" value={settlementBest} />
        <MiniStat icon={<Activity />} label="Avg Profession Total" value={formatNumber(averageTotal, 1)} />
        <MiniStat icon={<Swords />} label="Top Professional" value={topMemberName} />
      </div>
      <div className="skills-dashboard">
        <section className="focus-panel">
          <div className="split-header">
            <h3><Star size={17} /> Profession Focus</h3>
            <select className="select-control" value={focusedProfession} onChange={(event) => setFocusSkill(Number(event.target.value))}>
              {professionIds.map((id) => <option key={id} value={id}>{skillLabel(id)}</option>)}
            </select>
          </div>
          <div className="focus-metrics">
            <Info label="Average level" value={formatNumber(focusAverage, 1)} />
            <Info label="Best tier" value={focusTier ? <TierBadge tier={focusTier} /> : "-"} />
            <Info label="T3+" value={`${focusT3} members`} />
            <Info label="T5+" value={`${focusT5} members`} />
          </div>
          <div className="focus-list">
            {focusRows.map((citizen) => {
              const level = getSkill(citizen, focusedProfession);
              return <div key={citizen.entityId ?? getName(citizen)}><span>{getName(citizen)}</span><strong>Lv {level}</strong></div>;
            })}
          </div>
        </section>
        <section className="coverage-panel">
          <h3><Swords size={17} /> Profession Coverage</h3>
          <div className="coverage-list">
            {coverage.slice(0, 8).map((skill) => (
              <button key={skill.id} className={focusedProfession === skill.id ? "active" : ""} onClick={() => setFocusSkill(skill.id)}>
                <span>{skill.name}</span>
                <b>{skill.tier ? <><TierBadge tier={skill.tier} /> <span>/ Lv {skill.max}</span></> : "-"}</b>
                <small>Avg {formatNumber(skill.avg, 1)} - {skill.specialists} at T5+</small>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="adventure-skills-panel">
        <div className="split-header">
          <h3><Activity size={17} /> Skills</h3>
          <p className="legend">Adventure skills are tracked separately from professions.</p>
        </div>
        <div className="adventure-skill-grid">
          {adventureSkills.map((skill) => (
            <article key={skill.id}>
              <span>{skill.name}</span>
              <b>{skill.tier ? <TierBadge tier={skill.tier} /> : "-"} <small>Best Lv {skill.max}</small></b>
              <em>Settlement average {formatNumber(skill.avg, 1)}</em>
            </article>
          ))}
        </div>
      </section>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search members" />
        <span>{sorted.length} shown</span>
      </div>
      <div className="heatmap-wrap">
        <table className="skill-table">
          <thead>
            <tr>
              <th className="sticky-col clickable" onClick={() => toggleSort("name")}>Member {sortIcon("name")}</th>
              <th className="clickable numeric summary-header" onClick={() => toggleSort("total")}><span>Total Levels</span>{sortIcon("total")}</th>
              <th className="clickable numeric summary-header" onClick={() => toggleSort("highest")}><span>Best Level</span>{sortIcon("highest")}</th>
              {professionIds.map((id) => (
                <th key={id} className={`clickable profession-header ${sortKey === id ? "sorted" : ""}`} onClick={() => toggleSort(id)}>
                  <span>{skillLabel(id)}</span>{sortIcon(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((citizen, index) => {
              const name = getName(citizen);
              return (
                <tr key={citizen.entityId ?? name ?? index}>
                  <td className="sticky-col member-cell">{name}</td>
                  <td className="numeric">{formatNumber(getTotal(citizen))}</td>
                  <td className="numeric best">{getHighest(citizen)}</td>
                  {professionIds.map((id) => {
                    const level = getSkill(citizen, id);
                    return <td key={id} className={`skill-cell ${levelClass(level)}`} style={skillStyle(level)} title={`${name} - ${skillLabel(id)}: Lv ${level} (${skillTierLabel(level)})`}>{level > 0 ? level : "-"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col member-cell">Settlement Max</td>
              <td className="numeric">-</td>
              <td className="numeric best">{settlementBest}</td>
              {professionIds.map((id) => {
                const max = Math.max(...citizens.map((c) => getSkill(c, id)), 0);
                return <td key={id} className={`skill-cell ${levelClass(max)}`} style={skillStyle(max)} title={`${skillLabel(id)} max: Lv ${max} (${skillTierLabel(max)})`}>{max > 0 ? max : "-"}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="legend tier-legend">Profession tiers: <span className="lvl0">0</span> {Object.keys(TIER_COLORS).map((tier) => <TierBadge key={tier} tier={tier} />)} - cells show exact level, hover for tier</p>
    </div>
  );
}

function MiniStat({ icon, label, value, title }: { icon: React.ReactNode; label: string; value: React.ReactNode; title?: string }) {
  return <div className="mini-stat" title={title}><div>{icon}</div><span>{label}</span><strong><LiveValue value={value} /></strong></div>;
}

function skillStyle(level: number): React.CSSProperties {
  const tier = skillTier(level);
  const color = TIER_COLORS[tier];
  if (!color) return {};
  const textColor = tier === 9 ? "#c7c7c7" : tier === 10 ? "#deffff" : color;
  return { backgroundColor: `${color}${tier === 9 ? "55" : "25"}`, color: textColor };
}

function skillTier(level: number): number {
  if (level <= 0) return 0;
  if (level < 20) return 1;
  return Math.min(10, Math.floor(level / 10));
}

function skillTierLabel(level: number): string {
  const tier = skillTier(level);
  if (!tier) return "No tier";
  const low = tier === 1 ? 0 : tier * 10;
  const high = tier === 10 ? 100 : tier * 10 - 1;
  return `T${tier} (${low}-${high})`;
}

function levelClass(level: number): string {
  const tier = skillTier(level);
  if (tier <= 0) return "lvl0";
  if (tier <= 2) return "lvl1";
  if (tier <= 5) return "lvl2";
  if (tier <= 8) return "lvl3";
  return "lvl4";
}

function getRarityClass(rarity: unknown): string {
  switch (String(rarity ?? "").toLowerCase()) {
    case "legendary":
      return "legendary";
    case "epic":
      return "epic";
    case "rare":
      return "rare";
    case "uncommon":
      return "uncommon";
    default:
      return "";
  }
}

function Buildings({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [category, setCategory] = usePersistedState("structures.category", "All");
  const [tier, setTier] = usePersistedState("structures.tier", "All");
  const [sort, setSort] = usePersistedState("structures.sort", "name");
  const [selectedStructure, setSelectedStructure] = React.useState<AnyRecord | null>(null);
  const [structureDetail, setStructureDetail] = React.useState<AnyRecord | null>(null);
  const categories = ["All", "Crafting", "Refining", "Storage", "Housing", "Trade", "Core", "Utility", "Decoration"];
  const tiers = ["All", "1", "2", "3", "4", "5"];
  const buildings = data.buildings.map(normalizeBuilding);
  const filtered = buildings
    .filter((building) => {
      const text = `${building.name} ${building.nickname}`.toLowerCase();
      if (searchTerm && !text.includes(searchTerm.toLowerCase())) return false;
      if (category !== "All" && building.category !== category) return false;
      if (tier !== "All" && String(building.tier ?? "") !== tier) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "tier") return toNumber(b.tier) - toNumber(a.tier);
      if (sort === "crafting") return b.craftingSlots - a.craftingSlots;
      if (sort === "storage") return b.storageSlots - a.storageSlots;
      return a.name.localeCompare(b.name);
    });
  const groupedBuildings = categories
    .filter((item) => item !== "All")
    .map((item) => ({ category: item, buildings: filtered.filter((building) => building.category === item) }))
    .filter((group) => group.buildings.length > 0);
  const stationSummary = [
    ["Craft", sum(buildings, "craftingSlots"), buildings.filter((building) => building.craftingSlots > 0).length],
    ["Refine", sum(buildings, "refiningSlots"), buildings.filter((building) => building.refiningSlots > 0).length],
    ["Store", sum(buildings, "storageSlots"), buildings.filter((building) => building.storageSlots > 0).length],
    ["Housing", sum(buildings, "housingSlots"), buildings.filter((building) => building.housingSlots > 0).length],
  ];
  React.useEffect(() => {
    if (!selectedStructure?.descriptionId) {
      setStructureDetail(null);
      return;
    }
    const controller = new AbortController();
    fetch(`${API}/buildings/${selectedStructure.descriptionId}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`structure detail HTTP ${response.status}`)))
      .then(setStructureDetail)
      .catch(() => { if (!controller.signal.aborted) setStructureDetail(null); });
    return () => controller.abort();
  }, [selectedStructure?.descriptionId]);

  return (
    <div className="panel structures-panel">
      <div className="structure-hero">
        <Header title="Structures">Settlement capacity and operational stations</Header>
        <div className="structure-total"><strong>{buildings.length}</strong><span>structures built</span></div>
      </div>
      <div className="capacity-strip">
        {stationSummary.map(([label, slots, count]) => <div key={label}><strong>{formatNumber(slots)}</strong><span>{label} slots</span><small>{formatNumber(count)} structure{toNumber(count) === 1 ? "" : "s"}</small></div>)}
        <div><strong>{formatNumber(sum(buildings, "tradeOrders"))}</strong><span>Trade slots</span><small>{buildings.filter((building) => building.tradeOrders > 0).length} structures</small></div>
      </div>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search structures" />
        <Segmented options={categories} value={category} onChange={setCategory} />
        <Segmented options={tiers} value={tier} onChange={setTier} label="Tier" />
        <select className="select-control" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="name">Name</option>
          <option value="tier">Tier</option>
          <option value="crafting">Crafting Slots</option>
          <option value="storage">Storage Slots</option>
        </select>
      </div>
      {selectedStructure && structureDetail?.building ? (
        <section className="structure-detail">
          <div className="split-header">
            <h3><Home size={17} /> {selectedStructure.name}</h3>
            <button className="mini-action" onClick={() => setSelectedStructure(null)}>Close</button>
          </div>
          <div className="detail-grid">
            <Info label="Maximum health" value={formatNumber(structureDetail.building.maxHealth)} />
            <Info label="Maintenance" value={formatNumber(structureDetail.building.maintenance)} />
            <Info label="Defense level" value={formatNumber(structureDetail.building.defenseLevel)} />
            <Info label="Construction inputs" value={(structureDetail.itemInfo ?? []).length + (structureDetail.cargoInfo ?? []).length} />
          </div>
        </section>
      ) : null}
      <div className="building-sections">
        {groupedBuildings.map((group) => (
          <section className="building-section" key={group.category}>
            <h3><span className={`category-dot ${group.category.toLowerCase()}`} />{group.category}<small>{group.buildings.length}</small></h3>
            <div className="building-grid">
              {group.buildings.map((building) => (
                <article className="building-card" key={building.entityId}>
                  <header><strong>{building.name}</strong>{building.tier ? <TierBadge tier={building.tier} /> : null}</header>
                  {building.nickname ? <p>"{building.nickname}"</p> : null}
                  <div className="slot-row">
                    <Slot icon={<Hammer />} label="craft" value={building.craftingSlots} />
                    <Slot icon={<Flame />} label="refine" value={building.refiningSlots} />
                    <Slot icon={<Package />} label="store" value={building.storageSlots} />
                    <Slot icon={<Package />} label="cargo" value={building.cargoSlots} />
                    <Slot icon={<Bed />} label="house" value={building.housingSlots} />
                    <Slot icon={<ShoppingBag />} label="trade" value={building.tradeOrders} />
                    {building.terraformCapable ? <Slot icon={<MapIcon />} label="terraform" value={1} /> : null}
                  </div>
                  {building.descriptionId ? <button className="mini-action" onClick={() => setSelectedStructure(building)}>API Details</button> : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function inferTierNumber(item: AnyRecord): number | null {
  const icon = String(item.iconAssetName ?? "");
  const match = icon.match(/T(10|[1-9])/i);
  return match ? Number(match[1]) : item.tier ? Number(item.tier) : null;
}

function normalizeBuilding(building: AnyRecord) {
  const fn = building.functions?.[0] ?? {};
  const normalized = {
    entityId: String(building.entityId ?? building.buildingEntityId ?? building.name),
    descriptionId: building.buildingDescriptionId ?? building.descriptionId ?? null,
    name: String(building.name ?? building.buildingName ?? "Unknown"),
    nickname: building.nickname ?? building.buildingNickname ?? null,
    tier: inferTierNumber(building),
    craftingSlots: toNumber(building.craftingSlots ?? fn.crafting_slots),
    refiningSlots: toNumber(building.refiningSlots ?? fn.refining_slots),
    storageSlots: toNumber(building.storageSlots ?? fn.storage_slots),
    cargoSlots: toNumber(building.cargoSlots ?? fn.cargo_slots),
    housingSlots: toNumber(building.housingSlots ?? fn.housing_slots),
    tradeOrders: toNumber(building.tradeOrders ?? fn.trade_orders),
    terraformCapable: Boolean(building.terraformCapable ?? fn.terraform),
    category: "Utility",
  };
  normalized.category = getBuildingCategory(normalized);
  return normalized;
}

function getBuildingCategory(building: ReturnType<typeof normalizeBuilding>): string {
  const name = building.name.toLowerCase();
  if (building.storageSlots > 0) return "Storage";
  if (building.housingSlots > 0) return "Housing";
  if (building.tradeOrders > 0) return "Trade";
  if (building.refiningSlots > 0) return "Refining";
  if (building.craftingSlots > 0) return "Crafting";
  if (name.includes("totem") || name.includes("settlement")) return "Core";
  if (name.includes("statue") || name.includes("shrine")) return "Decoration";
  return "Utility";
}

function sum(rows: Array<Record<string, any>>, key: string): number {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0);
}

function getOwnerName(row: AnyRecord): string {
  return String(row.ownerPlayerUsername ?? row.ownerUsername ?? row.ownerName ?? row.owner ?? row.empireName ?? "-");
}

function Slot({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  if (!value) return null;
  return <span className="slot-chip">{icon}<strong>{value}</strong>{label}</span>;
}

function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="segmented" aria-label={label}>
      {label ? <span>{label}:</span> : null}
      {options.map((option) => <button key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  );
}

const CORE_MATERIAL_GROUPS = [
  { label: "Ingots", matcher: (row: AnyRecord) => /^(?:Refined )?Ingot$/i.test(String(row.tag ?? "")) },
  { label: "Planks", matcher: (row: AnyRecord) => /^(?:Refined )?Plank$/i.test(String(row.tag ?? "")) },
  { label: "Bricks", matcher: (row: AnyRecord) => /^(?:Refined )?Brick$/i.test(String(row.tag ?? "")) && !/^Unfired /i.test(String(row.name ?? "")) },
  { label: "Leather", matcher: (row: AnyRecord) => /^(?:Refined )?Leather$/i.test(String(row.tag ?? "")) },
  { label: "Cloth", matcher: (row: AnyRecord) => /^(?:Refined )?Cloth$/i.test(String(row.tag ?? "")) },
] as const;

function Inventory({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [q, setQ] = React.useState("");
  const [containerQ, setContainerQ] = React.useState("");
  const [type, setType] = usePersistedState("inventory.type", "All");
  const [tier, setTier] = usePersistedState("inventory.tier", "All");
  const [rarity, setRarity] = usePersistedState("inventory.rarity", "All");
  const [buildingFilter, setBuildingFilter] = usePersistedState("inventory.container", "All");
  const [coreMaterialFilter, setCoreMaterialFilter] = usePersistedState("inventory.core-material", "All");
  const [nonEmptyOnly, setNonEmptyOnly] = usePersistedState("inventory.non-empty", true);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [itemDetail, setItemDetail] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    if (!selectedItem?.itemId) {
      setItemDetail(null);
      return;
    }
    const controller = new AbortController();
    const resource = selectedItem.type === "Cargo" ? "cargo" : "items";
    fetch(`${API}/${resource}/${selectedItem.itemId}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`item detail HTTP ${response.status}`)))
      .then(setItemDetail)
      .catch(() => { if (!controller.signal.aborted) setItemDetail(null); });
    return () => controller.abort();
  }, [selectedItem?.itemId, selectedItem?.type]);
  const itemLookup = new Map([...(data.inventories.items ?? []), ...(data.inventories.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const containers = ((data.inventories.buildings ?? []) as AnyRecord[]).map((building) => {
    const items = (building.inventory ?? []).map((slot: AnyRecord, index: number) => {
      const contents = slot.contents ?? {};
      const lookup = itemLookup.get(String(contents.item_id)) ?? {};
      return {
        id: `${building.entityId}-${contents.item_id}-${slot.slot ?? index}`,
        building: building.buildingNickname ?? building.buildingName,
        itemId: contents.item_id == null ? null : String(contents.item_id),
        name: lookup.name ?? `Item #${contents.item_id ?? "?"}`,
        iconAssetName: lookup.iconAssetName,
        quantity: contents.quantity,
        type: contents.item_type === "cargo" ? "Cargo" : "Item",
        tier: lookup.tier,
        rarity: lookup.rarityStr,
        tag: lookup.tag,
      };
    });
    return {
      id: String(building.entityId ?? building.buildingName),
      name: building.buildingNickname ?? building.buildingName ?? "Unknown Container",
      locked: Boolean(building.locked),
      items,
    };
  });
  const allRows = containers.flatMap((container) => container.items);
  const materialSummary: AnyRecord[] = CORE_MATERIAL_GROUPS.map((group): AnyRecord => {
    const matches = allRows.filter((row: AnyRecord) => group.matcher(row));
    const quantity = matches.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
    const containerCount = new Set(matches.map((row: AnyRecord) => row.building).filter(Boolean)).size;
    const tierBreakdown = Object.values(matches.reduce((acc: Record<string, AnyRecord>, row: AnyRecord) => {
      const tierNumber = toNumber(row.tier);
      const tierLabel = tierNumber > 0 ? `T${tierNumber}` : "Other";
      const current = acc[tierLabel] ?? { tierLabel, tier: tierNumber, quantity: 0, item: row };
      current.quantity += toNumber(row.quantity);
      if (!current.item?.iconAssetName && row.iconAssetName) current.item = row;
      acc[tierLabel] = current;
      return acc;
    }, {})).sort((a: AnyRecord, b: AnyRecord) => {
      if (a.tierLabel === "Other") return 1;
      if (b.tierLabel === "Other") return -1;
      return toNumber(a.tier) - toNumber(b.tier);
    });
    return { label: group.label, quantity, containerCount, tierBreakdown };
  });
  const selectedCoreMaterial = CORE_MATERIAL_GROUPS.find((group) => group.label === coreMaterialFilter);
  const filteredContainers = containers.map((container) => ({
    ...container,
    items: container.items.filter((row: AnyRecord) => {
      if (selectedCoreMaterial && !selectedCoreMaterial.matcher(row)) return false;
      if (q && !row.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (type !== "All" && row.type !== type) return false;
      if (tier !== "All" && String(row.tier) !== tier) return false;
      if (rarity !== "All" && row.rarity !== rarity) return false;
      if (buildingFilter !== "All" && row.building !== buildingFilter) return false;
      return true;
    }),
  })).filter((container) => {
    if (containerQ && !container.name.toLowerCase().includes(containerQ.toLowerCase())) return false;
    if (selectedCoreMaterial && container.items.length === 0) return false;
    if (nonEmptyOnly && container.items.length === 0) return false;
    return true;
  });
  const rows = filteredContainers.flatMap((container) => container.items);
  const buildings = unique(allRows.map((row: AnyRecord) => String(row.building)).filter(Boolean));
  const tiers = unique(allRows.map((row: AnyRecord) => String(row.tier)).filter((value: string) => value && value !== "undefined" && value !== "-1" && value !== "0"));
  const rarities = unique(allRows.map((row: AnyRecord) => String(row.rarity)).filter((value: string) => value && value !== "undefined" && value !== "Default"));
  const totalItems = rows.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
  const occupiedContainers = containers.filter((container) => container.items.length > 0).length;
  return (
    <div className="panel">
      <Header title="Inventory & Storage">{containers.length} containers - {rows.length} visible stacks</Header>
      <div className="metric-grid">
        <MiniStat icon={<Package />} label="Total Items" value={formatNumber(totalItems)} />
        <MiniStat icon={<Box />} label="Unique Items" value={unique(rows.map((row: AnyRecord) => String(row.name))).length} />
        <MiniStat icon={<Package />} label="Occupied Containers" value={occupiedContainers} />
        <MiniStat icon={<Building2 />} label="Containers" value={containers.length} />
      </div>
      <section className="material-watch">
        <div className="split-header">
          <h3><Package size={17} /> Core Materials</h3>
          <p className="legend">Finished material stock only. Raw ingredients and intermediate inputs are excluded.</p>
        </div>
        <div className="material-watch-grid">
          {materialSummary.map((group) => (
            <button
              type="button"
              className={`material-card ${group.quantity ? "" : "empty"} ${coreMaterialFilter === group.label ? "active" : ""}`}
              key={group.label}
              aria-pressed={coreMaterialFilter === group.label}
              onClick={() => setCoreMaterialFilter(coreMaterialFilter === group.label ? "All" : group.label)}
            >
              <span>{group.label}</span>
              <strong>{formatNumber(group.quantity)}</strong>
              <small>{group.containerCount ? `${group.containerCount} container${group.containerCount === 1 ? "" : "s"}` : "None stored"}</small>
              {group.tierBreakdown.length ? (
                <div className="material-tier-list">
                  {group.tierBreakdown.map((entry: AnyRecord) => <div key={entry.tierLabel}>{entry.tierLabel === "Other" ? <b>{entry.tierLabel}</b> : <TierMaterialIcon item={entry.item} tier={entry.tier} />}<em>{formatNumber(entry.quantity)}</em></div>)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      {selectedItem && itemDetail ? (
        <section className="item-detail">
          <div className="split-header">
            <h3><Package size={17} /> {selectedItem.name}</h3>
            <button className="mini-action" onClick={() => setSelectedItem(null)}>Close</button>
          </div>
          <div className="metric-grid">
            <MiniStat icon={<Factory />} label="Crafting Recipes" value={(itemDetail.craftingRecipes ?? []).length} />
            <MiniStat icon={<Wrench />} label="Used In Recipes" value={(itemDetail.recipesUsingItem ?? []).length} />
            <MiniStat icon={<TrendingUp />} label="Related Skills" value={(itemDetail.relatedSkills ?? []).length} />
            <MiniStat icon={<CircleDollarSign />} label="Market Data" value={itemDetail.marketStats ? "Available" : "None"} />
          </div>
          <div className="highlight-grid">
            {[...(itemDetail.craftingRecipes ?? []), ...(itemDetail.recipesUsingItem ?? [])].slice(0, 6).map((recipe: AnyRecord) => (
              <div key={recipe.id ?? recipe.name}><strong>{recipe.name ?? "Recipe"}</strong><span>{recipe.buildingName ?? "No station listed"}</span></div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="toolbar-row">
        {selectedCoreMaterial ? <button className="mini-action active" onClick={() => setCoreMaterialFilter("All")}><X size={13} /> {selectedCoreMaterial.label} only</button> : null}
        <SearchBox value={q} onChange={setQ} placeholder="Search for items" />
        <SearchBox value={containerQ} onChange={setContainerQ} placeholder="Search for containers" />
        <select className="select-control" value={type} onChange={(event) => setType(event.target.value)}>
          <option>All</option><option>Item</option><option>Cargo</option>
        </select>
        <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}>
          <option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}>
          <option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="select-control" value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
          <option>All</option>{buildings.map((value) => <option key={value}>{value}</option>)}
        </select>
        <label className="check-control"><input type="checkbox" checked={nonEmptyOnly} onChange={(event) => setNonEmptyOnly(event.target.checked)} /> Non-empty only</label>
      </div>
      <div className="container-list">
        {selectedCoreMaterial && filteredContainers.length === 0 ? <div className="empty-state"><Package />No containers match the {selectedCoreMaterial.label.toLowerCase()} filter.</div> : null}
        {filteredContainers.map((container) => {
          const quantity = container.items.reduce((total: number, item: AnyRecord) => total + toNumber(item.quantity), 0);
          return (
            <details className="container-card" key={container.id} open={filteredContainers.length <= 4}>
              <summary>
                <span><Package size={16} /> <strong>{container.name}</strong>{container.locked ? <Lock size={13} /> : null}</span>
                <small>{container.items.length} stacks - {formatNumber(quantity)} items</small>
              </summary>
              <DataTable rows={container.items} columns={[
                ["Item", (r) => <button className="item-link with-icon" onClick={() => setSelectedItem(r)}><ItemIcon item={r} /><span><strong>{r.name}</strong>{r.tag ? <small className="muted-line">{r.tag}</small> : null}</span></button>],
                ["Qty", (r) => formatNumber(r.quantity)],
                ["Tier", (r) => r.tier ? <TierBadge tier={r.tier} /> : "-"],
                ["Rarity", (r) => r.rarity ? <RarityBadge rarity={r.rarity} /> : "-"],
                ["Type", (r) => r.type],
              ]} />
            </details>
          );
        })}
      </div>
    </div>
  );
}
function Construction({ data }: { data: ReturnType<typeof normalizeData> }) {
  const itemLookup = new Map<string, AnyRecord>((data.construction.items ?? []).map((i: AnyRecord) => [String(i.id), i]));
  const cargoLookup = new Map<string, AnyRecord>((data.construction.cargos ?? []).map((i: AnyRecord) => [String(i.id), i]));
  const storedTotals = new Map<string, number>();
  for (const building of data.inventories.buildings ?? []) {
    for (const slot of building.inventory ?? []) {
      const contents = slot.contents ?? {};
      const rawType = contents.item_type ?? contents.itemType;
      const type = rawType === "cargo" || rawType === 1 ? "cargo" : "item";
      const itemId = contents.item_id ?? contents.itemId;
      if (itemId == null) continue;
      const key = `${type}:${itemId}`;
      storedTotals.set(key, (storedTotals.get(key) ?? 0) + toNumber(contents.quantity));
    }
  }
  const materialRows = (materials: AnyRecord[], type: "item" | "cargo") => materials.map((mat: AnyRecord) => {
    const itemId = mat.item_id ?? mat.itemId ?? mat.id;
    const lookup = type === "cargo" ? cargoLookup.get(String(itemId)) : itemLookup.get(String(itemId));
    const required = toNumber(mat.required ?? mat.quantityRequired ?? mat.quantity ?? mat.amount);
    return {
      type,
      itemId,
      name: lookup?.name ?? `${type === "cargo" ? "Cargo" : "Item"} #${itemId}`,
      required,
      available: storedTotals.get(`${type}:${itemId}`) ?? 0,
    };
  }).filter((mat: AnyRecord) => mat.itemId != null && mat.required > 0);
  const projects: AnyRecord[] = (data.construction.projects ?? []).map((project: AnyRecord) => ({
    ...project,
    name: project.recipeName ?? project.buildingName ?? project.entityId,
    materials: [...materialRows(project.items ?? [], "item"), ...materialRows(project.cargos ?? [], "cargo")],
  }));
  const needed = Object.entries((projects.flatMap((project: AnyRecord) => project.materials) as AnyRecord[]).reduce((acc: Record<string, number>, mat: AnyRecord) => {
    acc[mat.name] = (acc[mat.name] ?? 0) + Math.max(0, mat.required - mat.available);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <div className="panel">
      <Header title="Construction Projects">{projects.length} active project{projects.length === 1 ? "" : "s"}</Header>
      {needed.length ? (
        <section className="warning-section">
          <h3><AlertTriangle size={17} /> What to Gather Next</h3>
          <div className="gather-grid">{needed.map(([name, amount]) => <MiniStat key={name} icon={<Package />} label={name} value={formatNumber(amount)} />)}</div>
        </section>
      ) : null}
      <div className="project-list">
        {projects.length ? projects.map((project: AnyRecord) => {
          const progress = toNumber(project.progress);
          const total = toNumber(project.actionsRequired) || 1;
          const pct = Math.min(100, Math.round((progress / total) * 100));
          return (
            <article className="project-card" key={project.entityId}>
              <header><Hammer /><strong>{project.name}</strong><span>{pct}%</span></header>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <div className="material-grid">
                {project.materials.map((mat: AnyRecord, index: number) => {
                  const remaining = Math.max(0, mat.required - mat.available);
                  return <div key={`${mat.type}-${mat.itemId}-${index}`}><strong>{mat.name}</strong><span>{formatNumber(mat.required)} required - {formatNumber(mat.available)} in storage{remaining ? ` - need ${formatNumber(remaining)}` : ""}</span></div>;
                })}
              </div>
            </article>
          );
        }) : <div className="empty-state"><Hammer />No active construction projects.</div>}
      </div>
    </div>
  );
}

function Research({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = usePersistedState("research.tier", "All");
  const matching = data.research.filter((item) => {
    if (query && !String(item.name ?? "").toLowerCase().includes(query.toLowerCase())) return false;
    if (tier !== "All" && String(item.tier) !== tier) return false;
    return true;
  });
  const researched = matching.filter((item) => item.isResearched);
  const available = matching.filter((item) => !item.isResearched);
  const tiers = unique(data.research.map((item) => String(item.tier)).filter(Boolean)).sort();
  const totalResearched = data.research.filter((item) => item.isResearched).length;
  const totalAvailable = data.research.filter((item) => !item.isResearched).length;
  const completion = data.research.length ? Math.round((totalResearched / data.research.length) * 100) : 0;
  const researchedTechs = data.research.filter((item) => item.isResearched);
  const maxTiles = Math.max(toNumber(data.claim.numTiles), ...researchedTechs.map((item) => toNumber(item.area)), 0);
  const maxSupplies = claimSupplyCap(data.claim);
  const settlementTier = toNumber(data.claim.tier);
  const workstationTiers = researchedTechs
    .filter((item) => /tier\s+\d+/i.test(String(item.name ?? "")) && item.techType && !["tier_upgrade", "settlement"].includes(String(item.techType)))
    .reduce<Record<string, number>>((acc, item) => {
      acc[String(item.techType)] = Math.max(acc[String(item.techType)] ?? 0, toNumber(item.tier));
      return acc;
    }, {});
  const card = (item: AnyRecord, done: boolean) => (
    <div className={`research-card ${done ? "done" : ""}`} key={item.entityId ?? item.id ?? item.name}>
      <span>{done ? <CheckCircle2 /> : <Circle />}</span>
      <strong>{item.name ?? item.techName ?? item.id ?? "Unknown Technology"}<small>{item.suppliesCost ? `${formatNumber(item.suppliesCost)} supplies` : ""}</small></strong>
      {item.tier ? <TierBadge tier={item.tier} /> : null}
    </div>
  );
  return (
    <div className="panel research-panel">
      <div className="research-hero">
        <Header title="Research & Technology">Technology progression and the next available unlocks</Header>
        <div className="research-completion"><strong>{completion}%</strong><span>complete</span></div>
      </div>
      <div className="research-summary">
        <div><CheckCircle2 /><strong>{totalResearched}</strong><span>Researched</span></div>
        <div><Lock /><strong>{totalAvailable}</strong><span>Available</span></div>
        <div><Crown /><strong>T{settlementTier || "-"}</strong><span>Settlement Tier</span></div>
        <div><Box /><strong>{maxSupplies ? formatNumber(maxSupplies) : "-"}</strong><span>Supply Cap</span></div>
        <div><MapPin /><strong>{maxTiles ? formatNumber(maxTiles) : "-"}</strong><span>Tile Cap</span></div>
      </div>
      {Object.keys(workstationTiers).length ? (
        <div className="research-unlocks">
          {Object.entries(workstationTiers).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => (
            <span key={name}>{name.replaceAll("_", " ")} <TierBadge tier={value} /></span>
          ))}
        </div>
      ) : null}
      <div className="toolbar-row">
        <SearchBox value={query} onChange={setQuery} placeholder="Search technologies" />
        <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <div className="two-col research-lanes"><section><h3><CheckCircle2 size={17} /> Completed Technology <small>{researched.length}</small></h3>{researched.map((item) => card(item, true))}</section><section><h3><Lock size={17} /> Available Research <small>{available.length}</small></h3>{available.map((item) => card(item, false))}</section></div>
    </div>
  );
}

function Market({ data, history, claimId, watches, onToggleWatch }: { data: ReturnType<typeof normalizeData>; history: AnyRecord | null; claimId: string; watches: WatchEntry[]; onToggleWatch: (watch: WatchEntry) => void }) {
  const [q, setQ] = React.useState("");
  const [view, setView] = usePersistedState<"live" | "analytics" | "pricing">("market.view", "live");
  const [tab, setTab] = React.useState<"sell" | "buy">("sell");
  const [tier, setTier] = usePersistedState("market.tier", "All");
  const [rarity, setRarity] = usePersistedState("market.rarity", "All");
  const [memberFilter, setMemberFilter] = usePersistedState("market.member", "All");
  const [memberHistory, setMemberHistory] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "live" || requested === "analytics" || requested === "pricing") setView(requested);
  }, [setView]);
  const selectView = (next: "live" | "analytics" | "pricing") => {
    setView(next);
    updateQueryState({ page: "market", tab: next });
    trackAnalyticsEvent("market_tab_viewed", { tab: next });
  };
  const memberOptions = React.useMemo(() => {
    const names = [
      ...data.members.map((member) => member.userName ?? member.username ?? member.playerUsername ?? member.name),
      ...data.market.map((listing) => listing.ownerUsername ?? listing.owner ?? listing.ownerName),
    ].filter(Boolean).map(String);
    return unique(names).sort((a, b) => a.localeCompare(b));
  }, [data.members, data.market]);
  const ownerMatches = React.useCallback((owner: unknown) => memberFilter === "All" || String(owner ?? "").toLowerCase() === memberFilter.toLowerCase(), [memberFilter]);
  const all = data.market.filter((listing) => ownerMatches(listing.ownerUsername ?? listing.owner ?? listing.ownerName));
  React.useEffect(() => {
    if (memberFilter === "All") {
      setMemberHistory(null);
      return;
    }
    const controller = new AbortController();
    setMemberHistory(null);
    fetch(`${LOCAL_API}/market/history?claimId=${encodeURIComponent(claimId)}&limit=120&owner=${encodeURIComponent(memberFilter)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market history HTTP ${response.status}`)))
      .then((result) => setMemberHistory(result))
      .catch(() => {
        if (!controller.signal.aborted) setMemberHistory({ sales: [], topItems: [], daily: [], totals: {} });
      });
    return () => controller.abort();
  }, [claimId, memberFilter, history]);
  const analytics = memberFilter === "All" ? history : memberHistory;
  const apiTrades: AnyRecord[] = (analytics?.sales ?? [])
    .map((event: AnyRecord) => {
      const raw = safeDisplayJson(event.raw_json) ?? {};
      return {
        id: event.id,
        itemName: event.item_name,
        name: event.item_name,
        iconAssetName: event.iconAssetName ?? raw.iconAssetName,
        quantity: event.quantity,
        unitPrice: event.price,
        totalPrice: event.total_value,
        sellerUsername: event.owner,
        purchaserUsername: raw.purchaserUsername,
        itemTier: event.tier ?? raw.itemTier,
        itemRarityStr: event.rarity ?? raw.itemRarityStr,
        timestamp: event.occurred_at,
      };
    })
    .sort((a: AnyRecord, b: AnyRecord) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const marketItemMeta = React.useMemo(() => {
    const entries = [...data.market, ...apiTrades].map((item: AnyRecord) => [String(item.itemName ?? item.name ?? ""), item] as const);
    return new Map(entries.filter(([name]) => Boolean(name)));
  }, [apiTrades, data.market]);
  const trackedLiveListings = React.useMemo(
    () => new Map<string, AnyRecord>((history?.liveListings ?? []).map((listing: AnyRecord) => [String(listing.listing_key), listing])),
    [history?.liveListings],
  );
  const listingListedAt = (listing: AnyRecord) => listingDate(listing, trackedLiveListings.get(listingTrackingKey(listing))?.first_seen);
  const sellOrders = all.filter((m) => String(m.side ?? m.orderType ?? "sell").toLowerCase().includes("sell"));
  const buyOrders = all.filter((m) => String(m.side ?? m.orderType ?? "").toLowerCase().includes("buy"));
  const current = tab === "sell" ? (sellOrders.length ? sellOrders : all) : buyOrders;
  const tiers = unique(all.map((m) => String(m.itemTier ?? m.tier)).filter((value) => value && value !== "undefined"));
  const rarities = unique(all.map((m) => m.itemRarityStr ?? m.rarity).filter(Boolean));
  const rows = current.filter((m) => {
    if (q && !String(m.itemName ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (tier !== "All" && String(m.itemTier ?? m.tier) !== tier) return false;
    if (rarity !== "All" && (m.itemRarityStr ?? m.rarity) !== rarity) return false;
    return true;
  });
  const highest = [...all].sort((a, b) => toNumber(b.price) * toNumber(b.quantity || 1) - toNumber(a.price) * toNumber(a.quantity || 1)).slice(0, 3);
  const saleEvents = apiTrades.map((trade: AnyRecord) => ({
    itemName: trade.itemName,
    item_name: trade.itemName,
    quantity: trade.quantity,
    price: trade.unitPrice,
    totalValue: trade.totalPrice,
    total_value: trade.totalPrice,
    occurredAt: trade.timestamp ?? trade.createdAt,
    occurred_at: trade.timestamp ?? trade.createdAt,
  }));
  const topItems = analytics?.topItems ?? buildMarketTopItems(saleEvents);
  const daily = analytics?.daily ?? buildMarketDaily(saleEvents);
  const confirmedSales = toNumber(analytics?.totals?.confirmedSales ?? apiTrades.length);
  const confirmedRevenue = toNumber(analytics?.totals?.trackedValue ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.totalPrice), 0));
  const unitsSold = toNumber(analytics?.totals?.confirmedUnits ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.quantity), 0));
  const averageSaleValue = confirmedSales ? confirmedRevenue / confirmedSales : 0;
  const maxDailyValue = Math.max(...daily.map((row: AnyRecord) => toNumber(row.totalValue)), 1);
  const trendRange = daily.length ? `${formatMarketDay(daily[0].day)} to ${formatMarketDay(daily[daily.length - 1].day)}` : "No confirmed sales";
  const filterLabel = memberFilter === "All" ? "all members" : memberFilter;
  return (
    <div className="panel">
      <Header title="Market">{view === "pricing" ? "Regional completed-trade pricing for smarter listings" : `${all.length} live listings - ${formatNumber(confirmedSales)} confirmed sale${confirmedSales === 1 ? "" : "s"} for ${filterLabel}`}</Header>
      {view !== "pricing" ? <div className="toolbar-row">
        <label className="inline-field">
          <span>Member</span>
          <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("market_member_filter_used", { scope: event.target.value === "All" ? "all" : "member" }); }}>
            <option>All</option>
            {memberOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div> : null}
      <div className="tabs primary-tabs">
        <button className={view === "live" ? "active" : ""} onClick={() => selectView("live")}><ShoppingCart size={15} /> Live Listings</button>
        <button className={view === "analytics" ? "active" : ""} onClick={() => selectView("analytics")}><TrendingUp size={15} /> Analytics</button>
        <button className={view === "pricing" ? "active" : ""} onClick={() => selectView("pricing")}><CircleDollarSign size={15} /> Price Finder</button>
      </div>
      {view === "pricing" ? (
        <PriceFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} watches={watches} onToggleWatch={onToggleWatch} />
      ) : view === "analytics" ? (
        <>
          <p className="legend">Completed sales for orders listed at this settlement market, confirmed from BitJita trade records.</p>
          <div className="metric-grid">
            <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
            <MiniStat icon={<Package />} label="Units Sold" value={formatNumber(unitsSold)} />
            <MiniStat icon={<CircleDollarSign />} label="Sales Revenue" value={`${formatNumber(confirmedRevenue)}g`} />
            <MiniStat icon={<TrendingUp />} label="Average Sale Value" value={`${formatNumber(averageSaleValue)}g`} />
          </div>
          <div className="two-col market-analytics">
            <section>
              <h3><Star size={17} /> Best Sellers</h3>
              <p className="legend">Ranked by units sold in API-confirmed sales.</p>
              <DataTable rows={topItems} columns={[
                ["Item", r => <ItemLabel item={{ ...marketItemMeta.get(String(r.itemName)), name: r.itemName, itemName: r.itemName }} name={r.itemName} />],
                ["Units Sold", r => formatNumber(r.unitsSold)],
                ["Sales", r => formatNumber(r.salesCount)],
                ["Revenue", r => `${formatNumber(r.totalValue)}g`],
                ["Avg Unit Price", r => `${formatNumber(r.avgUnitPrice)}g`],
                ["Last Trade", r => dateLabel(r.lastSoldAt)],
              ]} />
            </section>
            <section>
              <h3><TrendingUp size={17} /> Revenue By Day</h3>
              <p className="legend">{trendRange}. Confirmed sales only; bar length represents revenue.</p>
              <div className="daily-sales">
                {daily.length ? daily.map((row: AnyRecord) => (
                  <div className="daily-sale-row" key={row.day}>
                    <span>{formatMarketDay(row.day)}</span>
                    <div className="daily-sale-bar"><i style={{ width: `${(toNumber(row.totalValue) / maxDailyValue) * 100}%` }} /></div>
                    <strong>{formatNumber(row.totalValue)}g</strong>
                    <small>{formatNumber(row.salesCount)} sale{row.salesCount === 1 ? "" : "s"} - {formatNumber(row.unitsSold)} units</small>
                  </div>
                )) : <p className="legend">No API-confirmed sales found for this selection.</p>}
              </div>
            </section>
          </div>
          <section>
            <h3><CheckCircle2 size={17} /> Recent Confirmed Sales</h3>
            <p className="legend">Imported completed sales retained in this monitor's history for the selected current settlement member(s).</p>
            <DataTable rows={apiTrades} columns={[
              ["When", r => dateLabel(r.timestamp ?? r.createdAt)],
              ["Item", r => <ItemLabel item={r} name={r.itemName ?? "-"} />],
              ["Tier", r => r.itemTier ? <TierBadge tier={r.itemTier} /> : "-"],
              ["Qty", r => formatNumber(r.quantity)],
              ["Unit Price", r => `${formatNumber(r.unitPrice)}g`],
              ["Value", r => `${formatNumber(r.totalPrice)}g`],
              ["Seller", r => r.sellerUsername ?? "-"],
              ["Buyer", r => r.purchaserUsername ?? r.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : (
        <>
      <div className="metric-grid">
        <MiniStat icon={<ShoppingCart />} label="Visible Listings" value={all.length} />
        <MiniStat icon={<TrendingDown />} label="Sell Orders" value={sellOrders.length || all.length} />
        <MiniStat icon={<TrendingUp />} label="Buy Orders" value={buyOrders.length} />
        <MiniStat icon={<CircleDollarSign />} label="Top Value" value={highest[0] ? `${formatNumber(toNumber(highest[0].price) * toNumber(highest[0].quantity || 1))}g` : "-"} />
      </div>
      <div className="highlight-grid">{highest.map((listing) => <div key={listing.entityId ?? listing.itemName}><ItemLabel item={{ ...listing, name: listing.itemName }} name={listing.itemName} /><span>{formatNumber(toNumber(listing.price) * toNumber(listing.quantity || 1))}g - {formatNumber(listing.price)}g ea</span></div>)}</div>
      <div className="tabs"><button className={tab === "sell" ? "active" : ""} onClick={() => setTab("sell")}><TrendingDown size={15} /> Sell Orders</button><button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}><TrendingUp size={15} /> Buy Orders</button></div>
      <div className="toolbar-row">
        <SearchBox value={q} onChange={setQ} placeholder="Search market" />
        <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
        <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <p className="legend">Listed time uses the BitJita listing timestamp when available; monitor tracking time is used only as a fallback.</p>
      <DataTable rows={rows} columns={[
        ["Item", r => <ItemLabel item={{ ...r, name: r.itemName }} name={r.itemName ?? "Unknown"} />],
        ["Side", r => <span className={`pill ${String(r.side ?? r.orderType).includes("buy") ? "buy" : "sell"}`}>{r.side ?? r.orderType ?? "sell"}</span>],
        ["Qty", r => formatNumber(r.quantity)],
        ["Price", r => `${formatNumber(r.price)}g`],
        ["Tier", r => (r.itemTier ?? r.tier) ? <TierBadge tier={r.itemTier ?? r.tier} /> : "-"],
        ["Rarity", r => (r.itemRarityStr ?? r.rarity) ? <RarityBadge rarity={r.itemRarityStr ?? r.rarity} /> : "-"],
        ["Owner", r => r.ownerUsername ?? "-"],
        ["Listed", r => listingListedAt(r) ? dateLabel(listingListedAt(r)) : "-"],
        ["Live", r => liveDaysSince(listingListedAt(r))],
      ]} />
        </>
      )}
    </div>
  );
}

function PriceFinder({ monitoredRegionId, watches, onToggleWatch }: { monitoredRegionId: string; watches: WatchEntry[]; onToggleWatch: (watch: WatchEntry) => void }) {
  const defaultRegion = monitoredRegionId || "19";
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.price.region", defaultRegion);
  const [customRegion] = usePersistedState("market.price.customRegion", defaultRegion);
  const [availableRegions, setAvailableRegions] = React.useState<AnyRecord[]>([]);
  const [priceState, setPriceState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const activeRegion = regionChoice === "All" ? "" : regionChoice;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const itemName = params.get("itemName");
    const itemType = params.get("itemType");
    const region = params.get("region");
    if (itemId && itemName) {
      setSelectedItem({ id: itemId, name: itemName, itemType: toNumber(itemType) });
      setQuery(itemName);
    }
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    if (regionChoice !== "Custom") return;
    setRegionChoice(/^\d+$/.test(customRegion.trim()) ? customRegion.trim() : defaultRegion);
  }, [customRegion, defaultRegion, regionChoice, setRegionChoice]);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/regions/status`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`regions HTTP ${response.status}`)))
      .then((payload) => setAvailableRegions(payload.regions ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setAvailableRegions([]);
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).slice(0, 8));
          setSearchState("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSearchState("error");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!selectedItem || regionChoice === "Custom") {
      setPriceState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const type = toNumber(selectedItem.itemType) === 1 ? "cargo" : "items";
    const regionParam = activeRegion ? `&regionId=${encodeURIComponent(activeRegion)}` : "";
    setPriceState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${API}/market/${type}/${selectedItem.id}/price-history?bucket=1%20day&limit=30${regionParam}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`price history HTTP ${response.status}`)))
      .then((payload) => setPriceState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setPriceState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [selectedItem, activeRegion, regionChoice]);

  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
    updateQueryState({ item: String(item.id), itemName: String(item.name), itemType: String(item.itemType ?? 0), region: activeRegion || "all" });
    trackAnalyticsEvent("price_finder_search", { region: activeRegion ? "selected_region" : "all_regions" });
  }

  const stats = priceState.data?.priceStats ?? {};
  const suggestedWindow = stats.avg24h != null ? "Last 24 Hours" : stats.avg7d != null ? "Last 7 Days" : stats.avg30d != null ? "Last 30 Days" : "";
  const suggestedAverage = stats.avg24h ?? stats.avg7d ?? stats.avg30d;
  const suggestedPrice = suggestedAverage == null ? null : Math.max(1, Math.round(toNumber(suggestedAverage)));
  const tradeCount = toNumber(stats.totalTrades);
  const confidence = tradeCount >= 20 ? "High confidence" : tradeCount >= 5 ? "Medium confidence" : tradeCount > 0 ? "Low confidence" : "No sales data";
  const recentTrades: AnyRecord[] = priceState.data?.recentTrades ?? [];
  const regionLabel = activeRegion ? `R${activeRegion}` : "All Regions";
  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" && regionChoice !== "Custom" ? regionChoice : "",
    ...availableRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const selectedWatch = selectedItem ? { id: `market-${selectedItem.itemType ?? 0}-${selectedItem.id}`, type: "market" as const, label: String(selectedItem.name), itemId: String(selectedItem.id), itemType: toNumber(selectedItem.itemType), tier: toNumber(selectedItem.tier) } : null;
  const pinned = selectedWatch ? watches.some((watch) => watch.id === selectedWatch.id) : false;

  return (
    <section className="price-finder">
      <div className="price-finder-controls">
        <label className="field price-item-search">
          <span>Item</span>
          <div className="suggestion-anchor">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Start typing an item name" />
            {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => (
              <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                <ItemIcon item={item} />
                <strong>{item.name}</strong>
                {item.tier ? <TierBadge tier={item.tier} /> : null}
                <small className="item-meta-line">{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
              </button>
            ))}</div> : null}
          </div>
          {searchState === "loading" ? <small className="legend">Finding market items...</small> : null}
          {searchState === "error" ? <small className="legend">Unable to search items right now.</small> : null}
        </label>
        <label className="field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value); updateQueryState({ region: event.target.value === "All" ? "all" : event.target.value }); trackAnalyticsEvent("price_finder_region_changed", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
            {regionIds.map((regionId) => <option value={regionId} key={regionId}>R{regionId}{regionId === defaultRegion ? " - Settlement Region" : ""}</option>)}
            <option value="All">All Regions</option>
          </select>
        </label>
      </div>
      {!selectedItem ? <div className="empty-state price-empty"><CircleDollarSign />Choose an item to examine completed trade pricing.</div> : null}
      {selectedItem && priceState.loading && !priceState.data ? <div className="loading">Loading price history for {selectedItem.name}...</div> : null}
      {priceState.error ? <div className="error">Unable to load price history: {priceState.error}</div> : null}
      {selectedItem && priceState.data ? (
        <>
            <div className="price-finder-heading">
              <div><h3>{selectedItem.name}</h3><span>{regionLabel} market trade history</span></div>
              <div className="price-recommendation">
              <span>Suggested List Price</span>
              <strong>{suggestedPrice == null ? "-" : `${formatNumber(suggestedPrice)}g`}</strong>
                <small>{suggestedWindow ? `Based on ${suggestedWindow.toLowerCase()} average` : "No completed trades in this selection"}</small>
              </div>
              {selectedWatch ? <button className={`pin-action ${pinned ? "active" : ""}`} onClick={() => onToggleWatch(selectedWatch)} title={pinned ? "Remove from Overview watchlist" : "Pin to Overview watchlist"}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}{pinned ? "Pinned" : "Pin"}</button> : null}
            </div>
            <div className="metric-grid">
            <MiniStat icon={<Activity />} label="Last 24 Hours" value={stats.avg24h == null ? "-" : `${formatNumber(Math.round(stats.avg24h))}g`} title="Average completed-trade unit price during the last 24 hours." />
            <MiniStat icon={<TrendingUp />} label="Last 7 Days" value={stats.avg7d == null ? "-" : `${formatNumber(Math.round(stats.avg7d))}g`} />
            <MiniStat icon={<CircleDollarSign />} label="Last 30 Days" value={stats.avg30d == null ? "-" : `${formatNumber(Math.round(stats.avg30d))}g`} />
            <MiniStat icon={<ShoppingCart />} label="Trade Volume" value={formatNumber(stats.totalVolume)} />
            <MiniStat icon={<CheckCircle2 />} label="Price Confidence" value={confidence} />
          </div>
          <p className="legend">Suggested price follows the most recent available completed-trade average and is rounded to whole gold. Review recent trades and active listings before posting.</p>
          <section>
            <h3><ShoppingBag size={17} /> Recent Trades <small>{formatNumber(stats.totalTrades)} total trades</small></h3>
            <DataTable rows={recentTrades.slice(0, 15)} columns={[
              ["When", row => dateLabel(row.timestamp ?? row.createdAt)],
              ["Unit Price", row => `${formatNumber(row.unitPrice ?? row.price)}g`],
              ["Quantity", row => formatNumber(row.quantity)],
              ["Value", row => `${formatNumber(row.totalPrice ?? row.total_value ?? toNumber(row.quantity) * toNumber(row.unitPrice))}g`],
              ["Seller", row => row.sellerUsername ?? "-"],
              ["Buyer", row => row.purchaserUsername ?? row.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function buildMarketTopItems(events: AnyRecord[]) {
  const grouped = new Map<string, { itemName: string; salesCount: number; unitsSold: number; totalValue: number; lastSoldAt: string }>();
  for (const event of events) {
    const itemName = String(event.item_name ?? event.itemName ?? "Unknown Item");
    const current = grouped.get(itemName) ?? { itemName, salesCount: 0, unitsSold: 0, totalValue: 0, lastSoldAt: "" };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    current.lastSoldAt = String(current.lastSoldAt && current.lastSoldAt > String(event.occurred_at) ? current.lastSoldAt : event.occurred_at ?? "");
    grouped.set(itemName, current);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, avgUnitPrice: item.unitsSold ? item.totalValue / item.unitsSold : 0 }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.totalValue - a.totalValue)
    .slice(0, 20);
}

function buildMarketDaily(events: AnyRecord[]) {
  const grouped = new Map<string, { day: string; salesCount: number; unitsSold: number; totalValue: number }>();
  for (const event of events) {
    const occurredAt = event.occurred_at ?? event.occurredAt;
    const parsed = parseDateValue(occurredAt);
    const day = parsed ? parsed.toISOString().slice(0, 10) : String(occurredAt ?? "").slice(0, 10) || "Unknown";
    const current = grouped.get(day) ?? { day, salesCount: 0, unitsSold: 0, totalValue: 0 };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    grouped.set(day, current);
  }
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
}

function formatMarketDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function PublicCraftFinder({ refreshToken, monitoredRegionId, defaultRegionId, onShowMap }: { refreshToken: number; monitoredRegionId: string; defaultRegionId?: string; onShowMap: (focus: NonNullable<MapFocus>) => void }) {
  type PublicCraftSortKey = "output" | "tier" | "settlement" | "required" | "remaining" | "availableXp" | "owner";
  const [skillId, setSkillId] = usePersistedState("public-crafts.skill", "All");
  const [regionId, setRegionId] = usePersistedState("public-crafts.region", defaultRegionId || monitoredRegionId || "All");
  const [sortKey, setSortKey] = usePersistedState<PublicCraftSortKey>("public-crafts.sort", "remaining");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("public-crafts.direction", "desc");
  const hasSavedRegion = React.useRef(hasPersistedState("public-crafts.region"));
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("skill")) setSkillId(params.get("skill")!);
    if (params.get("region")) setRegionId(params.get("region")!);
  }, [setRegionId, setSkillId]);
  React.useEffect(() => {
    const preferredRegion = defaultRegionId || monitoredRegionId;
    if (!hasSavedRegion.current && preferredRegion && regionId === "All") {
      hasSavedRegion.current = true;
      setRegionId(preferredRegion);
    }
  }, [defaultRegionId, monitoredRegionId, regionId, setRegionId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const skillQuery = skillId === "All" ? "" : `&skillId=${encodeURIComponent(skillId)}`;
    fetch(`${API}/crafts?completed=false${skillQuery}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`crafts HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), loading: false }));
      });
    return () => controller.abort();
  }, [skillId, refreshToken]);
  const jobs: AnyRecord[] = state.data?.craftResults ?? [];
  const itemLookup = new Map([...(state.data?.items ?? []), ...(state.data?.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
  const publicJobs: AnyRecord[] = jobs.filter((job) => job.isPublic === true && !job.completed).map((job): AnyRecord => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    const remaining = Math.max(0, total - progress);
    const requiredSkillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experience = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === requiredSkillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    const item = itemLookup.get(String(job.craftedItem?.[0]?.item_id));
    return {
      ...job,
      output: item?.name ?? `Recipe #${job.recipeId ?? "?"}`,
      tier: item?.tier ?? job.tier,
      remaining,
      experience,
      availableXp: remaining * experience,
      requiredSkillId,
      requiredSkillName: SKILL_NAMES[requiredSkillId] ?? `Skill ${requiredSkillId}`,
      minimumLevel: toNumber(job.levelRequirements?.find((requirement: AnyRecord) => toNumber(requirement.skill_id) === requiredSkillId)?.level ?? job.levelRequirements?.[0]?.level),
    };
  }).filter((job) => job.remaining > 0);
  const regions = unique([...publicJobs.map((job) => String(job.regionId)).filter(Boolean), ...(monitoredRegionId ? [monitoredRegionId] : [])]).sort((a, b) => toNumber(a) - toNumber(b));
  const filteredJobs = publicJobs
    .filter((job) => regionId === "All" || String(job.regionId) === regionId)
    .sort((a, b) => {
      const values: Record<PublicCraftSortKey, (job: AnyRecord) => string | number> = {
        output: (job) => String(job.output ?? ""),
        tier: (job) => toNumber(job.tier),
        settlement: (job) => String(job.claimName ?? ""),
        required: (job) => toNumber(job.minimumLevel),
        remaining: (job) => toNumber(job.remaining),
        availableXp: (job) => toNumber(job.availableXp),
        owner: (job) => String(job.ownerUsername ?? ""),
      };
      const left = values[sortKey](a);
      const right = values[sortKey](b);
      const result = typeof left === "string" || typeof right === "string"
        ? String(left).localeCompare(String(right))
        : Number(left) - Number(right);
      return sortDir === "asc" ? result : -result;
    });
  const visibleJobs = filteredJobs.slice(0, 100);
  const skillName = skillId === "All" ? "All Skills" : SKILL_NAMES[toNumber(skillId)] ?? "Selected skill";
  function changeSort(nextKey: PublicCraftSortKey) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(["output", "settlement", "owner"].includes(nextKey) ? "asc" : "desc");
    }
  }
  const columns: Array<[string, PublicCraftSortKey, (job: AnyRecord) => React.ReactNode]> = [
    ["Craft", "output", (job) => <><strong>{job.output}</strong><small className="muted-line">{job.buildingName}</small></>],
    ["Tier", "tier", (job) => job.tier ? <TierBadge tier={job.tier} /> : "-"],
    ["Settlement", "settlement", (job) => <><strong>{job.claimName ?? "Unknown"}</strong>{job.claimLocationX != null && job.claimLocationZ != null ? <button className="map-location-link" onClick={() => { trackAnalyticsEvent("public_craft_map_opened"); onShowMap({ name: `${job.claimName ?? "Public craft"} - ${job.output}`, locationX: toNumber(job.claimLocationX), locationZ: toNumber(job.claimLocationZ) }); }}><MapPin size={12} />R{job.regionId} - {job.claimLocationX}, {job.claimLocationZ}</button> : null}</>],
    ["Required", "required", (job) => `${job.requiredSkillName} Lv ${job.minimumLevel}+`],
    ["Effort to Craft", "remaining", (job) => formatNumber(job.remaining)],
    ["XP Available", "availableXp", (job) => formatNumber(job.availableXp)],
    ["Owner", "owner", (job) => job.ownerUsername ?? "-"],
  ];
  return (
    <section className="public-craft-finder">
      <div className="split-header">
        <Header title="Public Craft Finder">
          {state.loading && !state.data ? "Loading public jobs..." : `${skillName} - ${formatNumber(filteredJobs.length)} public job${filteredJobs.length === 1 ? "" : "s"}${filteredJobs.length > visibleJobs.length ? ` - top ${visibleJobs.length} shown` : ""}`}
        </Header>
        <div className="toolbar-row">
          <label className="inline-field"><span>Skill</span>
            <select className="select-control" value={skillId} onChange={(event) => { setSkillId(event.target.value); updateQueryState({ skill: event.target.value }); trackAnalyticsEvent("public_craft_skill_filter_used", { scope: event.target.value === "All" ? "all_skills" : "specific_skill" }); }}>
              <option value="All">All Skills</option>
              {SKILL_IDS.map((id) => <option key={id} value={id}>{SKILL_NAMES[id]}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Region</span>
            <select className="select-control" value={regionId} onChange={(event) => { setRegionId(event.target.value); updateQueryState({ region: event.target.value }); trackAnalyticsEvent("public_craft_region_filter_used", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
              <option>All</option>{regions.map((id) => <option key={id} value={id}>R{id}</option>)}
            </select>
          </label>
        </div>
      </div>
      {state.error ? <div className="error">Failed to load public crafts: {state.error}</div> : null}
      {!state.loading && !state.error && visibleJobs.length === 0 ? <div className="empty-state"><Factory />No public {skillName.toLowerCase()} jobs found.</div> : null}
      {visibleJobs.length ? <div className="table-wrap"><table><thead><tr>{columns.map(([label, key]) => <th key={key}><button className="sort-button" onClick={() => changeSort(key)}>{label}{sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</button></th>)}</tr></thead><tbody>{visibleJobs.map((job, index) => <tr className="data-row" key={job.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(job)}</td>)}</tr>)}</tbody></table></div> : null}
    </section>
  );
}

const ACTIVE_CRAFT_WINDOW_MS = 30 * 1000;

function hasRecentCraftContribution(contributors: AnyRecord[]): boolean {
  return contributors.some((person) => {
    const lastContribution = parseDateValue(person.lastContributedAt);
    if (!lastContribution) return false;
    const age = Date.now() - lastContribution.getTime();
    return age >= -5 * 1000 && age <= ACTIVE_CRAFT_WINDOW_MS;
  });
}

function MemberPassiveCrafts({ members, refreshToken }: { members: AnyRecord[]; refreshToken: number }) {
  const [state, setState] = React.useState<LoadState<AnyRecord[]>>({ data: null, error: null, loading: true });
  const memberKey = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean).join(",");
  React.useEffect(() => {
    if (!memberKey) {
      setState({ data: [], error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => previous.data ? { ...previous, loading: true, error: null } : { data: null, error: null, loading: true });
    Promise.allSettled(members.filter((member) => member.playerEntityId).map(async (member) => {
      const response = await fetch(`${API}/players/${member.playerEntityId}/passive-crafts?status=all`, { signal: controller.signal });
      if (!response.ok) throw new Error(`passive crafts HTTP ${response.status}`);
      const payload = await response.json();
      return summarizePassiveCrafts(payload).map((craft): AnyRecord => ({
        ...craft,
        memberName: member.userName ?? member.username ?? "Unknown member",
      }));
    })).then((results) => {
      if (controller.signal.aborted) return;
      const rows = results
        .flatMap((result) => result.status === "fulfilled" ? result.value : [])
        .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
        .slice(0, 18);
      const failures = results.filter((result) => result.status === "rejected").length;
      setState({
        data: rows,
        error: failures ? `${failures} member${failures === 1 ? "" : "s"} could not be loaded.` : null,
        loading: false,
      });
    });
    return () => controller.abort();
  }, [memberKey, refreshToken]);
  const rows = state.data ?? [];
  return (
    <section className="settlement-passive-crafts">
      <div className="split-header">
        <Header title="Member Passive Crafts">
          Recent public passive output for current settlement members. BitJita does not report craft location, so entries may have been performed elsewhere.
        </Header>
        {state.loading && rows.length ? <span className="refreshing-label">Updating...</span> : null}
      </div>
      {state.error ? <p className="legend">{state.error}</p> : null}
      {state.loading && !state.data ? <p className="legend">Loading passive craft history...</p> : null}
      {!state.loading && rows.length === 0 ? <div className="empty-state"><Factory />No passive craft history reported for settlement members.</div> : null}
      {rows.length ? <DataTable rows={rows} columns={[
        ["Output", (row) => <strong>{row.recipe}</strong>],
        ["Tier", (row) => row.tier ? <TierBadge tier={row.tier} /> : "-"],
        ["Member", (row) => row.memberName],
        ["Structure", (row) => row.structure],
        ["Status", (row) => <span className={`status-pill ${row.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(row.status)}</span>],
        ["Quantity", (row) => formatNumber(row.quantity)],
        ["Latest", (row) => timeAgo(row.timestamp)],
      ]} /> : null}
    </section>
  );
}

function Production({ data, refreshToken, selectedMemberId, onSelectMember, watches, onToggleWatch }: { data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }; refreshToken: number; selectedMemberId: string; onSelectMember: (id: string) => void; watches: WatchEntry[]; onToggleWatch: (watch: WatchEntry) => void }) {
  type ProductionSortKey = "tier" | "totalXp" | "remainingXp" | "remainingEffort" | "completion" | "name";
  const [sortKey, setSortKey] = usePersistedState<ProductionSortKey>("production.sort", "tier");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("production.direction", "desc");
  const [toolbeltTools, setToolbeltTools] = React.useState<AnyRecord[] | null>(null);
  const [toolbeltError, setToolbeltError] = React.useState(false);
  const toolsForMemberRef = React.useRef<string | null>(null);
  const itemLookup = new Map([...(data.raw?.crafts?.items ?? []), ...(data.raw?.crafts?.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const selectedMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  const selectedCitizen = selectedMember ? data.citizens.find((citizen: AnyRecord) => String(citizen.userName ?? citizen.username) === String(selectedMember.userName ?? selectedMember.username)) ?? null : null;
  React.useEffect(() => {
    if (!selectedMember?.playerEntityId) {
      setToolbeltTools(null);
      setToolbeltError(false);
      toolsForMemberRef.current = null;
      return;
    }
    const controller = new AbortController();
    const memberId = String(selectedMember.playerEntityId);
    if (toolsForMemberRef.current !== memberId) {
      toolsForMemberRef.current = memberId;
      setToolbeltTools(null);
    }
    setToolbeltError(false);
    fetch(`${API}/players/${memberId}/inventories`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`inventories HTTP ${response.status}`)))
      .then((payload) => setToolbeltTools(playerToolbeltTools(payload)))
      .catch(() => { if (!controller.signal.aborted) setToolbeltError(true); });
    return () => controller.abort();
  }, [selectedMember?.playerEntityId, refreshToken]);
  function metrics(job: AnyRecord) {
    const item = itemLookup.get(String(job.craftedItem?.[0]?.item_id)) ?? {};
    const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experiencePerEffort = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    const total = toNumber(job.totalActionsRequired);
    const progress = toNumber(job.progress);
    const remaining = Math.max(0, total - progress);
    return {
      item,
      skillId,
      experiencePerEffort,
      total,
      progress,
      remaining,
      tier: toNumber(item.tier ?? job.tier),
      totalXp: total * experiencePerEffort,
      remainingXp: remaining * experiencePerEffort,
      completion: total > 0 ? progress / total : 0,
      name: String(item.name ?? job.recipeName ?? ""),
    };
  }
  function eligibility(job: AnyRecord) {
    if (!selectedMember) return null;
    const requirement = job.levelRequirements?.[0] ?? {};
    const requiredLevel = toNumber(requirement.level);
    const skillId = toNumber(requirement.skill_id);
    const skillName = SKILL_NAMES[skillId] ?? "Required skill";
    const memberLevel = toNumber(selectedCitizen?.skills?.[String(skillId)]);
    const skillOk = memberLevel >= requiredLevel;
    const toolRequirement = job.toolRequirements?.[0];
    const maxToolCraftTier = (item: AnyRecord) => toNumber(item.tier) + 1;
    const craftTier = toNumber(toolRequirement?.level);
    const expectedTool = toolRequirement ? TOOL_TAG_BY_TYPE[toNumber(toolRequirement.tool_type)] : null;
    const ownedTool = !toolRequirement ? null : (toolbeltTools ?? []).find((item) => {
      const correctType = toNumber(item.toolType) === toNumber(toolRequirement.tool_type) ||
        String(item.tags ?? item.tag ?? "") === expectedTool;
      return correctType && maxToolCraftTier(item) >= craftTier;
    });
    if (!skillOk) return { ok: false, text: `Needs ${skillName} Lv ${requiredLevel} (has ${memberLevel})` };
    if (toolbeltError && toolbeltTools == null) return { ok: false, pending: true, text: "Toolbelt unavailable" };
    if (toolRequirement && toolbeltTools == null) return { ok: false, pending: true, text: "Checking Toolbelt..." };
    if (toolRequirement && !ownedTool) return { ok: false, text: `Needs T${Math.max(1, craftTier - 1)}+ ${expectedTool ?? "required tool"} in Toolbelt` };
    return { ok: true, text: `Can craft - ${skillName} Lv ${memberLevel}${ownedTool ? ` - ${ownedTool.name} (${formatNumber(ownedTool.toolPower)} power)` : ""}` };
  }
  const jobs = [...data.crafts].sort((a, b) => {
    const aMetrics = metrics(a);
    const bMetrics = metrics(b);
    const aValue = sortKey === "remainingEffort" ? aMetrics.remaining : aMetrics[sortKey];
    const bValue = sortKey === "remainingEffort" ? bMetrics.remaining : bMetrics[sortKey];
    const comparison = sortKey === "name"
      ? String(aValue).localeCompare(String(bValue))
      : toNumber(aValue) - toNumber(bValue);
    if (comparison !== 0) return sortDir === "asc" ? comparison : -comparison;
    const aActive = hasRecentCraftContribution(data.contributions[String(a.entityId)] ?? []) ? 1 : 0;
    const bActive = hasRecentCraftContribution(data.contributions[String(b.entityId)] ?? []) ? 1 : 0;
    return bActive - aActive || bMetrics.completion - aMetrics.completion;
  });
  const crafterCounts = data.crafts.reduce<Record<string, number>>((acc, job) => {
    const name = String(job.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const activeJobs = jobs.filter((job) => {
    const total = toNumber(job.totalActionsRequired);
    return total > toNumber(job.progress) && hasRecentCraftContribution(data.contributions[String(job.entityId)] ?? []);
  }).length;

  return (
    <div className="panel">
      <div className="split-header">
        <Header title="Active Production">
          {data.crafts.length === 0 ? "No active crafting jobs" : `${activeJobs} active in the last 30s - ${data.crafts.length} jobs across ${Object.keys(crafterCounts).length} crafters`}
        </Header>
        <div className="crafter-pills">
          {Object.entries(crafterCounts).map(([name, count]) => <span key={name}><User size={13} /> <strong>{name}</strong> {count} job{count === 1 ? "" : "s"}</span>)}
        </div>
      </div>
      <div className="toolbar-row production-controls">
        <label className="inline-field"><span>Member</span>
          <select className="select-control" value={selectedMemberId} onChange={(event) => { onSelectMember(event.target.value); trackAnalyticsEvent("production_eligibility_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
            <option value="All">All members</option>
            {data.members.map((member: AnyRecord) => <option key={member.playerEntityId} value={String(member.playerEntityId)}>{member.userName ?? member.username}</option>)}
          </select>
        </label>
        <label className="inline-field"><span>Sort by</span>
          <select className="select-control" value={sortKey} onChange={(event) => setSortKey(event.target.value as ProductionSortKey)}>
            <option value="tier">Tier</option>
            <option value="totalXp">Total XP</option>
            <option value="remainingXp">XP Remaining</option>
            <option value="remainingEffort">Effort Remaining</option>
            <option value="completion">Completion</option>
            <option value="name">Item Name</option>
          </select>
        </label>
        <Segmented options={["Descending", "Ascending"]} value={sortDir === "desc" ? "Descending" : "Ascending"} onChange={(direction) => setSortDir(direction === "Descending" ? "desc" : "asc")} label="Direction" />
      </div>
      {selectedMember ? <div className="production-member-banner"><User size={15} /><span>Checking jobs for</span><strong>{selectedMember.userName ?? selectedMember.username}</strong><small>Requires skill level and a suitable Toolbelt tool. A tool can craft one tier above its own tier; power controls effort per action.</small></div> : null}
      {data.crafts.length === 0 ? <div className="empty-state"><Factory />No crafting jobs are currently active.</div> : null}
      <div className="production-grid">
        {jobs.map((job, index) => {
          const first = job.craftedItem?.[0] ?? {};
          const { item, skillId, experiencePerEffort, total, progress, remaining, totalXp, remainingXp, tier } = metrics(job);
          const skillName = SKILL_NAMES[skillId] ?? job.levelRequirements?.[0]?.skillName ?? (skillId ? `Skill ${skillId}` : null);
          const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
          const contributors: AnyRecord[] = data.contributions[String(job.entityId)] ?? [];
          const isWorking = total > progress && hasRecentCraftContribution(contributors);
          const isDone = total > 0 && progress >= total;
          const status = isWorking ? "Active now" : isDone ? "Ready" : progress > 0 ? "Paused" : "Queued";
          const eligibilityStatus = eligibility(job);
          const craftWatch = { id: `craft-${String(job.entityId ?? index)}`, type: "craft" as const, label: String(item?.name ?? job.recipeName ?? "Production craft") };
          const craftPinned = watches.some((watch) => watch.id === craftWatch.id);
          return (
            <article className={`production-card ${isWorking ? "active-work" : ""} ${eligibilityStatus?.ok ? "can-craft" : ""}`} key={job.entityId ?? index}>
              <header>
                <div><Factory size={16} /><strong>{job.buildingName ?? "Unknown Structure"}</strong><span>{job.ownerUsername ?? "Unknown"}</span></div>
                <p><button className={`icon-pin ${craftPinned ? "active" : ""}`} onClick={() => onToggleWatch(craftWatch)} title={craftPinned ? "Remove from watchlist" : "Pin craft to watchlist"}>{craftPinned ? <PinOff size={12} /> : <Pin size={12} />}</button><span className={`status-pill ${isWorking ? "working" : ""}`}>{status}</span>{skillName ? <small>{skillName} Lv {job.levelRequirements?.[0]?.level ?? 1}+</small> : null}</p>
              </header>
              <section>
                <div className={`craft-title ${item?.iconAssetName ? "has-icon" : ""}`}>{item?.iconAssetName ? <ItemIcon item={item} /> : null}<h3>{item?.name ?? (skillName ? `${skillName} craft` : `Item #${first.item_id ?? "?"}`)}</h3>{tier ? <TierBadge tier={tier} /> : null}</div>
                {!item.name && job.recipeId ? <small>recipe #{job.recipeId}</small> : null}
                <div className="work-chips">
                  <span>{formatNumber(job.craftCount)} craft{toNumber(job.craftCount) === 1 ? "" : "s"}</span>
                  <span>{formatNumber(remaining)} effort to craft</span>
                  {experiencePerEffort ? <span>{formatNumber(totalXp)} total XP</span> : null}
                </div>
                <div className="progress-meta"><span>Effort applied</span><span>{formatNumber(progress)} / {formatNumber(total)}</span></div>
                <div className={`progress ${isWorking ? "is-moving" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                <div className="progress-meta"><strong>{pct}%</strong><span>{experiencePerEffort ? `${formatNumber(remainingXp)} XP remaining` : "XP not provided"}</span></div>
                {eligibilityStatus ? <div className={`eligibility-pill ${eligibilityStatus.ok ? "eligible" : eligibilityStatus.pending ? "pending" : "blocked"}`}>{eligibilityStatus.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{eligibilityStatus.text}</div> : null}
                {contributors.length ? (
                  <div className="contributors">
                    <small>Contributors</small>
                    {contributors.slice(0, 3).map((person) => (
                      <span key={person.contributorEntityId}><strong>{person.contributorUsername ?? "Unknown"}</strong> {formatNumber(person.totalProgressContributed)} progress - {timeAgo(person.lastContributedAt)}</span>
                    ))}
                  </div>
                ) : <small>No contributions recorded by the API.</small>}
              </section>
            </article>
          );
        })}
      </div>
      <MemberPassiveCrafts members={data.members} refreshToken={refreshToken} />
    </div>
  );
}

function Region({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [sortKey, setSortKey] = usePersistedState("region.sort", "tier");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("region.direction", "desc");
  const sorters: Record<string, (row: AnyRecord) => string | number> = {
    name: (row) => String(row.name ?? ""),
    owner: getOwnerName,
    tier: (row) => toNumber(row.tier),
    supplies: (row) => toNumber(row.supplies),
    treasury: (row) => toNumber(row.treasury),
    numTiles: (row) => toNumber(row.numTiles),
  };
  const allRows = data.region;
  const rows = [...allRows].sort((a, b) => {
    const aVal = sorters[sortKey]?.(a) ?? 0;
    const bVal = sorters[sortKey]?.(b) ?? 0;
    const result = typeof aVal === "string" || typeof bVal === "string"
      ? String(aVal).localeCompare(String(bVal))
      : Number(aVal) - Number(bVal);
    return sortDir === "asc" ? result : -result;
  }).slice(0, 100);
  const mine = rows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const rank = (field: string) => {
    const sorted = [...allRows].sort((a, b) => toNumber(b[field]) - toNumber(a[field]));
    const idx = sorted.findIndex((row) => String(row.entityId) === String(data.claim.entityId));
    return idx >= 0 ? `#${idx + 1}` : "-";
  };
  const chartRows = [...allRows].sort((a, b) => toNumber(b.supplies) - toNumber(a.supplies)).slice(0, 15);
  const maxSupplies = Math.max(...chartRows.map((row) => toNumber(row.supplies)), 1);
  const avgTier = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.tier), 0) / allRows.length : 0;
  const avgTiles = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.numTiles), 0) / allRows.length : 0;
  const totalTreasury = allRows.reduce((total, row) => total + toNumber(row.treasury), 0);
  const liveStatus = data.regionStatus.find((region) => String(region.regionId) === String(data.claim.regionId));
  const tradeSummary = data.tradeVolume.overall ?? {};
  const myRankRow = allRows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const nearbyRows = myRankRow ? [...allRows]
    .filter((row) => String(row.entityId) !== String(data.claim.entityId))
    .map((row): AnyRecord => ({ ...row, distance: Math.abs(toNumber(row.locationX) - toNumber(myRankRow.locationX)) + Math.abs(toNumber(row.locationZ) - toNumber(myRankRow.locationZ)) }))
    .sort((a, b) => toNumber(a.distance) - toNumber(b.distance))
    .slice(0, 5) : [];
  function changeSort(nextKey: string) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(nextKey === "name" || nextKey === "owner" ? "asc" : "desc");
    }
  }
  const columns: Array<[string, string, (row: AnyRecord, index: number) => React.ReactNode]> = [
    ["#", "rank", (_r, i) => i + 1],
    ["Claim", "name", (r) => <span className={String(r.entityId) === String(data.claim.entityId) ? "mine-text" : ""}>{String(r.entityId) === String(data.claim.entityId) ? <Crown size={13} /> : null}{r.name}</span>],
    ["Owner", "owner", (r) => getOwnerName(r)],
    ["Tier", "tier", (r) => <TierBadge tier={r.tier} />],
    ["Supplies", "supplies", (r) => formatNumber(r.supplies)],
    ["Treasury", "treasury", (r) => `${formatNumber(r.treasury)}g`],
    ["Tiles", "numTiles", (r) => formatNumber(r.numTiles)],
  ];
  return (
    <div className="panel region-panel">
      <div className="region-hero">
        <Header title={`${data.claim.regionName ?? "Region"} Overview`}>{allRows.length} settlements compared across supplies, treasury, tiles, and tier</Header>
        {myRankRow ? <div className="region-identity"><Crown size={18} /><div><strong>{myRankRow.name}</strong><span><TierBadge tier={myRankRow.tier} /> Monitored settlement</span></div></div> : null}
      </div>
      {mine ? (
        <div className="rank-grid">
          <MiniStat icon={<Crown />} label="Tier Rank" value={rank("tier")} />
          <MiniStat icon={<Box />} label="Supply Rank" value={rank("supplies")} />
          <MiniStat icon={<CircleDollarSign />} label="Treasury Rank" value={rank("treasury")} />
          <MiniStat icon={<Hammer />} label="Tile Rank" value={rank("numTiles")} />
        </div>
      ) : null}
      <div className="metric-grid">
        <MiniStat icon={<Globe2 />} label="Settlements" value={allRows.length} />
        <MiniStat icon={<Users />} label="Players Online" value={liveStatus ? formatNumber(liveStatus.signedInPlayers) : "-"} />
        <MiniStat icon={<Server />} label="Region Status" value={liveStatus ? liveStatus.syncing ? "Syncing" : liveStatus.active ? "Active" : "Offline" : "-"} />
        <MiniStat icon={<ShoppingCart />} label="Regional Trades" value={formatNumber(tradeSummary.totalTrades)} />
        <MiniStat icon={<CircleDollarSign />} label="Region Treasury" value={`${formatNumber(totalTreasury)}g`} />
      </div>
      <div className="highlight-grid">
        <div><strong>Average Tier</strong><span>{avgTier.toFixed(1)} across known settlements</span></div>
        <div><strong>Average Tiles</strong><span>{formatNumber(avgTiles)} claimed tiles</span></div>
        <div><strong>Regional Trade Value</strong><span>{formatNumber(tradeSummary.totalValue)}g in selected API window</span></div>
      </div>
      <div className="region-context">
        <div className="bar-panel">
          <h3>Supply Leaders</h3>
          {chartRows.map((row) => <div className="bar-row" key={row.entityId}><span>{row.name}</span><div><i style={{ width: `${(toNumber(row.supplies) / maxSupplies) * 100}%` }} className={String(row.entityId) === String(data.claim.entityId) ? "mine" : ""} /></div><b>{formatNumber(row.supplies)}</b></div>)}
        </div>
        {nearbyRows.length ? (
          <section className="nearby-panel">
            <h3><MapPin size={17} /> Close Settlements</h3>
            <p>These settlements are geographically closest to our monitored settlement.</p>
            {nearbyRows.map((row) => <div key={row.entityId}><strong>{row.name}</strong><span>{getOwnerName(row)} <TierBadge tier={row.tier} /></span><small>{formatNumber(row.supplies)} supplies</small></div>)}
          </section>
        ) : null}
      </div>
      <div className="table-heading"><h3>Regional Rankings</h3><span>Click a column heading to sort</span></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map(([label, key]) => <th key={label}><button className="sort-button" onClick={() => key !== "rank" && changeSort(key)} disabled={key === "rank"}>{label}{key !== "rank" ? (sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />) : null}</button></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => <tr className={String(row.entityId) === String(data.claim.entityId) ? "mine-row" : ""} key={row.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function bitcraftMapUrl(playerIds: string[], mapMarker: MapFocus, flyTo = false) {
  const playerQuery = playerIds.length ? `?playerId=${playerIds.sort().join(",")}` : "";
  const waypoint = mapMarker ? {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        popupText: mapMarker.name,
        iconName: "waypoint",
        turnLayerOn: MAP_DEFAULT_LAYERS,
        ...(flyTo ? { flyTo: [mapMarker.locationZ, mapMarker.locationX], zoomTo: 2 } : { noPan: true }),
      },
      geometry: { type: "Point", coordinates: [mapMarker.locationX, mapMarker.locationZ] },
    }],
  } : null;
  return `https://bitcraftmap.com/${playerQuery}${waypoint ? `#${encodeURIComponent(JSON.stringify(waypoint))}` : ""}`;
}

function MapPanel({ data, focus, onClearFocus }: { data: ReturnType<typeof normalizeData>; focus: MapFocus; onClearFocus: () => void }) {
  const [selectedIds, setSelectedIds] = usePersistedState<string[] | null>("map.players", null);
  const [frameUrl, setFrameUrl] = usePersistedState("map.url", "");
  const roster = data.players;
  const defaultSelection = React.useMemo(() => {
    const online = roster.filter((player) => player.signedIn).map((player) => String(player.entityId)).filter(Boolean);
    return new Set(online.length ? online : roster.map((player) => String(player.entityId)).filter(Boolean));
  }, [roster]);
  const current = React.useMemo(() => selectedIds === null ? defaultSelection : new Set(selectedIds), [defaultSelection, selectedIds]);
  const defaultFocus = data.claim.locationX != null && data.claim.locationZ != null ? {
    name: data.claim.name ?? "Monitored settlement",
    locationX: toNumber(data.claim.locationX),
    locationZ: toNumber(data.claim.locationZ),
  } : null;
  const mapMarker = focus ?? defaultFocus;
  const mapUrl = React.useMemo(() => bitcraftMapUrl([...current], mapMarker, Boolean(focus)), [current, focus, mapMarker]);
  const focusKey = focus ? `${focus.name}:${focus.locationX}:${focus.locationZ}` : "";
  React.useEffect(() => {
    if (!frameUrl) setFrameUrl(mapUrl);
  }, [frameUrl, mapUrl, setFrameUrl]);
  React.useEffect(() => {
    if (focus) setFrameUrl(bitcraftMapUrl([...current], focus, true));
  }, [focusKey, setFrameUrl]);
  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev === null ? [...defaultSelection] : prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const nextIds = [...next].sort();
      setFrameUrl(bitcraftMapUrl(nextIds, mapMarker, false));
      return nextIds;
    });
  }
  function toggleAll() {
    const nextIds = current.size === roster.length ? [] : roster.map((player) => String(player.entityId)).filter(Boolean).sort();
    setSelectedIds(nextIds);
    setFrameUrl(bitcraftMapUrl(nextIds, mapMarker, false));
  }
  function resetMapFilters() {
    const nextIds = [...defaultSelection].sort();
    setSelectedIds(null);
    onClearFocus();
    setFrameUrl(bitcraftMapUrl(nextIds, defaultFocus, false));
  }
  const onlineCount = roster.filter((player) => player.signedIn).length;
  const currentFrameUrl = frameUrl || mapUrl;
  return (
    <div className={`panel map-panel full-height ${focus ? "has-focus" : ""}`}>
      <div className="split-header">
        <Header title="World Map">Live player tracking via bitcraftmap.com</Header>
        <a className="toolbar-button" href={currentFrameUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full map</a>
      </div>
      <p className="online-summary"><strong>{onlineCount} online</strong> - {roster.length} members total</p>
      {focus ? (
        <div className="map-focus">
          <MapPin size={17} />
          <div><strong>{focus.name}</strong><span>{focus.locationX}, {focus.locationZ}</span></div>
          <button className="mini-action" onClick={onClearFocus}>Clear</button>
        </div>
      ) : null}
      <div className="player-pills">
        <button className={current.size === roster.length ? "active" : ""} onClick={toggleAll}>All</button>
        <button onClick={resetMapFilters}>Clear filters</button>
        {roster.map((player) => {
          const id = String(player.entityId);
          return <button key={id} className={current.has(id) ? "active" : ""} onClick={() => toggle(id)} title={player.signedIn ? `Online - ${formatDuration(player.sessionSeconds)}` : "Offline"}><span className={`online-dot ${player.signedIn ? "is-online" : ""}`} />{player.username}{current.has(id) ? <MapPin size={12} /> : null}</button>;
        })}
      </div>
      <iframe className="map-frame" src={currentFrameUrl} title="BitCraft World Map" />
    </div>
  );
}

function sanitizeActivityLog(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item).replaceAll("\u00c2\u00b7", "-").replaceAll("\u00e2\u20ac\u201d", "-"))
    .filter((item) => !/changed from \d+ to 0$/.test(item) && !/changed from 0 to \d+$/.test(item))
    .slice(0, 100);
}

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["storage", "Storage"],
  ["treasury", "Treasury"],
  ["supplies", "Supplies"],
  ["market", "Market"],
  ["members", "Members"],
  ["buildings", "Structures"],
] as const;

function signedDelta(after: unknown, before: unknown, suffix = ""): string {
  const delta = toNumber(after) - toNumber(before);
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(delta))}${suffix}`;
}

function activitySummary(item: AnyRecord): string {
  if (item.event_type === "storage") return item.summary ?? "-";
  let metadata: AnyRecord = {};
  try {
    metadata = JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    metadata = {};
  }
  if (metadata.before != null && metadata.after != null) {
    if (item.event_type === "treasury") return `${signedDelta(metadata.after, metadata.before, "g")} to treasury`;
    if (item.event_type === "supplies") return `${signedDelta(metadata.after, metadata.before)} supplies`;
    if (item.event_type === "members") return `${signedDelta(metadata.after, metadata.before)} members`;
    if (item.event_type === "buildings") return `${signedDelta(metadata.after, metadata.before)} structures`;
    if (item.event_type === "market") return `${signedDelta(metadata.after, metadata.before)} market listings`;
  }
  return item.summary ?? "-";
}

function activityMetadata(item: AnyRecord): AnyRecord {
  try {
    return JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    return {};
  }
}

function RarityBadge({ rarity }: { rarity: unknown }) {
  if (!rarity) return null;
  return <span className={`rarity-badge ${getRarityClass(rarity)}`}>{String(rarity)}</span>;
}

function activityActorName(item: AnyRecord): string {
  const metadata = activityMetadata(item);
  if (metadata.actorName) return String(metadata.actorName);
  if (!String(item.event_type ?? "").includes("market")) return "";
  return String(metadata.ownerUsername ?? metadata.owner ?? metadata.sellerUsername ?? "");
}

function activityContainerName(item: AnyRecord): string {
  return String(activityMetadata(item).containerName ?? "");
}

function activityStyle(item: AnyRecord): { label: string; tone: string; icon: React.ReactNode } {
  const eventType = String(item.event_type ?? "");
  if (eventType.includes("market")) return { label: "Market", tone: "market", icon: <ShoppingCart size={18} /> };
  switch (eventType) {
    case "storage": return { label: "Storage", tone: "storage", icon: <Box size={18} /> };
    case "treasury": return { label: "Treasury", tone: "treasury", icon: <CircleDollarSign size={18} /> };
    case "supplies": return { label: "Supplies", tone: "supplies", icon: <Package size={18} /> };
    case "members": return { label: "Members", tone: "members", icon: <Users size={18} /> };
    case "buildings": return { label: "Structures", tone: "buildings", icon: <Building2 size={18} /> };
    default: return { label: "Update", tone: "default", icon: <Activity size={18} /> };
  }
}

function ActivityPanel({ activity, activityTotal, claimId, error }: { activity: AnyRecord[]; activityTotal: number; claimId: string; error: string | null }) {
  const [filter, setFilter] = usePersistedState<(typeof ACTIVITY_FILTERS)[number][0]>("activity.filter", "all");
  const [memberFilter, setMemberFilter] = usePersistedState("activity.member", "All");
  const [compact, setCompact] = usePersistedState("activity.compact", true);
  const [members, setMembers] = React.useState<AnyRecord[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/claims/${claimId}/members`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`members HTTP ${response.status}`)))
      .then((payload) => setMembers(unwrap<AnyRecord[]>(payload, "members", [])))
      .catch(() => undefined);
    return () => controller.abort();
  }, [claimId]);
  const combined = [...activity].sort((a, b) => timestampMs(b.occurred_at ?? b.occurredAt) - timestampMs(a.occurred_at ?? a.occurredAt) || toNumber(b.id) - toNumber(a.id));
  const memberOptions = unique(members.map((member) => String(member.userName ?? member.username ?? "")).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  React.useEffect(() => {
    if (memberFilter !== "All" && !memberOptions.includes(memberFilter)) setMemberFilter("All");
  }, [memberFilter, memberOptions.join("|")]);
  const memberActivity = memberFilter === "All" ? combined : combined.filter((item) => activityActorName(item).toLowerCase() === memberFilter.toLowerCase());
  const baseFiltered = filter === "all" ? memberActivity : memberActivity.filter((item) => String(item.event_type ?? "").includes(filter));
  const filtered = compact ? compactActivity(baseFiltered) : baseFiltered;
  const filterCounts = new Map(ACTIVITY_FILTERS.map(([id]) => [id, id === "all" ? memberActivity.length : memberActivity.filter((item) => String(item.event_type ?? "").includes(id)).length]));
  const storageMoves = memberActivity.filter((item) => item.event_type === "storage").length;
  const settlementChanges = memberActivity.length - storageMoves;
  const latestEvent = memberActivity[0]?.occurred_at ?? memberActivity[0]?.occurredAt;
  const scopeLabel = memberFilter === "All" ? "settlement" : memberFilter;
  return (
    <div className="panel activity-panel">
      <Header title="Activity">A live audit trail of settlement updates and movements through owned storage.</Header>
      {error ? <div className="error">Local history unavailable: {error}</div> : null}
      <div className="activity-overview">
        <article><Activity /><span>{memberFilter === "All" ? "Total history" : "Recent member events"}</span><strong>{formatNumber(memberFilter === "All" ? activityTotal : memberActivity.length)}</strong><small>{memberFilter === "All" ? `${formatNumber(combined.length)} recent events loaded` : `Attributed to ${memberFilter}`}</small></article>
        <article><Box /><span>Recent storage moves</span><strong>{formatNumber(storageMoves)}</strong><small>Settlement containers only</small></article>
        <article><Building2 /><span>{memberFilter === "All" ? "Recent system changes" : "System changes"}</span><strong>{formatNumber(settlementChanges)}</strong><small>{memberFilter === "All" ? "Within loaded history" : "Not attributed to members"}</small></article>
        <article><RefreshCw /><span>Latest event</span><strong>{latestEvent ? timeAgo(latestEvent) : "-"}</strong><small>{latestEvent ? dateLabel(latestEvent) : "Awaiting activity"}</small></article>
      </div>
      <section className="activity-controls" aria-label="Activity filters">
        <label className="activity-member-filter">
          <User size={16} />
          <span>Member</span>
          <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("activity_member_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
            <option value="All">All members</option>
            {memberOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {memberFilter !== "All" ? <small>Shows attributed storage and market events only.</small> : null}
        </label>
        <div className="activity-filters">
          {ACTIVITY_FILTERS.map(([id, label]) => (
            <button key={id} className={filter === id ? "active" : ""} onClick={() => { setFilter(id); trackAnalyticsEvent("activity_category_filter_used", { category: id }); }}>
              <span>{label}</span>
              <strong>{filterCounts.get(id) ?? 0}</strong>
            </button>
          ))}
        </div>
        <div className="activity-options">
          <label className="check-control"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /> Combine repeated treasury changes</label>
          <span>Showing {filtered.length} of {memberActivity.length} recent {scopeLabel} events{memberFilter === "All" && activityTotal > combined.length ? ` - ${formatNumber(activityTotal)} retained` : ""}</span>
        </div>
      </section>
      <div className="activity-timeline">
        {filtered.length ? filtered.map((item) => {
          const display = activityStyle(item);
          return (
            <article className={`activity-event ${display.tone}`} key={item.id ?? `${item.occurred_at}-${item.summary}`}>
              <div className="activity-event-icon">{display.icon}</div>
              <div className="activity-event-body">
                <header><span>{display.label}</span><time>{timeAgo(item.occurred_at ?? item.occurredAt)}</time></header>
                <p>{activitySummary(item)}</p>
                {activityContainerName(item) ? <small><Box size={12} /> {activityContainerName(item)}</small> : null}
              </div>
              <time className="activity-event-date">{dateLabel(item.occurred_at ?? item.occurredAt)}</time>
            </article>
          );
        }) : <div className="empty-state activity-empty"><Activity />{combined.length ? "No activity matches this filter." : "No activity has been returned yet."}</div>}
      </div>
    </div>
  );
}

function compactActivity(items: AnyRecord[]): AnyRecord[] {
  const output: AnyRecord[] = [];
  let treasuryGroup: AnyRecord[] = [];
  const flush = () => {
    if (!treasuryGroup.length) return;
    if (treasuryGroup.length === 1) {
      output.push(treasuryGroup[0]);
      treasuryGroup = [];
      return;
    }
    const first = treasuryGroup[0];
    const last = treasuryGroup[treasuryGroup.length - 1];
    const total = treasuryGroup.reduce((sum, item) => {
      try {
        const meta = JSON.parse(item.metadata_json ?? "{}");
        return sum + (toNumber(meta.after) - toNumber(meta.before));
      } catch {
        return sum;
      }
    }, 0);
    output.push({ id: `treasury-${first.id}-${last.id}`, event_type: "treasury", occurred_at: first.occurred_at, summary: `${total >= 0 ? "+" : "-"}${formatNumber(Math.abs(total))}g to treasury across ${treasuryGroup.length} refreshes` });
    treasuryGroup = [];
  };
  for (const item of items) {
    if (item.event_type === "treasury") treasuryGroup.push(item);
    else {
      flush();
      output.push(item);
    }
  }
  flush();
  return output;
}

function diffSnapshot(prev: AnyRecord, curr: AnyRecord): string[] {
  const changes = [];
  for (const key of ["members", "buildings", "market"]) {
    if (prev[key] !== curr[key]) changes.push(`${key} changed from ${prev[key]} to ${curr[key]}`);
  }
  if (toNumber(prev.claim?.supplies) !== toNumber(curr.claim?.supplies)) changes.push(`Supplies changed to ${formatNumber(curr.claim?.supplies)}`);
  if (toNumber(prev.claim?.treasury) !== toNumber(curr.claim?.treasury)) changes.push(`Treasury changed to ${formatNumber(curr.claim?.treasury)}g`);
  return changes.length ? changes : ["No tracked changes detected"];
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search"><Search size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function applyTheme(theme: Partial<typeof DEFAULT_THEME>) {
  for (const [key, , cssVar] of THEME_FIELDS) {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  }
  document.documentElement.style.setProperty("--gold-dim", `${theme.gold ?? DEFAULT_THEME.gold}2e`);
}

function ToastStack({ notices, onDismiss }: { notices: ToastNotice[]; onDismiss: (id: string) => void }) {
  return (
    <section className="toast-stack" aria-live="polite" aria-label="Notifications">
      {notices.map((notice) => (
        <article className={`toast ${notice.kind}`} key={notice.id}>
          <div className="toast-icon">{notice.kind === "market" ? <ShoppingCart size={17} /> : <Factory size={17} />}</div>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
          </div>
          <button onClick={() => onDismiss(notice.id)} aria-label="Dismiss notification"><X size={14} /></button>
        </article>
      ))}
    </section>
  );
}

function NotificationDrawer({ notices, onClose, onOpenNotice }: { notices: ToastNotice[]; onClose: () => void; onOpenNotice: (notice: ToastNotice) => void }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="notice-drawer" role="dialog" aria-modal="true" aria-label="Recent notifications" onClick={(event) => event.stopPropagation()}>
        <header><h2><Bell size={18} /> Notifications</h2><button onClick={onClose} aria-label="Close notifications"><X size={16} /></button></header>
        {notices.length ? <div className="notice-list">{notices.map((notice) => (
          <button key={notice.id} className={notice.read ? "" : "unread"} onClick={() => onOpenNotice(notice)}>
            <span>{notice.kind === "market" ? <ShoppingCart size={15} /> : <Factory size={15} />}</span>
            <strong>{notice.title}</strong>
            <small>{notice.body}</small>
            <time>{notice.occurredAt ? timeAgo(notice.occurredAt) : ""}</time>
          </button>
        ))}</div> : <p className="legend">Notifications for sales, listings and production will appear here.</p>}
      </aside>
    </div>
  );
}

function CommandPalette({ data, onClose, onNavigate, onSelectMember }: { data: ReturnType<typeof normalizeData>; onClose: () => void; onNavigate: (panel: ActivePanel, marketTab?: string) => void; onSelectMember: (id: string) => void }) {
  const [query, setQuery] = React.useState("");
  const q = query.toLowerCase().trim();
  const commands = [
    ...NAV.map(([id, label, Icon]) => ({ key: `page-${id}`, label, description: "Open page", icon: <Icon size={15} />, run: () => onNavigate(id) })),
    { key: "price-finder", label: "Price Finder", description: "Find a listing price", icon: <CircleDollarSign size={15} />, run: () => onNavigate("market", "pricing") },
    ...data.members.map((member: AnyRecord) => ({
      key: `member-${member.playerEntityId}`,
      label: String(member.userName ?? member.username ?? "Member"),
      description: "Open member details",
      icon: <User size={15} />,
      run: () => { onSelectMember(String(member.playerEntityId)); onNavigate("members"); },
    })),
  ].filter((command) => !q || `${command.label} ${command.description}`.toLowerCase().includes(q)).slice(0, 12);
  React.useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);
  return (
    <div className="command-overlay" onClick={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Quick navigation" onClick={(event) => event.stopPropagation()}>
        <label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Navigate or find a member..." /></label>
        <div>{commands.map((command) => <button key={command.key} onClick={() => { command.run(); onClose(); }}>{command.icon}<strong>{command.label}</strong><span>{command.description}</span></button>)}</div>
      </section>
    </div>
  );
}

function HelpCenter({ version, onClose, onPrivacy, onTerms }: { version: string; onClose: () => void; onPrivacy: () => void; onTerms: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <CircleHelp size={19} />
            <h2 id="help-title">Claim Monitor Help</h2>
          </div>
          <button onClick={onClose} aria-label="Close help"><X size={16} /></button>
        </header>
        <div className="beta-notice"><strong>Beta - Work in progress</strong><span>This application is actively being developed. Data display and features may change as accuracy and coverage improve.</span></div>
        <p className="help-intro">Track settlement operations, production opportunities, member professions and skills, storage, regional context, and market history using public BitCraft data.</p>
        <div className="help-links">
          <a href={`${GITHUB_REPOSITORY}#readme`} target="_blank" rel="noreferrer">
            <strong>Application Guide</strong>
            <span>Read the full feature and deployment overview</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            <strong>Version {version}</strong>
            <span>View the latest changes and release notes</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer">
            <strong>Report Bugs & Request Features</strong>
            <span>Found an issue or have an idea? Let us know on GitHub Issues.</span>
            <ExternalLink size={14} />
          </a>
          <button className="help-link-button" onClick={() => { onClose(); onPrivacy(); }}>
            <strong>Privacy & Analytics</strong>
            <span>See what anonymous usage data may be measured</span>
            <Shield size={14} />
          </button>
          <button className="help-link-button" onClick={() => { onClose(); onTerms(); }}>
            <strong>Legal & Bot Terms</strong>
            <span>Read usage terms for the site and Discord bot</span>
            <FileText size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function TermsContent({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <section className="terms-section">
        <h3>Application Terms</h3>
        <p>This is an unofficial fan-made settlement tool for BitCraft players. It is provided as-is for community use, testing and development. Data may be delayed, incomplete, unavailable or inaccurate, so do not rely on it as the only source for important settlement decisions.</p>
        <p>The app is not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc. Data is provided by the BitJita API.</p>
      </section>
      <section className="terms-section">
        <h3>Discord Bot Terms</h3>
        <p>The optional Timbersteel Trade Discord bot posts settlement notifications and responds to slash commands using the same public BitJita data and locally stored app data used by this dashboard.</p>
        <p>Using the bot in Discord means command names, command options, Discord user/server/channel identifiers, response status, and notification delivery diagnostics may be processed by this app and Discord to provide the requested bot features.</p>
        <p>Bot responses are informational only. Server administrators can disable notifications, remove the bot, rotate its token, or delete local diagnostic/history data from the app administration tools.</p>
      </section>
      {!compact ? <p className="help-intro">Questions, bug reports and feature requests can be raised through the GitHub Issues link in this app.</p> : null}
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="help-intro">With your permission, this site uses first-party analytics cookies to understand which pages and tools are valuable and how long sections are used. This information is genuinely helpful while the app is being developed.</p>
      <p className="help-intro">Analytics record a random browser identifier, visits to app sections and high-level feature actions. They do not record BitCraft usernames, selected member identities, typed search text, admin credentials or database contents.</p>
      <p className="help-intro">The optional Discord bot does not use analytics cookies. When enabled, Discord slash commands and notifications may process Discord server, channel and user identifiers, command options, public BitJita data, and notification delivery diagnostics so the bot can respond and administrators can diagnose delivery issues.</p>
      <p className="help-intro">Consent and analytics cookies last for up to 180 days. Raw usage events are retained for up to 90 days. You can change your preference in the app at any time; declining removes the analytics identifier from this browser.</p>
    </>
  );
}

function DedicatedLegalPage({ type }: { type: "terms" | "privacy" }) {
  const isTerms = type === "terms";
  return (
    <main className="legal-page">
      <section className="legal-document">
        <header>
          <div>
            {isTerms ? <FileText size={22} /> : <Shield size={22} />}
            <h1>{isTerms ? "Terms & Discord Bot Use" : "Privacy Policy"}</h1>
          </div>
          <a className="toolbar-button" href="/"><ExternalLink size={14} /> Open app</a>
        </header>
        <p className="help-intro">Timbersteel Claim Monitor - version {APP_VERSION}</p>
        {isTerms ? <TermsContent /> : <PrivacyContent />}
        <footer>
          <span>Unofficial fan-made tool. Not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc.</span>
          <span>Data provided by the <a href="https://bitjita.com/docs/api">BitJita API</a>. Source available on <a href={GITHUB_REPOSITORY}>GitHub</a>.</span>
        </footer>
      </section>
    </main>
  );
}

function TermsDialog({ onClose, onPrivacy }: { onClose: () => void; onPrivacy: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <FileText size={19} />
            <h2 id="terms-title">Legal & Bot Terms</h2>
          </div>
          <button onClick={onClose} aria-label="Close legal and bot terms"><X size={16} /></button>
        </header>
        <TermsContent compact />
        <div className="toolbar">
          <a className="toolbar-button primary" href="/terms" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
          <button className="toolbar-button" onClick={() => { onClose(); onPrivacy(); }}><Shield size={14} /> Privacy details</button>
        </div>
      </section>
    </div>
  );
}

function PrivacyDialog({ consent, onConsent, onClose }: { consent: AnalyticsConsent; onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onClose: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Shield size={19} />
            <h2 id="privacy-title">Privacy & Analytics</h2>
          </div>
          <button onClick={onClose} aria-label="Close privacy information"><X size={16} /></button>
        </header>
        <div className={`analytics-status ${consent === "accepted" ? "enabled" : ""}`}>
          <strong>Usage analytics {consent === "accepted" ? "accepted" : consent === "declined" ? "declined" : "not selected"}</strong>
          <span>{consent === "accepted" ? "This browser is helping development by sharing anonymous feature usage." : "This browser is not currently contributing usage analytics."}</span>
        </div>
        <PrivacyContent />
        <div className="privacy-actions">
          <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
          <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
          <a className="toolbar-button" href="/privacy" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
        </div>
      </section>
    </div>
  );
}

function UserSettingsDialog({ density, onDensityChange, toastSettings, onToastSettingsChange, watchCount, onClearWatches, onResetSettings, onClose }: { density: "comfortable" | "compact"; onDensityChange: (density: "comfortable" | "compact") => void; toastSettings: UserToastSettings; onToastSettingsChange: (settings: UserToastSettings) => void; watchCount: number; onClearWatches: () => void; onResetSettings: () => void; onClose: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Settings size={19} />
            <h2 id="settings-title">User Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close user settings"><X size={16} /></button>
        </header>
        <div className="settings-grid">
          <section>
            <h3>This Browser</h3>
            <p className="legend">Your page, filters, density, notifications and pinned overview items are saved in this browser only. This uses local browser storage, not analytics cookies, so it works even if analytics cookies are declined.</p>
          </section>
          <section>
            <h3>Display Density</h3>
            <div className="segmented-control">
              <button className={density === "comfortable" ? "active" : ""} onClick={() => onDensityChange("comfortable")}>Comfortable</button>
              <button className={density === "compact" ? "active" : ""} onClick={() => onDensityChange("compact")}>Compact</button>
            </div>
          </section>
          <section>
            <h3>Notifications</h3>
            {([["marketListings", "New market listings"], ["marketSales", "Confirmed market sales"], ["production", "Production starts and completions"]] as const).map(([key, label]) => (
              <label className="toggle-row" key={key}><input type="checkbox" checked={toastSettings[key]} onChange={(event) => onToastSettingsChange({ ...toastSettings, [key]: event.target.checked })} /><span>{label}</span></label>
            ))}
          </section>
          <section>
            <h3>Pinned Items</h3>
            <p className="legend">{watchCount ? `${watchCount} pinned item${watchCount === 1 ? "" : "s"} saved in this browser.` : "No pinned items saved in this browser."}</p>
            <button className="toolbar-button" disabled={!watchCount} onClick={onClearWatches}><PinOff size={14} /> Clear pinned items</button>
          </section>
          <section>
            <h3>Reset</h3>
            <p className="legend">Reset this browser's local app preferences. Admin settings and settlement data are not affected.</p>
            <button className="toolbar-button" onClick={onResetSettings}><RefreshCw size={14} /> Reset my settings</button>
          </section>
        </div>
      </section>
    </div>
  );
}

function CookieBanner({ onConsent, onPrivacy }: { onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onPrivacy: () => void }) {
  return (
    <section className="cookie-banner" role="dialog" aria-label="Analytics cookies">
      <div>
        <strong>Help improve Claim Monitor</strong>
        <p>We would like to use analytics cookies to see which pages and tools are useful. This data is genuinely helpful for development, so please accept if you are happy to help.</p>
        <button className="cookie-details" onClick={onPrivacy}>Privacy & Analytics details</button>
      </div>
      <div className="cookie-actions">
        <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
        <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
      </div>
    </section>
  );
}

function TablePanel({ title, subtitle, rows, columns }: { title: string; subtitle: string; rows: AnyRecord[]; columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]> }) {
  return <div className="panel"><Header title={title}>{subtitle}</Header><DataTable rows={rows} columns={columns} /></div>;
}

function DataTable({ rows, columns, onRowClick, rowClassName }: { rows: AnyRecord[]; columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]>; onRowClick?: (row: AnyRecord) => void; rowClassName?: (row: AnyRecord) => string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr className={`data-row ${rowClassName?.(row) ?? ""}`} key={row.entityId ?? row.id ?? index} onClick={onRowClick ? () => onRowClick(row) : undefined}>{columns.map(([label, render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}</tr>) : <tr><td colSpan={columns.length}>No data returned.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AppSkeleton() {
  return <div className="panel app-skeleton"><div className="skeleton-line title" /><div className="skeleton-grid">{[0, 1, 2, 3].map((id) => <div key={id} />)}</div><div className="skeleton-block" /><div className="skeleton-block short" /></div>;
}

function SyncPanel({ syncUrl }: { syncUrl: string }) {
  return (
    <div className="panel sync-panel">
      <div className="split-header">
        <Header title="Sync">Embedded BitCraft Sync materials and goals board</Header>
        <a className="toolbar-button" href={syncUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open Full Page</a>
      </div>
      <iframe className="sync-frame" src={syncUrl} title="BitCraft Sync" />
    </div>
  );
}

type AdminTab = "status" | "analytics" | "configuration" | "discord" | "theme" | "database" | "users" | "audit" | "backups";

function bytesLabel(value: unknown) {
  const bytes = toNumber(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminPanel({ settings, onSettingsSaved }: { settings: AppSettings; onSettingsSaved: (settings: AppSettings) => void }) {
  const [auth, setAuth] = React.useState<AnyRecord | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("");
  const [setupKey, setSetupKey] = React.useState("");
  const [tab, setTab] = React.useState<AdminTab>("status");
  const [message, setMessage] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AppSettings>(settings);
  const [status, setStatus] = React.useState<AnyRecord | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<AnyRecord[]>([]);
  const [tables, setTables] = React.useState<AnyRecord[]>([]);
  const [selectedTable, setSelectedTable] = React.useState("");
  const [tableResult, setTableResult] = React.useState<AnyRecord>({ rows: [], columns: [], total: 0, offset: 0, limit: 50 });
  const [tableSearch, setTableSearch] = React.useState("");
  const [tableOffset, setTableOffset] = React.useState(0);
  const [users, setUsers] = React.useState<AnyRecord[]>([]);
  const [newUser, setNewUser] = React.useState({ username: "", password: "" });
  const [resetUser, setResetUser] = React.useState("");
  const [resetPassword, setResetPassword] = React.useState("");
  const [auditData, setAuditData] = React.useState<AnyRecord>({ auditLog: [], logins: [] });
  const [backups, setBackups] = React.useState<AnyRecord[]>([]);
  const [analyticsDays, setAnalyticsDays] = React.useState("30");
  const [analyticsData, setAnalyticsData] = React.useState<AnyRecord | null>(null);

  async function api(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.method && options.method !== "GET" && auth?.csrfToken) headers.set("x-csrf-token", String(auth.csrfToken));
    const response = await fetch(`${LOCAL_API}${path}`, {
      ...options,
      headers,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  async function run(task: () => Promise<void>, success?: string) {
    setMessage(null);
    try {
      await task();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshStatus() {
    setStatus(await api("/admin/status"));
  }

  async function refreshTables() {
    const result = await api("/admin/tables");
    setTables(result.tables ?? []);
    setSelectedTable((current) => current || result.tables?.[0]?.name || "");
  }

  async function refreshUsers() {
    setUsers((await api("/admin/users")).users ?? []);
  }

  async function refreshAudit() {
    setAuditData(await api("/admin/audit?limit=100"));
  }

  async function refreshBackups() {
    setBackups((await api("/admin/backups")).backups ?? []);
  }

  async function refreshAnalytics() {
    setAnalyticsData(await api(`/admin/analytics?days=${encodeURIComponent(analyticsDays)}`));
  }

  React.useEffect(() => {
    api("/admin/me").then(setAuth).catch((error) => setMessage(error.message)).finally(() => setAuthLoading(false));
  }, []);
  React.useEffect(() => setDraft(settings), [settings]);
  const hasUnsavedSettings = React.useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  React.useEffect(() => {
    if (tab === "theme" && auth?.authenticated) applyTheme(draft.theme);
    return () => { if (tab === "theme") applyTheme(settings.theme); };
  }, [auth?.authenticated, draft.theme, settings.theme, tab]);
  React.useEffect(() => {
    if (!auth?.authenticated) return;
    run(async () => {
      if (tab === "status" || tab === "discord") await refreshStatus();
      if (tab === "analytics") await refreshAnalytics();
      if (tab === "database") await refreshTables();
      if (tab === "users") await refreshUsers();
      if (tab === "audit") await refreshAudit();
      if (tab === "backups") await refreshBackups();
    });
  }, [auth?.authenticated, tab, analyticsDays]);
  React.useEffect(() => {
    if (!auth?.authenticated || tab !== "database" || !selectedTable) return;
    const timer = window.setTimeout(() => {
      run(async () => setTableResult(await api(`/admin/table?name=${encodeURIComponent(selectedTable)}&limit=50&offset=${tableOffset}&search=${encodeURIComponent(tableSearch)}`)));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [auth?.authenticated, selectedTable, tableOffset, tableSearch, tab]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const route = auth?.setupRequired ? "/admin/setup" : "/admin/login";
      const result = await api(route, { method: "POST", body: JSON.stringify({ username, password, setupKey }) });
      setAuth(result);
      setPassword("");
      setSetupKey("");
    });
  }

  async function saveSettings() {
    await run(async () => {
      const result = await api("/admin/settings", { method: "PUT", body: JSON.stringify(draft) });
      const next = normalizeAppSettings(result);
      setDraft(next);
      onSettingsSaved(next);
    }, "Settings saved and applied.");
  }

  function revertSettings() {
    setDraft(settings);
    applyTheme(settings.theme);
    setMessage("Unsaved changes reverted.");
  }

  function updateDraft<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDiscord(value: Partial<DiscordSettings>) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, ...value } }));
  }

  function updateDiscordNotify(key: keyof DiscordSettings["notify"], value: boolean) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, notify: { ...current.discord.notify, [key]: value } } }));
  }

  function updateDiscordChannel(key: string, value: string) {
    setDraft((current) => ({
      ...current,
      discord: {
        ...current.discord,
        channels: { ...current.discord.channels, [key]: value },
        craftChannels: key in DEFAULT_CRAFT_CHANNELS ? { ...current.discord.craftChannels, [key]: value } : current.discord.craftChannels,
        ...(key === "notifications" ? { channelId: value } : {}),
      },
    }));
  }

  function updateNotificationChannel(key: string, value: string) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, notificationChannels: { ...current.discord.notificationChannels, [key]: value } } }));
  }

  async function uploadBrand(type: "logo" | "favicon", file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) return setMessage("Image must be smaller than 1 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Unable to read image"));
      reader.readAsDataURL(file);
    });
    await run(async () => {
      const result = await api("/admin/branding", { method: "POST", body: JSON.stringify({ type, dataUrl }) });
      const next = { ...draft, branding: result.branding };
      setDraft(next);
      onSettingsSaved(next);
    }, `${type === "logo" ? "Logo" : "Favicon"} uploaded.`);
  }

  async function removeBrand(type: "logo" | "favicon") {
    await run(async () => {
      const result = await api(`/admin/branding?type=${type}`, { method: "DELETE" });
      const next = { ...draft, branding: result.branding };
      setDraft(next);
      onSettingsSaved(next);
    }, `${type === "logo" ? "Logo" : "Favicon"} removed.`);
  }

  const tabs: Array<[AdminTab, string]> = [["status", "Status"], ["analytics", "Analytics"], ["configuration", "Configuration"], ["discord", "Discord"], ["theme", "Theme"], ["database", "Database"], ["users", "Users"], ["audit", "Audit"], ["backups", "Backups"]];
  const themePresets: Array<[string, typeof DEFAULT_THEME]> = [
    ["Default", DEFAULT_THEME],
    ["Steel", { ...DEFAULT_THEME, bg: "#0b1117", sidebar: "#070b11", panel: "#18222d", panel2: "#101821", border: "#344657", gold: "#65b7fa" }],
    ["Ember", { ...DEFAULT_THEME, bg: "#120c0a", sidebar: "#090705", panel: "#211815", panel2: "#17110f", border: "#50382d", gold: "#f5aa45", good: "#55db96" }],
  ];
  const discordTestButtons = [
    ["basic", "Basic"],
    ["listing", "Listing"],
    ["sale", "Sale"],
    ["craftStarted", "Craft Started"],
    ["craftCompleted", "Craft Completed"],
    ["supplies", "Supplies"],
    ["appUpdate", "App Update"],
  ];

  if (authLoading) return <div className="panel"><Header title="Admin">Checking administrator session</Header><div className="loading">Loading...</div></div>;
  if (!auth?.authenticated) {
    return (
      <div className="panel admin-login">
        <Header title="Admin">{auth?.setupRequired ? "Create the first administrator account" : "Sign in to manage this installation"}</Header>
        <form className="form-card" onSubmit={submitAuth}>
          <label className="field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          {auth?.setupKeyRequired ? <label className="field"><span>Server Setup Key</span><input type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} autoComplete="one-time-code" /></label> : null}
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} autoComplete={auth?.setupRequired ? "new-password" : "current-password"} /></label>
          <button className="toolbar-button primary" type="submit"><KeyRound size={15} /> {auth?.setupRequired ? "Create Administrator" : "Sign In"}</button>
          {message ? <p className="legend">{message}</p> : null}
        </form>
      </div>
    );
  }

  const tableRows: AnyRecord[] = tableResult.rows ?? [];
  const tableColumns = (tableResult.columns ?? Object.keys(tableRows[0] ?? {})).slice(0, 10);
  const channelOptions = Object.entries(draft.discord.channels ?? {}).map(([key, id]) => ({ key, label: key === "notifications" ? "Default notifications" : key === "modNotes" ? "Mod notes" : key[0].toUpperCase() + key.slice(1), id })).filter((entry) => entry.id || entry.key === "notifications");
  const channelSelect = (key: string, value: string, allowProfession = false) => (
    <select value={value} onChange={(event) => updateNotificationChannel(key, event.target.value)}>
      {allowProfession ? <option value="profession">Profession channel</option> : null}
      {channelOptions.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}{entry.id ? ` (${entry.id})` : ""}</option>)}
    </select>
  );
  const discordDelivery = status?.discord?.lastDelivery ?? {};
  const discordLog: AnyRecord[] = status?.discord?.deliveryLog ?? [];
  const discordDeliveryLabel = discordDelivery.status === "failed"
    ? `Failed ${dateLabel(discordDelivery.at)}: ${discordDelivery.error ?? "Unknown Discord error"}`
    : discordDelivery.status === "sent"
      ? `Sent ${dateLabel(discordDelivery.at)}: ${discordDelivery.eventType ?? "notification"}${discordDelivery.channelId ? ` to ${discordDelivery.channelId}` : ""}`
      : discordDelivery.status === "skipped"
        ? `Skipped ${dateLabel(discordDelivery.at)}: ${discordDelivery.reason ?? "Not enabled"}`
        : "No Discord deliveries recorded";
  return (
    <div className="panel admin-console">
      <div className="split-header">
        <Header title="Admin Console">Configuration and operational controls for this installation</Header>
        <button className="toolbar-button" onClick={() => run(async () => { await api("/admin/logout", { method: "POST", body: "{}" }); setAuth({ authenticated: false, setupRequired: false }); })}><LogOut size={15} /> Sign out</button>
      </div>
      <div className="admin-tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>
      {message ? <div className="admin-message">{message}</div> : null}

      {tab === "status" ? (
        <div className="admin-section">
          <div className="metric-grid admin-metrics">
            <Stat icon={<Server />} label="Environment" value={status?.environment ?? "-"} />
            <Stat icon={<Database />} label="Database" value={bytesLabel(status?.databaseSize)} />
            <Stat icon={<Save />} label="Snapshots" value={formatNumber(status?.counts?.snapshots)} />
            <Stat icon={<CircleDollarSign />} label="Confirmed Trades" value={formatNumber(status?.counts?.market_trades)} />
            <Stat icon={<Activity />} label="Activity Events" value={formatNumber(status?.counts?.activity_events)} />
          </div>
          <section className="form-card">
            <div className="split-header"><h3><Server size={17} /> Collection Status</h3><div className="toolbar"><button className="toolbar-button" onClick={() => run(refreshStatus)}><RefreshCw size={15} /> Refresh</button><button className="toolbar-button primary" onClick={() => run(async () => { await api("/admin/poll", { method: "POST", body: "{}" }); await refreshStatus(); }, "Collection run completed.")}><RefreshCw size={15} /> Collect Now</button></div></div>
            <div className="status-detail">
              <Info label="Server polling" value={status?.polling?.enabled ? `Enabled, every ${Math.round(status.polling.intervalMs / 1000)} seconds` : "Disabled"} />
              <Info label="Last successful collection" value={dateLabel(status?.polling?.lastSuccessAt)} />
              <Info label="Storage activity sync" value={status?.polling?.storageLastSuccessAt ? `${dateLabel(status.polling.storageLastSuccessAt)} - ${formatNumber(status.polling.storageInserted)} new events from ${formatNumber(status.polling.storageRequests)} containers` : "Not collected yet"} />
              <Info label="Storage sync error" value={status?.polling?.storageLastError ?? "None"} />
              <Info label="Last error" value={status?.polling?.lastError ?? "None"} />
              <Info label="Discord delivery" value={discordDeliveryLabel} />
              <Info label="Storage" value={status?.storageLabel ?? "-"} />
            </div>
          </section>
          <section className="form-card">
            <div className="split-header"><h3><Activity size={17} /> BitJita Endpoint Check</h3><button className="toolbar-button" onClick={() => run(async () => setDiagnostics((await api("/admin/diagnostics", { method: "POST", body: "{}" })).checks ?? []), "Endpoint check completed.")}><RefreshCw size={15} /> Run Checks</button></div>
            {diagnostics.length ? <div className="diagnostics">{[...diagnostics].sort((a, b) => toNumber(b.durationMs) - toNumber(a.durationMs)).map((check) => <div key={check.label} className={check.ok ? "ok" : "fail"}><strong>{check.label}</strong><span>{check.ok ? `${check.durationMs} ms` : check.error}</span></div>)}</div> : <p className="legend">Run checks to time public data sources, including each settlement storage container used for Activity history.</p>}
          </section>
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="admin-section analytics-admin">
          <section className="form-card">
            <div className="split-header">
              <h3><TrendingUp size={17} /> Usage Analytics</h3>
              <div className="toolbar"><label className="inline-field"><span>Period</span><select className="select-control" value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button className="toolbar-button" onClick={() => { if (window.confirm("Delete all collected usage analytics? This cannot be undone.")) run(async () => { await api("/admin/analytics", { method: "DELETE", body: "{}" }); await refreshAnalytics(); }, "Usage analytics deleted."); }}><X size={14} /> Clear Data</button></div>
            </div>
            <p className="legend">First-party analytics collected only from visitors who accept analytics cookies. Browser identifiers are random, reporting is aggregate, and raw events are retained for up to {analyticsData?.retentionDays ?? 90} days.</p>
            <div className="metric-grid analytics-metrics">
              <Stat icon={<Users />} label="Visitors" value={formatNumber(analyticsData?.totals?.visitors)} />
              <Stat icon={<Globe2 />} label="Sessions" value={formatNumber(analyticsData?.totals?.sessions)} />
              <Stat icon={<Activity />} label="Page Views" value={formatNumber(analyticsData?.totals?.pageViews)} />
              <Stat icon={<Command />} label="Feature Uses" value={formatNumber(analyticsData?.totals?.interactions)} />
              <Stat icon={<RefreshCw />} label="Time Recorded" value={formatDuration(toNumber(analyticsData?.totals?.durationSeconds))} />
            </div>
          </section>
          <div className="admin-grid">
            <section className="form-card">
              <h3><Globe2 size={17} /> Most Used Pages</h3>
              <DataTable rows={analyticsData?.pages ?? []} columns={[
                ["Page", (row) => String(row.page).replaceAll("publiccrafts", "Public Craft Finder")],
                ["Views", (row) => formatNumber(row.pageViews)],
                ["Visitors", (row) => formatNumber(row.visitors)],
                ["Time", (row) => formatDuration(toNumber(row.durationSeconds))],
              ]} />
            </section>
            <section className="form-card">
              <h3><Factory size={17} /> Feature Usage</h3>
              <DataTable rows={analyticsData?.features ?? []} columns={[
                ["Feature", (row) => String(row.eventName).replaceAll("_", " ")],
                ["Uses", (row) => formatNumber(row.uses)],
                ["Visitors", (row) => formatNumber(row.visitors)],
              ]} />
            </section>
          </div>
        </div>
      ) : null}

      {tab === "configuration" ? (
        <div className="admin-grid">
          <section className="form-card">
            <h3><Shield size={17} /> Settlement Defaults</h3>
            <label className="field"><span>Settlement ID</span><input value={draft.claimId} onChange={(event) => updateDraft("claimId", event.target.value)} /></label>
            <label className="field"><span>BitCraft Sync URL</span><input value={draft.syncUrl} onChange={(event) => updateDraft("syncUrl", event.target.value)} /></label>
            <label className="field"><span>Default opening page</span><select value={draft.defaultPage} onChange={(event) => updateDraft("defaultPage", event.target.value as ActivePanel)}>{NAV.filter(([id]) => id !== "admin").map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="field"><span>Public Crafts default region ID</span><input value={draft.defaultRegion} onChange={(event) => updateDraft("defaultRegion", event.target.value)} placeholder="Use settlement region" /></label>
            <label className="field"><span>Browser refresh interval (seconds)</span><input type="number" min={15} max={300} value={draft.refreshSeconds} onChange={(event) => updateDraft("refreshSeconds", Number(event.target.value))} /></label>
            <label className="field"><span>Snapshot retention (days)</span><input type="number" min={30} max={3650} value={draft.snapshotRetentionDays} onChange={(event) => updateDraft("snapshotRetentionDays", Number(event.target.value))} /></label>
            <button className="toolbar-button primary" onClick={saveSettings}><Save size={15} /> Save Configuration</button>
          </section>
          <div className="admin-section">
            <section className="form-card">
              <h3><Upload size={17} /> Branding</h3>
              {(["logo", "favicon"] as const).map((type) => {
                const asset = draft.branding?.[type];
                return <div className="brand-upload" key={type}><div>{asset ? <img src={`${asset.url}?v=${encodeURIComponent(asset.updatedAt)}`} alt="" /> : <Shield size={25} />}<strong>{type === "logo" ? "Overview Logo" : "Browser Favicon"}</strong></div><label className="toolbar-button"><Upload size={14} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadBrand(type, event.target.files?.[0])} /></label>{asset ? <button className="toolbar-button" onClick={() => removeBrand(type)}><X size={14} /> Remove</button> : null}</div>;
              })}
              <p className="legend">PNG, JPG or WebP up to 1 MB. The logo is shown on Overview and the favicon is used by the browser tab.</p>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "discord" ? (
        <div className="admin-grid discord-admin">
          <section className="form-card">
            <h3><MessageCircle size={17} /> Discord Bot</h3>
            <label className="toggle-line"><input type="checkbox" checked={draft.discord.enabled} onChange={(event) => updateDiscord({ enabled: event.target.checked })} /><span>Enable Discord notifications and slash commands</span></label>
            <label className="field"><span>Bot Token</span><input type="password" value={draft.discord.botToken ?? ""} onChange={(event) => updateDiscord({ botToken: event.target.value, clearBotToken: false })} placeholder={draft.discord.botTokenConfigured ? `Configured via ${draft.discord.botTokenSource ?? "server"}` : "Paste token from Discord Developer Portal"} /></label>
            {draft.discord.botTokenConfigured ? <label className="toggle-line"><input type="checkbox" checked={draft.discord.clearBotToken === true} onChange={(event) => updateDiscord({ clearBotToken: event.target.checked, botToken: "" })} /><span>Clear stored bot token on save</span></label> : null}
            <label className="field"><span>Application ID</span><input value={draft.discord.applicationId} onChange={(event) => updateDiscord({ applicationId: event.target.value })} /></label>
            <label className="field"><span>Public Key</span><input value={draft.discord.publicKey} onChange={(event) => updateDiscord({ publicKey: event.target.value })} /></label>
            <label className="field"><span>Server/Guild ID</span><input value={draft.discord.guildId} onChange={(event) => updateDiscord({ guildId: event.target.value })} placeholder="Recommended for instant slash command updates" /></label>
            <div className="toolbar discord-actions"><button className="toolbar-button primary" onClick={saveSettings}><Save size={15} /> Save Discord Settings</button><button className="toolbar-button" onClick={() => run(async () => { const result = await api("/admin/discord/register-commands", { method: "POST", body: "{}" }); setMessage(`Registered ${formatNumber(result.commands?.length)} Discord slash commands.`); })}><Command size={15} /> Register Commands</button></div>
          </section>
          <details className="form-card discord-channel-card">
            <summary><span><MessageCircle size={17} /> Channel List</span><small>Channel IDs and profession routing</small></summary>
            <p className="legend">Configure each Discord channel ID once. Profession channels here are also used when craft notifications route by profession.</p>
            <div className="craft-channel-grid">{DISCORD_CHANNEL_FIELDS.map((key) => <label className="field" key={key}><span>{key === "notifications" ? "Default notifications" : key === "modNotes" ? "Mod notes" : key[0].toUpperCase() + key.slice(1)}</span><input value={draft.discord.channels?.[key] ?? ""} onChange={(event) => updateDiscordChannel(key, event.target.value)} /></label>)}</div>
          </details>
          <section className="form-card discord-preview-card">
            <h3><Bell size={17} /> Notifications</h3>
            <div className="discord-rule-grid">
              <div className="discord-rule-card">
                <h4>Market</h4>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.marketListings} onChange={(event) => updateDiscordNotify("marketListings", event.target.checked)} /><span>New listings</span></label>
                <label className="field"><span>Listings channel</span>{channelSelect("marketListings", draft.discord.notificationChannels.marketListings)}</label>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.marketSales} onChange={(event) => updateDiscordNotify("marketSales", event.target.checked)} /><span>Confirmed sales</span></label>
                <label className="field"><span>Sales channel</span>{channelSelect("marketSales", draft.discord.notificationChannels.marketSales)}</label>
                <label className="field"><span>Minimum sale value</span><input type="number" min={0} value={draft.discord.minSaleValue} onChange={(event) => updateDiscord({ minSaleValue: Number(event.target.value) })} /></label>
              </div>
              <div className="discord-rule-card">
                <h4>Crafts</h4>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.production} onChange={(event) => updateDiscordNotify("production", event.target.checked)} /><span>Enable craft alerts</span></label>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.productionStarted} onChange={(event) => updateDiscordNotify("productionStarted", event.target.checked)} /><span>Craft started</span></label>
                <label className="field"><span>Started channel</span>{channelSelect("productionStarted", draft.discord.notificationChannels.productionStarted, true)}</label>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.productionCompleted} onChange={(event) => updateDiscordNotify("productionCompleted", event.target.checked)} /><span>Craft completed</span></label>
                <label className="field"><span>Completed channel</span>{channelSelect("productionCompleted", draft.discord.notificationChannels.productionCompleted, true)}</label>
                <label className="field"><span>Minimum total XP</span><input type="number" min={0} value={draft.discord.productionMinXp} onChange={(event) => updateDiscord({ productionMinXp: Number(event.target.value) })} /></label>
                <label className="field"><span>Start progress (%)</span><input type="number" min={0} max={100} step={0.5} value={draft.discord.productionMinProgressPct} onChange={(event) => updateDiscord({ productionMinProgressPct: Number(event.target.value) })} /></label>
                <label className="field"><span>Allowed crafters</span><input value={draft.discord.productionUsers} onChange={(event) => updateDiscord({ productionUsers: event.target.value })} placeholder="Blank allows all, or comma separate usernames" /></label>
              </div>
              <div className="discord-rule-card">
                <h4>Supplies</h4>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.lowSupplies} onChange={(event) => updateDiscordNotify("lowSupplies", event.target.checked)} /><span>Low supplies changes</span></label>
                <label className="field"><span>Low supplies channel</span>{channelSelect("lowSupplies", draft.discord.notificationChannels.lowSupplies)}</label>
                <label className="field"><span>Runway threshold (days)</span><input type="number" min={0.25} step={0.25} value={draft.discord.supplyRunwayDaysThreshold} onChange={(event) => updateDiscord({ supplyRunwayDaysThreshold: Number(event.target.value) })} /></label>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.supplyReports} onChange={(event) => updateDiscordNotify("supplyReports", event.target.checked)} /><span>Scheduled report</span></label>
                <label className="field"><span>Report channel</span>{channelSelect("supplyReport", draft.discord.notificationChannels.supplyReport)}</label>
                <label className="field"><span>Report interval (days)</span><input type="number" min={1} step={1} value={draft.discord.supplyReportIntervalDays} onChange={(event) => updateDiscord({ supplyReportIntervalDays: Number(event.target.value) })} /></label>
              </div>
              <div className="discord-rule-card">
                <h4>Application</h4>
                <label className="toggle-line"><input type="checkbox" checked={draft.discord.notify.appUpdates} onChange={(event) => updateDiscordNotify("appUpdates", event.target.checked)} /><span>App update announcements</span></label>
                <label className="field"><span>Updates channel</span>{channelSelect("appUpdates", draft.discord.notificationChannels.appUpdates)}</label>
              </div>
            </div>
            <div className="status-detail">
              <Info label="Interaction endpoint" value={draft.discord.interactionUrl ? `${window.location.origin}${draft.discord.interactionUrl}` : `${window.location.origin}/api/discord/interactions`} />
              <Info label="Slash commands" value="/supplies, /online, /crafts, /price" />
              <Info label="Token status" value={draft.discord.botTokenConfigured ? `Configured via ${draft.discord.botTokenSource ?? "server"}` : "Not configured"} />
              <Info label="Last Discord delivery" value={discordDeliveryLabel} />
            </div>
            <p className="legend">Use a Discord application with the bot and applications.commands scopes. Guild command registration is immediate; global commands can take longer to appear.</p>
          </section>
          <details className="form-card discord-preview-card">
            <summary><span><MessageCircle size={17} /> Notification Tests</span><small>Preview Discord message formats</small></summary>
            <p className="legend">Send sample messages to the configured channel to preview how each alert type will look in Discord.</p>
            <div className="discord-test-grid">{discordTestButtons.map(([kind, label]) => <button key={kind} className="toolbar-button" onClick={() => run(async () => { await api("/admin/discord/test", { method: "POST", body: JSON.stringify({ kind }) }); }, `${label} Discord test sent.`)}><MessageCircle size={14} /> {label}</button>)}</div>
          </details>
          <section className="form-card discord-terminal-card">
            <div className="split-header">
              <h3><Activity size={17} /> Discord Diagnostics</h3>
              <button className="toolbar-button" onClick={() => run(refreshStatus)}><RefreshCw size={15} /> Refresh Log</button>
            </div>
            <p className="legend">Newest entries are shown first. This records sent, skipped and failed Discord notifications with routing and filter details so notification issues can be diagnosed.</p>
            <div className="discord-terminal" role="log" aria-label="Discord diagnostics log">
              {discordLog.length ? discordLog.map((entry) => {
                const metadata = entry.metadata ?? {};
                const detailLines = [
                  `event=${entry.event_type}`,
                  `status=${entry.status}`,
                  entry.channel_key ? `channelKey=${entry.channel_key}` : "",
                  entry.channel_id ? `channelId=${entry.channel_id}` : "",
                  entry.reason ? `reason=${entry.reason}` : "",
                  entry.error ? `error=${entry.error}` : "",
                  metadata?.productionUsers ? `allowedCrafters=${metadata.productionUsers}` : "",
                  metadata?.productionMinXp !== undefined ? `minXp=${metadata.productionMinXp}` : "",
                  metadata?.productionMinProgressPct !== undefined ? `minProgress=${metadata.productionMinProgressPct}%` : "",
                  metadata?.metadata?.activeCraftCount !== undefined ? `activeCrafts=${metadata.metadata.activeCraftCount}` : "",
                  metadata?.metadata?.activeKnownBeforePoll !== undefined ? `knownBeforePoll=${metadata.metadata.activeKnownBeforePoll}` : "",
                  metadata?.metadata?.hasProductionBaseline !== undefined ? `hasBaseline=${metadata.metadata.hasProductionBaseline}` : "",
                  metadata?.metadata?.crafterName ? `crafter=${metadata.metadata.crafterName}` : "",
                  metadata?.metadata?.skillName ? `profession=${metadata.metadata.skillName}` : "",
                  metadata?.metadata?.totalXp !== undefined ? `craftXp=${metadata.metadata.totalXp}` : "",
                  metadata?.metadata?.progressPct !== undefined ? `progress=${metadata.metadata.progressPct}%` : "",
                ].filter(Boolean).join(" | ");
                return (
                  <article className={`discord-log-entry ${String(entry.status ?? "unknown").toLowerCase()}`} key={entry.id}>
                    <time>{dateLabel(entry.occurred_at)}</time>
                    <strong>{entry.summary ?? entry.event_type}</strong>
                    <code>{detailLines}</code>
                    {Array.isArray(metadata?.metadata?.crafts) && metadata.metadata.crafts.length ? <code>crafts={JSON.stringify(metadata.metadata.crafts)}</code> : null}
                    {entry.response ? <code>response={JSON.stringify(entry.response)}</code> : null}
                  </article>
                );
              }) : <div className="discord-log-empty">No Discord diagnostics recorded yet.</div>}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "theme" ? (
        <section className="form-card admin-theme">
          <div className="split-header"><h3><Palette size={17} /> Theme Editor</h3><div className="toolbar">{themePresets.map(([label, preset]) => <button className="toolbar-button" key={label} onClick={() => updateDraft("theme", preset)}>{label}</button>)}</div></div>
          <div className="theme-grid">{THEME_FIELDS.map(([key, label]) => <label className="color-field" key={key}><span>{label}</span><input type="color" value={draft.theme[key]} onChange={(event) => updateDraft("theme", { ...draft.theme, [key]: event.target.value })} /></label>)}</div>
          <div className="toolbar"><button className="toolbar-button primary" onClick={saveSettings}><Save size={15} /> Save Theme</button><button className="toolbar-button" onClick={() => updateDraft("theme", settings.theme)}><RefreshCw size={15} /> Revert Preview</button></div>
        </section>
      ) : null}

      {tab === "database" ? (
        <section className="form-card database-browser">
          <div className="split-header"><h3><Database size={17} /> Database Browser</h3><select className="select-control" value={selectedTable} onChange={(event) => { setSelectedTable(event.target.value); setTableOffset(0); }}>{tables.map((table) => <option key={table.name} value={table.name}>{table.name} ({formatNumber(table.rows)})</option>)}</select></div>
          <div className="database-toolbar"><SearchBox value={tableSearch} onChange={(value) => { setTableSearch(value); setTableOffset(0); }} placeholder="Filter table records" /><a className="toolbar-button" href={`${LOCAL_API}/admin/export?name=${encodeURIComponent(selectedTable)}&format=csv&search=${encodeURIComponent(tableSearch)}`}><Download size={14} /> CSV</a><a className="toolbar-button" href={`${LOCAL_API}/admin/export?name=${encodeURIComponent(selectedTable)}&format=json&search=${encodeURIComponent(tableSearch)}`}><Download size={14} /> JSON</a></div>
          {tableColumns.length ? <DataTable rows={tableRows} columns={tableColumns.map((key: string) => [key, (row: AnyRecord) => { const value = String(row[key] ?? "-"); return value.length > 90 ? `${value.slice(0, 90)}...` : value; }])} /> : <p className="legend">No records returned.</p>}
          <div className="pager"><span>{formatNumber(tableResult.total)} matching records</span><button className="toolbar-button" disabled={!tableOffset} onClick={() => setTableOffset(Math.max(0, tableOffset - 50))}>Previous</button><button className="toolbar-button" disabled={tableOffset + 50 >= tableResult.total} onClick={() => setTableOffset(tableOffset + 50)}>Next</button></div>
        </section>
      ) : null}

      {tab === "users" ? (
        <div className="admin-grid">
          <section className="form-card">
            <h3><UserPlus size={17} /> Add Administrator</h3>
            <label className="field"><span>Username</span><input value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /></label>
            <label className="field"><span>Initial password</span><input type="password" minLength={12} value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></label>
            <button className="toolbar-button primary" onClick={() => run(async () => { await api("/admin/users", { method: "POST", body: JSON.stringify(newUser) }); setNewUser({ username: "", password: "" }); await refreshUsers(); }, "Administrator created.")}><UserPlus size={15} /> Create Account</button>
            <h3><KeyRound size={17} /> Reset Password</h3>
            <label className="field"><span>Administrator</span><select value={resetUser} onChange={(event) => setResetUser(event.target.value)}><option value="">Select user</option>{users.map((entry) => <option value={entry.id} key={entry.id}>{entry.username}</option>)}</select></label>
            <label className="field"><span>New password</span><input type="password" minLength={12} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
            <button className="toolbar-button" onClick={() => run(async () => { const result = await api("/admin/user/password", { method: "PUT", body: JSON.stringify({ userId: Number(resetUser), password: resetPassword }) }); setResetPassword(""); if (result.signedOut) setAuth({ authenticated: false, setupRequired: false }); else await refreshUsers(); }, "Password reset; existing sessions for that user were signed out.")}><Save size={15} /> Reset Password</button>
          </section>
          <section className="form-card">
            <h3><Users size={17} /> Administrators</h3>
            <div className="admin-users">{users.map((entry) => <div key={entry.id}><strong>{entry.username}</strong><span>{entry.active ? "Active" : "Disabled"} | {formatNumber(entry.sessions)} sessions | Last login {dateLabel(entry.last_login_at)}</span><div className="toolbar"><button className="toolbar-button" onClick={() => run(async () => { await api("/admin/sessions/clear", { method: "POST", body: JSON.stringify({ userId: entry.id }) }); await refreshUsers(); }, "Sessions cleared.")}>Clear Sessions</button><button className="toolbar-button" disabled={entry.id === auth.user?.id} onClick={() => run(async () => { await api("/admin/user/status", { method: "PUT", body: JSON.stringify({ userId: entry.id, active: !entry.active }) }); await refreshUsers(); }, "Account status updated.")}>{entry.active ? "Disable" : "Enable"}</button></div></div>)}</div>
          </section>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="admin-grid audit-grid">
          <section className="form-card"><h3><Activity size={17} /> Admin Actions</h3><div className="audit-list">{auditData.auditLog.map((entry: AnyRecord) => <div key={entry.id}><strong>{entry.action}</strong><span>{entry.username} | {dateLabel(entry.occurred_at)}</span></div>)}</div></section>
          <section className="form-card"><h3><Lock size={17} /> Sign-in History</h3><div className="audit-list">{auditData.logins.map((entry: AnyRecord) => <div key={entry.id} className={entry.successful ? "" : "failed"}><strong>{entry.successful ? "Successful sign-in" : "Failed sign-in"}</strong><span>{entry.username} | {dateLabel(entry.occurred_at)} | {entry.remote_address ?? "-"}</span></div>)}</div></section>
        </div>
      ) : null}

      {tab === "backups" ? (
        <div className="admin-section">
          <section className="form-card">
            <div className="split-header"><h3><HardDrive size={17} /> Database Backups</h3><button className="toolbar-button primary" onClick={() => run(async () => { await api("/admin/backups", { method: "POST", body: "{}" }); await refreshBackups(); }, "Backup created.")}><Save size={15} /> Create Backup</button></div>
            <p className="legend">Backups are SQLite copies stored on the server. Restoration is intentionally performed on the VPS while the service is stopped.</p>
            <div className="backup-list">{backups.map((backup) => <div key={backup.name}><div><strong>{backup.name}</strong><span>{bytesLabel(backup.size)} | {dateLabel(backup.createdAt)}</span></div><a className="toolbar-button" href={`${LOCAL_API}/admin/backup?name=${encodeURIComponent(backup.name)}`}><Download size={14} /> Download</a></div>)}</div>
          </section>
          <section className="form-card maintenance-card">
            <h3><Database size={17} /> Retention Maintenance</h3>
            <p className="legend">Removes snapshots older than the configured {draft.snapshotRetentionDays}-day retention window. Market and activity history are retained.</p>
            <button className="toolbar-button" onClick={() => run(async () => { const result = await api("/admin/maintenance/prune", { method: "POST", body: "{}" }); await refreshStatus(); setMessage(`Removed ${formatNumber(result.removed)} expired snapshots.`); })}><RefreshCw size={15} /> Remove Expired Snapshots</button>
          </section>
        </div>
      ) : null}
      {hasUnsavedSettings ? (
        <div className="floating-save">
          <div><strong>Unsaved changes</strong><span>Save to apply these settings.</span></div>
          <button className="toolbar-button" onClick={revertSettings}><RefreshCw size={14} /> Revert</button>
          <button className="toolbar-button primary" onClick={saveSettings}><Save size={14} /> Save Changes</button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardApp() {
  const [active, setActive] = usePersistedState<ActivePanel>("navigation.page", "overview");
  const mainRef = React.useRef<HTMLElement | null>(null);
  const defaultPageAppliedRef = React.useRef(false);
  const savedPageRef = React.useRef(hasPersistedState("navigation.page") || Boolean(urlPanel()));
  const [appSettings, setAppSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [claimId, setClaimId] = React.useState(DEFAULT_CLAIM_ID);
  const [syncUrl, setSyncUrl] = React.useState(DEFAULT_SYNC_URL);
  const [theme, setTheme] = React.useState<typeof DEFAULT_THEME>(DEFAULT_THEME);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [mapFocus, setMapFocus] = usePersistedState<MapFocus>("map.focus", urlMapFocus());
  const [selectedMemberId, setSelectedMemberId] = usePersistedState("production.member", "All");
  const [toasts, setToasts] = React.useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = usePersistedState<ToastNotice[]>("notifications.log", []);
  const [watches, setWatches] = usePersistedState<WatchEntry[]>("overview.watches", legacyDefaultWatchlist());
  const [userToastSettings, setUserToastSettings] = usePersistedState<UserToastSettings>("user.notifications", DEFAULT_USER_TOAST_SETTINGS);
  const [density, setDensity] = usePersistedState<"comfortable" | "compact">("layout.density", "comfortable");
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [consent, setConsent] = React.useState<AnalyticsConsent>(() => readAnalyticsConsent());
  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const toastTimersRef = React.useRef<Map<string, number>>(new Map());
  const activityNoticeIdsRef = React.useRef<Set<string> | null>(null);
  const activityNoticeClaimRef = React.useRef(claimId);
  const craftQueueRef = React.useRef<{ claimId: string; jobs: Map<string, AnyRecord> } | null>(null);
  const state = useBitjitaData(refreshToken, claimId, active);
  const data = React.useMemo(() => {
    const normalized = normalizeData(state.data);
    return { ...normalized, raw: state.data };
  }, [state.data]);
  const localHistory = useLocalHistory(refreshToken + historyRefreshToken, claimId);
  const selectedProductionMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  analyticsConsent = consent;
  const dismissToast = React.useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);
  const navigate = React.useCallback((panel: ActivePanel, marketTab?: string, nextMapFocus?: MapFocus) => {
    setActive(panel);
    const activeMapFocus = panel === "map" ? nextMapFocus ?? mapFocus : null;
    updateQueryState({
      page: panel,
      tab: panel === "market" ? marketTab ?? null : null,
      item: panel === "market" ? new URLSearchParams(window.location.search).get("item") : null,
      itemName: panel === "market" ? new URLSearchParams(window.location.search).get("itemName") : null,
      itemType: panel === "market" ? new URLSearchParams(window.location.search).get("itemType") : null,
      region: panel === "market" ? new URLSearchParams(window.location.search).get("region") : null,
      mapName: activeMapFocus?.name ?? null,
      mapX: activeMapFocus ? String(activeMapFocus.locationX) : null,
      mapZ: activeMapFocus ? String(activeMapFocus.locationZ) : null,
    });
  }, [mapFocus, setActive]);
  const toggleWatch = React.useCallback((watch: WatchEntry) => {
    setWatches((current) => current.some((entry) => entry.id === watch.id) ? current.filter((entry) => entry.id !== watch.id) : [...current, watch].slice(-12));
  }, [setWatches]);
  const pushToast = React.useCallback((title: string, body: string, kind: ToastKind) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notice: ToastNotice = { id, title, body, kind, occurredAt: new Date().toISOString(), read: false, destination: kind === "market" ? "market" : "production" };
    setToasts((current) => [...current, notice].slice(-4));
    setNotificationLog((current) => [notice, ...current].slice(0, 80));
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((current) => current.filter((notice) => notice.id !== id));
    }, 7000);
    toastTimersRef.current.set(id, timer);
  }, [setNotificationLog]);
  React.useEffect(() => () => {
    for (const timer of toastTimersRef.current.values()) window.clearTimeout(timer);
    toastTimersRef.current.clear();
  }, []);
  React.useEffect(() => {
    const requested = urlPanel();
    const requestedMapFocus = urlMapFocus();
    if (requestedMapFocus) setMapFocus(requestedMapFocus);
    if (requested) setActive(requested);
    function restoreFromHistory() {
      const panel = urlPanel();
      const historyMapFocus = urlMapFocus();
      if (historyMapFocus) setMapFocus(historyMapFocus);
      if (panel) setActive(panel);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [setActive, setMapFocus]);
  React.useEffect(() => {
    function openCommands(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === "/" && !isEditing) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", openCommands);
    return () => window.removeEventListener("keydown", openCommands);
  }, []);
  React.useEffect(() => {
    fetch(`${LOCAL_API}/config`)
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (!config) return;
        const next = normalizeAppSettings(config);
        setAppSettings(next);
        setClaimId(next.claimId);
        setSyncUrl(next.syncUrl);
        setTheme(next.theme);
        if (!defaultPageAppliedRef.current && !savedPageRef.current && next.defaultPage !== "admin") {
          defaultPageAppliedRef.current = true;
          setActive(next.defaultPage);
        }
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  React.useEffect(() => {
    if (consent !== "accepted") return;
    trackAnalyticsEvent("page_view", undefined, undefined, active);
    const enteredAt = Date.now();
    let recorded = false;
    const recordDuration = () => {
      if (recorded) return;
      recorded = true;
      const durationSeconds = Math.round((Date.now() - enteredAt) / 1000);
      if (durationSeconds > 0) trackAnalyticsEvent("page_duration", undefined, durationSeconds, active);
    };
    window.addEventListener("pagehide", recordDuration);
    return () => {
      window.removeEventListener("pagehide", recordDuration);
      recordDuration();
    };
  }, [active, consent]);
  React.useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [active]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setRefreshToken((x) => x + 1), appSettings.refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [appSettings.refreshSeconds]);
  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;
    const favicon = appSettings.branding.favicon;
    link.href = favicon ? `${favicon.url}?v=${encodeURIComponent(favicon.updatedAt)}` : "/favicon.svg";
    link.type = favicon?.contentType ?? "image/svg+xml";
  }, [appSettings.branding.favicon]);
  React.useEffect(() => {
    if (state.data) setLastUpdated(new Date());
  }, [state.data]);
  React.useEffect(() => {
    if (selectedMemberId !== "All" && state.data && !selectedProductionMember) setSelectedMemberId("All");
  }, [selectedMemberId, selectedProductionMember, state.data]);
  React.useEffect(() => {
    if (activityNoticeClaimRef.current !== claimId) {
      activityNoticeClaimRef.current = claimId;
      activityNoticeIdsRef.current = null;
    }
    if (!localHistory.refreshToken) return;
    const knownIds = localHistory.activity.map((event) => String(event.id));
    if (activityNoticeIdsRef.current == null) {
      activityNoticeIdsRef.current = new Set(knownIds);
      return;
    }
    const notable = new Set(["market_new_listing", "market_sale", "market_sale_confirmed"]);
    const unseen = localHistory.activity
      .filter((event) => !activityNoticeIdsRef.current?.has(String(event.id)) && notable.has(String(event.event_type)))
      .slice(0, 3)
      .reverse();
    for (const id of knownIds) activityNoticeIdsRef.current.add(id);
    for (const event of unseen) {
      const isListing = event.event_type === "market_new_listing";
      if (isListing && (!appSettings.toastSettings.marketListings || !userToastSettings.marketListings)) continue;
      if (!isListing && (!appSettings.toastSettings.marketSales || !userToastSettings.marketSales)) continue;
      pushToast(isListing ? "New market listing" : "Market sale", activitySummary(event), "market");
    }
  }, [appSettings.toastSettings.marketListings, appSettings.toastSettings.marketSales, claimId, localHistory.activity, localHistory.refreshToken, pushToast, userToastSettings.marketListings, userToastSettings.marketSales]);
  React.useEffect(() => {
    if (!state.data) return;
    const current = new Map<string, AnyRecord>(data.crafts.map((job: AnyRecord) => [String(job.entityId ?? `${job.buildingName}-${job.recipeId}`), job]));
    const previous = craftQueueRef.current;
    if (!previous || previous.claimId !== claimId) {
      craftQueueRef.current = { claimId, jobs: current };
      return;
    }
    if (!appSettings.toastSettings.production || !userToastSettings.production) {
      craftQueueRef.current = { claimId, jobs: current };
      return;
    }
    const started = [...current.entries()].filter(([id]) => !previous.jobs.has(id)).slice(0, 2);
    const completed = [...previous.jobs.entries()].filter(([id]) => !current.has(id)).slice(0, 2);
    for (const [, job] of started) {
      pushToast("Craft started", `${craftDisplayName(job, data.raw?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production");
    }
    for (const [, job] of completed) {
      pushToast("Craft completed", `${craftDisplayName(job, state.data?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production");
    }
    craftQueueRef.current = { claimId, jobs: current };
  }, [appSettings.toastSettings.production, claimId, data.crafts, data.raw?.crafts, pushToast, state.data, userToastSettings.production]);
  React.useEffect(() => {
    if (!appSettings.browserSnapshotsEnabled || !state.data || !data.claim?.entityId) return;
    const controller = new AbortController();
    async function record() {
      try {
        const response = await fetch(`${LOCAL_API}/snapshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimId,
            claim: data.claim,
            membersCount: data.members.length,
            buildingsCount: data.buildings.length,
            market: data.market,
          }),
          signal: controller.signal,
        });
        if (response.ok) setHistoryRefreshToken((x) => x + 1);
      } catch {
        // The app can still run without the local history server.
      }
    }
    record();
    return () => controller.abort();
  }, [appSettings.browserSnapshotsEnabled, claimId, state.data, data.claim, data.members.length, data.buildings.length, data.market]);

  const panels: Record<string, React.ReactNode> = {
    overview: <Overview data={data} onNavigate={navigate} logo={appSettings.branding.logo} watches={watches} onToggleWatch={toggleWatch} />,
    members: <Members data={data} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} />,
    skills: <Skills data={data} />,
    production: <Production data={data} refreshToken={refreshToken} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} watches={watches} onToggleWatch={toggleWatch} />,
    publiccrafts: <div className="panel public-craft-page"><PublicCraftFinder refreshToken={refreshToken} monitoredRegionId={String(data.claim.regionId ?? "")} defaultRegionId={appSettings.defaultRegion} onShowMap={(focus) => { setMapFocus(focus); navigate("map", undefined, focus); }} /></div>,
    inventory: <Inventory data={data} />,
    construction: <Construction data={data} />,
    buildings: <Buildings data={data} />,
    research: <Research data={data} />,
    market: <Market data={data} history={localHistory.market} claimId={claimId} watches={watches} onToggleWatch={toggleWatch} />,
    empire: <Region data={data} />,
    map: <MapPanel data={data} focus={mapFocus} onClearFocus={() => { setMapFocus(null); updateQueryState({ mapName: null, mapX: null, mapZ: null }); }} />,
    sync: <SyncPanel syncUrl={syncUrl} />,
    activity: <ActivityPanel activity={localHistory.activity} activityTotal={localHistory.activityTotal} claimId={claimId} error={localHistory.error} />,
    admin: <AdminPanel settings={appSettings} onSettingsSaved={(settings) => { setAppSettings(settings); setClaimId(settings.claimId); setSyncUrl(settings.syncUrl ?? DEFAULT_SYNC_URL); setTheme({ ...DEFAULT_THEME, ...settings.theme }); setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); }} />,
  };

  return (
    <div className={`app-shell density-${density}`}>
      <aside>
        <div className="brand">{appSettings.branding.logo ? <img src={`${appSettings.branding.logo.url}?v=${encodeURIComponent(appSettings.branding.logo.updatedAt)}`} alt="" /> : <Shield />}<div><h1>Claim Monitor</h1><span>Timbersteel</span></div></div>
        <button className="command-launch" onClick={() => setCommandOpen(true)}><Search size={15} /><span>Quick find</span><kbd>Ctrl K</kbd></button>
        <a className="discord-cta" href={DISCORD_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /><span>Join Discord</span><ExternalLink size={13} /></a>
        <nav>{NAV.map(([id, label, Icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={16} />{label}</button>)}</nav>
        <div className="sidebar-tools">
          <button onClick={() => setUserSettingsOpen(true)} title="Browser settings"><Settings size={14} /> Browser Settings</button>
          <button className="notification-button" onClick={() => { setNoticeOpen(true); setNotificationLog((current) => current.map((notice) => ({ ...notice, read: true }))); }}><Bell size={14} /> Updates{notificationLog.some((notice) => !notice.read) ? <b>{notificationLog.filter((notice) => !notice.read).length}</b> : null}</button>
        </div>
        <div className="refresh-status" title={`Data refreshes automatically every ${appSettings.refreshSeconds} seconds`}>
          <span className={`refresh-dot ${state.loading && state.data ? "refreshing" : ""}`} />
          <span>
            <small>{state.loading && state.data ? "Refreshing" : "Last refresh"}</small>
            <time>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Waiting..."}</time>
          </span>
        </div>
      </aside>
      <main ref={mainRef}>
        {state.loading && !state.data ? <AppSkeleton /> : state.error && !state.data ? <div className="error">Failed to load BitJita data: {state.error}</div> : <div className="page-view" key={active}>{panels[active]}</div>}
        <footer className="app-footer">
          <div className="footer-legal">
            <span>&copy; {new Date().getFullYear()} Timbersteel Claim Monitor</span>
            <span>Unofficial fan-made tool. Not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc. Data provided by the <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer">BitJita API</a>.</span>
          </div>
          <div>
            <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer"><ExternalLink size={13} /> GitHub</a>
            <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Feature Requests</a>
            <button className="footer-link" onClick={() => setPrivacyOpen(true)}><Shield size={13} /> Privacy & Analytics</button>
            <button className="footer-link" onClick={() => setTermsOpen(true)}><FileText size={13} /> Terms & Bot Use</button>
            <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer"><ExternalLink size={13} /> BitJita API</a>
            <a href="https://bitcraftmap.com/" target="_blank" rel="noreferrer"><ExternalLink size={13} /> BitCraft Map</a>
          </div>
        </footer>
      </main>
      <button className="floating-help" onClick={() => setHelpOpen(true)} aria-label="Help and application information" title="Help and application information">?</button>
      <ToastStack notices={toasts} onDismiss={dismissToast} />
      {noticeOpen ? <NotificationDrawer notices={notificationLog} onClose={() => setNoticeOpen(false)} onOpenNotice={(notice) => { setNoticeOpen(false); navigate(notice.destination ?? "activity"); }} /> : null}
      {commandOpen ? <CommandPalette data={data} onClose={() => setCommandOpen(false)} onNavigate={(panel, tab) => navigate(panel, tab)} onSelectMember={setSelectedMemberId} /> : null}
      {userSettingsOpen ? <UserSettingsDialog density={density} onDensityChange={setDensity} toastSettings={{ ...DEFAULT_USER_TOAST_SETTINGS, ...userToastSettings }} onToastSettingsChange={setUserToastSettings} watchCount={watches.length} onClearWatches={() => setWatches([])} onResetSettings={() => { clearBrowserLocalSettings(); window.location.reload(); }} onClose={() => setUserSettingsOpen(false)} /> : null}
      {helpOpen ? <HelpCenter version={APP_VERSION} onClose={() => setHelpOpen(false)} onPrivacy={() => setPrivacyOpen(true)} onTerms={() => setTermsOpen(true)} /> : null}
      {consent == null && !privacyOpen ? <CookieBanner onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); }} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      {privacyOpen ? <PrivacyDialog consent={consent} onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); setPrivacyOpen(false); }} onClose={() => setPrivacyOpen(false)} /> : null}
      {termsOpen ? <TermsDialog onClose={() => setTermsOpen(false)} onPrivacy={() => setPrivacyOpen(true)} /> : null}
    </div>
  );
}

function App() {
  const dedicatedLegalPath = window.location.pathname === "/terms" ? "terms" : window.location.pathname === "/privacy" ? "privacy" : null;
  return dedicatedLegalPath ? <DedicatedLegalPage type={dedicatedLegalPath} /> : <DashboardApp />;
}

createRoot(document.getElementById("root")!).render(<App />);
