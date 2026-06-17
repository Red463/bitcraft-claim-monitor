import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/phase6.css";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Bell,
  Box,
  Building2,
  Calculator,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  CircleHelp,
  Clock,
  Command,
  Crown,
  Database,
  Download,
  ExternalLink,
  Factory,
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
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
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
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
  TrendingDown,
  TrendingUp,
  Trophy,
  Trash2,
  Upload,
  Users,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import packageJson from "../package.json";
import { useBitjitaData } from "./api/bitjita";
import { useLocalHistory, useNotificationActivity } from "./api/localHistory";
import type { BotSection } from "./components/bot/BotSectionNav";
import { ApiErrorState, ApiStatusBanner, AppSkeleton, Header, PageLoadingIndicator, RefreshStatus, TablePanel, ToolbarButton, type ApiStatusDiagnostics } from "./components/main/AppChrome";
import { RarityBadge, TierBadge, TrackedOwnerName } from "./components/main/Badges";
import { CommandPalette } from "./components/main/CommandPalette";
import { DashboardCardHeader, DashboardMetric, DashboardTrend } from "./components/main/DashboardWidgets";
import { DataTable } from "./components/main/DataTable";
import { ItemIcon, ItemLabel, TierMaterialIcon } from "./components/main/ItemDisplay";
import { NotificationDrawer, ToastStack, dedupeNotifications, type ToastKind, type ToastNotice } from "./components/main/Notifications";
import { SearchBox } from "./components/main/SearchBox";
import { Segmented } from "./components/main/Segmented";
import { Info, LiveValue, MiniStat, Stat } from "./components/main/Stats";
import { BuyMeCoffeeButton, DiscordIcon } from "./components/main/SupportLinks";
import { CookieBanner, DedicatedLegalPage, DiscordSignInPrompt, HelpCenter, PrivacyDialog, TermsDialog } from "./components/main/LegalDialogs";
import {
  buildConstructionProjects,
  claimSupplyCap,
  claimSupplyRunOutAt,
  constructionNeededMaterials,
  parseDateValue,
  toNumber,
  unwrap,
  type AnyRecord,
} from "./main-app-data";
import {
  dateLabel,
  formatCurrentSession,
  formatCompactNumber,
  formatDaysAndHours,
  formatDuration,
  formatEquipmentSlot,
  formatNumber,
  formatPlaytime,
  shortDateLabel,
  timeAgo,
  timestampMs,
} from "./utils/format";
import { mapWithBrowserConcurrency } from "./utils/concurrency";
import { clearBrowserLocalSettings, hasPersistedState, usePersistedState } from "./hooks/usePersistedState";
import { getTrackedOwnerName } from "./utils/ownership";
import { bitjitaIconUrl, isMarketableItem, playerToolbeltTools } from "./utils/items";
import { buyOrderAgeDays, normalizeBuyOrder, sortBuyOrdersByBestPrice } from "./utils/marketOrders";
import { normalizeData } from "./utils/normalize";
import { unique } from "./utils/array";
import { bitjitaSkillRows, PROFESSION_IDS, skillNameFromRows, skillTier, SKILL_IDS, SKILL_NAMES, TOOL_TAG_BY_TYPE } from "./utils/professions";
import type { ActivePanel, LocalHistoryState, LoadState } from "./types/app";
import { Construction } from "./pages/ConstructionPage";
import { CraftCalculatorPage } from "./pages/CraftCalculatorPage";
import { Members } from "./pages/MembersPage";
import { Research } from "./pages/ResearchPage";
import { Region } from "./pages/RegionPage";
import { Skills } from "./pages/SkillsPage";
import { SyncPanel } from "./pages/SyncPage";
import { ActivityPanel, Dashboard, Inventory, Leaderboard, MapPanel, Market, Production, PublicCraftFinder, activityNoticeKey, activitySummary, toastItemFromActivity, type MapFocus } from "./pages/MainPages";
import "./styles.css";

const BotSectionNav = React.lazy(() => import("./components/bot/BotSectionNav").then((module) => ({ default: module.BotSectionNav })));
const DiscordChannelsSection = React.lazy(() => import("./components/bot/DiscordChannelsSection").then((module) => ({ default: module.DiscordChannelsSection })));
const DiscordColourRolesSection = React.lazy(() => import("./components/bot/DiscordColourRolesSection").then((module) => ({ default: module.DiscordColourRolesSection })));
const DiscordCraftWatchRolesSection = React.lazy(() => import("./components/bot/DiscordCraftWatchRolesSection").then((module) => ({ default: module.DiscordCraftWatchRolesSection })));
const DiscordMemberRecordsSection = React.lazy(() => import("./components/bot/DiscordMemberRecordsSection").then((module) => ({ default: module.DiscordMemberRecordsSection })));
const DiscordModerationSection = React.lazy(() => import("./components/bot/DiscordModerationSection").then((module) => ({ default: module.DiscordModerationSection })));
const DiscordNotificationsSection = React.lazy(() => import("./components/bot/DiscordNotificationsSection").then((module) => ({ default: module.DiscordNotificationsSection })));
const DiscordRoleManagerSection = React.lazy(() => import("./components/bot/DiscordRoleManagerSection").then((module) => ({ default: module.DiscordRoleManagerSection })));
const DiscordRolePanelsSection = React.lazy(() => import("./components/bot/DiscordRolePanelsSection").then((module) => ({ default: module.DiscordRolePanelsSection })));
const DiscordSafetySection = React.lazy(() => import("./components/bot/DiscordSafetySection").then((module) => ({ default: module.DiscordSafetySection })));
const DiscordSetupSection = React.lazy(() => import("./components/bot/DiscordSetupSection").then((module) => ({ default: module.DiscordSetupSection })));
const DiscordDiagnosticsPanel = React.lazy(() => import("./components/bot/DiscordDiagnosticsPanel").then((module) => ({ default: module.DiscordDiagnosticsPanel })));
const DiscordTestsPanel = React.lazy(() => import("./components/bot/DiscordTestsPanel").then((module) => ({ default: module.DiscordTestsPanel })));

const DEFAULT_CLAIM_ID = "1369094286777412590";
const DEFAULT_SYNC_URL = "https://bitcraftsync.app/s/MUFJw3#claims=1369094286777412590&players=1369094286756659093%2C576460752388321942%2C864691128512324120&shopping=i.2036617800%3A20&p.exc=1369094286756659093%3A1369094286764705296%2C1369094286756792917%3B864691128512324120%3A1369094286778153104%2C1369094286772328807%2C1369094286761962469%3B576460752388321942%3A1369094286783870822&crafts=1&crafts.pf=includedPlayers";
const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor";
const DISCORD_URL = "https://discord.gg/ET4bteqbG5";
const APP_VERSION = packageJson.version;

type ToastOptions = { occurredAt?: string; sourceKey?: string };
type BrandingAsset = { fileName: string; contentType: string; updatedAt: string; url: string };
type AnalyticsConsent = "accepted" | "declined" | null;
type UserToastSettings = { marketListings: boolean; marketSales: boolean; production: boolean };
type ActiveRegion = { regionId: string; regionName?: string; active?: boolean; syncing?: boolean; signedInPlayers?: number; playersInQueue?: number; updatedAt?: string | null; source?: string };
type AppUser = {
  id: number;
  discordId: string;
  username: string;
  globalName: string;
  avatarUrl: string | null;
  characterPlayerId: string;
  characterName: string;
  characterStatus: "unlinked" | "pending" | "approved" | "rejected" | string;
  settings: AnyRecord;
  createdAt?: string;
  lastLoginAt?: string;
};
type UserAuthState = { user: AppUser | null; discordLoginEnabled: boolean };
type ColourRoleDefinition = { key: string; label: string; roleName: string; roleId: string; color: number };
type DiscordRoleOption = { key: string; label: string; roleId: string; emoji: string };
type DiscordRolePanel = { key: string; label: string; channelId: string; messageId: string; title: string; description: string; mode: "single" | "multi"; showHelperText: boolean; options: DiscordRoleOption[] };
type DiscordWelcomeFlow = { enabled: boolean; channelId: string; messageId: string; title: string; message: string; readyRoleId: string; showNextStep: boolean };
type DiscordPresence = { enabled: boolean; status: "online" | "idle" | "dnd" | "invisible"; activityType: "playing" | "watching" | "listening" | "competing"; activityText: string };
type DiscordSettings = {
  enabled: boolean;
  applicationId: string;
  publicKey: string;
  guildId: string;
  channelId: string;
  minSaleValue: number;
  supplyRunwayDaysThreshold: number;
  productionMinXp: number;
  productionMinAgeMinutes: number;
  productionUsers: string;
  supplyReportIntervalDays: number;
  channels: Record<string, string>;
  notificationChannels: Record<string, string>;
  craftChannels: Record<string, string>;
  craftRoles: Record<string, string>;
  colourRolesChannelId: string;
  colourRolesMessageId: string;
  colourRoles: ColourRoleDefinition[];
  rolePanels: DiscordRolePanel[];
  welcomeFlow: DiscordWelcomeFlow;
  presence: DiscordPresence;
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
  excludedMemberIds: string[];
  theme: typeof DEFAULT_THEME;
  refreshSeconds: number;
  serverRefreshSeconds: number;
  collectorSettings: Record<string, { label: string; enabled: boolean; intervalSeconds: number }>;
  defaultPage: ActivePanel;
  defaultRegion: string;
  additionalActiveRegions: string;
  toastSettings: { marketListings: boolean; marketSales: boolean; production: boolean };
  branding: { logo?: BrandingAsset; favicon?: BrandingAsset };
  snapshotRetentionDays: number;
  visitorSecurity: { fullIpRetentionDays: number; statsRetentionDays: number; geoipProvider: string; geoipCacheDays: number; geoipSourceUrl: string; geoipAccountId: string; geoipLicenseKey?: string; geoipLicenseKeyConfigured?: boolean; geoipClearLicenseKey?: boolean };
  browserSnapshotsEnabled: boolean;
  discord: DiscordSettings;
};

type NavItem = readonly [ActivePanel, string, LucideIcon];
type NavGroup = { id: string; label: string; items: readonly NavItem[] };

const NAV_GROUPS = [
  { id: "command", label: "Command", items: [
    ["dashboard", "Dashboard", Home],
    ["leaderboard", "Leaderboard", Trophy],
  ] },
  { id: "settlement", label: "Settlement", items: [
    ["members", "Members", Users],
    ["skills", "Professions", GraduationCap],
    ["production", "Production", Factory],
    ["inventory", "Inventory", Package],
    ["construction", "Construction", Hammer],
    ["research", "Research", FlaskConical],
  ] },
  { id: "economy", label: "Economy & Region", items: [
    ["market", "Market", CircleDollarSign],
    ["empire", "Region", Globe2],
    ["map", "Map", MapIcon],
    ["activity", "Activity", Activity],
  ] },
  { id: "tools", label: "Tools", items: [
    ["publiccrafts", "Public Craft Finder", Search],
    ["craftcalc", "Craft Calculator", Calculator],
    ["sync", "Sync", Share2],
  ] },
] as const satisfies readonly NavGroup[];

const ADMIN_NAV_ITEM = ["admin", "Admin", KeyRound] as const satisfies NavItem;
const NAV: readonly NavItem[] = NAV_GROUPS.reduce<NavItem[]>((items, group) => {
  items.push(...group.items);
  return items;
}, [ADMIN_NAV_ITEM]);
const DEFAULT_SIDEBAR_GROUPS = Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true])) as Record<string, boolean>;

const DEFAULT_THEME = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  cardTop: "#111923",
  cardBottom: "#080d14",
  cardTitle: "#b8c2cf",
  cardValue: "#ffffff",
  iconBg: "#12181f",
  activeColor: "#f0c64f",
  activeBg: "#3a3118",
  activeBorder: "#7a6428",
  hoverBorder: "#5f5127",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
  gradientTop: "#1f1f1f",
  gradientMid: "#080808",
  gradientBase: "#030303",
  gradientTopStop: "0",
  gradientMidStop: "58",
  gradientFadeStop: "100",
  gradientHeight: "32",
};
type ThemeSettings = typeof DEFAULT_THEME;
type ThemeKey = keyof ThemeSettings;
type ThemeRangeKey = "gradientTopStop" | "gradientMidStop" | "gradientFadeStop" | "gradientHeight";
type ThemeColorKey = Exclude<ThemeKey, ThemeRangeKey>;
const CUSTOM_THEME_STORAGE_KEY = "theme.custom.local";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const THEME_RANGE_FIELD_CONFIG: Record<ThemeRangeKey, { label: string; cssVar: string; min: number; max: number; unit: string }> = {
  gradientTopStop: { label: "Top colour stop", cssVar: "--theme-gradient-top-stop", min: 0, max: 100, unit: "%" },
  gradientMidStop: { label: "Middle colour stop", cssVar: "--theme-gradient-mid-stop", min: 0, max: 100, unit: "%" },
  gradientFadeStop: { label: "Fade stop", cssVar: "--theme-gradient-fade-stop", min: 0, max: 100, unit: "%" },
  gradientHeight: { label: "Gradient height", cssVar: "--theme-gradient-height", min: 12, max: 72, unit: "vh" },
};
const THEME_RANGE_KEYS = Object.keys(THEME_RANGE_FIELD_CONFIG) as ThemeRangeKey[];

function clampThemeNumber(value: unknown, min: number, max: number, fallback: string) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, Math.round(parsed))));
}

function normalizeThemeCandidate(input: unknown): { theme: ThemeSettings; count: number } | null {
  const source = (input as AnyRecord)?.theme && typeof (input as AnyRecord).theme === "object" ? (input as AnyRecord).theme : input;
  if (!source || typeof source !== "object") return null;
  const nextTheme = { ...DEFAULT_THEME };
  let applied = 0;
  for (const key of Object.keys(DEFAULT_THEME) as ThemeKey[]) {
    const value = (source as AnyRecord)[key];
    if (THEME_RANGE_KEYS.includes(key as ThemeRangeKey)) {
      const config = THEME_RANGE_FIELD_CONFIG[key as ThemeRangeKey];
      const nextValue = clampThemeNumber(value, config.min, config.max, DEFAULT_THEME[key]);
      if (nextValue !== DEFAULT_THEME[key] || value !== undefined) {
        nextTheme[key] = nextValue;
        applied += 1;
      }
    } else if (typeof value === "string" && HEX_COLOR_RE.test(value)) {
      nextTheme[key] = value;
      applied += 1;
    }
  }
  return applied ? { theme: nextTheme, count: applied } : null;
}

function loadSavedCustomTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return normalizeThemeCandidate(JSON.parse(raw))?.theme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

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
  modLog: "",
  ...DEFAULT_CRAFT_CHANNELS,
};

const DEFAULT_CRAFT_ROLES: Record<string, string> = {
  forestry: "1511297282769944596",
  carpentry: "1511297283386249358",
  masonry: "1511297283931639808",
  mining: "1511297284724494399",
  smithing: "1511297285772804206",
  scholar: "1511297286469324890",
  leatherworking: "1511297288511815751",
  tailoring: "1511297287157055632",
  farming: "1511297288176144425",
  fishing: "1511297635665969222",
  cooking: "1511297639269011486",
  foraging: "1511297639868665966",
  hunting: "1511297640866906153",
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

const MAP_CATEGORY_ORDER = [
  "Ancient Loot",
  "Baitfish",
  "Berry",
  "Chummed Ocean Fish School",
  "Clay",
  "Coconut",
  "Fiber Plant",
  "Flower",
  "Fruit",
  "Huntable Animal",
  "Hexite Meteor",
  "Lake Fish School",
  "Metal Outcrop",
  "Monster Den",
  "Mushroom",
  "Ocean Fish School",
  "Ore Vein",
  "Rare Mushroom",
  "Rare Research",
  "Research",
  "Rock",
  "Rock Boulder",
  "Rock Outcrop",
  "Sailing Cargo",
  "Salt",
  "Sand",
  "Sapling",
  "Seasonal",
  "Seasonal Resource",
  "Stick",
  "Treasure",
  "Tree",
  "Wild Grain",
  "Wild Vegetable",
  "Wonder Resource",
  "Wood Logs",
];
const MAP_CATEGORY_SET = new Set(MAP_CATEGORY_ORDER);

const DEFAULT_COLOUR_ROLES = [
  { key: "green1", label: "Green 1", roleName: "Green 1", roleId: "", color: 0x2be56f },
  { key: "green2", label: "Green 2", roleName: "Green 2", roleId: "", color: 0x1fb72e },
  { key: "blue1", label: "Blue 1", roleName: "Blue 1", roleId: "", color: 0x5fa8ff },
  { key: "blue2", label: "Blue 2", roleName: "Blue 2", roleId: "", color: 0x244cff },
  { key: "purple", label: "Purple", roleName: "Purple", roleId: "", color: 0x9b4acb },
  { key: "pink", label: "Pink", roleName: "Pink", roleId: "", color: 0xff4f88 },
  { key: "red", label: "Red", roleName: "Red", roleId: "", color: 0xff2028 },
  { key: "yellow", label: "Yellow", roleName: "Yellow", roleId: "", color: 0xf4c430 },
  { key: "orange", label: "Orange", roleName: "Orange", roleId: "", color: 0xff9f1c },
  { key: "black", label: "Black", roleName: "Black", roleId: "", color: 0x111111 },
  { key: "white", label: "White", roleName: "White", roleId: "", color: 0xf4f4f4 },
];

const DEFAULT_ROLE_PANELS: DiscordRolePanel[] = [
  {
    key: "access",
    label: "Access Roles",
    channelId: "",
    messageId: "",
    title: "Welcome to Timbersteel Trade!",
    description: "Choose your access role below.",
    mode: "single",
    showHelperText: true,
    options: [
      { key: "citizen", label: "Citizen", roleId: "", emoji: "1" },
      { key: "visitor", label: "Visitor", roleId: "", emoji: "2" },
    ],
  },
  {
    key: "professions",
    label: "Profession Roles",
    channelId: "",
    messageId: "",
    title: "Choose Your Professions",
    description: "Select as many profession interests as you like.",
    mode: "multi",
    showHelperText: true,
    options: Object.keys(DEFAULT_CRAFT_ROLES).map((key) => ({
      key,
      label: key === "leatherworking" ? "Leatherworking" : key[0].toUpperCase() + key.slice(1),
      roleId: DEFAULT_CRAFT_ROLES[key],
      emoji: "",
    })),
  },
  { key: "events", label: "Event Roles", channelId: "", messageId: "", title: "Event Roles", description: "Choose event pings you want.", mode: "multi", showHelperText: true, options: [] },
  { key: "timezones", label: "Timezone Roles", channelId: "", messageId: "", title: "Timezone Roles", description: "Choose your timezone group.", mode: "single", showHelperText: true, options: [] },
];

const DEFAULT_WELCOME_FLOW: DiscordWelcomeFlow = {
  enabled: false,
  channelId: "",
  messageId: "",
  title: "Welcome to Timbersteel Trade",
  message: "Read the welcome steps, choose your roles, then click Ready.",
  readyRoleId: "",
  showNextStep: true,
};

const DEFAULT_DISCORD_PRESENCE: DiscordPresence = {
  enabled: true,
  status: "online",
  activityType: "watching",
  activityText: "app.timbersteeltrade.com",
};

function uniqueKey(prefix = "colour"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function discordColorToHex(value: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.round(toNumber(value)))).toString(16).padStart(6, "0")}`;
}

function hexToDiscordColor(value: string): number {
  const cleaned = String(value ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return cleaned ? parseInt(cleaned.padEnd(6, "0"), 16) : 0xf4c430;
}

function normalizeColourRoleDefinition(value: AnyRecord, fallback?: ColourRoleDefinition): ColourRoleDefinition {
  const label = String(value?.label ?? fallback?.label ?? "New Colour").trim() || "New Colour";
  const savedRoleName = String(value?.roleName ?? "").trim();
  return {
    key: String(value?.key ?? fallback?.key ?? uniqueKey()).trim() || uniqueKey(),
    label,
    roleName: savedRoleName || fallback?.roleName || label,
    roleId: String(value?.roleId ?? fallback?.roleId ?? "").trim(),
    color: Math.max(toNumber(value?.color ?? fallback?.color ?? 0xf4c430), 0),
  };
}

function normalizeDiscordRoleOption(value: AnyRecord, fallback?: DiscordRoleOption): DiscordRoleOption {
  const label = String(value?.label ?? fallback?.label ?? "Role").trim() || "Role";
  return {
    key: String(value?.key ?? fallback?.key ?? uniqueKey("role")).trim() || uniqueKey("role"),
    label,
    roleId: String(value?.roleId ?? fallback?.roleId ?? "").trim(),
    emoji: String(value?.emoji ?? fallback?.emoji ?? "").trim(),
  };
}

function normalizeDiscordRolePanel(value: AnyRecord, fallback?: DiscordRolePanel): DiscordRolePanel {
  const label = String(value?.label ?? fallback?.label ?? "Role Panel").trim() || "Role Panel";
  const options = Array.isArray(value?.options) ? value.options : fallback?.options ?? [];
  return {
    key: String(value?.key ?? fallback?.key ?? uniqueKey("panel")).trim() || uniqueKey("panel"),
    label,
    channelId: String(value?.channelId ?? fallback?.channelId ?? "").trim(),
    messageId: String(value?.messageId ?? fallback?.messageId ?? "").trim(),
    title: String(value?.title ?? fallback?.title ?? label).trim() || label,
    description: String(value?.description ?? fallback?.description ?? "").trim(),
    mode: String(value?.mode ?? fallback?.mode ?? "multi") === "single" ? "single" : "multi",
    showHelperText: value?.showHelperText ?? fallback?.showHelperText ?? true,
    options: options.map((option: AnyRecord, index: number) => normalizeDiscordRoleOption(option, fallback?.options?.[index])),
  };
}

function normalizeDiscordWelcomeFlow(value: AnyRecord): DiscordWelcomeFlow {
  return {
    ...DEFAULT_WELCOME_FLOW,
    ...(value ?? {}),
    enabled: value?.enabled === true,
    channelId: String(value?.channelId ?? "").trim(),
    messageId: String(value?.messageId ?? "").trim(),
    title: String(value?.title ?? DEFAULT_WELCOME_FLOW.title).trim() || DEFAULT_WELCOME_FLOW.title,
    message: String(value?.message ?? DEFAULT_WELCOME_FLOW.message).trim() || DEFAULT_WELCOME_FLOW.message,
    readyRoleId: String(value?.readyRoleId ?? "").trim(),
    showNextStep: value?.showNextStep !== false,
  };
}

function normalizeDiscordPresence(value: AnyRecord = {}): DiscordPresence {
  const status = ["online", "idle", "dnd", "invisible"].includes(String(value?.status)) ? String(value.status) as DiscordPresence["status"] : DEFAULT_DISCORD_PRESENCE.status;
  const activityType = ["playing", "watching", "listening", "competing"].includes(String(value?.activityType)) ? String(value.activityType) as DiscordPresence["activityType"] : DEFAULT_DISCORD_PRESENCE.activityType;
  return {
    ...DEFAULT_DISCORD_PRESENCE,
    ...(value ?? {}),
    enabled: value?.enabled !== false,
    status,
    activityType,
    activityText: String(value?.activityText ?? DEFAULT_DISCORD_PRESENCE.activityText).trim() || DEFAULT_DISCORD_PRESENCE.activityText,
  };
}

const DISCORD_CHANNEL_FIELDS = Object.keys(DEFAULT_DISCORD_CHANNELS);
const DEFAULT_COLLECTOR_SETTINGS: AppSettings["collectorSettings"] = {
  claim: { label: "Claim", enabled: true, intervalSeconds: 30 },
  members: { label: "Members", enabled: true, intervalSeconds: 30 },
  players: { label: "Player details", enabled: true, intervalSeconds: 60 },
  professions: { label: "Professions", enabled: true, intervalSeconds: 30 },
  production: { label: "Production", enabled: true, intervalSeconds: 30 },
  inventory: { label: "Inventory and storage", enabled: true, intervalSeconds: 60 },
  construction: { label: "Construction", enabled: true, intervalSeconds: 60 },
  research: { label: "Research", enabled: true, intervalSeconds: 600 },
  market: { label: "Market", enabled: true, intervalSeconds: 60 },
  buyOrders: { label: "Regional buy orders", enabled: true, intervalSeconds: 300 },
  region: { label: "Region", enabled: true, intervalSeconds: 300 },
  mapCatalog: { label: "Map/catalog", enabled: true, intervalSeconds: 600 },
  snapshotHistory: { label: "Snapshot and history", enabled: true, intervalSeconds: 60 },
  storageActivity: { label: "Storage activity", enabled: true, intervalSeconds: 60 },
  marketTrades: { label: "Member market trades", enabled: true, intervalSeconds: 60 },
};

const DEFAULT_SETTINGS: AppSettings = {
  claimId: DEFAULT_CLAIM_ID,
  syncUrl: DEFAULT_SYNC_URL,
  excludedMemberIds: [],
  theme: DEFAULT_THEME,
  refreshSeconds: 30,
  serverRefreshSeconds: 30,
  collectorSettings: DEFAULT_COLLECTOR_SETTINGS,
  defaultPage: "dashboard",
  defaultRegion: "",
  additionalActiveRegions: "",
  toastSettings: { marketListings: true, marketSales: true, production: true },
  branding: {},
  snapshotRetentionDays: 365,
  visitorSecurity: { fullIpRetentionDays: 7, statsRetentionDays: 180, geoipProvider: "ipapi", geoipCacheDays: 30, geoipSourceUrl: "", geoipAccountId: "", geoipLicenseKey: "", geoipLicenseKeyConfigured: false },
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
    productionMinAgeMinutes: 5,
    productionUsers: "",
    supplyReportIntervalDays: 3,
    channels: DEFAULT_DISCORD_CHANNELS,
    notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
    craftChannels: DEFAULT_CRAFT_CHANNELS,
    craftRoles: DEFAULT_CRAFT_ROLES,
    colourRolesChannelId: "",
    colourRolesMessageId: "",
    colourRoles: DEFAULT_COLOUR_ROLES,
    rolePanels: DEFAULT_ROLE_PANELS,
    welcomeFlow: DEFAULT_WELCOME_FLOW,
    presence: DEFAULT_DISCORD_PRESENCE,
    notify: { marketListings: true, marketSales: true, production: true, productionStarted: true, productionCompleted: true, lowSupplies: false, appUpdates: true, supplyReports: true },
    botTokenConfigured: false,
    botTokenSource: null,
    interactionUrl: "/api/discord/interactions",
  },
};

const DEFAULT_USER_TOAST_SETTINGS: UserToastSettings = { marketListings: true, marketSales: true, production: true };

function normalizeAppSettings(config: Partial<AppSettings> | AnyRecord | null | undefined): AppSettings {
  const savedColourRoles = Array.isArray((config as AnyRecord)?.discord?.colourRoles) ? (config as AnyRecord).discord.colourRoles : null;
  const savedRolePanels = Array.isArray((config as AnyRecord)?.discord?.rolePanels) ? (config as AnyRecord).discord.rolePanels : null;
  const excludedMemberIds = Array.isArray((config as AnyRecord)?.excludedMemberIds)
    ? unique((config as AnyRecord).excludedMemberIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean))
    : [];
  const configuredDefaultPage = String((config as AnyRecord)?.defaultPage ?? DEFAULT_SETTINGS.defaultPage);
  const defaultPage = configuredDefaultPage === "buildings" || !NAV.some(([id]) => id === configuredDefaultPage && id !== "admin")
    ? DEFAULT_SETTINGS.defaultPage
    : configuredDefaultPage as ActivePanel;
  const savedCollectorSettings = (config as AnyRecord)?.collectorSettings && typeof (config as AnyRecord).collectorSettings === "object" && !Array.isArray((config as AnyRecord).collectorSettings)
    ? (config as AnyRecord).collectorSettings as Record<string, AnyRecord>
    : {};
  return {
    ...DEFAULT_SETTINGS,
    ...(config ?? {}),
    refreshSeconds: Math.min(Math.max(toNumber((config as AnyRecord)?.refreshSeconds) || DEFAULT_SETTINGS.refreshSeconds, 15), 300),
    serverRefreshSeconds: Math.min(Math.max(toNumber((config as AnyRecord)?.serverRefreshSeconds ?? (config as AnyRecord)?.refreshSeconds) || DEFAULT_SETTINGS.serverRefreshSeconds, 15), 300),
    collectorSettings: Object.fromEntries(Object.entries(DEFAULT_COLLECTOR_SETTINGS).map(([key, defaults]) => {
      const saved = savedCollectorSettings[key] ?? {};
      return [key, {
        label: String(saved.label ?? defaults.label),
        enabled: saved.enabled !== false,
        intervalSeconds: Math.min(Math.max(toNumber(saved.intervalSeconds) || defaults.intervalSeconds, 15), 3600),
      }];
    })),
    defaultPage,
    excludedMemberIds,
    additionalActiveRegions: String((config as AnyRecord)?.additionalActiveRegions ?? ""),
    theme: { ...DEFAULT_THEME, ...((config as AnyRecord)?.theme ?? {}) },
    toastSettings: { ...DEFAULT_SETTINGS.toastSettings, ...((config as AnyRecord)?.toastSettings ?? {}) },
    branding: (config as AnyRecord)?.branding ?? {},
    visitorSecurity: {
      fullIpRetentionDays: Math.min(Math.max(toNumber((config as AnyRecord)?.visitorSecurity?.fullIpRetentionDays) || DEFAULT_SETTINGS.visitorSecurity.fullIpRetentionDays, 1), 30),
      statsRetentionDays: Math.min(Math.max(toNumber((config as AnyRecord)?.visitorSecurity?.statsRetentionDays) || DEFAULT_SETTINGS.visitorSecurity.statsRetentionDays, 30), 730),
      geoipProvider: String((config as AnyRecord)?.visitorSecurity?.geoipProvider ?? "ipapi"),
      geoipCacheDays: Math.min(Math.max(toNumber((config as AnyRecord)?.visitorSecurity?.geoipCacheDays) || DEFAULT_SETTINGS.visitorSecurity.geoipCacheDays, 1), 90),
      geoipSourceUrl: String((config as AnyRecord)?.visitorSecurity?.geoipSourceUrl ?? ""),
      geoipAccountId: String((config as AnyRecord)?.visitorSecurity?.geoipAccountId ?? ""),
      geoipLicenseKey: String((config as AnyRecord)?.visitorSecurity?.geoipLicenseKey ?? ""),
      geoipLicenseKeyConfigured: Boolean((config as AnyRecord)?.visitorSecurity?.geoipLicenseKeyConfigured),
      geoipClearLicenseKey: Boolean((config as AnyRecord)?.visitorSecurity?.geoipClearLicenseKey),
    },
    discord: {
      ...DEFAULT_SETTINGS.discord,
      ...((config as AnyRecord)?.discord ?? {}),
      channels: { ...DEFAULT_DISCORD_CHANNELS, ...((config as AnyRecord)?.discord?.channels ?? {}), notifications: (config as AnyRecord)?.discord?.channelId ?? (config as AnyRecord)?.discord?.channels?.notifications ?? "" },
      notificationChannels: { ...DEFAULT_NOTIFICATION_CHANNELS, ...((config as AnyRecord)?.discord?.notificationChannels ?? {}) },
      craftChannels: { ...DEFAULT_CRAFT_CHANNELS, ...((config as AnyRecord)?.discord?.channels ?? {}), ...((config as AnyRecord)?.discord?.craftChannels ?? {}) },
      craftRoles: { ...DEFAULT_CRAFT_ROLES, ...((config as AnyRecord)?.discord?.craftRoles ?? {}) },
      colourRolesChannelId: String((config as AnyRecord)?.discord?.colourRolesChannelId ?? ""),
      colourRolesMessageId: String((config as AnyRecord)?.discord?.colourRolesMessageId ?? ""),
      colourRoles: (savedColourRoles ?? DEFAULT_COLOUR_ROLES).map((entry: AnyRecord, index: number) => normalizeColourRoleDefinition(entry, DEFAULT_COLOUR_ROLES[index])),
      rolePanels: (savedRolePanels ?? DEFAULT_ROLE_PANELS).map((entry: AnyRecord, index: number) => normalizeDiscordRolePanel(entry, DEFAULT_ROLE_PANELS[index])),
      welcomeFlow: normalizeDiscordWelcomeFlow((config as AnyRecord)?.discord?.welcomeFlow ?? {}),
      presence: normalizeDiscordPresence((config as AnyRecord)?.discord?.presence ?? {}),
      notify: { ...DEFAULT_SETTINGS.discord.notify, ...((config as AnyRecord)?.discord?.notify ?? {}) },
      productionMinAgeMinutes: toNumber((config as AnyRecord)?.discord?.productionMinAgeMinutes ?? (config as AnyRecord)?.discord?.productionMinAgeMins ?? DEFAULT_SETTINGS.discord.productionMinAgeMinutes),
    },
  } as AppSettings;
}

const THEME_FIELDS: Array<[ThemeColorKey, string, string]> = [
  ["gradientTop", "Top page gradient", "--theme-gradient-top"],
  ["gradientMid", "Middle page gradient", "--theme-gradient-mid"],
  ["gradientBase", "Lower page base", "--theme-gradient-base"],
  ["bg", "Body fallback", "--bg"],
  ["sidebar", "Sidebar surface", "--sidebar"],
  ["panel", "Card surface", "--panel"],
  ["panel2", "Field / inset surface", "--panel-2"],
  ["border", "Card and control border", "--border"],
  ["cardTop", "Card gradient top", "--card-top"],
  ["cardBottom", "Card gradient bottom", "--card-bottom"],
  ["cardTitle", "Card title text", "--card-title"],
  ["cardValue", "Metric value text", "--card-value"],
  ["iconBg", "Icon background", "--icon-bg"],
  ["activeColor", "Active text / icon", "--active-color"],
  ["activeBg", "Active highlight", "--active-bg"],
  ["activeBorder", "Active border", "--active-border"],
  ["hoverBorder", "Hover border", "--hover-border"],
  ["muted", "Muted Text", "--muted"],
  ["text", "Text", "--text"],
  ["gold", "Accent", "--gold"],
  ["good", "Positive", "--good"],
  ["danger", "Danger", "--danger"],
];
const THEME_GRADIENT_RANGE_FIELDS: ThemeRangeKey[] = ["gradientTopStop", "gradientMidStop", "gradientFadeStop", "gradientHeight"];

const THEME_PRESETS: Array<{ id: string; label: string; description: string; theme: ThemeSettings }> = [
  { id: "default", label: "Default", description: "Original Timbersteel gold on dark steel.", theme: DEFAULT_THEME },
  { id: "command", label: "Command", description: "Darker dashboard-style black and charcoal.", theme: { ...DEFAULT_THEME, bg: "#030303", sidebar: "#05070b", panel: "#111923", panel2: "#070c12", border: "#273140", cardTop: "#101821", cardBottom: "#060a10", cardTitle: "#b8c2cf", activeBg: "#332b16", activeBorder: "#7a6428", hoverBorder: "#625328", muted: "#aab3c2", text: "#f7f8fb", gradientTop: "#1f1f1f", gradientMid: "#080808", gradientBase: "#030303" } },
  { id: "steel", label: "Steel", description: "Cooler blue-grey surfaces with blue accent.", theme: { ...DEFAULT_THEME, bg: "#071018", sidebar: "#050a10", panel: "#121f2b", panel2: "#0b141d", border: "#2e4356", cardTop: "#142434", cardBottom: "#07111a", cardTitle: "#b9d8ef", iconBg: "#0b1824", gold: "#65b7fa", activeColor: "#65b7fa", activeBg: "#12334b", activeBorder: "#3d79a8", hoverBorder: "#4e8bbc", good: "#63eba5", gradientTop: "#16283a", gradientMid: "#071018", gradientBase: "#03070c" } },
  { id: "ember", label: "Ember", description: "Warm copper-gold for a forge feel.", theme: { ...DEFAULT_THEME, bg: "#110b08", sidebar: "#080604", panel: "#211714", panel2: "#160f0c", border: "#493329", cardTop: "#2a1d17", cardBottom: "#100a07", cardTitle: "#f0cda5", iconBg: "#1b110b", gold: "#f5aa45", activeColor: "#f5aa45", activeBg: "#3d2510", activeBorder: "#915c25", hoverBorder: "#a66a2a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#2d1b10", gradientMid: "#110b08", gradientBase: "#050302" } },
  { id: "forest", label: "Forest", description: "Green accent for resource and gathering focus.", theme: { ...DEFAULT_THEME, bg: "#07100c", sidebar: "#040806", panel: "#101c16", panel2: "#0a120e", border: "#284238", cardTop: "#13231a", cardBottom: "#06100b", cardTitle: "#bcdfca", iconBg: "#0b1910", gold: "#63eba5", activeColor: "#63eba5", activeBg: "#153824", activeBorder: "#3f9565", hoverBorder: "#4eb476", good: "#78f0a2", danger: "#ff6b65", gradientTop: "#183126", gradientMid: "#07100c", gradientBase: "#020503" } },
  { id: "violet", label: "Violet", description: "Purple accent with a sharper arcane command feel.", theme: { ...DEFAULT_THEME, bg: "#090812", sidebar: "#05050b", panel: "#151322", panel2: "#0d0b18", border: "#39304f", cardTop: "#1c1930", cardBottom: "#090815", cardTitle: "#d4c3ff", iconBg: "#111023", gold: "#b783ff", activeColor: "#b783ff", activeBg: "#2d2147", activeBorder: "#6f51a7", hoverBorder: "#8462c5", good: "#63eba5", danger: "#ff6b88", gradientTop: "#221a35", gradientMid: "#090812", gradientBase: "#030208" } },
  { id: "void", label: "Void", description: "Very dark, moody black with restrained silver-gold highlights.", theme: { ...DEFAULT_THEME, bg: "#010203", sidebar: "#010102", panel: "#07090d", panel2: "#030507", border: "#1c2633", cardTop: "#090d13", cardBottom: "#020304", cardTitle: "#c5ccd6", cardValue: "#ffffff", iconBg: "#06090d", muted: "#87909d", text: "#f7f8fb", gold: "#d8bd68", activeColor: "#d8bd68", activeBg: "#171407", activeBorder: "#5f5229", hoverBorder: "#77683a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#0c1017", gradientMid: "#020304", gradientBase: "#000000" } },
  { id: "ocean", label: "Ocean", description: "Deep blue command surfaces with cyan highlights.", theme: { ...DEFAULT_THEME, bg: "#031018", sidebar: "#02080d", panel: "#0c1b27", panel2: "#06121b", border: "#244256", cardTop: "#102536", cardBottom: "#04101a", cardTitle: "#b8def0", iconBg: "#071721", gold: "#56d5ff", activeColor: "#56d5ff", activeBg: "#0e3340", activeBorder: "#32859a", hoverBorder: "#42a5bd", good: "#63eba5", danger: "#ff6b65", gradientTop: "#12304a", gradientMid: "#031018", gradientBase: "#010407" } },
  { id: "crimson", label: "Crimson", description: "Dark red accents for a high-alert operations feel.", theme: { ...DEFAULT_THEME, bg: "#110607", sidebar: "#070203", panel: "#1e0f12", panel2: "#11080a", border: "#4c242b", cardTop: "#2a1217", cardBottom: "#0b0405", cardTitle: "#f0c2c8", iconBg: "#17090b", gold: "#ff6b65", activeColor: "#ff6b65", activeBg: "#3a1518", activeBorder: "#993a3f", hoverBorder: "#b6494d", good: "#63eba5", danger: "#ff7d7d", gradientTop: "#2c1014", gradientMid: "#110607", gradientBase: "#040101" } },
  { id: "contrast", label: "High Contrast", description: "Brighter text and stronger borders.", theme: { ...DEFAULT_THEME, bg: "#020304", sidebar: "#020304", panel: "#111820", panel2: "#070b10", border: "#536072", cardTop: "#16202a", cardBottom: "#05080c", cardTitle: "#e5ebf5", cardValue: "#ffffff", iconBg: "#101720", muted: "#c1cad8", text: "#ffffff", gold: "#ffd84d", activeColor: "#ffd84d", activeBg: "#403414", activeBorder: "#b9972f", hoverBorder: "#c7a83a", good: "#68ff9a", danger: "#ff5b5b", gradientTop: "#202834", gradientMid: "#090d12", gradientBase: "#020304" } },
];

const THEME_FIELD_GROUPS: Array<{ title: string; keys: ThemeColorKey[] }> = [
  { title: "Page Background", keys: ["gradientTop", "gradientMid", "gradientBase", "bg"] },
  { title: "Surfaces", keys: ["sidebar", "panel", "panel2", "border", "cardTop", "cardBottom", "iconBg"] },
  { title: "Text", keys: ["text", "muted", "cardTitle", "cardValue"] },
  { title: "Active / Highlights", keys: ["gold", "activeColor", "activeBg", "activeBorder", "hoverBorder"] },
  { title: "Status", keys: ["good", "danger"] },
];

const MAP_DEFAULT_LAYERS = ["roadsLayer", ...Array.from({ length: 11 }, (_, tier) => `claimT${tier}Layer`)];

function urlPanel(): ActivePanel | null {
  const panel = new URLSearchParams(window.location.search).get("page");
  if (panel === "buildings" || panel === "overview") return "dashboard";
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

function panelHref(panel: ActivePanel): string {
  return `/?page=${encodeURIComponent(panel)}`;
}

const ANALYTICS_CONSENT_COOKIE = "claim_monitor_analytics_consent_v2";
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
  const page = pageOverride ?? urlPanel() ?? "dashboard";
  if (page === "admin") return;
  void fetch(`${LOCAL_API}/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ sessionId, eventName, page, properties, durationSeconds }),
  }).catch(() => undefined);
}

function craftDisplayName(job: AnyRecord, craftsPayload?: AnyRecord): string {
  const item = craftOutputItem(job, craftsPayload);
  return String(item?.name ?? job.recipeName ?? `${job.buildingName ?? "Settlement"} craft`);
}

function craftOutputItem(job: AnyRecord, craftsPayload?: AnyRecord): AnyRecord | null {
  const output = job.craftedItem?.[0] ?? {};
  const itemId = String(output.item_id ?? output.itemId ?? job.outputItemId ?? job.itemId ?? "");
  const item = [...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].find((candidate: AnyRecord) => String(candidate.id) === itemId);
  if (item) return { ...item, itemType: output.item_type ?? output.itemType ?? item.itemType };
  if (!itemId && !job.recipeName && !job.name) return null;
  return {
    id: itemId,
    itemId,
    itemType: output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType,
    name: job.recipeName ?? job.name ?? "Craft",
    tier: job.tier ?? job.itemTier,
    iconAssetName: job.iconAssetName,
  };
}

function safeDisplayJson(value: unknown): AnyRecord {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}

function memberTrackingId(member: AnyRecord | null | undefined): string {
  return String(
    member?.playerEntityId
      ?? member?.player_entity_id
      ?? member?.playerId
      ?? member?.player_id
      ?? member?.entityId
      ?? member?.entity_id
      ?? member?.id
      ?? "",
  ).trim();
}

function memberDisplayName(member: AnyRecord | null | undefined): string {
  return String((member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? memberTrackingId(member)) || "Unknown member");
}

function memberTrackingKeys(member: AnyRecord | null | undefined): string[] {
  const id = memberTrackingId(member);
  const name = memberDisplayName(member).trim();
  return unique([id, name].filter(Boolean).map((value) => value.toLowerCase()));
}

function filterTrackedMemberRows<T extends AnyRecord>(rows: T[], excludedKeys: Set<string>): T[] {
  if (!excludedKeys.size) return rows;
  return rows.filter((row) => !memberTrackingKeys(row).some((key) => excludedKeys.has(key)));
}

function applyMemberTrackingFilter<T extends ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }>(data: T, excludedMemberIds: string[]): T {
  const excludedKeys = new Set(excludedMemberIds.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean));
  for (const member of data.members) {
    const id = memberTrackingId(member);
    if (id && excludedKeys.has(id.toLowerCase())) {
      for (const key of memberTrackingKeys(member)) excludedKeys.add(key);
    }
  }
  if (!excludedKeys.size) return data;
  return {
    ...data,
    members: filterTrackedMemberRows(data.members, excludedKeys),
    citizens: filterTrackedMemberRows(data.citizens, excludedKeys),
    players: filterTrackedMemberRows(data.players, excludedKeys),
  };
}

function applyTheme(theme: Partial<typeof DEFAULT_THEME>) {
  for (const [key, , cssVar] of THEME_FIELDS) {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  }
  const bg = theme.bg ?? DEFAULT_THEME.bg;
  const gold = theme.gold ?? DEFAULT_THEME.gold;
  const activeColor = theme.activeColor ?? DEFAULT_THEME.activeColor;
  const activeBg = theme.activeBg ?? DEFAULT_THEME.activeBg;
  const gradientTop = theme.gradientTop ?? DEFAULT_THEME.gradientTop;
  const gradientMid = theme.gradientMid ?? DEFAULT_THEME.gradientMid;
  const gradientBase = theme.gradientBase ?? DEFAULT_THEME.gradientBase;
  const gradientTopStop = clampThemeNumber(theme.gradientTopStop, 0, 100, DEFAULT_THEME.gradientTopStop);
  const gradientMidStop = clampThemeNumber(theme.gradientMidStop, 0, 100, DEFAULT_THEME.gradientMidStop);
  const gradientFadeStop = clampThemeNumber(theme.gradientFadeStop, 0, 100, DEFAULT_THEME.gradientFadeStop);
  const gradientHeight = clampThemeNumber(theme.gradientHeight, 12, 72, DEFAULT_THEME.gradientHeight);
  document.documentElement.style.setProperty("--theme-gradient-top-stop", `${gradientTopStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-mid-stop", `${gradientMidStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-fade-stop", `${gradientFadeStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-height", `${gradientHeight}vh`);
  document.documentElement.style.setProperty("--gold-dim", `color-mix(in srgb, ${activeBg || gold} 48%, transparent)`);
  document.documentElement.style.setProperty("--focus-border", activeColor);
  document.documentElement.style.setProperty("--focus-ring", `color-mix(in srgb, ${activeBg || activeColor} 42%, transparent)`);
  document.documentElement.style.setProperty("--command-page-gradient", `linear-gradient(180deg, ${gradientTop} ${gradientTopStop}%, ${gradientMid} ${gradientMidStop}%, ${gradientBase}00 ${gradientFadeStop}%) top / 100% ${gradientHeight}vh no-repeat, ${gradientBase || bg}`);
}

function UserSettingsDialog({
  density,
  onDensityChange,
  toastSettings,
  onToastSettingsChange,
  theme,
  onThemeChange,
  auth,
  members,
  onDiscordLogin,
  onDiscordLogout,
  onLinkCharacter,
  onSaveAccountSettings,
  onLoadAccountSettings,
  showAdminTools,
  onOpenAdmin,
  onResetSettings,
  onClose,
}: {
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  toastSettings: UserToastSettings;
  onToastSettingsChange: (settings: UserToastSettings) => void;
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  auth: UserAuthState;
  members: AnyRecord[];
  onDiscordLogin: () => void;
  onDiscordLogout: () => Promise<void>;
  onLinkCharacter: (member: AnyRecord | null) => Promise<void>;
  onSaveAccountSettings: () => Promise<void>;
  onLoadAccountSettings: () => void;
  showAdminTools: boolean;
  onOpenAdmin: () => void;
  onResetSettings: () => void;
  onClose: () => void;
}) {
  const [settingsSection, setSettingsSection] = React.useState<"account" | "theme" | "preferences" | "data">("account");
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const [themeExpanded, setThemeExpanded] = React.useState(false);
  const [themeShareOpen, setThemeShareOpen] = React.useState(false);
  const [themeImportText, setThemeImportText] = React.useState("");
  const [themeShareStatus, setThemeShareStatus] = React.useState("");
  const [customTheme, setCustomTheme] = React.useState<ThemeSettings>(() => loadSavedCustomTheme());
  const [customThemeStatus, setCustomThemeStatus] = React.useState("");
  const [lastThemeChoice, setLastThemeChoice] = React.useState("");
  const [selectedCharacterId, setSelectedCharacterId] = React.useState(auth.user?.characterPlayerId ?? "");
  const [accountStatus, setAccountStatus] = React.useState("");
  React.useEffect(() => setSelectedCharacterId(auth.user?.characterPlayerId ?? ""), [auth.user?.characterPlayerId]);
  const themeFingerprint = JSON.stringify(theme);
  const customThemeFingerprint = JSON.stringify(customTheme);
  const matchedBuiltInPreset = THEME_PRESETS.find((preset) => JSON.stringify(preset.theme) === themeFingerprint)?.id;
  const customThemeMatches = customThemeFingerprint === themeFingerprint;
  const activePreset = lastThemeChoice === "custom" && customThemeMatches
    ? "custom"
    : matchedBuiltInPreset ?? (customThemeMatches ? "custom" : "custom-editing");
  const fieldLabel = (key: ThemeColorKey) => THEME_FIELDS.find(([fieldKey]) => fieldKey === key)?.[1] ?? key;
  const setThemeValue = (key: ThemeColorKey, value: string) => onThemeChange({ ...theme, [key]: value });
  const rangeFieldLabel = (key: ThemeRangeKey) => THEME_RANGE_FIELD_CONFIG[key].label;
  const setThemeRangeValue = (key: ThemeRangeKey, value: string) => {
    const config = THEME_RANGE_FIELD_CONFIG[key];
    onThemeChange({ ...theme, [key]: clampThemeNumber(value, config.min, config.max, DEFAULT_THEME[key]) });
  };
  const previewGradient = `linear-gradient(180deg, ${theme.gradientTop} ${theme.gradientTopStop}%, ${theme.gradientMid} ${theme.gradientMidStop}%, ${theme.gradientBase} ${theme.gradientFadeStop}%)`;
  const themePayload = React.useMemo(() => JSON.stringify({ schema: "timbersteel-local-theme", version: 2, theme }, null, 2), [theme]);
  const saveCustomTheme = () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({ schema: "timbersteel-local-theme", version: 2, theme }));
    setCustomTheme(theme);
    setLastThemeChoice("custom");
    setThemeExpanded(false);
    setCustomThemeStatus("Custom theme saved. You can now switch between presets and Custom.");
  };
  const openCustomTheme = () => {
    onThemeChange(customTheme);
    setLastThemeChoice("custom");
    setThemeExpanded(true);
    setThemeShareStatus("");
    setCustomThemeStatus(customThemeFingerprint === JSON.stringify(DEFAULT_THEME) ? "Custom starts from the default theme until you save your own." : "");
  };
  const openThemeShare = () => {
    const nextOpen = !themeShareOpen;
    if (nextOpen && !themeImportText.trim()) setThemeImportText(themePayload);
    setThemeShareStatus("");
    setThemeShareOpen(nextOpen);
  };
  const copyTheme = async () => {
    setThemeImportText(themePayload);
    try {
      await navigator.clipboard?.writeText(themePayload);
      setThemeShareStatus("Theme copied to clipboard.");
    } catch {
      setThemeShareStatus("Theme JSON is ready below. Copy it manually if clipboard access is blocked.");
    }
  };
  const downloadTheme = () => {
    const blob = new Blob([themePayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "timbersteel-theme.json";
    link.click();
    URL.revokeObjectURL(url);
    setThemeShareStatus("Theme export downloaded.");
  };
  const applyImportedTheme = () => {
    try {
      const parsed = JSON.parse(themeImportText);
      const result = normalizeThemeCandidate(parsed);
      if (!result) throw new Error("No recognised colour fields were found.");
      onThemeChange(result.theme);
      setLastThemeChoice("custom-editing");
      setThemeExpanded(true);
      setThemeShareStatus(`Imported ${result.count} theme setting${result.count === 1 ? "" : "s"}. Save as Custom if you want to keep it in the preset list.`);
    } catch (error) {
      setThemeShareStatus(error instanceof Error ? error.message : "Could not import that theme JSON.");
    }
  };
  const selectedCharacter = members.find((member) => String(member.playerEntityId) === selectedCharacterId) ?? null;
  const memberDisplayName = (member: AnyRecord | null | undefined) => String(member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? member?.playerEntityId ?? "Unknown member");
  const accountName = auth.user?.globalName || auth.user?.username || "Discord user";
  const statusLabel = auth.user?.characterStatus === "approved"
    ? "Approved"
    : auth.user?.characterStatus === "pending"
      ? "Awaiting admin approval"
      : auth.user?.characterStatus === "rejected"
        ? "Rejected"
        : "Not linked";
  async function runAccountAction(action: () => Promise<void>, success: string) {
    setAccountStatus("");
    try {
      await action();
      setAccountStatus(success);
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : String(error));
    }
  }
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
        <div className="settings-shell">
          <nav className="settings-section-tabs" aria-label="Settings sections">
            {([
              ["account", "Account", MessageCircle],
              ["theme", "Theme", Star],
              ["preferences", "Preferences", Bell],
              ["data", "Local data", HardDrive],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} className={settingsSection === id ? "active" : ""} onClick={() => setSettingsSection(id)}>
                <Icon size={15} /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-grid">
          {settingsSection === "account" ? <section className="settings-account-section">
            <div className="settings-section-heading">
              <div>
                <h3>Discord Account</h3>
                <p className="legend">Optional sign-in lets you link your Discord account to a BitCraft character and save settings beyond this browser.</p>
              </div>
              {auth.user ? <button className="toolbar-button" onClick={() => runAccountAction(onDiscordLogout, "Signed out of Discord.")}><LogOut size={14} /> Sign out</button> : null}
            </div>
            {!auth.user ? (
              <div className="account-connect-card">
                <div>
                  <strong>Not signed in</strong>
                  <span>{auth.discordLoginEnabled ? "Sign in with Discord to request a character link and save your preferences on this server." : "Discord login is not configured on this server yet."}</span>
                </div>
                <button className="toolbar-button primary" disabled={!auth.discordLoginEnabled} onClick={onDiscordLogin}><MessageCircle size={14} /> Sign in with Discord</button>
              </div>
            ) : (
              <div className="account-profile-card">
                <div className="account-profile-main">
                  {auth.user.avatarUrl ? <img src={auth.user.avatarUrl} alt="" /> : <span>{accountName.slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{accountName}</strong>
                    <small>Discord ID {auth.user.discordId}</small>
                  </div>
                  <em className={`link-status ${auth.user.characterStatus}`}>{statusLabel}</em>
                </div>
                <div className="account-link-grid">
                  <label className="field">
                    <span>BitCraft character</span>
                    <select value={selectedCharacterId} onChange={(event) => setSelectedCharacterId(event.target.value)}>
                      <option value="">Select your character</option>
                      {auth.user.characterPlayerId && !members.some((member) => String(member.playerEntityId) === String(auth.user?.characterPlayerId)) ? <option value={auth.user.characterPlayerId}>{auth.user.characterName || auth.user.characterPlayerId}</option> : null}
                      {members.map((member) => <option key={member.playerEntityId ?? memberDisplayName(member)} value={String(member.playerEntityId ?? "")}>{memberDisplayName(member)}</option>)}
                    </select>
                  </label>
                  <button className="toolbar-button primary" disabled={!selectedCharacter} onClick={() => runAccountAction(() => onLinkCharacter(selectedCharacter), "Character link request saved for admin approval.")}><UserPlus size={14} /> Request link approval</button>
                </div>
                <div className="settings-account-actions">
                  <button className="toolbar-button" onClick={() => runAccountAction(onSaveAccountSettings, "Settings saved to your Discord account.")}><Save size={14} /> Save settings to account</button>
                  <button className="toolbar-button" disabled={!auth.user.settings || !Object.keys(auth.user.settings).length} onClick={onLoadAccountSettings}><Download size={14} /> Load saved settings</button>
                </div>
                {accountStatus ? <p className="theme-share-status">{accountStatus}</p> : null}
              </div>
            )}
          </section> : null}
          {settingsSection === "account" ? <section>
            <h3>This Browser</h3>
            <p className="legend">Your page, filters, density and notification preferences are saved in this browser only. This uses local browser storage, not analytics cookies, so it works even if analytics cookies are declined.</p>
          </section> : null}
          {settingsSection === "account" && showAdminTools ? <section>
            <h3>Admin Tools</h3>
            <p className="legend">For settlement monitor administrators. Opens the admin console where configuration, database, accounts and diagnostics are managed.</p>
            <button className="toolbar-button" onClick={onOpenAdmin}><KeyRound size={14} /> Open Admin Console</button>
          </section> : null}
          {settingsSection === "theme" ? <section className={`settings-theme-section ${themeExpanded ? "expanded" : ""}`}>
            <div className="settings-section-heading">
              <div>
                <h3>Theme</h3>
                <p className="legend">Saved locally for this browser. Presets apply instantly and advanced controls can be fine-tuned below.</p>
              </div>
              <div className="settings-heading-actions">
                <button className="toolbar-button" onClick={() => { onThemeChange(DEFAULT_THEME); setLastThemeChoice("default"); setThemeExpanded(false); }}><RefreshCw size={14} /> Reset Default</button>
                <button className="toolbar-button" onClick={openThemeShare}><Share2 size={14} /> Import / Export</button>
                {themeExpanded ? <button className="toolbar-button primary" onClick={saveCustomTheme}><Save size={14} /> Save Custom</button> : null}
              </div>
            </div>
            <div className="theme-preset-grid">
              {THEME_PRESETS.map((preset) => (
                <button className={activePreset === preset.id ? "active" : ""} key={preset.id} onClick={() => { onThemeChange(preset.theme); setLastThemeChoice(preset.id); setThemeExpanded(false); }}>
                  <span className="theme-preset-swatches" aria-hidden="true">
                    <i style={{ background: preset.theme.bg }} />
                    <i style={{ background: preset.theme.panel }} />
                    <i style={{ background: preset.theme.gold }} />
                  </span>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
              <button className={`theme-custom-preset ${activePreset === "custom" || themeExpanded ? "active" : ""}`} onClick={openCustomTheme}>
                <span className="theme-preset-swatches" aria-hidden="true">
                  <i style={{ background: customTheme.gradientBase }} />
                  <i style={{ background: customTheme.cardTop }} />
                  <i style={{ background: customTheme.activeColor }} />
                </span>
                <strong>Custom</strong>
                <small>Open the editor and use your saved custom theme.</small>
              </button>
            </div>
            {customThemeStatus ? <p className="theme-share-status">{customThemeStatus}</p> : null}
            {themeShareOpen ? (
              <div className="theme-share-panel">
                <div>
                  <strong>Theme backup and sharing</strong>
                  <p className="legend">Export this browser theme as JSON, or paste a shared Timbersteel theme below and apply it locally.</p>
                </div>
                <div className="theme-share-actions">
                  <button className="toolbar-button" onClick={copyTheme}><Share2 size={14} /> Copy current theme</button>
                  <button className="toolbar-button" onClick={downloadTheme}><Download size={14} /> Download JSON</button>
                  <button className="toolbar-button primary" onClick={applyImportedTheme}><Upload size={14} /> Apply import</button>
                </div>
                <label className="field theme-json-field">
                  <span>Theme JSON</span>
                  <textarea value={themeImportText} onChange={(event) => setThemeImportText(event.target.value)} spellCheck={false} />
                </label>
                {themeShareStatus ? <p className="theme-share-status">{themeShareStatus}</p> : null}
              </div>
            ) : null}
            <div className="theme-editor-layout" hidden={!themeExpanded}>
              <div className="theme-field-groups">
                <div className="theme-field-group">
                  <strong>Gradient Shape</strong>
                  <div className="theme-range-grid">
                    {THEME_GRADIENT_RANGE_FIELDS.map((key) => {
                      const config = THEME_RANGE_FIELD_CONFIG[key];
                      return (
                        <label className="theme-range-field" key={key}>
                          <span>{rangeFieldLabel(key)}</span>
                          <input
                            aria-label={rangeFieldLabel(key)}
                            type="range"
                            min={config.min}
                            max={config.max}
                            value={theme[key]}
                            onChange={(event) => setThemeRangeValue(key, event.target.value)}
                          />
                          <span className="theme-range-value">
                            <input
                              aria-label={`${rangeFieldLabel(key)} value`}
                              type="number"
                              min={config.min}
                              max={config.max}
                              value={theme[key]}
                              onChange={(event) => setThemeRangeValue(key, event.target.value)}
                            />
                            <em>{config.unit}</em>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {THEME_FIELD_GROUPS.map((group) => (
                  <div className="theme-field-group" key={group.title}>
                    <strong>{group.title}</strong>
                    <div className="theme-grid">
                      {group.keys.map((key) => (
                        <label className="color-field" key={key}>
                          <span>{fieldLabel(key)}</span>
                          <code>{theme[key]}</code>
                          <input aria-label={fieldLabel(key)} type="color" value={theme[key]} onInput={(event) => setThemeValue(key, event.currentTarget.value)} onChange={(event) => setThemeValue(key, event.target.value)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="theme-preview-card" style={{ background: previewGradient, borderColor: theme.border, color: theme.text }}>
                <aside style={{ background: `linear-gradient(180deg, ${theme.sidebar}, ${theme.gradientBase})`, borderColor: theme.border }}>
                  <b style={{ color: theme.activeColor }}>Timbersteel</b>
                  <span style={{ color: theme.muted }}>Claim Monitor</span>
                  <em style={{ borderColor: theme.activeBorder, color: theme.activeColor, background: theme.activeBg }}>Dashboard</em>
                </aside>
                <main>
                  <header>
                    <span style={{ color: theme.cardTitle }}>Theme Preview</span>
                    <strong style={{ color: theme.cardValue }}>Dashboard</strong>
                  </header>
                  <article style={{ background: `linear-gradient(180deg, ${theme.cardTop}, ${theme.cardBottom})`, borderColor: theme.border }}>
                    <div style={{ background: theme.iconBg, color: theme.activeColor }}>
                      <Shield size={16} />
                    </div>
                    <span style={{ color: theme.cardTitle }}>Supply Status</span>
                    <b style={{ color: theme.cardValue }}>47d 6h</b>
                    <small style={{ color: theme.good }}>Healthy runway</small>
                  </article>
                  <article style={{ background: `linear-gradient(180deg, ${theme.cardTop}, ${theme.cardBottom})`, borderColor: theme.border }}>
                    <div style={{ background: theme.iconBg, color: theme.activeColor }}>
                      <Activity size={16} />
                    </div>
                    <span style={{ color: theme.cardTitle }}>Recent Activity</span>
                    <b style={{ color: theme.cardValue }}>5 events</b>
                    <small style={{ color: theme.danger }}>1 needs review</small>
                  </article>
                </main>
                <p style={{ color: theme.muted }}>Preview shows page gradient, sidebar, cards, borders, text, accent and status colours.</p>
                <div className="theme-preview-progress" style={{ background: theme.panel2 }}>
                  <i style={{ background: `linear-gradient(90deg, ${theme.good}, #56d5ff)` }} />
                </div>
              </div>
            </div>
          </section> : null}
          {settingsSection === "preferences" ? <section>
            <h3>Display Density</h3>
            <div className="segmented-control">
              <button className={density === "comfortable" ? "active" : ""} onClick={() => onDensityChange("comfortable")}>Comfortable</button>
              <button className={density === "compact" ? "active" : ""} onClick={() => onDensityChange("compact")}>Compact</button>
            </div>
          </section> : null}
          {settingsSection === "preferences" ? <section>
            <h3>Notifications</h3>
            {([["marketListings", "New market listings"], ["marketSales", "Confirmed market sales"], ["production", "Production starts and completions"]] as const).map(([key, label]) => (
              <label className="toggle-row" key={key}><input type="checkbox" checked={toastSettings[key]} onChange={(event) => onToastSettingsChange({ ...toastSettings, [key]: event.target.checked })} /><span>{label}</span></label>
            ))}
          </section> : null}
          {settingsSection === "data" ? <section>
            <h3>Reset</h3>
            <p className="legend">Reset this browser's local app preferences. Admin settings and settlement data are not affected.</p>
            <button className="toolbar-button" onClick={onResetSettings}><RefreshCw size={14} /> Reset my settings</button>
          </section> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

type AdminTab = "status" | "analytics" | "configuration" | "diagnostics" | "discord" | "database" | "users" | "accounts" | "audit" | "backups";

function bytesLabel(value: unknown) {
  const bytes = toNumber(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminPanel({
  settings,
  members = [],
  onSettingsSaved,
  botOnly = false,
  onAuthChanged,
}: {
  settings: AppSettings;
  members?: AnyRecord[];
  onSettingsSaved: (settings: AppSettings) => void;
  botOnly?: boolean;
  onAuthChanged?: (auth: AnyRecord) => void;
}) {
  const [auth, setAuth] = React.useState<AnyRecord | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authLoaderMinimumActive, setAuthLoaderMinimumActive] = React.useState(true);
  const [tab, setTab] = usePersistedState<AdminTab>(botOnly ? "bot.adminTab" : "admin.tab", botOnly ? "discord" : "status");
  const [botSection, setBotSection] = React.useState<BotSection>("setup");
  const [message, setMessage] = React.useState<string | null>(null);
  const [messageKind, setMessageKind] = React.useState<"success" | "error" | "info">("info");
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AppSettings>(settings);
  const [status, setStatus] = React.useState<AnyRecord | null>(null);
  const [scheduledJobs, setScheduledJobs] = React.useState<AnyRecord | null>(null);
  const [expandedScheduledJobKey, setExpandedScheduledJobKey] = React.useState<string | null>(null);
  const [scheduledJobDrafts, setScheduledJobDrafts] = React.useState<Record<string, AnyRecord>>({});
  const [diagnostics, setDiagnostics] = React.useState<AnyRecord[]>([]);
  const [mapUrlLog, setMapUrlLog] = usePersistedState<AnyRecord[]>("diagnostics.mapUrlLog", []);
  const [tables, setTables] = React.useState<AnyRecord[]>([]);
  const [selectedTable, setSelectedTable] = usePersistedState("admin.database.selectedTable", "");
  const [tableResult, setTableResult] = React.useState<AnyRecord>({ table: "", rows: [], columns: [], total: 0, offset: 0, limit: 50 });
  const [tableSearch, setTableSearch] = React.useState("");
  const [tableOffset, setTableOffset] = React.useState(0);
  const [users, setUsers] = React.useState<AnyRecord[]>([]);
  const [linkedAccounts, setLinkedAccounts] = React.useState<AppUser[]>([]);
  const [newUser, setNewUser] = React.useState({ discordId: "", displayName: "", role: "admin" });
  const [auditData, setAuditData] = React.useState<AnyRecord>({ auditLog: [], logins: [] });
  const [backups, setBackups] = React.useState<AnyRecord[]>([]);
  const [analyticsDays, setAnalyticsDays] = React.useState("30");
  const [analyticsData, setAnalyticsData] = React.useState<AnyRecord | null>(null);
  const [visitorSecurityData, setVisitorSecurityData] = React.useState<AnyRecord | null>(null);
  const [securityEventSearch, setSecurityEventSearch] = React.useState("");
  const [securityEventPage, setSecurityEventPage] = React.useState(1);
  const [securityEventPageSize, setSecurityEventPageSize] = React.useState(50);
  const [discordDiscovery, setDiscordDiscovery] = React.useState<AnyRecord | null>(null);
  const [discordToolResults, setDiscordToolResults] = React.useState<Record<string, AnyRecord | null>>({});
  const [expandedRoleOption, setExpandedRoleOption] = React.useState<string | null>(null);
  const [roleDraft, setRoleDraft] = React.useState({ name: "", color: "#5865f2", hoist: false, mentionable: false });
  const [announcementDraft, setAnnouncementDraft] = React.useState({ channelId: "", title: "", message: "" });
  const [pinnedDraft, setPinnedDraft] = React.useState({ channelId: "", messageId: "", title: "", message: "" });
  const [eventDraft, setEventDraft] = React.useState({ name: "", description: "", location: "Discord", startTime: "", endTime: "" });
  const [moderationDraft, setModerationDraft] = React.useState({ userId: "", reason: "", timeoutMinutes: "60", deleteMessageSeconds: "0", channelId: "", purgeLimit: "25", unbanUserId: "" });
  const [safetyDraft, setSafetyDraft] = React.useState({ blockedWords: "", ruleName: "Timbersteel keyword filter", slowmodeSeconds: "10", lockdownChannelId: "", nicknamePattern: "^[A-Za-z0-9 _.-]{2,32}$" });
  const [recordsDraft, setRecordsDraft] = React.useState({ userId: "", reason: "", note: "" });
  const [pollDraft, setPollDraft] = React.useState({ channelId: "", title: "", options: "" });
  const [rsvpDraft, setRsvpDraft] = React.useState({ channelId: "", title: "", description: "" });
  const [embedDraft, setEmbedDraft] = React.useState({ channelId: "", title: "", description: "", color: "#f0c64f" });
  const [commandDraft, setCommandDraft] = React.useState({ name: "", description: "", response: "" });
  const [customCommands, setCustomCommands] = React.useState<AnyRecord[]>([]);
  const [discordDiagnosticsFilter, setDiscordDiagnosticsFilter] = React.useState("all");
  const discordToolResult = discordToolResults[botSection] ?? null;
  const adminRoles: Record<string, string> = auth?.roles ?? { owner: "Owner", admin: "Administrator", "discord-manager": "Discord Manager", moderator: "Moderator", viewer: "Viewer" };
  const canManageAdmins = Boolean(auth?.user?.permissions?.includes("*") || auth?.user?.permissions?.includes("users.manage"));
  const setAdminAuthState = React.useCallback((next: AnyRecord) => {
    setAuth(next);
    onAuthChanged?.(next);
  }, [onAuthChanged]);
  const setDiscordToolResult = React.useCallback((result: AnyRecord | null) => {
    setDiscordToolResults((current) => ({ ...current, [botSection]: result }));
  }, [botSection]);

  async function api(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.method && options.method !== "GET" && auth?.csrfToken) headers.set("x-csrf-token", String(auth.csrfToken));
    const response = await fetch(`${LOCAL_API}${path}`, {
      ...options,
      headers,
    });
    const text = await response.text();
    let body: AnyRecord = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Admin request returned an unreadable response (HTTP ${response.status}).`);
      }
    }
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  const isBusyAction = React.useCallback((key: string) => busyAction === key, [busyAction]);
  const busyButtonClass = React.useCallback((key: string, className = "toolbar-button") => `${className}${busyAction === key ? " is-loading" : ""}`, [busyAction]);

  async function run(task: () => Promise<unknown>, success?: string, busyKey?: string) {
    setMessage(null);
    setMessageKind("info");
    if (busyKey) setBusyAction(busyKey);
    try {
      await task();
      if (success) {
        setMessageKind("success");
        setMessage(success);
      }
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (busyKey) setBusyAction((current) => current === busyKey ? null : current);
    }
  }

  async function refreshStatus() {
    setStatus(await api("/admin/status"));
  }

  async function collectNowWithLiveStatus() {
    let timer: number | null = window.setInterval(() => {
      void refreshStatus().catch(() => undefined);
    }, 1000);
    try {
      await api("/admin/poll", { method: "POST", body: "{}" });
    } finally {
      if (timer != null) window.clearInterval(timer);
      timer = null;
      await refreshStatus();
    }
  }

  function collectorStatusValue(collector: AnyRecord) {
    if (collector.running) {
      const hasProgress = collector.progressCurrent != null && collector.progressTotal != null;
      const progress = hasProgress ? ` (${formatNumber(collector.progressCurrent)} / ${formatNumber(collector.progressTotal)})` : "";
      return `Running: ${collector.currentStep ?? "Collecting"}${progress}`;
    }
    return `${collector.lastSuccessAt ? `OK ${dateLabel(collector.lastSuccessAt)}` : "Not collected yet"}${collector.lastError ? ` - ${collector.lastError}` : ""}`;
  }

  async function refreshScheduledJobs() {
    setScheduledJobs(await api("/admin/jobs"));
  }

  function scheduledJobProgressText(metadata: AnyRecord) {
    const stage = String(metadata?.stage ?? "running").replace(/_/g, " ");
    const parts: string[] = [];
    if (metadata?.current != null && metadata?.total != null) parts.push(`${formatNumber(metadata.current)} / ${formatNumber(metadata.total)} checked`);
    if (metadata?.averageCount != null) parts.push(`${formatNumber(metadata.averageCount)} saved`);
    if (metadata?.failureCount != null && toNumber(metadata.failureCount) > 0) parts.push(`${formatNumber(metadata.failureCount)} failed`);
    if (metadata?.currentItem) parts.push(`now ${metadata.currentItem}${metadata.currentRegionId ? ` in R${metadata.currentRegionId}` : ""}`);
    if (metadata?.phase) parts.push(String(metadata.phase).replace(/_/g, " "));
    if (metadata?.downloadedBytes) parts.push(`${formatNumber(metadata.downloadedBytes)} bytes downloaded`);
    if (metadata?.locationRows) parts.push(`${formatNumber(metadata.locationRows)} locations indexed`);
    if (metadata?.rangeRows) parts.push(`${formatNumber(metadata.rangeRows)} ranges written`);
    if (metadata?.entries) parts.push(`${formatNumber(metadata.entries)} entries`);
    return `${stage}${parts.length ? ` (${parts.join(" · ")})` : ""}`;
  }

  function scheduledJobConfig(job: AnyRecord) {
    return scheduledJobDrafts[String(job.key)] ?? job.scheduleConfig ?? { frequency: "daily", time: "00:00", dayOfWeek: 1, dayOfMonth: 1 };
  }

  function updateScheduledJobDraft(job: AnyRecord, patch: AnyRecord) {
    const key = String(job.key);
    setScheduledJobDrafts((current) => ({ ...current, [key]: { ...scheduledJobConfig(job), ...patch } }));
  }

  async function refreshTables() {
    const result = await api("/admin/tables");
    setTables(result.tables ?? []);
    setSelectedTable((current) => current || result.tables?.[0]?.name || "");
  }

  async function refreshUsers() {
    setUsers((await api("/admin/users")).users ?? []);
  }

  async function refreshLinkedAccounts() {
    setLinkedAccounts((await api("/admin/user-accounts")).accounts ?? []);
  }

  async function refreshAudit() {
    setAuditData(await api("/admin/audit?limit=100"));
  }

  async function refreshBackups() {
    setBackups((await api("/admin/backups")).backups ?? []);
  }

  async function refreshAnalytics() {
    setAnalyticsData(await api(`/admin/analytics?days=${encodeURIComponent(analyticsDays)}`));
    const securityParams = new URLSearchParams({
      days: analyticsDays,
      eventSearch: securityEventSearch,
      eventPage: String(securityEventPage),
      eventPageSize: String(securityEventPageSize),
    });
    setVisitorSecurityData(await api(`/admin/visitor-security?${securityParams.toString()}`));
  }

  async function refreshDiscordDiscovery() {
    setDiscordDiscovery(await api("/admin/discord/discovery"));
  }

  async function refreshCustomCommands() {
    setCustomCommands((await api("/admin/discord/custom-commands")).commands ?? []);
  }

  React.useEffect(() => {
    const timer = window.setTimeout(() => setAuthLoaderMinimumActive(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    api("/admin/me").then(setAdminAuthState).catch((error) => {
      setAdminAuthState({ authenticated: false, setupRequired: false, error: error instanceof Error ? error.message : String(error) });
      setMessageKind("error");
      setMessage(error.message);
    }).finally(() => setAuthLoading(false));
  }, []);
  React.useEffect(() => setDraft(settings), [settings]);
  const hasUnsavedSettings = React.useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const adminMemberRows = React.useMemo(() => [...members].sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b))), [members]);
  React.useEffect(() => {
    if (!auth?.authenticated) return;
    run(async () => {
      if (tab === "status" || tab === "discord") await refreshStatus();
      if (tab === "status") await refreshScheduledJobs();
      if (botOnly && tab === "discord") await refreshDiscordDiscovery();
      if (botOnly && tab === "discord" && botSection === "commands") await refreshCustomCommands();
      if (tab === "analytics") await refreshAnalytics();
      if (tab === "database") await refreshTables();
      if (tab === "users") await refreshUsers();
      if (tab === "accounts") await refreshLinkedAccounts();
      if (tab === "audit") await refreshAudit();
      if (tab === "backups") await refreshBackups();
    });
  }, [auth?.authenticated, tab, analyticsDays, botSection, securityEventSearch, securityEventPage, securityEventPageSize]);
  const scheduledJobsRunning = Boolean((scheduledJobs?.jobs ?? []).some((job: AnyRecord) => job.running));
  React.useEffect(() => {
    if (!auth?.authenticated || tab !== "status" || !scheduledJobsRunning) return;
    const timer = window.setInterval(() => {
      void refreshScheduledJobs().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [auth?.authenticated, tab, scheduledJobsRunning]);
  React.useEffect(() => {
    if (!auth?.authenticated || tab !== "database" || !selectedTable) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      const requestedTable = selectedTable;
      run(async () => {
        const result = await api(`/admin/table?name=${encodeURIComponent(requestedTable)}&limit=50&offset=${tableOffset}&search=${encodeURIComponent(tableSearch)}`);
        if (!stale) setTableResult({ ...result, table: requestedTable });
      });
    }, 150);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [auth?.authenticated, selectedTable, tableOffset, tableSearch, tab]);

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
    setMessageKind("info");
    setMessage("Unsaved changes reverted.");
  }

  function updateDraft<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateCollectorSetting(key: string, patch: Partial<AppSettings["collectorSettings"][string]>) {
    setDraft((current) => ({
      ...current,
      collectorSettings: {
        ...current.collectorSettings,
        [key]: { ...current.collectorSettings[key], ...patch },
      },
    }));
  }

  function updateVisitorSecuritySetting(patch: Partial<AppSettings["visitorSecurity"]>) {
    setDraft((current) => ({
      ...current,
      visitorSecurity: { ...current.visitorSecurity, ...patch },
    }));
  }

  function setMemberTracking(member: AnyRecord, tracked: boolean) {
    const id = memberTrackingId(member);
    if (!id) return;
    setDraft((current) => {
      const currentIds = current.excludedMemberIds ?? [];
      const nextIds = tracked
        ? currentIds.filter((value) => String(value) !== id)
        : unique([...currentIds, id]);
      return { ...current, excludedMemberIds: nextIds };
    });
  }

  function updateDiscord(value: Partial<DiscordSettings>) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, ...value } }));
  }

  function updateDiscordNotify(key: keyof DiscordSettings["notify"], value: boolean) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, notify: { ...current.discord.notify, [key]: value } } }));
  }

  function updateDiscordPresence(value: Partial<DiscordPresence>) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, presence: { ...current.discord.presence, ...value } } }));
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

  function updateDiscordRole(key: string, value: string) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, craftRoles: { ...current.discord.craftRoles, [key]: value } } }));
  }
  function updateDiscordColourRole(key: string, patch: Partial<ColourRoleDefinition>) {
    setDraft((current) => ({
      ...current,
      discord: {
        ...current.discord,
        colourRoles: current.discord.colourRoles.map((entry) => entry.key === key ? { ...entry, ...patch } : entry),
      },
    }));
  }

  function addDiscordColourRole() {
    const label = `Colour ${draft.discord.colourRoles.length + 1}`;
    setDraft((current) => ({
      ...current,
      discord: {
        ...current.discord,
        colourRoles: [...current.discord.colourRoles, { key: uniqueKey(), label, roleName: label, roleId: "", color: 0xf4c430 }],
      },
    }));
  }

  function removeDiscordColourRole(key: string) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, colourRoles: current.discord.colourRoles.filter((entry) => entry.key !== key) } }));
  }

  function updateDiscordRolePanel(panelKey: string, patch: Partial<DiscordRolePanel>) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, rolePanels: current.discord.rolePanels.map((panel) => panel.key === panelKey ? { ...panel, ...patch } : panel) } }));
  }

  function updateDiscordRolePanelOption(panelKey: string, optionKey: string, patch: Partial<DiscordRoleOption>) {
    setDraft((current) => ({
      ...current,
      discord: {
        ...current.discord,
        rolePanels: current.discord.rolePanels.map((panel) => panel.key === panelKey ? { ...panel, options: panel.options.map((option) => option.key === optionKey ? { ...option, ...patch } : option) } : panel),
      },
    }));
  }

  function addDiscordRolePanelOption(panelKey: string) {
    const label = "New Role";
    const key = uniqueKey("role");
    setDraft((current) => ({
      ...current,
      discord: {
        ...current.discord,
        rolePanels: current.discord.rolePanels.map((panel) => panel.key === panelKey ? { ...panel, options: [...panel.options, { key, label, roleId: "", emoji: "" }] } : panel),
      },
    }));
    setExpandedRoleOption(`${panelKey}:${key}`);
  }

  function removeDiscordRolePanelOption(panelKey: string, optionKey: string) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, rolePanels: current.discord.rolePanels.map((panel) => panel.key === panelKey ? { ...panel, options: panel.options.filter((option) => option.key !== optionKey) } : panel) } }));
    setExpandedRoleOption((current) => current === `${panelKey}:${optionKey}` ? null : current);
  }

  function updateWelcomeFlow(patch: Partial<DiscordWelcomeFlow>) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, welcomeFlow: { ...current.discord.welcomeFlow, ...patch } } }));
  }

  async function syncDiscordColourRoles() {
    const result = await api("/admin/discord/colour-roles/manage", { method: "POST", body: JSON.stringify({ colourRoles: draft.discord.colourRoles, colourRolesChannelId: draft.discord.colourRolesChannelId }) });
    const next = normalizeAppSettings(result.settings);
    setDraft(next);
    onSettingsSaved(next);
    await refreshDiscordDiscovery();
  }

  async function createDiscordRoleFromDashboard() {
    const result = await api("/admin/discord/roles/create", { method: "POST", body: JSON.stringify(roleDraft) });
    setRoleDraft((current) => ({ ...current, name: "" }));
    await refreshDiscordDiscovery();
    setDiscordToolResult({ createdRole: result.role });
  }

  async function postRolePanel(panelKey: string) {
    const result = await api("/admin/discord/role-panel/post", { method: "POST", body: JSON.stringify({ panelKey }) });
    const next = normalizeAppSettings(result.settings);
    setDraft(next);
    onSettingsSaved(next);
  }

  async function postWelcomeFlow() {
    const result = await api("/admin/discord/welcome/post", { method: "POST", body: "{}" });
    const next = normalizeAppSettings(result.settings);
    setDraft(next);
    onSettingsSaved(next);
  }

  async function runModerationAction(action: "timeout" | "kick" | "ban" | "unban" | "purge") {
    const payload = action === "purge"
      ? { channelId: moderationDraft.channelId, limit: Number(moderationDraft.purgeLimit), reason: moderationDraft.reason }
      : action === "unban"
        ? { userId: moderationDraft.unbanUserId || moderationDraft.userId, reason: moderationDraft.reason }
        : {
          userId: moderationDraft.userId,
          reason: moderationDraft.reason,
          minutes: action === "timeout" ? Number(moderationDraft.timeoutMinutes) : undefined,
          deleteMessageSeconds: action === "ban" ? Number(moderationDraft.deleteMessageSeconds) : undefined,
        };
    const result = await api(`/admin/discord/moderation/${action}`, { method: "POST", body: JSON.stringify(payload) });
    setDiscordToolResult({ ...result, __type: "moderationAction" });
  }

  function confirmDanger(message: string, phrase = "CONFIRM") {
    const response = window.prompt(`${message}\n\nType ${phrase} to continue.`);
    return response === phrase;
  }

  function confirmModeration(message: string) {
    return confirmDanger(message);
  }

  async function runBotEndpoint(path: string, payload: AnyRecord, type: string) {
    const result = await api(path, { method: "POST", body: JSON.stringify(payload) });
    setDiscordToolResult({ ...result, __type: type });
    return result;
  }

  function updateNotificationChannel(key: string, value: string) {
    setDraft((current) => ({ ...current, discord: { ...current.discord, notificationChannels: { ...current.discord.notificationChannels, [key]: value } } }));
  }

  async function uploadBrand(type: "logo" | "favicon", file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setMessageKind("error");
      return setMessage("Image must be smaller than 1 MB.");
    }
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

  const tabs = React.useMemo<Array<[AdminTab, string]>>(
    () => botOnly ? [] : [["status", "Status"], ["analytics", "Analytics"], ["configuration", "Configuration"], ["diagnostics", "Diagnostics"], ["database", "Database"], ["users", "Administrators"], ["accounts", "Linked Accounts"], ["audit", "Audit"], ["backups", "Backups"]],
    [botOnly],
  );
  React.useEffect(() => {
    if (botOnly) {
      if (tab !== "discord") setTab("discord");
      return;
    }
    if (!tabs.some(([key]) => key === tab)) setTab("status");
  }, [botOnly, setTab, tab, tabs]);
  const discordTestButtons = [
    ["basic", "Basic"],
    ["listing", "Listing"],
    ["sale", "Sale"],
    ["craftStarted", "Craft Started"],
    ["craftCompleted", "Craft Completed"],
    ["supplies", "Supplies"],
    ["appUpdate", "App Update"],
  ] as const;
  if (authLoading || authLoaderMinimumActive) return (
    <div className="panel admin-login admin-loading-panel">
      <section className="admin-session-loader" role="status" aria-live="polite" aria-label="Checking administrator session">
        <div className="admin-loader-orb" aria-hidden="true">
          <span className="admin-loader-ring" />
          <span className="admin-loader-ring delay" />
          <span className="admin-loader-core" />
          <KeyRound size={30} />
        </div>
        <div className="admin-loader-copy">
          <span className="eyebrow">Admin Console</span>
          <h2>Verifying Access</h2>
          <p>Checking your session, permissions, and console modules.</p>
        </div>
        <div className="admin-loader-track" aria-hidden="true">
          <span />
        </div>
        <div className="admin-loader-steps" aria-hidden="true">
          <span><Shield size={14} /> Session</span>
          <span><Database size={14} /> Roles</span>
          <span><CheckCircle2 size={14} /> Console</span>
        </div>
      </section>
    </div>
  );
  if (!auth?.authenticated) {
    const adminDiscordLogin = String(auth?.discordLoginUrl ?? `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent("/?page=admin")}`);
    return (
      <div className="panel admin-login">
        <header className="members-topbar admin-topbar">
          <div>
            <h2>{botOnly ? "Discord Bot Control" : "Admin"}</h2>
            <p>Sign in with an approved Discord administrator account to manage this installation.</p>
          </div>
        </header>
        <section className="form-card">
          <h3><MessageCircle size={17} /> Discord Administrator Sign-In</h3>
          <p className="legend">Discord proves identity; administrator access is controlled by the owner-managed admin list.</p>
          {auth?.discordLoginEnabled ? <a className="toolbar-button primary" href={adminDiscordLogin}><MessageCircle size={15} /> Sign in with Discord</a> : <p className="error">Discord login is not configured on this server.</p>}
          {message ? <p className="legend">{message}</p> : null}
        </section>
      </div>
    );
  }

  const activeTableResult = tableResult.table === selectedTable ? tableResult : { table: selectedTable, rows: [], columns: [], total: 0, offset: tableOffset, limit: 50 };
  const tableRows: AnyRecord[] = activeTableResult.rows ?? [];
  const tableColumns = activeTableResult.columns ?? Object.keys(tableRows[0] ?? {});
  const selectedTableInfo = tables.find((table) => table.name === selectedTable);
  const tableRangeStart = activeTableResult.total ? tableOffset + 1 : 0;
  const tableRangeEnd = Math.min(tableOffset + tableRows.length, toNumber(activeTableResult.total));
  const securityRecent = visitorSecurityData?.recent ?? {};
  const securityEventRows: AnyRecord[] = Array.isArray(securityRecent) ? securityRecent : securityRecent.rows ?? [];
  const securityEventTotal = Array.isArray(securityRecent) ? securityEventRows.length : toNumber(securityRecent.total);
  const securityEventActivePage = Array.isArray(securityRecent) ? 1 : toNumber(securityRecent.page) || securityEventPage;
  const securityEventActivePageSize = Array.isArray(securityRecent) ? securityEventRows.length || securityEventPageSize : toNumber(securityRecent.pageSize) || securityEventPageSize;
  const securityEventPageCount = Math.max(1, Math.ceil(securityEventTotal / Math.max(securityEventActivePageSize, 1)));
  const securityEventRangeStart = securityEventTotal ? (securityEventActivePage - 1) * securityEventActivePageSize + 1 : 0;
  const securityEventRangeEnd = securityEventTotal ? Math.min(securityEventRangeStart + securityEventRows.length - 1, securityEventTotal) : 0;
  const endpointChecks = [...diagnostics].sort((a, b) => {
    if (Boolean(a.ok) !== Boolean(b.ok)) return a.ok ? 1 : -1;
    return toNumber(b.durationMs) - toNumber(a.durationMs);
  });
  const endpointFailures = endpointChecks.filter((check) => !check.ok);
  const endpointSuccesses = endpointChecks.filter((check) => check.ok);
  const slowestEndpoint = endpointSuccesses[0];
  const fastestEndpoint = endpointSuccesses.reduce<AnyRecord | null>((fastest, check) => {
    if (!fastest || toNumber(check.durationMs) < toNumber(fastest.durationMs)) return check;
    return fastest;
  }, null);
  const discordChannelLabel = (key: string) => {
    if (key === "notifications") return "Default notifications";
    if (key === "modNotes") return "Mod notes";
    if (key === "modLog") return "Mod log";
    return key[0].toUpperCase() + key.slice(1);
  };
  const channelOptions = Object.entries(draft.discord.channels ?? {}).map(([key, id]) => ({ key, label: discordChannelLabel(key), id })).filter((entry) => entry.id || entry.key === "notifications");
  const channelSelect = (key: string, value: string, allowProfession = false) => (
    <select value={value} onChange={(event) => updateNotificationChannel(key, event.target.value)}>
      {allowProfession ? <option value="profession">Profession channel</option> : null}
      {channelOptions.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
    </select>
  );
  const discoveredChannels: AnyRecord[] = discordDiscovery?.channels ?? [];
  const discoveredRoles: AnyRecord[] = discordDiscovery?.roles ?? [];
  const discoveredMembers: AnyRecord[] = discordDiscovery?.members ?? [];
  const roleById = (id: string) => discoveredRoles.find((role) => String(role.id) === String(id));
  const roleMemberCountText = (role: AnyRecord | undefined | null) => role?.memberCountAvailable === false ? "Member count unavailable" : `${formatNumber(role?.memberCount)} members`;
  const roleStatusText = (role: AnyRecord | undefined | null) => role ? `${roleMemberCountText(role)} | ${role.manageabilityReason ?? (role.botCanManage ? "Bot can manage" : "Not manageable")}` : "";
  const memberCountWarning = discordDiscovery?.memberCountAvailable === false ? (
    <div className="error">Discord member counts are unavailable. Enable the bot's Server Members Intent in the Discord Developer Portal, then sync the server again. {discordDiscovery.memberCountError ? `Discord returned: ${discordDiscovery.memberCountError}` : ""}</div>
  ) : null;
  const channelIdSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a channel</option>
      {value && !discoveredChannels.some((channel) => String(channel.id) === String(value)) ? <option value={value}>Unknown channel ({value})</option> : null}
      {discoveredChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.label ?? `#${channel.name}`} ({channel.id})</option>)}
    </select>
  );
  const memberIdSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a member</option>
      {value && !discoveredMembers.some((member) => String(member.id) === String(value)) ? <option value={value}>Unknown member ({value})</option> : null}
      {discoveredMembers.map((member) => <option key={member.id} value={member.id}>{member.username ?? member.id} ({member.id})</option>)}
    </select>
  );
  const roleIdSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a role</option>
      {value && !discoveredRoles.some((role) => String(role.id) === String(value)) ? <option value={value}>Unknown role ({value})</option> : null}
      {discoveredRoles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.botCanManage ? "" : ` - ${role.manageabilityReason ?? "not manageable"}`}</option>)}
    </select>
  );
  const discordDelivery = status?.discord?.lastDelivery ?? {};
  const discordLog: AnyRecord[] = Array.isArray(status?.discord?.deliveryLog) ? status.discord.deliveryLog : [];
  const discordDeliveryLabel = discordDelivery.status === "failed"
    ? `Failed ${dateLabel(discordDelivery.at)}: ${discordDelivery.error ?? "Unknown Discord error"}`
    : discordDelivery.status === "sent"
      ? `Sent ${dateLabel(discordDelivery.at)}: ${discordDelivery.eventType ?? "notification"}${discordDelivery.channelId ? ` to ${discordDelivery.channelId}` : ""}`
      : discordDelivery.status === "skipped"
        ? `Skipped ${dateLabel(discordDelivery.at)}: ${discordDelivery.reason ?? "Not enabled"}`
        : "No Discord deliveries recorded";
  const adminSetupItems = [
    { label: "Discord administrator", done: Boolean(auth?.user), detail: auth?.user?.username ? `Signed in as ${auth.user.username}` : "Sign in with an approved Discord admin account." },
    { label: "Settlement defaults", done: Boolean(draft.claimId), detail: draft.claimId ? `Settlement ${draft.claimId}` : "Add the monitored settlement ID." },
    { label: "Local data collection", done: Boolean(status?.polling?.enabled || status?.counts?.snapshots), detail: status?.polling?.enabled ? `Collects every ${Math.round(toNumber(status.polling.intervalMs) / 1000)} seconds` : "Enable server polling in production or run manual collection." },
    { label: "Database history", done: toNumber(status?.counts?.snapshots) > 0 || toNumber(status?.counts?.activity_events) > 0 || toNumber(status?.counts?.market_trades) > 0, detail: `${formatNumber(status?.counts?.snapshots)} snapshots, ${formatNumber(status?.counts?.market_trades)} trades` },
    { label: "Branding", done: Boolean(draft.branding?.logo || draft.branding?.favicon), detail: draft.branding?.logo || draft.branding?.favicon ? "Custom brand assets configured." : "Optional logo and favicon can be added." },
    { label: "Discord bot", done: Boolean(draft.discord?.botTokenConfigured && draft.discord?.enabled), detail: draft.discord?.botTokenConfigured ? (draft.discord.enabled ? "Enabled and token configured." : "Token configured, bot disabled.") : "Optional bot token not configured." },
  ];
  const completedSetupItems = adminSetupItems.filter((item) => item.done).length;
  const botWorkflowItems = [
    { label: "Connect bot", done: Boolean(draft.discord?.botTokenConfigured), detail: draft.discord?.botTokenConfigured ? `Token configured via ${draft.discord.botTokenSource ?? "server"}.` : "Add the bot token in Setup." },
    { label: "Sync Discord server", done: Boolean(discoveredChannels.length || discoveredRoles.length || discoveredMembers.length), detail: `${formatNumber(discoveredChannels.length)} channels, ${formatNumber(discoveredRoles.length)} roles, ${formatNumber(discoveredMembers.length)} members cached.` },
    { label: "Choose notification channels", done: Boolean(Object.values(draft.discord?.notificationChannels ?? {}).some(Boolean)), detail: "Route app, supply, craft and moderation messages." },
    { label: "Register slash commands", done: Boolean(status?.discord?.registeredCommandsAt), detail: status?.discord?.registeredCommandsAt ? `Last registered ${dateLabel(status.discord.registeredCommandsAt)}.` : "Use Tests & Commands after settings are saved." },
  ];

  function discordSnowflakeDate(id: unknown) {
    try {
      const raw = String(id ?? "");
      if (!/^\d+$/.test(raw)) return null;
      return new Date(Number((BigInt(raw) >> 22n) + 1420070400000n));
    } catch {
      return null;
    }
  }

  function discordAuditActionLabel(actionType: unknown) {
    const labels: Record<string, string> = {
      "1": "Guild updated",
      "10": "Channel created",
      "11": "Channel updated",
      "12": "Channel deleted",
      "13": "Channel permissions created",
      "14": "Channel permissions updated",
      "15": "Channel permissions deleted",
      "20": "Member removed",
      "21": "Member pruned",
      "22": "Member banned",
      "23": "Member unbanned",
      "24": "Member updated",
      "25": "Member roles updated",
      "26": "Member moved",
      "27": "Member disconnected",
      "28": "Bot added",
      "30": "Role created",
      "31": "Role updated",
      "32": "Role deleted",
      "40": "Invite created",
      "41": "Invite updated",
      "42": "Invite deleted",
      "50": "Webhook created",
      "51": "Webhook updated",
      "52": "Webhook deleted",
      "60": "Emoji created",
      "61": "Emoji updated",
      "62": "Emoji deleted",
      "72": "Message deleted",
      "73": "Messages bulk deleted",
      "74": "Message pinned",
      "75": "Message unpinned",
      "80": "Integration created",
      "81": "Integration updated",
      "82": "Integration deleted",
      "90": "Stage instance created",
      "91": "Stage instance updated",
      "92": "Stage instance deleted",
      "110": "Thread created",
      "111": "Thread updated",
      "112": "Thread deleted",
      "121": "AutoMod rule created",
      "122": "AutoMod rule updated",
      "123": "AutoMod rule deleted",
    };
    const key = String(actionType ?? "");
    return labels[key] ?? `Action ${key || "unknown"}`;
  }

  function discordAuditUserLabel(users: AnyRecord[], id: unknown) {
    const user = users.find((entry) => String(entry.id) === String(id));
    return String(user?.global_name ?? user?.username ?? id ?? "Unknown user");
  }

  function discordChangeLabel(change: AnyRecord) {
    const key = String(change.key ?? "change").replaceAll("_", " ");
    const next = change.new_value;
    const previous = change.old_value;
    const format = (value: unknown) => {
      if (value === undefined) return "";
      if (Array.isArray(value)) return `${formatNumber(value.length)} item${value.length === 1 ? "" : "s"}`;
      if (typeof value === "object" && value !== null) return JSON.stringify(value);
      return String(value);
    };
    if (next !== undefined && previous !== undefined) return `${key}: ${format(previous)} -> ${format(next)}`;
    if (next !== undefined) return `${key}: ${format(next)}`;
    if (previous !== undefined) return `${key}: removed ${format(previous)}`;
    return key;
  }

  function renderDiscordToolResult(result: AnyRecord) {
    const resultType = String(result.__type ?? "");
    if (Array.isArray(result.entries) && Array.isArray(result.users)) {
      return <div className="discord-audit-report">
        <div className="split-header">
          <div>
            <h4>Audit Log</h4>
            <p className="legend">Latest Discord server actions returned by the bot.</p>
          </div>
          <span className="role-option-status ok">{formatNumber(result.entries.length)} entries</span>
        </div>
        {!result.entries.length ? <div className="empty-state"><FileText />No audit entries returned.</div> : null}
        <div className="discord-audit-list">{result.entries.map((entry: AnyRecord) => {
          const occurredAt = discordSnowflakeDate(entry.id);
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          return <article className="discord-audit-entry" key={entry.id}>
            <div className="discord-audit-icon"><FileText size={16} /></div>
            <div>
              <strong>{discordAuditActionLabel(entry.actionType)}</strong>
              <span>{discordAuditUserLabel(result.users, entry.userId)}{entry.targetId ? ` -> ${entry.targetId}` : ""}</span>
              {entry.reason ? <p>Reason: {entry.reason}</p> : null}
              {changes.length ? <ul>{changes.slice(0, 5).map((change: AnyRecord, index: number) => <li key={`${entry.id}-${index}`}>{discordChangeLabel(change)}</li>)}</ul> : null}
            </div>
            <time>{occurredAt ? dateLabel(occurredAt.toISOString()) : entry.id}</time>
          </article>;
        })}</div>
      </div>;
    }
    if (resultType === "roleCleanup" || (Array.isArray(result.unusedRoles) && Array.isArray(result.duplicateColours))) {
      const unusedRoles = result.unusedRoles ?? [];
      const duplicateColours = result.duplicateColours ?? [];
      const missingConfiguredRoles = result.missingConfiguredRoles ?? [];
      const notManageableConfiguredRoles = result.notManageableConfiguredRoles ?? [];
      return <div className="discord-report">
        <div className="split-header">
          <div><h4>Role Cleanup</h4><p className="legend">Potential Discord role issues found from the latest server sync.</p></div>
          <span className="role-option-status warn">{formatNumber(unusedRoles.length + duplicateColours.length + missingConfiguredRoles.length + notManageableConfiguredRoles.length)} findings</span>
        </div>
        <div className="discord-report-metrics">
          <Info label="Unused roles" value={formatNumber(unusedRoles.length)} />
          <Info label="Duplicate colours" value={formatNumber(duplicateColours.length)} />
          <Info label="Missing configured" value={formatNumber(missingConfiguredRoles.length)} />
          <Info label="Not manageable" value={formatNumber(notManageableConfiguredRoles.length)} />
        </div>
        <div className="discord-report-grid">
          <section><h5>Unused Roles</h5>{unusedRoles.length ? unusedRoles.map((role: AnyRecord) => <div className="discord-report-row" key={role.id}><span className="role-swatch" style={{ backgroundColor: role.color ? `#${Number(role.color).toString(16).padStart(6, "0")}` : "transparent" }} /><strong>{role.name}</strong><small>{roleMemberCountText(role)} | {role.manageabilityReason ?? "Role can be reviewed"}</small></div>) : <p className="legend">No unused roles found.</p>}</section>
          <section><h5>Duplicate Colours</h5>{duplicateColours.length ? duplicateColours.map((group: AnyRecord) => <div className="discord-report-row" key={group.color}><span className="role-swatch" style={{ backgroundColor: group.color ? `#${Number(group.color).toString(16).padStart(6, "0")}` : "transparent" }} /><strong>#{Number(group.color ?? 0).toString(16).padStart(6, "0")}</strong><small>{(group.roles ?? []).map((role: AnyRecord) => role.name).join(", ")}</small></div>) : <p className="legend">No duplicate role colours found.</p>}</section>
          <section><h5>Missing Configured Roles</h5>{missingConfiguredRoles.length ? missingConfiguredRoles.map((roleId: string) => <div className="discord-report-row" key={roleId}><AlertTriangle size={15} /><strong>Missing role</strong><small>{roleId}</small></div>) : <p className="legend">All configured roles exist.</p>}</section>
          <section><h5>Not Manageable</h5>{notManageableConfiguredRoles.length ? notManageableConfiguredRoles.map((role: AnyRecord) => <div className="discord-report-row" key={role.id}><Lock size={15} /><strong>{role.name}</strong><small>{role.manageabilityReason ?? "Bot cannot manage this role"}</small></div>) : <p className="legend">Configured roles are manageable.</p>}</section>
        </div>
      </div>;
    }
    if (resultType === "channelPermissions" || Array.isArray(result.channels)) {
      const channels = result.channels ?? [];
      const missing = channels.filter((channel: AnyRecord) => !channel.found);
      const denied = channels.filter((channel: AnyRecord) => (channel.deniedConfiguredRoles ?? []).length);
      return <div className="discord-report">
        <div className="split-header">
          <div><h4>Channel Checks</h4><p className="legend">Configured channels and role permission overwrite warnings.</p></div>
          <span className={`role-option-status ${missing.length || denied.length ? "warn" : "ok"}`}>{missing.length || denied.length ? `${missing.length + denied.length} warnings` : "Looks good"}</span>
        </div>
        <div className="discord-report-metrics">
          <Info label="Configured channels" value={formatNumber(channels.length)} />
          <Info label="Missing channels" value={formatNumber(missing.length)} />
          <Info label="Denied role overwrites" value={formatNumber(denied.length)} />
        </div>
        <div className="discord-report-list">{channels.map((channel: AnyRecord) => <article className="discord-report-item" key={`${channel.key}-${channel.id}`}>
          <div className={`discord-report-dot ${channel.found ? "ok" : "warn"}`} />
          <div><strong>{channel.name}</strong><span>{channel.key} | {channel.id}</span></div>
          <span className={`role-option-status ${channel.found && !(channel.deniedConfiguredRoles ?? []).length ? "ok" : "warn"}`}>{!channel.found ? "Missing" : (channel.deniedConfiguredRoles ?? []).length ? "Denied role overwrite" : "Found"}</span>
        </article>)}</div>
      </div>;
    }
    if (resultType === "inactiveReport" || Array.isArray(result.inactive)) {
      const inactive = result.inactive ?? [];
      return <div className="discord-report">
        <div className="split-header">
          <div><h4>Inactive Members</h4><p className="legend">Members with no recent messages or sampled reactions in the checked channels.</p></div>
          <span className="role-option-status warn">{formatNumber(inactive.length)} inactive</span>
        </div>
        <div className="discord-report-metrics">
          <Info label="Period" value={`${formatNumber(result.days)} days`} />
          <Info label="Members scanned" value={result.totalMembers === null ? "Unavailable" : formatNumber(result.totalMembers)} />
          <Info label="Active found" value={formatNumber(result.activeCount)} />
          <Info label="Channels checked" value={formatNumber(result.scannedChannels)} />
          <Info label="Reaction checks" value={formatNumber(result.reactionChecks)} />
        </div>
        <div className="discord-report-list">{inactive.length ? inactive.map((member: AnyRecord) => <article className="discord-report-item" key={member.id}>
          <div className="discord-report-dot warn" />
          <div><strong>{member.username}</strong><span>{member.id}</span></div>
          <span className="role-option-status warn">Inactive</span>
        </article>) : <p className="legend">No inactive members found in this scan.</p>}</div>
      </div>;
    }
    if (resultType === "moderationBans" || Array.isArray(result.bans)) {
      const bans = result.bans ?? [];
      return <div className="discord-report">
        <div className="split-header">
          <div><h4>Ban List</h4><p className="legend">Current Discord server bans returned by the bot.</p></div>
          <span className="role-option-status warn">{formatNumber(bans.length)} banned</span>
        </div>
        <div className="discord-report-list">{bans.length ? bans.map((entry: AnyRecord) => <article className="discord-report-item" key={entry.user?.id ?? entry.id}>
          <div className="discord-report-dot warn" />
          <div><strong>{entry.user?.username ?? "Unknown user"}</strong><span>{entry.user?.id ?? "-"}{entry.reason ? ` | ${entry.reason}` : ""}</span></div>
          <span className="role-option-status warn">Banned</span>
        </article>) : <p className="legend">No banned users returned by Discord.</p>}</div>
      </div>;
    }
    if (resultType === "moderationAction") {
      const labels: Record<string, string> = {
        timeout: "Timeout Applied",
        timeout_removed: "Timeout Removed",
        kick: "Member Kicked",
        ban: "Member Banned",
        unban: "Member Unbanned",
        purge: "Messages Purged",
      };
      return <div className="discord-report">
        <div className="split-header">
          <div><h4>{labels[result.action] ?? "Moderation Action"}</h4><p className="legend">Discord accepted the moderation request.</p></div>
          <span className="role-option-status ok">Success</span>
        </div>
        <div className="discord-report-metrics">
          <Info label="Action" value={labels[result.action] ?? result.action ?? "Moderation"} />
          {result.userId ? <Info label="User ID" value={result.userId} /> : null}
          {result.channelId ? <Info label="Channel ID" value={result.channelId} /> : null}
          {result.minutes != null ? <Info label="Timeout" value={result.minutes ? `${formatNumber(result.minutes)} minutes` : "Removed"} /> : null}
          {result.deleted != null ? <Info label="Deleted" value={`${formatNumber(result.deleted)} messages`} /> : null}
        </div>
      </div>;
    }
    if (resultType === "botAction") {
      const response = result.response ?? result.rule ?? result.command ?? {};
      return <div className="discord-report">
        <div className="split-header"><div><h4>Action Complete</h4><p className="legend">The bot action completed successfully.</p></div><span className="role-option-status ok">Success</span></div>
        <div className="discord-report-metrics">
          <Info label="Result" value={result.action ?? response.name ?? response.title ?? response.id ?? "Completed"} />
          {result.response?.id ? <Info label="Message ID" value={result.response.id} /> : null}
          {result.rule?.id ? <Info label="Rule ID" value={result.rule.id} /> : null}
          {result.caseId ? <Info label="Case ID" value={`#${result.caseId}`} /> : null}
          {result.unbanAt ? <Info label="Unban At" value={dateLabel(result.unbanAt)} /> : null}
        </div>
      </div>;
    }
    if (resultType === "botReport") {
      const rows = result.cases ?? result.warnings ?? result.notes ?? result.mismatches ?? result.commands ?? result.rules ?? [];
      const title = result.cases ? "Case Log" : result.warnings ? "Warnings" : result.notes ? "Mod Notes" : result.mismatches ? "Nickname Report" : result.commands ? "Custom Commands" : result.rules ? "Auto-Moderation Rules" : "Report";
      return <div className="discord-report">
        <div className="split-header"><div><h4>{title}</h4><p className="legend">Latest bot report output.</p></div><span className="role-option-status">{formatNumber(Array.isArray(rows) ? rows.length : 0)} rows</span></div>
        <div className="discord-report-list">{Array.isArray(rows) && rows.length ? rows.slice(0, 100).map((row: AnyRecord, index: number) => <article className="discord-report-item" key={row.id ?? row.name ?? index}>
          <div className="discord-report-dot ok" />
          <div><strong>{row.name ?? row.username ?? row.case_type ?? row.reason ?? row.note ?? row.user?.username ?? `Record ${index + 1}`}</strong><span>{row.description ?? row.response ?? row.user_id ?? row.user?.id ?? row.created_at ?? row.occurred_at ?? JSON.stringify(row).slice(0, 180)}</span></div>
          <span className="role-option-status">{row.active === 0 ? "Cleared" : row.enabled === false ? "Off" : "Active"}</span>
        </article>) : <p className="legend">No records returned.</p>}</div>
      </div>;
    }
    return <pre className="discord-tool-result">{JSON.stringify(result, null, 2)}</pre>;
  }
  return (
    <div className={`panel admin-console ${botOnly ? "bot-console" : "admin-page"}`}>
      {botOnly ? (
        <div className="split-header">
          <Header title="Discord Bot Control">Manage bot setup, notifications, self-assign roles, tools and diagnostics</Header>
          <div className="toolbar">
            <a className="toolbar-button" href="/"><ExternalLink size={15} /> Open App</a>
            <button className="toolbar-button" onClick={() => run(async () => { await api("/admin/logout", { method: "POST", body: "{}" }); setAdminAuthState({ authenticated: false, setupRequired: false }); })}><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      ) : (
        <header className="members-topbar admin-topbar">
          <div>
            <h2>Admin Console</h2>
            <p>Configuration and operational controls for this installation</p>
          </div>
          <div className="dashboard-top-meta" aria-label="Admin status">
            <div className="dashboard-meta-cluster">
              <span><Server size={15} /> {status?.environment ?? "Local"}</span>
              <span>{status?.polling?.enabled ? "Collection enabled" : "Collection disabled"}</span>
            </div>
            <div className="toolbar">
              <a className="toolbar-button" href="/bot" target="_blank" rel="noreferrer"><MessageCircle size={15} /> Bot Dashboard</a>
              <button className="toolbar-button" onClick={() => run(async () => { await api("/admin/logout", { method: "POST", body: "{}" }); setAdminAuthState({ authenticated: false, setupRequired: false }); })}><LogOut size={15} /> Sign out</button>
            </div>
          </div>
        </header>
      )}
      {tabs.length ? <div className="admin-tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div> : null}
      {message ? <div className={`admin-message ${messageKind}`}>{message}</div> : null}

      {tab === "status" ? (
        <div className="admin-section">
          <section className="form-card setup-checklist-card">
            <div className="split-header">
              <div>
                <h3><CheckCircle2 size={17} /> Setup Checklist</h3>
                <p className="legend">A quick operational checklist for this installation. Optional items are marked when configured, but do not block local use.</p>
              </div>
              <span className="setup-progress-pill">{completedSetupItems}/{adminSetupItems.length} complete</span>
            </div>
            <div className="setup-checklist">
              {adminSetupItems.map((item) => (
                <div className={item.done ? "done" : ""} key={item.label}>
                  <span>{item.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
          </section>
          <div className="metric-grid admin-metrics">
            <Stat icon={<Server />} label="Environment" value={status?.environment ?? "-"} />
            <Stat icon={<Database />} label="Database" value={bytesLabel(status?.databaseSize)} />
            <Stat icon={<Save />} label="Snapshots" value={formatNumber(status?.counts?.snapshots)} />
            <Stat icon={<CircleDollarSign />} label="Confirmed Trades" value={formatNumber(status?.counts?.market_trades)} />
            <Stat icon={<Activity />} label="Activity Events" value={formatNumber(status?.counts?.activity_events)} />
          </div>
          <section className="form-card">
            <div className="split-header"><h3><Server size={17} /> Collection Status</h3><div className="toolbar"><button className={busyButtonClass("status-refresh")} disabled={isBusyAction("status-refresh")} onClick={() => run(refreshStatus, undefined, "status-refresh")}><RefreshCw size={15} /> {isBusyAction("status-refresh") ? "Refreshing..." : "Refresh"}</button><button className={busyButtonClass("collect-now", "toolbar-button primary")} disabled={isBusyAction("collect-now")} onClick={() => run(collectNowWithLiveStatus, "Collection run completed.", "collect-now")}><RefreshCw size={15} /> {isBusyAction("collect-now") ? "Collecting..." : "Collect Now"}</button></div></div>
            <div className="status-detail">
              <Info label="Server polling" value={status?.polling?.enabled ? `Enabled, every ${Math.round(status.polling.intervalMs / 1000)} seconds` : "Disabled"} />
              <Info label="Last successful collection" value={dateLabel(status?.polling?.lastSuccessAt)} />
              <Info label="Next scheduled collection" value={dateLabel(status?.polling?.nextRunAt)} />
              <Info label="Last error" value={status?.polling?.lastError ?? "None"} />
              <Info label="Discord delivery" value={discordDeliveryLabel} />
              <Info label="Storage" value={status?.storageLabel ?? "-"} />
            </div>
            <div className="status-detail collector-status-grid">
              {Object.entries(status?.polling?.collectors ?? {}).map(([key, collector]: [string, AnyRecord]) => (
                <Info
                  key={key}
                  label={collector.label ?? key}
                  value={collectorStatusValue(collector)}
                />
              ))}
            </div>
          </section>
          <section className="form-card scheduled-jobs-card">
            <div className="split-header">
              <div>
                <h3><Clock size={17} /> Scheduled Jobs</h3>
                <p className="legend">Background jobs run on the local server. Click a job to edit when and how often it runs.</p>
              </div>
              <button className={busyButtonClass("jobs-refresh")} disabled={isBusyAction("jobs-refresh")} onClick={() => run(refreshScheduledJobs, undefined, "jobs-refresh")}><RefreshCw size={15} /> {isBusyAction("jobs-refresh") ? "Refreshing..." : "Refresh"}</button>
            </div>
            <div className="status-detail">
              <Info label="Scheduler" value={scheduledJobs?.enabled ? "Enabled" : "Disabled"} />
              <Info label="Recipe records" value={formatNumber(scheduledJobs?.recipeCatalogCount)} />
              <Info label="Server time" value={dateLabel(scheduledJobs?.serverTime)} />
            </div>
            <div className="scheduled-job-list">
              {(scheduledJobs?.jobs ?? []).map((job: AnyRecord) => {
                const expanded = expandedScheduledJobKey === job.key;
                const config = scheduledJobConfig(job);
                return (
                  <article
                    className={`scheduled-job-row ${expanded ? "is-expanded" : ""}`}
                    key={job.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedScheduledJobKey((current) => current === job.key ? null : String(job.key))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedScheduledJobKey((current) => current === job.key ? null : String(job.key));
                      }
                    }}
                  >
                    <div>
                      <strong>{job.label}</strong>
                      <span>{job.description}</span>
                      <small>
                        Schedule {job.scheduleLabel ?? job.schedule}
                        {" | "}
                        Last success {dateLabel(job.lastSuccessAt)}
                        {" | "}
                        Next run {dateLabel(job.nextRunAt)}
                      </small>
                      {job.running && job.metadata?.stage ? (
                        <small>
                          Current step: {scheduledJobProgressText(job.metadata)}
                        </small>
                      ) : null}
                      {job.lastError ? <small className="error">Last error: {job.lastError}</small> : null}
                    </div>
                    <div className="scheduled-job-actions" onClick={(event) => event.stopPropagation()}>
                      <span className={`role-option-status ${job.running ? "warn" : job.enabled ? "ok" : ""}`}>{job.running ? "Running" : job.enabled ? "Enabled" : "Disabled"}</span>
                      <label className="toggle-line compact-toggle">
                        <span>{job.enabled ? "Enabled" : "Disabled"}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(job.enabled)}
                          onChange={(event) => run(async () => {
                            setScheduledJobs(await api("/admin/jobs", { method: "PUT", body: JSON.stringify({ key: job.key, enabled: event.target.checked }) }));
                          }, `Scheduled job ${event.target.checked ? "enabled" : "disabled"}.`)}
                        />
                      </label>
                      <button
                        className={busyButtonClass(`job-run:${job.key}`)}
                        disabled={Boolean(job.running) || isBusyAction(`job-run:${job.key}`)}
                        onClick={() => run(async () => {
                          const result = await api("/admin/jobs/run", { method: "POST", body: JSON.stringify({ key: job.key }) });
                          setScheduledJobs(result);
                        }, "Scheduled job started.", `job-run:${job.key}`)}
                      >
                        <RefreshCw size={15} /> {isBusyAction(`job-run:${job.key}`) ? "Starting..." : "Run Now"}
                      </button>
                    </div>
                    {expanded ? (
                      <div className="scheduled-job-editor" onClick={(event) => event.stopPropagation()}>
                        <label className="inline-field">
                          <span>Frequency</span>
                          <select className="select-control" value={config.frequency ?? "daily"} onChange={(event) => updateScheduledJobDraft(job, { frequency: event.target.value })}>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </label>
                        {config.frequency === "weekly" ? (
                          <label className="inline-field">
                            <span>Day</span>
                            <select className="select-control" value={String(config.dayOfWeek ?? 1)} onChange={(event) => updateScheduledJobDraft(job, { dayOfWeek: Number(event.target.value) })}>
                              <option value="0">Sunday</option>
                              <option value="1">Monday</option>
                              <option value="2">Tuesday</option>
                              <option value="3">Wednesday</option>
                              <option value="4">Thursday</option>
                              <option value="5">Friday</option>
                              <option value="6">Saturday</option>
                            </select>
                          </label>
                        ) : null}
                        {config.frequency === "monthly" ? (
                          <label className="inline-field">
                            <span>Day of month</span>
                            <input className="select-control" type="number" min={1} max={28} value={String(config.dayOfMonth ?? 1)} onChange={(event) => updateScheduledJobDraft(job, { dayOfMonth: Math.min(28, Math.max(1, Math.floor(toNumber(event.target.value) || 1))) })} />
                          </label>
                        ) : null}
                        <label className="inline-field">
                          <span>Run time</span>
                          <input className="select-control" type="time" value={String(config.time ?? "00:00")} onChange={(event) => updateScheduledJobDraft(job, { time: event.target.value || "00:00" })} />
                        </label>
                        <div className="scheduled-job-editor-actions">
                          <button
                            className="toolbar-button"
                            onClick={() => setScheduledJobDrafts((current) => {
                              const next = { ...current };
                              delete next[String(job.key)];
                              return next;
                            })}
                          >
                            Reset
                          </button>
                          <button
                            className="toolbar-button primary"
                            onClick={() => run(async () => {
                              const result = await api("/admin/jobs", { method: "PUT", body: JSON.stringify({ key: job.key, enabled: Boolean(job.enabled), scheduleConfig: scheduledJobConfig(job) }) });
                              setScheduledJobs(result);
                              setScheduledJobDrafts((current) => {
                                const next = { ...current };
                                delete next[String(job.key)];
                                return next;
                              });
                            }, "Scheduled job settings saved.")}
                          >
                            <Save size={14} /> Save Schedule
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {scheduledJobs && !(scheduledJobs.jobs ?? []).length ? <p className="legend">No scheduled jobs are registered.</p> : null}
              {!scheduledJobs ? <p className="legend">Loading scheduled jobs...</p> : null}
            </div>
          </section>
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Activity size={17} /> BitJita Endpoint Check</h3>
                <p className="legend">Runs live timing checks for public data sources and settlement storage containers.</p>
              </div>
              <button className={busyButtonClass("endpoint-checks")} disabled={isBusyAction("endpoint-checks")} onClick={() => run(async () => setDiagnostics((await api("/admin/diagnostics", { method: "POST", body: "{}" })).checks ?? []), "Endpoint check completed.", "endpoint-checks")}><RefreshCw size={15} /> {isBusyAction("endpoint-checks") ? "Checking..." : "Run Checks"}</button>
            </div>
            {diagnostics.length ? (
              <div className="endpoint-check-panel">
                <div className="endpoint-summary-grid">
                  <Info label="Checks run" value={formatNumber(endpointChecks.length)} />
                  <Info label="Failures" value={formatNumber(endpointFailures.length)} />
                  <Info label="Slowest successful" value={slowestEndpoint ? `${slowestEndpoint.label} · ${formatNumber(slowestEndpoint.durationMs)} ms` : "-"} />
                  <Info label="Fastest successful" value={fastestEndpoint ? `${fastestEndpoint.label} · ${formatNumber(fastestEndpoint.durationMs)} ms` : "-"} />
                </div>
                <DataTable
                  rows={endpointChecks}
                  columns={[
                    ["Endpoint", (check) => <span className="endpoint-name">{check.label}</span>],
                    ["Status", (check) => <span className={`endpoint-status ${check.ok ? "ok" : "fail"}`}>{check.ok ? "Healthy" : "Failed"}</span>],
                    ["Duration", (check) => check.ok ? `${formatNumber(check.durationMs)} ms` : "-"],
                    ["Detail", (check) => check.ok ? "Request completed successfully" : String(check.error ?? "Request failed")],
                  ]}
                />
              </div>
            ) : <p className="legend">Run checks to time public data sources, including each settlement storage container used for Activity history.</p>}
          </section>
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="admin-section analytics-admin">
          <section className="form-card">
            <div className="split-header">
              <h3><TrendingUp size={17} /> Usage Analytics</h3>
              <div className="toolbar"><label className="inline-field"><span>Period</span><select className="select-control" value={analyticsDays} onChange={(event) => { setAnalyticsDays(event.target.value); setSecurityEventPage(1); }}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button className="toolbar-button danger" onClick={() => { if (confirmDanger("Delete all collected usage analytics? This cannot be undone.")) run(async () => { await api("/admin/analytics", { method: "DELETE", body: "{}" }); await refreshAnalytics(); }, "Usage analytics deleted."); }}><X size={14} /> Clear Data</button></div>
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
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Shield size={17} /> Visitor Security & Location</h3>
                <p className="legend">Server-side request logging for security and abuse prevention. This runs independently of optional analytics cookies. Full IPs are retained for {visitorSecurityData?.retention?.fullIpDays ?? 7} days, then anonymised stats remain.</p>
              </div>
            </div>
            <div className="metric-grid analytics-metrics">
              <Stat icon={<Activity />} label="Requests" value={formatNumber(visitorSecurityData?.totals?.requests)} />
              <Stat icon={<Users />} label="Unique Visitors" value={formatNumber(visitorSecurityData?.totals?.uniqueVisitors)} />
              <Stat icon={<AlertTriangle />} label="Error Responses" value={formatNumber(visitorSecurityData?.totals?.errors)} />
              <Stat icon={<MapPin />} label="GeoIP Status" value={visitorSecurityData?.geoip?.configured ? `${visitorSecurityData?.geoip?.provider === "ipapi" ? "ipapi cache" : "local"} · ${formatNumber(visitorSecurityData?.geoip?.entries)} records` : "Not configured"} />
              <Stat icon={<Clock />} label="Full IP Retention" value={`${formatNumber(visitorSecurityData?.retention?.fullIpDays ?? 7)} days`} />
            </div>
          </section>
          <div className="admin-grid">
            <section className="form-card">
              <h3><Globe2 size={17} /> Location Summary</h3>
              <DataTable rows={visitorSecurityData?.locations ?? []} columns={[
                ["Country", (row) => row.country || "Unknown"],
                ["City", (row) => row.city || "-"],
                ["Requests", (row) => formatNumber(row.requests)],
                ["Visitors", (row) => formatNumber(row.visitors)],
              ]} />
            </section>
            <section className="form-card">
              <h3><Server size={17} /> Route Groups</h3>
              <DataTable rows={visitorSecurityData?.routes ?? []} columns={[
                ["Group", (row) => row.routeGroup],
                ["Requests", (row) => formatNumber(row.requests)],
                ["Errors", (row) => formatNumber(row.errors)],
              ]} />
            </section>
          </div>
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Database size={17} /> Recent Security Events</h3>
                <p className="legend">Search and page through retained server-side request logs for security and abuse investigation.</p>
              </div>
              <label className="inline-field">
                <span>Rows</span>
                <select className="select-control" value={securityEventPageSize} onChange={(event) => { setSecurityEventPageSize(Number(event.target.value)); setSecurityEventPage(1); }}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </label>
            </div>
            <div className="database-toolbar">
              <SearchBox value={securityEventSearch} onChange={(value) => { setSecurityEventSearch(value); setSecurityEventPage(1); }} placeholder="Search time, group, status, IP, country or city" />
              <span className="legend">{formatNumber(securityEventTotal)} matching events</span>
            </div>
            <DataTable rows={securityEventRows} columns={[
              ["Time", (row) => dateLabel(row.occurredAt)],
              ["Method", (row) => row.method],
              ["Group", (row) => row.routeGroup],
              ["Status", (row) => row.statusCode],
              ["IP", (row) => row.ipAddress ?? row.ipAnonymized ?? "-"],
              ["Location", (row) => [row.city, row.country].filter(Boolean).join(", ") || "Unknown"],
            ]} />
            <div className="pager">
              <span>Showing {formatNumber(securityEventRangeStart)}-{formatNumber(securityEventRangeEnd)} of {formatNumber(securityEventTotal)} events</span>
              <button className="toolbar-button" disabled={securityEventActivePage <= 1} onClick={() => setSecurityEventPage(Math.max(1, securityEventActivePage - 1))}>Previous</button>
              <span className="legend">Page {formatNumber(securityEventActivePage)} of {formatNumber(securityEventPageCount)}</span>
              <button className="toolbar-button" disabled={securityEventActivePage >= securityEventPageCount} onClick={() => setSecurityEventPage(securityEventActivePage + 1)}>Next</button>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "diagnostics" ? (
        <div className="admin-section diagnostics-admin">
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Activity size={17} /> Diagnostics</h3>
                <p className="legend">Troubleshooting tools for local browser state, API refresh behaviour and generated external URLs.</p>
              </div>
            </div>
            <div className="status-detail">
              <Info label="Map URL log entries" value={formatNumber(mapUrlLog.length)} />
              <Info label="Latest map log" value={mapUrlLog[0]?.at ? dateLabel(mapUrlLog[0].at) : "Not recorded"} />
              <Info label="Latest tracked players" value={formatNumber(mapUrlLog[0]?.selectedPlayerIds?.length)} />
              <Info label="Latest detail failures" value={formatNumber(mapUrlLog[0]?.playerDetailFailed)} />
            </div>
          </section>
          <section className="form-card map-url-diagnostics">
            <div className="split-header">
              <div>
                <h3><MapIcon size={17} /> Map URL Diagnostics</h3>
                <p className="legend">Records the generated BitCraft map URL whenever the Map page changes tracked players, resources, regions or focus. Use this to diagnose player tracking flicker.</p>
              </div>
              <button className="toolbar-button" disabled={!mapUrlLog.length} onClick={() => setMapUrlLog([])}><X size={14} /> Clear Log</button>
            </div>
            {mapUrlLog.length ? (
              <>
                <div className="map-url-diagnostic-grid">
                  <Info label="Roster source" value={String(mapUrlLog[0].rosterSource ?? "-")} />
                  <Info label="Settlement members" value={formatNumber(mapUrlLog[0].memberCount)} />
                  <Info label="Roster players" value={formatNumber(mapUrlLog[0].rosterCount)} />
                  <Info label="Detail failures" value={formatNumber(mapUrlLog[0].playerDetailFailed)} />
                  <Info label="Tracked players" value={formatNumber(mapUrlLog[0].selectedPlayerIds?.length)} />
                  <Info label="Mode" value={mapUrlLog[0].selectedMode === "auto-online" ? "Auto online" : "Manual"} />
                </div>
                <code>{JSON.stringify(mapUrlLog[0], null, 2)}</code>
                <div className="map-url-log-list">
                  {mapUrlLog.map((entry) => (
                    <article key={`${entry.at}-${entry.url}`}>
                      <time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                      <span>{entry.rosterSource ?? "unknown"} roster, {formatNumber(entry.selectedPlayerIds?.length)} players, R {entry.regionIdParam || "-"}</span>
                      <small>{entry.playerIdParam || "no playerId"}</small>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <MapIcon size={32} />
                <strong>No map diagnostics yet</strong>
                <span>Open the Map page and change tracked players, resources or regions to record generated URL entries here.</span>
              </div>
            )}
          </section>
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
            <label className="field"><span>Additional active region IDs</span><input value={draft.additionalActiveRegions} onChange={(event) => updateDraft("additionalActiveRegions", event.target.value)} placeholder="Optional, e.g. 22,24" /></label>
            <div className="configuration-timing-grid">
              <label className="field unit-field">
                <span>Display refresh interval</span>
                <div className="unit-input"><input type="number" min={15} max={300} value={draft.refreshSeconds} onChange={(event) => updateDraft("refreshSeconds", Number(event.target.value))} /><em>seconds</em></div>
                <small>How often browser tabs ask the local server for the latest stored data.</small>
              </label>
              <label className="field unit-field">
                <span>Server collection interval</span>
                <div className="unit-input"><input type="number" min={15} max={300} value={draft.serverRefreshSeconds} onChange={(event) => updateDraft("serverRefreshSeconds", Number(event.target.value))} /><em>seconds</em></div>
                <small>Fallback interval for server-owned BitJita collection.</small>
              </label>
              <label className="field unit-field">
                <span>Snapshot retention</span>
                <div className="unit-input"><input type="number" min={30} max={3650} value={draft.snapshotRetentionDays} onChange={(event) => updateDraft("snapshotRetentionDays", Number(event.target.value))} /><em>days</em></div>
                <small>How long daily snapshot records are kept.</small>
              </label>
              <label className="field unit-field">
                <span>Full IP retention</span>
                <div className="unit-input"><input type="number" min={1} max={30} value={draft.visitorSecurity.fullIpRetentionDays} onChange={(event) => updateVisitorSecuritySetting({ fullIpRetentionDays: Number(event.target.value) })} /><em>days</em></div>
                <small>Full visitor IPs are cleared after this window; anonymised stats remain.</small>
              </label>
              <label className="field unit-field">
                <span>Visitor stats retention</span>
                <div className="unit-input"><input type="number" min={30} max={730} value={draft.visitorSecurity.statsRetentionDays} onChange={(event) => updateVisitorSecuritySetting({ statsRetentionDays: Number(event.target.value) })} /><em>days</em></div>
                <small>How long anonymised security/location statistics are kept.</small>
              </label>
              <label className="field unit-field">
                <span>GeoIP cache</span>
                <div className="unit-input"><input type="number" min={1} max={90} value={draft.visitorSecurity.geoipCacheDays} onChange={(event) => updateVisitorSecuritySetting({ geoipCacheDays: Number(event.target.value) })} /><em>days</em></div>
                <small>How long third-party IP location lookups are cached locally.</small>
              </label>
            </div>
            <div className="form-card nested-card">
              <h3><MapPin size={17} /> GeoIP Location Source</h3>
              <p className="legend">Choose how visitor IPs are converted into approximate country/city statistics. ipapi.co is queried server-side only when a cached location is missing.</p>
              <label className="field">
                <span>Provider</span>
                <select value={draft.visitorSecurity.geoipProvider} onChange={(event) => updateVisitorSecuritySetting({ geoipProvider: event.target.value })}>
                  <option value="ipapi">ipapi.co cached lookup</option>
                  <option value="local">Local GeoIP database</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              {draft.visitorSecurity.geoipProvider === "ipapi" ? (
                <p className="legend">Provider mode avoids large local imports. Locations are approximate, cached for {draft.visitorSecurity.geoipCacheDays} days, and fall back to Unknown if the provider is unavailable.</p>
              ) : null}
              {draft.visitorSecurity.geoipProvider === "local" ? (
                <>
                  <p className="legend">Local database mode uses a MaxMind GeoLite2 City CSV ZIP. This avoids third-party lookups but can be heavy on small VPS plans.</p>
                  <label className="field">
                    <span>GeoIP source URL</span>
                    <input value={draft.visitorSecurity.geoipSourceUrl} onChange={(event) => updateVisitorSecuritySetting({ geoipSourceUrl: event.target.value })} placeholder="https://download.maxmind.com/geoip/databases/GeoLite2-City-CSV/download?suffix=zip" />
                  </label>
                  <div className="form-grid two">
                    <label className="field">
                      <span>MaxMind account ID</span>
                      <input value={draft.visitorSecurity.geoipAccountId} onChange={(event) => updateVisitorSecuritySetting({ geoipAccountId: event.target.value })} placeholder="Account ID" />
                    </label>
                    <label className="field">
                      <span>MaxMind license key</span>
                      <input type="password" value={draft.visitorSecurity.geoipLicenseKey ?? ""} onChange={(event) => updateVisitorSecuritySetting({ geoipLicenseKey: event.target.value, geoipClearLicenseKey: false })} placeholder={draft.visitorSecurity.geoipLicenseKeyConfigured ? "Configured - enter a new key to replace" : "License key"} />
                    </label>
                  </div>
                  <div className="toolbar-row">
                    <span className={draft.visitorSecurity.geoipLicenseKeyConfigured ? "status-pill ok" : "status-pill"}>{draft.visitorSecurity.geoipLicenseKeyConfigured ? "License key configured" : "No license key saved"}</span>
                    {draft.visitorSecurity.geoipLicenseKeyConfigured ? <button className="toolbar-button" type="button" onClick={() => updateVisitorSecuritySetting({ geoipLicenseKey: "", geoipLicenseKeyConfigured: false, geoipClearLicenseKey: true })}>Clear saved key</button> : null}
                  </div>
                </>
              ) : null}
              {draft.visitorSecurity.geoipProvider === "disabled" ? <p className="legend">Location statistics will show Unknown while request logging and abuse-prevention records continue.</p> : null}
            </div>
            <button className="toolbar-button primary" onClick={saveSettings}><Save size={15} /> Save Configuration</button>
          </section>
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><RefreshCw size={17} /> Domain Collectors</h3>
                <p className="legend">The server collects background history and notification data. Main pages refresh live BitJita data through the local proxy while users view them.</p>
              </div>
            </div>
            <div className="collector-settings-list">
              {Object.entries(draft.collectorSettings).map(([key, collector]) => (
                <div className="collector-setting-row" key={key}>
                  <label className="toggle-line collector-toggle">
                    <input type="checkbox" checked={collector.enabled !== false} onChange={(event) => updateCollectorSetting(key, { enabled: event.target.checked })} />
                    <span><strong>{collector.label ?? key}</strong><small>{collector.enabled === false ? "Collector disabled" : "Collector enabled"}</small></span>
                  </label>
                  <label className="field compact-field collector-interval-field">
                    <span>Interval</span>
                    <div className="unit-input"><input type="number" min={15} max={3600} value={collector.intervalSeconds} onChange={(event) => updateCollectorSetting(key, { intervalSeconds: Number(event.target.value) })} /><em>sec</em></div>
                  </label>
                </div>
              ))}
            </div>
          </section>
          <div className="admin-section">
            <section className="form-card member-tracking-card">
              <div className="split-header">
                <div>
                  <h3><Users size={17} /> Member Tracking</h3>
                  <p className="legend">Members are visible by default. Disable tracking for players who joined the claim but should be hidden from member-derived pages and filters.</p>
                </div>
                <span className="role-option-status">{formatNumber(draft.excludedMemberIds.length)} hidden</span>
              </div>
              <div className="member-tracking-list">
                {adminMemberRows.length ? adminMemberRows.map((member) => {
                  const id = memberTrackingId(member);
                  const tracked = id ? !draft.excludedMemberIds.includes(id) : true;
                  return (
                    <label className={`toggle-line member-tracking-row ${tracked ? "" : "is-hidden"}`} key={id || memberDisplayName(member)}>
                      <span>
                        <strong>{memberDisplayName(member)}</strong>
                        <small>{id || "No stable player ID returned by BitJita"}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={tracked}
                        disabled={!id}
                        onChange={(event) => setMemberTracking(member, event.target.checked)}
                      />
                    </label>
                  );
                }) : <p className="legend">Member data has not loaded yet. Refresh BitJita data and return here to configure per-player tracking.</p>}
              </div>
            </section>
            <section className="form-card">
              <h3><Upload size={17} /> Branding</h3>
              {(["logo", "favicon"] as const).map((type) => {
                const asset = draft.branding?.[type];
                return <div className="brand-upload" key={type}><div>{asset ? <img src={`${asset.url}?v=${encodeURIComponent(asset.updatedAt)}`} alt="" /> : <Shield size={25} />}<strong>{type === "logo" ? "App Logo" : "Browser Favicon"}</strong></div><label className="toolbar-button"><Upload size={14} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadBrand(type, event.target.files?.[0])} /></label>{asset ? <button className="toolbar-button" onClick={() => removeBrand(type)}><X size={14} /> Remove</button> : null}</div>;
              })}
              <p className="legend">PNG, JPG or WebP up to 1 MB. The logo is shown in the app chrome and the favicon is used by the browser tab.</p>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "discord" ? (
        <div className="admin-section bot-dashboard">
          {botOnly ? (
            <>
              <div className="bot-overview">
                <div><MessageCircle size={19} /><strong>{draft.discord.enabled ? "Bot Enabled" : "Bot Disabled"}</strong><span>Slash commands and notification delivery</span></div>
                <div><Bell size={19} /><strong>{Object.values(draft.discord.notify).filter(Boolean).length} Rules On</strong><span>Notification categories currently enabled</span></div>
                <div><Command size={19} /><strong>{draft.discord.botTokenConfigured ? "Token Set" : "Token Missing"}</strong><span>{draft.discord.botTokenConfigured ? `Configured via ${draft.discord.botTokenSource ?? "server"}` : "Add a bot token to send messages"}</span></div>
                <div><Activity size={19} /><strong>{discordDelivery.status ?? "No delivery"}</strong><span>{discordDeliveryLabel}</span></div>
              </div>
              <section className="bot-workflow-card" aria-label="Bot setup workflow">
                {botWorkflowItems.map((item) => (
                  <button key={item.label} type="button" onClick={() => item.label === "Connect bot" ? setBotSection("setup") : item.label === "Sync Discord server" ? setBotSection("setup") : item.label === "Choose notification channels" ? setBotSection("notifications") : setBotSection("tests")}>
                    <span className={item.done ? "done" : ""}>{item.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </button>
                ))}
              </section>
            </>
          ) : null}
          <div className={botOnly ? "bot-layout" : ""}>
          <React.Suspense fallback={<div className="loading">Loading Discord controls...</div>}>
          {botOnly ? (
            <BotSectionNav active={botSection} onSelect={setBotSection} />
          ) : null}
        <div className={`admin-grid discord-admin${botOnly ? ` bot-admin-section bot-section-${botSection}` : ""}`}>
          {(!botOnly || botSection === "setup") ? (
            <DiscordSetupSection
              discord={draft.discord}
              discordDiscovery={discordDiscovery}
              discoveredChannelCount={discoveredChannels.length}
              discoveredRoleCount={discoveredRoles.length}
              formatNumber={formatNumber}
              onSync={() => run(refreshDiscordDiscovery, "Discord server data synced.")}
              status={status}
              updateDiscord={updateDiscord}
              updateDiscordPresence={updateDiscordPresence}
            />
          ) : null}
          {(!botOnly || botSection === "channels") ? (
            <DiscordChannelsSection
              botOnly={botOnly}
              channelFields={DISCORD_CHANNEL_FIELDS}
              channelIdSelect={channelIdSelect}
              discordChannelLabel={discordChannelLabel}
              discordChannels={draft.discord.channels}
              discoveredChannelCount={discoveredChannels.length}
              updateDiscordChannel={updateDiscordChannel}
            />
          ) : null}
          {(!botOnly || botSection === "roleManager") ? (
            <DiscordRoleManagerSection
              discoveredRoles={discoveredRoles}
              formatNumber={formatNumber}
              memberCountWarning={memberCountWarning}
              onCreateRole={() => run(createDiscordRoleFromDashboard, "Discord role created.")}
              onSyncRoles={() => run(refreshDiscordDiscovery, "Discord roles synced.")}
              roleDraft={roleDraft}
              roleStatusText={roleStatusText}
              setRoleDraft={setRoleDraft}
            />
          ) : null}
          {(!botOnly || botSection === "roles") ? (
            <DiscordCraftWatchRolesSection
              botOnly={botOnly}
              craftRoleKeys={Object.keys(DEFAULT_CRAFT_ROLES)}
              craftRoles={draft.discord.craftRoles}
              discoveredRoles={discoveredRoles}
              memberCountWarning={memberCountWarning}
              roleIdSelect={roleIdSelect}
              roleStatusText={roleStatusText}
              updateDiscordRole={updateDiscordRole}
            />
          ) : null}
          {(!botOnly || botSection === "colours") ? (
            <DiscordColourRolesSection
              addDiscordColourRole={addDiscordColourRole}
              channelIdSelect={channelIdSelect}
              colourRoles={draft.discord.colourRoles}
              colourRolesChannelId={draft.discord.colourRolesChannelId}
              discoveredRoles={discoveredRoles}
              discordColorToHex={discordColorToHex}
              hexToDiscordColor={hexToDiscordColor}
              memberCountWarning={memberCountWarning}
              onPostSelector={() => run(async () => { await api("/admin/discord/colour-roles/post", { method: "POST", body: "{}" }); }, "Colour role selector posted.")}
              onSyncRoles={() => run(syncDiscordColourRoles, "Colour roles created and synced.")}
              removeDiscordColourRole={removeDiscordColourRole}
              roleStatusText={roleStatusText}
              updateDiscord={updateDiscord}
              updateDiscordColourRole={updateDiscordColourRole}
            />
          ) : null}
          {(!botOnly || botSection === "community") ? <DiscordRolePanelsSection
            expandedRoleOption={expandedRoleOption}
            roleById={roleById}
            roleIdSelect={roleIdSelect}
            rolePanels={draft.discord.rolePanels}
            channelIdSelect={channelIdSelect}
            onAddOption={addDiscordRolePanelOption}
            onPostPanel={(panelKey, panelLabel) => run(async () => postRolePanel(panelKey), `${panelLabel} posted or updated.`)}
            onPostWelcome={() => run(postWelcomeFlow, "Welcome message posted or updated.")}
            onRemoveOption={removeDiscordRolePanelOption}
            onSetExpandedRoleOption={setExpandedRoleOption}
            onUpdateOption={updateDiscordRolePanelOption}
            onUpdatePanel={updateDiscordRolePanel}
            onUpdateWelcomeFlow={updateWelcomeFlow}
            roleStatusText={roleStatusText}
            welcomeFlow={draft.discord.welcomeFlow}
          /> : null}
          {(!botOnly || botSection === "moderation") ? (
            <DiscordModerationSection
              channelIdSelect={channelIdSelect}
              confirmModeration={confirmModeration}
              discordToolResult={discordToolResult}
              discoveredMemberCount={discoveredMembers.length}
              memberIdSelect={memberIdSelect}
              moderationDraft={moderationDraft}
              onBan={() => run(async () => runModerationAction("ban"), "Ban sent to Discord.")}
              onKick={() => run(async () => runModerationAction("kick"), "Kick sent to Discord.")}
              onLoadBans={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/moderation/bans"), __type: "moderationBans" }), "Ban list loaded.")}
              onPurge={() => run(async () => runModerationAction("purge"), "Channel cleanup sent to Discord.")}
              onRemoveTimeout={() => run(async () => { setModerationDraft((current) => ({ ...current, timeoutMinutes: "0" })); const result = await api("/admin/discord/moderation/timeout", { method: "POST", body: JSON.stringify({ userId: moderationDraft.userId, minutes: 0, reason: moderationDraft.reason }) }); setDiscordToolResult({ ...result, __type: "moderationAction" }); }, "Timeout removed.")}
              onSync={() => run(refreshDiscordDiscovery, "Discord members, channels and roles synced.")}
              onTempBan={() => run(async () => runBotEndpoint("/admin/discord/moderation/temp-ban", { userId: moderationDraft.userId, hours: Number(moderationDraft.timeoutMinutes), reason: moderationDraft.reason, deleteMessageSeconds: Number(moderationDraft.deleteMessageSeconds) }, "moderationAction"), "Temporary ban recorded.")}
              onTimeout={() => run(async () => runModerationAction("timeout"), "Timeout action sent to Discord.")}
              onUnban={() => run(async () => runModerationAction("unban"), "Unban sent to Discord.")}
              renderDiscordToolResult={renderDiscordToolResult}
              setModerationDraft={setModerationDraft}
            />
          ) : null}
          {(!botOnly || botSection === "safety") ? (
            <DiscordSafetySection
              channelIdSelect={channelIdSelect}
              confirmModeration={confirmModeration}
              discordToolResult={discordToolResult}
              onApplySlowmode={() => run(async () => runBotEndpoint("/admin/discord/moderation/slowmode", { channelId: safetyDraft.lockdownChannelId, seconds: Number(safetyDraft.slowmodeSeconds) }, "botAction"), "Slowmode updated.")}
              onCreateAutomodRule={() => run(async () => runBotEndpoint("/admin/discord/moderation/automod", { name: safetyDraft.ruleName, blockedWords: safetyDraft.blockedWords }, "botAction"), "Auto-moderation rule created.")}
              onLoadAutomodRules={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/moderation/automod"), __type: "botReport" }), "Auto-moderation rules loaded.")}
              onLockChannel={() => run(async () => runBotEndpoint("/admin/discord/moderation/lockdown", { channelId: safetyDraft.lockdownChannelId, locked: true }, "botAction"), "Channel locked.")}
              onNicknameReport={() => run(async () => runBotEndpoint("/admin/discord/moderation/nickname-report", { pattern: safetyDraft.nicknamePattern }, "botReport"), "Nickname report loaded.")}
              onSync={() => run(refreshDiscordDiscovery, "Discord server data synced.")}
              onUnlockChannel={() => run(async () => runBotEndpoint("/admin/discord/moderation/lockdown", { channelId: safetyDraft.lockdownChannelId, locked: false }, "botAction"), "Channel unlocked.")}
              renderDiscordToolResult={renderDiscordToolResult}
              safetyDraft={safetyDraft}
              setSafetyDraft={setSafetyDraft}
            />
          ) : null}
          {(!botOnly || botSection === "records") ? (
            <DiscordMemberRecordsSection
              confirmModeration={confirmModeration}
              discordToolResult={discordToolResult}
              memberIdSelect={memberIdSelect}
              onAddNote={() => run(async () => runBotEndpoint("/admin/discord/moderation/notes", recordsDraft, "botAction"), "Mod note saved.")}
              onAddWarning={() => run(async () => runBotEndpoint("/admin/discord/moderation/warnings", recordsDraft, "botAction"), "Warning recorded.")}
              onClearWarnings={() => run(async () => runBotEndpoint("/admin/discord/moderation/warnings/clear", recordsDraft, "botAction"), "Warnings cleared.")}
              onLoadCaseLog={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/moderation/cases"), __type: "botReport" }), "Case log loaded.")}
              onLoadNotes={() => run(async () => runBotEndpoint("/admin/discord/moderation/notes/list", recordsDraft, "botReport"), "Mod notes loaded.")}
              onLoadProfile={() => run(async () => runBotEndpoint("/admin/discord/moderation/profile", recordsDraft, "botReport"), "Member profile loaded.")}
              onLoadWarnings={() => run(async () => runBotEndpoint("/admin/discord/moderation/warnings/list", recordsDraft, "botReport"), "Warnings loaded.")}
              onSync={() => run(refreshDiscordDiscovery, "Discord members synced.")}
              recordsDraft={recordsDraft}
              renderDiscordToolResult={renderDiscordToolResult}
              setRecordsDraft={setRecordsDraft}
            />
          ) : null}
          {(!botOnly || botSection === "content") ? <section className="form-card discord-channel-card bot-tools-card">
            <div className="split-header"><div><h3><MessageCircle size={17} /> Posts & Events</h3><p className="legend">Create polls, RSVP posts and clean embeds for Discord-only community management.</p></div></div>
            <div className="discord-tool-forms">
              <div className="discord-tool-form-card"><h4><CircleHelp size={15} /> Poll</h4><label className="field"><span>Channel</span>{channelIdSelect(pollDraft.channelId, (value) => setPollDraft((current) => ({ ...current, channelId: value })))}</label><label className="field"><span>Title</span><input value={pollDraft.title} onChange={(event) => setPollDraft((current) => ({ ...current, title: event.target.value }))} /></label><label className="field"><span>Options</span><textarea value={pollDraft.options} onChange={(event) => setPollDraft((current) => ({ ...current, options: event.target.value }))} placeholder="One option per line" /></label><button className="toolbar-button primary bot-post-button" onClick={() => run(async () => runBotEndpoint("/admin/discord/poll", pollDraft, "botAction"), "Poll posted.")}><MessageCircle size={14} /> Post Poll</button></div>
              <div className="discord-tool-form-card"><h4><Bell size={15} /> Event RSVP</h4><label className="field"><span>Channel</span>{channelIdSelect(rsvpDraft.channelId, (value) => setRsvpDraft((current) => ({ ...current, channelId: value })))}</label><label className="field"><span>Title</span><input value={rsvpDraft.title} onChange={(event) => setRsvpDraft((current) => ({ ...current, title: event.target.value }))} /></label><label className="field"><span>Description</span><textarea value={rsvpDraft.description} onChange={(event) => setRsvpDraft((current) => ({ ...current, description: event.target.value }))} /></label><button className="toolbar-button primary bot-post-button" onClick={() => run(async () => runBotEndpoint("/admin/discord/rsvp", rsvpDraft, "botAction"), "RSVP posted.")}><Bell size={14} /> Post RSVP</button></div>
              <div className="discord-tool-form-card"><h4><Star size={15} /> Clean Embed Builder</h4><label className="field"><span>Channel</span>{channelIdSelect(embedDraft.channelId, (value) => setEmbedDraft((current) => ({ ...current, channelId: value })))}</label><label className="field"><span>Title</span><input value={embedDraft.title} onChange={(event) => setEmbedDraft((current) => ({ ...current, title: event.target.value }))} /></label><label className="field"><span>Message</span><textarea value={embedDraft.description} onChange={(event) => setEmbedDraft((current) => ({ ...current, description: event.target.value }))} /></label><label className="colour-picker-field"><input type="color" value={embedDraft.color} onChange={(event) => setEmbedDraft((current) => ({ ...current, color: event.target.value }))} /><code>{embedDraft.color}</code></label><button className="toolbar-button primary bot-post-button" onClick={() => run(async () => runBotEndpoint("/admin/discord/embed", embedDraft, "botAction"), "Embed posted.")}><Star size={14} /> Post Embed</button></div>
            </div>
            {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
          </section> : null}
          {(!botOnly || botSection === "commands") ? <section className="form-card discord-channel-card bot-tools-card">
            <div className="split-header"><div><h3><Command size={17} /> Custom Commands</h3><p className="legend">Create Discord slash commands that respond with static server information. Select an existing command to edit it, then re-register slash commands after saving.</p></div><button className={busyButtonClass("commands-refresh")} disabled={isBusyAction("commands-refresh")} onClick={() => run(refreshCustomCommands, "Custom commands loaded.", "commands-refresh")}><RefreshCw size={15} /> {isBusyAction("commands-refresh") ? "Refreshing..." : "Refresh"}</button></div>
            <div className="discord-tool-forms">
              <div className="discord-tool-form-card">
                <h4><Save size={15} /> Command Editor</h4>
                <label className="field"><span>Command name</span><input value={commandDraft.name} onChange={(event) => setCommandDraft((current) => ({ ...current, name: event.target.value }))} placeholder="rules" /></label>
                <label className="field"><span>Description</span><input value={commandDraft.description} onChange={(event) => setCommandDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="field"><span>Response</span><textarea value={commandDraft.response} onChange={(event) => setCommandDraft((current) => ({ ...current, response: event.target.value }))} /></label>
                <div className="toolbar">
                  <button className="toolbar-button primary" disabled={!commandDraft.name.trim() || !commandDraft.response.trim()} onClick={() => run(async () => { await api("/admin/discord/custom-commands", { method: "PUT", body: JSON.stringify(commandDraft) }); await refreshCustomCommands(); }, "Custom command saved. Re-register slash commands to publish it.")}><Save size={14} /> Save Command</button>
                  <button className="toolbar-button" onClick={() => setCommandDraft({ name: "", description: "", response: "" })}><Plus size={14} /> New</button>
                  <button className="toolbar-button danger" disabled={!commandDraft.name.trim()} onClick={() => confirmModeration("Delete this custom command?") && run(async () => { await api(`/admin/discord/custom-commands?name=${encodeURIComponent(commandDraft.name)}`, { method: "DELETE" }); setCommandDraft({ name: "", description: "", response: "" }); await refreshCustomCommands(); }, "Custom command deleted.")}><X size={14} /> Delete</button>
                  <button className="toolbar-button bot-post-button" onClick={() => run(async () => { const commands = await api("/admin/discord/register-commands", { method: "POST", body: "{}" }); setDiscordToolResult({ ...commands, __type: "botReport" }); }, "Slash commands registered.")}><Command size={14} /> Register Slash Commands</button>
                </div>
              </div>
              <div className="discord-tool-form-card">
                <h4><Command size={15} /> Existing Commands</h4>
                <div className="discord-report-list command-list">{customCommands.length ? customCommands.map((command) => (
                  <button type="button" className={`discord-report-item command-list-item ${commandDraft.name === command.name ? "active" : ""}`} key={command.name} onClick={() => setCommandDraft({ name: String(command.name ?? ""), description: String(command.description ?? ""), response: String(command.response ?? "") })}>
                    <div className="discord-report-dot ok" />
                    <div><strong>/{command.name}</strong><span>{command.description || command.response}</span></div>
                    <span className="role-option-status">Edit</span>
                  </button>
                )) : <p className="legend">No custom commands yet.</p>}</div>
              </div>
            </div>
            {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
          </section> : null}
          {(!botOnly || botSection === "tools") ? <section className="form-card discord-channel-card bot-tools-card">
            <div className="split-header">
              <div>
                <h3><Wrench size={17} /> Server Management Tools</h3>
                <p className="legend">Run Discord health reports, post managed announcements, maintain pinned information and schedule events from one place.</p>
              </div>
            </div>
            <div className="discord-tool-actions">
              <button className="discord-tool-action" onClick={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/audit-log"), __type: "auditLog" }), "Audit log loaded.")}>
                <span className="discord-tool-action-icon"><FileText size={18} /></span>
                <span><strong>Audit Log</strong><small>Review recent bot and Discord management actions in a readable timeline.</small><em>Run report</em></span>
              </button>
              <button className="discord-tool-action" onClick={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/role-cleanup"), __type: "roleCleanup" }), "Role cleanup report loaded.")}>
                <span className="discord-tool-action-icon"><Users size={18} /></span>
                <span><strong>Role Cleanup</strong><small>Find unused roles, duplicate colours and role manageability problems.</small><em>Run report</em></span>
              </button>
              <button className="discord-tool-action" onClick={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/channel-permissions"), __type: "channelPermissions" }), "Channel permission report loaded.")}>
                <span className="discord-tool-action-icon"><Lock size={18} /></span>
                <span><strong>Channel Checks</strong><small>Check whether key roles can read and post in important channels.</small><em>Run report</em></span>
              </button>
              <button className="discord-tool-action" onClick={() => run(async () => setDiscordToolResult({ ...await api("/admin/discord/inactive-report", { method: "POST", body: JSON.stringify({ days: 30 }) }), __type: "inactiveReport" }), "Inactive member report loaded.")}>
                <span className="discord-tool-action-icon"><Activity size={18} /></span>
                <span><strong>Inactive Members</strong><small>List synced Discord members with no recent observed activity.</small><em>Run 30 day report</em></span>
              </button>
            </div>
            <div className="discord-tool-section-header">
              <div>
                <h4>Post & Maintain Content</h4>
                <p className="legend">Use these for clean server messages without manually formatting Discord embeds.</p>
              </div>
            </div>
            <div className="discord-tool-forms">
              <div className="discord-tool-form-card">
                <h4><MessageCircle size={15} /> Announcement Builder</h4>
                <p className="legend">Post a formatted announcement to any configured channel.</p>
                <label className="field"><span>Channel</span>{channelIdSelect(announcementDraft.channelId, (value) => setAnnouncementDraft((current) => ({ ...current, channelId: value })))}</label>
                <label className="field"><span>Title</span><input value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="field"><span>Message</span><textarea value={announcementDraft.message} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, message: event.target.value }))} /></label>
                <button className="toolbar-button primary bot-post-button" onClick={() => run(async () => { await api("/admin/discord/announcement", { method: "POST", body: JSON.stringify(announcementDraft) }); }, "Announcement posted.")}><MessageCircle size={14} /> Post Announcement</button>
              </div>
              <div className="discord-tool-form-card">
                <h4><Pin size={15} /> Pinned Info Updater</h4>
                <p className="legend">Create or update one maintained information post for a channel.</p>
                <label className="field"><span>Channel</span>{channelIdSelect(pinnedDraft.channelId, (value) => setPinnedDraft((current) => ({ ...current, channelId: value })))}</label>
                <label className="field"><span>Existing message ID</span><input value={pinnedDraft.messageId} onChange={(event) => setPinnedDraft((current) => ({ ...current, messageId: event.target.value }))} placeholder="Blank posts a new pinned message" /></label>
                <label className="field"><span>Title</span><input value={pinnedDraft.title} onChange={(event) => setPinnedDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="field"><span>Message</span><textarea value={pinnedDraft.message} onChange={(event) => setPinnedDraft((current) => ({ ...current, message: event.target.value }))} /></label>
                <button className="toolbar-button bot-post-button" onClick={() => run(async () => { const result = await api("/admin/discord/pinned-info", { method: "POST", body: JSON.stringify(pinnedDraft) }); setPinnedDraft((current) => ({ ...current, messageId: String(result.response?.id ?? current.messageId) })); }, "Pinned info posted or updated.")}><Pin size={14} /> Post/Update Pin</button>
              </div>
              <div className="discord-tool-form-card">
                <h4><Bell size={15} /> Event Scheduler</h4>
                <p className="legend">Create a Discord event for planned gathering or crafting sessions.</p>
                <label className="field"><span>Name</span><input value={eventDraft.name} onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="field"><span>Location</span><input value={eventDraft.location} onChange={(event) => setEventDraft((current) => ({ ...current, location: event.target.value }))} /></label>
                <label className="field"><span>Start</span><input type="datetime-local" value={eventDraft.startTime} onChange={(event) => setEventDraft((current) => ({ ...current, startTime: event.target.value }))} /></label>
                <label className="field"><span>End</span><input type="datetime-local" value={eventDraft.endTime} onChange={(event) => setEventDraft((current) => ({ ...current, endTime: event.target.value }))} /></label>
                <label className="field"><span>Description</span><textarea value={eventDraft.description} onChange={(event) => setEventDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <button className="toolbar-button" onClick={() => run(async () => { await api("/admin/discord/scheduled-event", { method: "POST", body: JSON.stringify(eventDraft) }); }, "Discord event created.")}><Bell size={14} /> Create Event</button>
              </div>
            </div>
            {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
          </section> : null}
          {(!botOnly || botSection === "notifications") ? (
            <DiscordNotificationsSection
              channelSelect={channelSelect}
              discord={draft.discord}
              discordDeliveryLabel={discordDeliveryLabel}
              updateDiscord={updateDiscord}
              updateDiscordNotify={updateDiscordNotify}
            />
          ) : null}
          {(!botOnly || botSection === "tests") ? (
            <DiscordTestsPanel
              botOnly={botOnly}
              discordTestButtons={discordTestButtons}
              onRegisterCommands={() =>
                run(async () => {
                  const result = await api("/admin/discord/register-commands", { method: "POST", body: "{}" });
                  setMessageKind("success");
                  setMessage(`Registered ${formatNumber(result.commands?.length)} Discord slash commands.`);
                })
              }
              onSendTest={(kind, label) =>
                run(async () => {
                  await api("/admin/discord/test", { method: "POST", body: JSON.stringify({ kind }) });
                }, `${label} Discord test sent.`)
              }
            />
          ) : null}
          {(!botOnly || botSection === "diagnostics") ? <DiscordDiagnosticsPanel filter={discordDiagnosticsFilter} log={discordLog} onFilterChange={setDiscordDiagnosticsFilter} onRefresh={() => run(refreshStatus)} /> : null}
        </div>
        </React.Suspense>
        </div>
        </div>
      ) : null}

      {tab === "database" ? (
        <section className="form-card database-browser">
          <div className="database-browser-header">
            <div>
              <h3><Database size={17} /> Database Browser</h3>
              <p className="legend">Inspect current SQLite tables, search records, and export filtered data for debugging.</p>
            </div>
            <label className="field database-table-select">
              <span>Table</span>
              <select className="select-control" value={selectedTable} onChange={(event) => { setSelectedTable(event.target.value); setTableOffset(0); }}>{tables.map((table) => <option key={table.name} value={table.name}>{table.name} ({formatNumber(table.rows)})</option>)}</select>
            </label>
          </div>
          <div className="database-inspector-stats">
            <Info label="Selected table" value={selectedTable || "-"} />
            <Info label="Total rows" value={formatNumber(selectedTableInfo?.rows ?? activeTableResult.total)} />
            <Info label="Columns" value={formatNumber(tableColumns.length)} />
            <Info label="Showing" value={`${formatNumber(tableRangeStart)}-${formatNumber(tableRangeEnd)}`} />
          </div>
          <div className="database-toolbar">
            <SearchBox value={tableSearch} onChange={(value) => { setTableSearch(value); setTableOffset(0); }} placeholder="Search across visible table records" />
            <div className="database-export-actions">
              <a className="toolbar-button" href={`${LOCAL_API}/admin/export?name=${encodeURIComponent(selectedTable)}&format=csv&search=${encodeURIComponent(tableSearch)}`}><Download size={14} /> Export CSV</a>
              <a className="toolbar-button" href={`${LOCAL_API}/admin/export?name=${encodeURIComponent(selectedTable)}&format=json&search=${encodeURIComponent(tableSearch)}`}><Download size={14} /> Export JSON</a>
            </div>
          </div>
          {tableColumns.length ? <DataTable rows={tableRows} columns={tableColumns.map((key: string) => [key, (row: AnyRecord) => { const value = String(row[key] ?? "-"); const display = value.length > 120 ? `${value.slice(0, 120)}...` : value; return <code className={value.startsWith("{") || value.startsWith("[") ? "database-cell-code" : ""}>{display}</code>; }])} /> : <p className="legend">No records returned.</p>}
          <div className="pager"><span>{formatNumber(activeTableResult.total)} matching records</span><button className="toolbar-button" disabled={!tableOffset} onClick={() => setTableOffset(Math.max(0, tableOffset - 50))}>Previous</button><button className="toolbar-button" disabled={tableOffset + 50 >= activeTableResult.total} onClick={() => setTableOffset(tableOffset + 50)}>Next</button></div>
        </section>
      ) : null}

      {tab === "users" ? (
        <div className="admin-grid">
          <section className="form-card">
            <h3><UserPlus size={17} /> Add Discord Administrator</h3>
            {!canManageAdmins ? <p className="legend">Your administrator role can view this page but cannot create or change administrator accounts.</p> : null}
            <p className="legend">Add the user's Discord ID and choose the app admin role they should receive when signing in with Discord.</p>
            <label className="field"><span>Discord user ID</span><input value={newUser.discordId} onChange={(event) => setNewUser({ ...newUser, discordId: event.target.value })} placeholder="145544610234630144" /></label>
            <label className="field"><span>Display name</span><input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} placeholder="red463" /></label>
            <label className="field"><span>Role</span><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>{Object.entries(adminRoles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
            <button className="toolbar-button primary" disabled={!canManageAdmins} onClick={() => run(async () => { await api("/admin/users", { method: "POST", body: JSON.stringify(newUser) }); setNewUser({ discordId: "", displayName: "", role: "admin" }); await refreshUsers(); }, "Discord administrator added.")}><UserPlus size={15} /> Add Administrator</button>
          </section>
          <section className="form-card">
            <h3><Users size={17} /> Administrators</h3>
            <div className="admin-users">{users.map((entry) => <div key={entry.id}><strong>{entry.username}</strong><span>{entry.active ? "Active" : "Disabled"} | Discord ID {entry.discord_id || "not linked"} | {entry.roleLabel ?? adminRoles[entry.role] ?? entry.role ?? "Viewer"} | {formatNumber(entry.sessions)} sessions | Last login {dateLabel(entry.last_login_at)}</span><label className="field compact-field"><span>Role</span><select value={entry.role ?? "viewer"} disabled={!canManageAdmins || entry.id === auth.user?.id} onChange={(event) => run(async () => { const result = await api("/admin/user/role", { method: "PUT", body: JSON.stringify({ userId: entry.id, role: event.target.value }) }); if (result.signedOut) setAdminAuthState({ authenticated: false, setupRequired: false }); else await refreshUsers(); }, "Administrator role updated and sessions cleared.")}>{Object.entries(adminRoles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label><div className="toolbar"><button className="toolbar-button" disabled={!canManageAdmins} onClick={() => run(async () => { await api("/admin/sessions/clear", { method: "POST", body: JSON.stringify({ userId: entry.id }) }); await refreshUsers(); }, "Sessions cleared.")}>Clear Sessions</button><button className="toolbar-button" disabled={!canManageAdmins || entry.id === auth.user?.id} onClick={() => run(async () => { await api("/admin/user/status", { method: "PUT", body: JSON.stringify({ userId: entry.id, active: !entry.active }) }); await refreshUsers(); }, "Account status updated.")}>{entry.active ? "Disable" : "Enable"}</button></div></div>)}</div>
          </section>
        </div>
      ) : null}

      {tab === "accounts" ? (
        <section className="form-card linked-accounts-card">
          <div className="split-header">
            <h3><MessageCircle size={17} /> Discord Linked Accounts</h3>
            <button className={busyButtonClass("linked-accounts-refresh")} disabled={isBusyAction("linked-accounts-refresh")} onClick={() => run(refreshLinkedAccounts, undefined, "linked-accounts-refresh")}><RefreshCw size={14} /> {isBusyAction("linked-accounts-refresh") ? "Refreshing..." : "Refresh"}</button>
          </div>
          <p className="legend">Users can sign in with Discord and request a BitCraft character link. Approval is manual because Discord identity does not prove character ownership by itself.</p>
          <div className="linked-account-list">
            {linkedAccounts.length ? linkedAccounts.map((account) => (
              <div className="linked-account-row" key={account.id}>
                <div className="linked-account-user">
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{(account.globalName || account.username || "?").slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{account.globalName || account.username || "Discord user"}</strong>
                    <small>{account.username ? `@${account.username}` : account.discordId} | Last login {dateLabel(account.lastLoginAt)}</small>
                  </div>
                </div>
                <div>
                  <strong>{account.characterName || "No character selected"}</strong>
                  <small>{account.characterPlayerId || "No BitCraft player ID"}</small>
                </div>
                <em className={`link-status ${account.characterStatus}`}>{account.characterStatus || "unlinked"}</em>
                <div className="toolbar">
                  {(["approved", "pending", "rejected"] as const).map((status) => (
                    <button
                      className={`toolbar-button ${account.characterStatus === status ? "primary" : ""}`}
                      disabled={!account.characterPlayerId}
                      key={status}
                      onClick={() => run(async () => {
                        const result = await api("/admin/user-accounts/approval", { method: "PUT", body: JSON.stringify({ userId: account.id, status }) });
                        setLinkedAccounts(result.accounts ?? []);
                      }, `Account marked ${status}.`)}
                    >
                      {status === "approved" ? <CheckCircle2 size={14} /> : status === "pending" ? <Clock size={14} /> : <Ban size={14} />}
                      {status[0].toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )) : <p className="legend">No Discord users have signed in yet.</p>}
          </div>
        </section>
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
            <button className="toolbar-button" onClick={() => run(async () => { const result = await api("/admin/maintenance/prune", { method: "POST", body: "{}" }); await refreshStatus(); setMessageKind("success"); setMessage(`Removed ${formatNumber(result.removed)} expired snapshots.`); })}><RefreshCw size={15} /> Remove Expired Snapshots</button>
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
  const [active, setActive] = usePersistedState<ActivePanel>("navigation.page", "dashboard");
  const mainRef = React.useRef<HTMLElement | null>(null);
  const defaultPageAppliedRef = React.useRef(false);
  const savedPageRef = React.useRef(hasPersistedState("navigation.page") || Boolean(urlPanel()));
  const [appSettings, setAppSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [userAuth, setUserAuth] = React.useState<UserAuthState>({ user: null, discordLoginEnabled: false });
  const [adminAuth, setAdminAuth] = React.useState<AnyRecord>({ authenticated: false });
  const [claimId, setClaimId] = React.useState(DEFAULT_CLAIM_ID);
  const [syncUrl, setSyncUrl] = React.useState(DEFAULT_SYNC_URL);
  const [browserTheme, setBrowserTheme] = usePersistedState<ThemeSettings>("theme.local", DEFAULT_THEME);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [mapFocus, setMapFocus] = usePersistedState<MapFocus>("map.focus", urlMapFocus());
  const [selectedMemberId, setSelectedMemberId] = usePersistedState("production.member", "All");
  const [toasts, setToasts] = React.useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = usePersistedState<ToastNotice[]>("notifications.log", []);
  const [userToastSettings, setUserToastSettings] = usePersistedState<UserToastSettings>("user.notifications", DEFAULT_USER_TOAST_SETTINGS);
  const [density, setDensity] = usePersistedState<"comfortable" | "compact">("layout.density", "comfortable");
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("layout.sidebarCollapsed", false);
  const [sidebarGroups, setSidebarGroups] = usePersistedState<Record<string, boolean>>("layout.sidebarGroups", DEFAULT_SIDEBAR_GROUPS);
  const [discordPromptDismissed, setDiscordPromptDismissed] = usePersistedState("auth.discordPromptDismissed", false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [consent, setConsent] = React.useState<AnalyticsConsent>(() => readAnalyticsConsent());
  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const toastTimersRef = React.useRef<Map<string, number>>(new Map());
  const notificationSourceKeysRef = React.useRef<Set<string>>(new Set(notificationLog.map((notice) => notice.sourceKey).filter(Boolean) as string[]));
  const activityNoticeIdsRef = React.useRef<Set<string> | null>(null);
  const activityNoticeClaimRef = React.useRef(claimId);
  const craftQueueRef = React.useRef<{ claimId: string; jobs: Map<string, AnyRecord> } | null>(null);
  const state = useBitjitaData(refreshToken, claimId, active);
  const excludedMemberIds = appSettings.excludedMemberIds;
  const data = React.useMemo(() => {
    const normalized = normalizeData(state.data);
    return applyMemberTrackingFilter({ ...normalized, raw: state.data }, excludedMemberIds);
  }, [state.data, excludedMemberIds]);
  const localHistory = useLocalHistory(refreshToken + historyRefreshToken, claimId, active);
  const notificationActivity = useNotificationActivity(refreshToken, claimId);
  const discordAuthHref = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
  const selectedProductionMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  analyticsConsent = consent;
  const dismissToast = React.useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);
  const refreshUserAuth = React.useCallback(async () => {
    const response = await fetch(`${LOCAL_API}/auth/me`);
    if (!response.ok) return;
    setUserAuth(await response.json());
  }, []);
  const refreshAdminAuth = React.useCallback(async () => {
    try {
      const response = await fetch(`${LOCAL_API}/admin/me`);
      if (!response.ok) {
        setAdminAuth({ authenticated: false });
        return;
      }
      setAdminAuth(await response.json());
    } catch {
      setAdminAuth({ authenticated: false });
    }
  }, []);
  const discordLogin = React.useCallback(() => {
    setDiscordPromptDismissed(true);
    window.location.href = discordAuthHref;
  }, [discordAuthHref, setDiscordPromptDismissed]);
  const discordLogout = React.useCallback(async () => {
    const response = await fetch(`${LOCAL_API}/auth/logout`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to sign out");
    setUserAuth(body);
  }, []);
  const linkDiscordCharacter = React.useCallback(async (member: AnyRecord | null) => {
    const payload = member ? { characterPlayerId: String(member.playerEntityId ?? ""), characterName: String(member.userName ?? member.username ?? member.playerUsername ?? member.name ?? "") } : {};
    const response = await fetch(`${LOCAL_API}/auth/character`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to save character link request");
    setUserAuth((current) => ({ ...current, user: body.user }));
  }, []);
  const saveAccountSettings = React.useCallback(async () => {
    const settings = { density, toastSettings: userToastSettings, theme: browserTheme, sidebarCollapsed, sidebarGroups, selectedMemberId };
    const response = await fetch(`${LOCAL_API}/auth/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to save account settings");
    setUserAuth((current) => ({ ...current, user: body.user }));
  }, [browserTheme, density, selectedMemberId, sidebarCollapsed, sidebarGroups, userToastSettings]);
  const loadAccountSettings = React.useCallback(() => {
    const saved = userAuth.user?.settings ?? {};
    if (saved.density === "comfortable" || saved.density === "compact") setDensity(saved.density);
    if (saved.toastSettings && typeof saved.toastSettings === "object") setUserToastSettings({ ...DEFAULT_USER_TOAST_SETTINGS, ...saved.toastSettings });
    const savedTheme = normalizeThemeCandidate(saved.theme)?.theme;
    if (savedTheme) setBrowserTheme(savedTheme);
    if (typeof saved.sidebarCollapsed === "boolean") setSidebarCollapsed(saved.sidebarCollapsed);
    if (saved.sidebarGroups && typeof saved.sidebarGroups === "object" && !Array.isArray(saved.sidebarGroups)) setSidebarGroups({ ...DEFAULT_SIDEBAR_GROUPS, ...saved.sidebarGroups });
    if (typeof saved.selectedMemberId === "string") setSelectedMemberId(saved.selectedMemberId);
  }, [setBrowserTheme, setDensity, setSelectedMemberId, setSidebarCollapsed, setSidebarGroups, setUserToastSettings, userAuth.user?.settings]);
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
      buyItem: panel === "market" ? new URLSearchParams(window.location.search).get("buyItem") : null,
      buyItemName: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemName") : null,
      buyItemType: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemType") : null,
      buyRegion: panel === "market" ? new URLSearchParams(window.location.search).get("buyRegion") : null,
      mapName: activeMapFocus?.name ?? null,
      mapX: activeMapFocus ? String(activeMapFocus.locationX) : null,
      mapZ: activeMapFocus ? String(activeMapFocus.locationZ) : null,
    });
  }, [mapFocus, setActive]);
  React.useEffect(() => {
    notificationSourceKeysRef.current = new Set(notificationLog.map((notice) => notice.sourceKey).filter(Boolean) as string[]);
  }, [notificationLog]);
  const pushToast = React.useCallback((title: string, body: string, kind: ToastKind, item?: AnyRecord | null, options: ToastOptions = {}) => {
    if (options.sourceKey && notificationSourceKeysRef.current.has(options.sourceKey)) return;
    if (options.sourceKey) notificationSourceKeysRef.current.add(options.sourceKey);
    const id = `${Date.now()}-${Math.random()}`;
    const notice: ToastNotice = { id, title, body, kind, occurredAt: options.occurredAt ?? new Date().toISOString(), read: false, destination: kind === "market" ? "market" : "production", item: item ?? null, sourceKey: options.sourceKey };
    setToasts((current) => [...current, notice].slice(-4));
    setNotificationLog((current) => [notice, ...dedupeNotifications(current)].slice(0, 80));
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
    if (String(active) === "buildings" || String(active) === "overview") {
      setActive("dashboard");
      updateQueryState({ page: "dashboard" });
    }
  }, [active, setActive]);
  React.useEffect(() => {
    const rawPanel = new URLSearchParams(window.location.search).get("page");
    if (rawPanel === "buildings" || rawPanel === "overview") updateQueryState({ page: "dashboard" });
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
        if (!defaultPageAppliedRef.current && !savedPageRef.current && next.defaultPage !== "admin") {
          defaultPageAppliedRef.current = true;
          setActive(next.defaultPage);
        }
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    refreshUserAuth().catch(() => undefined);
  }, [refreshUserAuth]);
  React.useEffect(() => {
    refreshAdminAuth().catch(() => undefined);
  }, [refreshAdminAuth]);
  React.useEffect(() => {
    applyTheme(browserTheme);
  }, [browserTheme]);
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
    if (!state.data) return;
    const serverTime = state.data.serverFreshness?.lastSuccessAt ?? state.data.serverFreshness?.collectedAt;
    setLastUpdated(serverTime ? new Date(serverTime) : new Date());
  }, [state.data]);
  React.useEffect(() => {
    if (selectedMemberId !== "All" && state.data && !selectedProductionMember) setSelectedMemberId("All");
  }, [selectedMemberId, selectedProductionMember, state.data]);
  React.useEffect(() => {
    if (activityNoticeClaimRef.current !== claimId) {
      activityNoticeClaimRef.current = claimId;
      activityNoticeIdsRef.current = null;
    }
    if (!notificationActivity.refreshToken) return;
    const knownIds = notificationActivity.events.map((event) => String(event.id));
    if (activityNoticeIdsRef.current == null) {
      activityNoticeIdsRef.current = new Set(knownIds);
      return;
    }
    const notable = new Set(["market_new_listing", "market_sale", "market_sale_confirmed"]);
    const unseen = notificationActivity.events
      .filter((event) => !activityNoticeIdsRef.current?.has(String(event.id)) && notable.has(String(event.event_type)))
      .slice(0, 3)
      .reverse();
    for (const id of knownIds) activityNoticeIdsRef.current.add(id);
    for (const event of unseen) {
      const isListing = event.event_type === "market_new_listing";
      if (isListing && (!appSettings.toastSettings.marketListings || !userToastSettings.marketListings)) continue;
      if (!isListing && (!appSettings.toastSettings.marketSales || !userToastSettings.marketSales)) continue;
      pushToast(isListing ? "New market listing" : "Market sale", activitySummary(event), "market", toastItemFromActivity(event), {
        occurredAt: event.occurred_at ?? event.occurredAt,
        sourceKey: activityNoticeKey(event),
      });
    }
  }, [appSettings.toastSettings.marketListings, appSettings.toastSettings.marketSales, claimId, notificationActivity.events, notificationActivity.refreshToken, pushToast, userToastSettings.marketListings, userToastSettings.marketSales]);
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
    for (const [id, job] of started) {
      pushToast("Craft started", `${craftDisplayName(job, data.raw?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production", craftOutputItem(job, data.raw?.crafts), {
        sourceKey: `production-started:${claimId}:${id}`,
      });
    }
    for (const [id, job] of completed) {
      pushToast("Craft completed", `${craftDisplayName(job, state.data?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production", craftOutputItem(job, state.data?.crafts), {
        sourceKey: `production-completed:${claimId}:${id}`,
      });
    }
    craftQueueRef.current = { claimId, jobs: current };
  }, [appSettings.toastSettings.production, claimId, data.crafts, data.raw?.crafts, pushToast, state.data, userToastSettings.production]);
  React.useEffect(() => {
    if (active !== "dashboard" || !appSettings.browserSnapshotsEnabled || !state.data || !data.claim?.entityId) return;
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
  }, [active, appSettings.browserSnapshotsEnabled, claimId, state.data, data.claim, data.members.length, data.buildings.length, data.market]);

  const panels: Record<string, React.ReactNode> = {
    dashboard: <Dashboard data={data} activity={localHistory.activity} snapshots={localHistory.snapshots} dashboardSummary={localHistory.dashboard} lastUpdated={lastUpdated} onNavigate={navigate} />,
    leaderboard: <Leaderboard claimId={claimId} refreshToken={refreshToken} excludedMemberIds={appSettings.excludedMemberIds} data={data} />,
    members: <Members data={data} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onMemberDetailsOpened={() => trackAnalyticsEvent("member_details_opened")} />,
    skills: <Skills data={data} />,
    production: <Production data={data} refreshToken={refreshToken} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} />,
    publiccrafts: <div className="panel public-craft-page"><PublicCraftFinder refreshToken={refreshToken} monitoredRegionId={String(data.claim.regionId ?? "")} monitoredOwnerName={getTrackedOwnerName(data.claim)} defaultRegionId={appSettings.defaultRegion} onShowMap={(focus) => { setMapFocus(focus); navigate("map", undefined, focus); }} /></div>,
    craftcalc: <CraftCalculatorPage />,
    inventory: <Inventory data={data} />,
    construction: <Construction data={data} />,
    research: <Research data={data} />,
    market: <Market data={data} history={localHistory.market} claimId={claimId} />,
    empire: <Region data={data} />,
    map: <MapPanel data={data} focus={mapFocus} onClearFocus={() => { setMapFocus(null); updateQueryState({ mapName: null, mapX: null, mapZ: null }); }} />,
    sync: <SyncPanel syncUrl={syncUrl} />,
    activity: <ActivityPanel activity={localHistory.activity} activityTotal={localHistory.activityTotal} claimId={claimId} error={localHistory.error} />,
    admin: <AdminPanel settings={appSettings} members={normalizeData(state.data).members} onAuthChanged={setAdminAuth} onSettingsSaved={(settings) => { setAppSettings(settings); setClaimId(settings.claimId); setSyncUrl(settings.syncUrl ?? DEFAULT_SYNC_URL); setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); }} />,
  };
  const activePanel = panels[active] ?? panels.dashboard;
  const apiWarnings = React.useMemo(() => {
    const partialErrors = Array.isArray(data.raw?.partialErrors) ? data.raw.partialErrors.map((error) => String(error)) : [];
    return [
      ...(state.error ? [`Main BitJita refresh failed: ${state.error}`] : []),
      ...partialErrors,
    ];
  }, [data.raw?.partialErrors, state.error]);
  const apiDiagnostics = React.useMemo<ApiStatusDiagnostics>(() => ({
    appVersion: APP_VERSION,
    page: active,
    claimId,
    url: window.location.href,
    loading: state.loading,
    lastSuccessfulRefresh: lastUpdated?.toISOString() ?? null,
    warningCount: apiWarnings.length,
    dataCounts: {
      members: data.members.length,
      citizens: data.citizens.length,
      crafts: data.crafts.length,
      constructionProjects: Array.isArray(data.construction) ? data.construction.length : toNumber(data.construction?.projects?.length),
      marketListings: data.market.length,
      inventories: Array.isArray(data.inventories?.inventories) ? data.inventories.inventories.length : 0,
      regionClaims: data.region.length,
    },
    warnings: apiWarnings,
  }), [active, apiWarnings, claimId, data.citizens.length, data.construction, data.crafts.length, data.inventories, data.market.length, data.members.length, data.region.length, lastUpdated, state.loading]);

  return (
    <div className={`app-shell density-${density} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <div className="brand">
          {appSettings.branding.logo ? <img src={`${appSettings.branding.logo.url}?v=${encodeURIComponent(appSettings.branding.logo.updatedAt)}`} alt="" /> : <Shield />}
          <div title={data.claim.name ?? "Settlement"}><h1>{data.claim.name ?? "Settlement"}</h1><span>Claim Monitor</span></div>
          <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((current) => !current)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <a className="discord-cta" href={DISCORD_URL} target="_blank" rel="noreferrer"><DiscordIcon size={18} /><span>Join Our Discord</span><ExternalLink size={13} /></a>
        {userAuth.discordLoginEnabled && !userAuth.user ? (
          <a className="sidebar-auth-cta" href={discordAuthHref} onClick={() => setDiscordPromptDismissed(true)}>
            <MessageCircle size={16} /><span>Sign in with Discord</span>
          </a>
        ) : null}
        <nav aria-label="Main navigation">
          {NAV_GROUPS.map((group) => {
            const hasActivePage = group.items.some(([id]) => active === id);
            const isOpen = sidebarGroups[group.id] ?? true;
            const showItems = isOpen || hasActivePage;
            return (
              <section className={`sidebar-section ${showItems ? "" : "is-collapsed"} ${hasActivePage ? "has-active" : ""}`} key={group.id}>
                <button
                  className="sidebar-section-title"
                  type="button"
                  aria-expanded={showItems}
                  onClick={() => setSidebarGroups((current) => ({ ...current, [group.id]: !(current[group.id] ?? true) }))}
                >
                  <span>{group.label}</span>
                  <ArrowDown size={12} aria-hidden="true" />
                </button>
                <div className="sidebar-section-items">
                  {group.items.map(([id, label, Icon]) => (
                    <a
                      key={id}
                      className={active === id ? "active" : ""}
                      href={panelHref(id)}
                      title={label}
                      onClick={(event) => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        navigate(id);
                      }}
                    >
                      <Icon size={16} /><span className="nav-label">{label}</span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
        <RefreshStatus
          loading={state.loading && Boolean(state.data)}
          lastUpdated={lastUpdated}
          collectorStatus={data.raw?.collectorStatus}
          intervalSeconds={appSettings.refreshSeconds}
        />
      </aside>
      <main ref={mainRef}>
        {state.loading && !state.data ? <AppSkeleton /> : state.error && !state.data ? <ApiErrorState message={state.error} /> : (
          <>
            <ApiStatusBanner warnings={apiWarnings} lastUpdated={lastUpdated} diagnostics={apiDiagnostics} />
            <PageLoadingIndicator visible={state.loading && Boolean(state.data)} />
            <div className="page-view" key={active}>{activePanel}</div>
          </>
        )}
      <footer className="app-footer">
          <div className="footer-links">
            <span className="footer-copy">
              &copy; {new Date().getFullYear()} Timbersteel Claim Monitor — unofficial fan-made tool.
            </span>
            <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer">Data: BitJita API</a>
            <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer"><ExternalLink size={13} /> GitHub</a>
            <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Feature Requests</a>
            <BuyMeCoffeeButton />
            <button className="footer-link" onClick={() => setPrivacyOpen(true)}><Shield size={13} /> Privacy & Analytics</button>
            <button className="footer-link" onClick={() => setTermsOpen(true)}><FileText size={13} /> Terms & Bot Use</button>
            <a href="https://bitcraftmap.com/" target="_blank" rel="noreferrer"><ExternalLink size={13} /> BitCraft Map</a>
          </div>
        </footer>
      </main>
      <div className="floating-actions" aria-label="Application tools">
        {adminAuth.authenticated ? <a
          className={active === "admin" ? "active" : ""}
          href={panelHref("admin")}
          aria-label="Admin console"
          title="Admin console"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate("admin");
          }}
        >
          <KeyRound size={18} />
        </a> : null}
        <button onClick={() => setUserSettingsOpen(true)} aria-label="Browser settings" title="Browser settings"><Settings size={18} /></button>
        <button className="notification-button" onClick={() => { setNoticeOpen(true); setNotificationLog((current) => current.map((notice) => ({ ...notice, read: true }))); }} aria-label="Updates" title="Updates"><Bell size={18} />{notificationLog.some((notice) => !notice.read) ? <b>{notificationLog.filter((notice) => !notice.read).length}</b> : null}</button>
        <button className="floating-help" onClick={() => setHelpOpen(true)} aria-label="Help and application information" title="Help and application information">?</button>
      </div>
      <ToastStack notices={toasts} onDismiss={dismissToast} />
      {noticeOpen ? <NotificationDrawer notices={notificationLog} onClose={() => setNoticeOpen(false)} onOpenNotice={(notice) => { setNoticeOpen(false); navigate(notice.destination ?? "activity"); }} /> : null}
      {commandOpen ? <CommandPalette navItems={NAV} members={data.members} onClose={() => setCommandOpen(false)} onNavigate={(panel, tab) => navigate(panel, tab)} onSelectMember={setSelectedMemberId} /> : null}
      {!discordPromptDismissed && userAuth.discordLoginEnabled && !userAuth.user ? <DiscordSignInPrompt authHref={discordAuthHref} onDiscordLogin={discordLogin} onClose={() => setDiscordPromptDismissed(true)} onSettings={() => { setDiscordPromptDismissed(true); setUserSettingsOpen(true); }} /> : null}
      {userSettingsOpen ? <UserSettingsDialog density={density} onDensityChange={setDensity} toastSettings={{ ...DEFAULT_USER_TOAST_SETTINGS, ...userToastSettings }} onToastSettingsChange={setUserToastSettings} theme={{ ...DEFAULT_THEME, ...browserTheme }} onThemeChange={setBrowserTheme} auth={userAuth} members={data.members} onDiscordLogin={discordLogin} onDiscordLogout={discordLogout} onLinkCharacter={linkDiscordCharacter} onSaveAccountSettings={saveAccountSettings} onLoadAccountSettings={loadAccountSettings} showAdminTools={Boolean(adminAuth.authenticated)} onOpenAdmin={() => { setUserSettingsOpen(false); navigate("admin"); }} onResetSettings={() => { clearBrowserLocalSettings(); window.location.reload(); }} onClose={() => setUserSettingsOpen(false)} /> : null}
      {helpOpen ? <HelpCenter version={APP_VERSION} onClose={() => setHelpOpen(false)} onPrivacy={() => setPrivacyOpen(true)} onTerms={() => setTermsOpen(true)} /> : null}
      {consent == null && !privacyOpen ? <CookieBanner onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); }} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      {privacyOpen ? <PrivacyDialog consent={consent} onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); setPrivacyOpen(false); }} onClose={() => setPrivacyOpen(false)} /> : null}
      {termsOpen ? <TermsDialog onClose={() => setTermsOpen(false)} onPrivacy={() => setPrivacyOpen(true)} /> : null}
    </div>
  );
}

function BotControlApp() {
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    fetch(`${LOCAL_API}/config`)
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        const next = normalizeAppSettings(config);
        setSettings(next);
        applyTheme(next.theme);
      })
      .catch(() => applyTheme(DEFAULT_THEME))
      .finally(() => setLoading(false));
  }, []);
  return loading ? <main><AppSkeleton /></main> : (
    <main className="bot-control-page">
      <AdminPanel settings={settings} onSettingsSaved={(next) => {
        setSettings(next);
        applyTheme(next.theme);
      }} botOnly />
    </main>
  );
}

function App() {
  const dedicatedLegalPath = window.location.pathname === "/terms" ? "terms" : window.location.pathname === "/privacy" ? "privacy" : null;
  const dedicatedBotPath = window.location.pathname === "/bot" || window.location.hostname.toLowerCase().startsWith("bot.");
  if (dedicatedLegalPath) return <DedicatedLegalPage type={dedicatedLegalPath} />;
  if (dedicatedBotPath) return <BotControlApp />;
  return <DashboardApp />;
}

createRoot(document.getElementById("root")!).render(<App />);




