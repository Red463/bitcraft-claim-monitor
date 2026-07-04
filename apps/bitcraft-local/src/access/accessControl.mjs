export const ACCESS_RULE_MODES = [
  { mode: "public", label: "Any users", deniedReason: "This page is available to everyone." },
  { mode: "discord", label: "Discord logged in users only", deniedReason: "Sign in with Discord to view this area." },
  { mode: "verified", label: "Discord logged in and character verified only", deniedReason: "Sign in with Discord and have your character link approved to view this area." },
  { mode: "specificUsers", label: "Discord specific users", deniedReason: "Your Discord account is not on the allow list for this area." },
];

const PAGE_TARGETS = [
  ["dashboard", "Dashboard"],
  ["leaderboard", "Leaderboard"],
  ["members", "Members"],
  ["skills", "Professions"],
  ["production", "Production"],
  ["inventory", "Inventory"],
  ["construction", "Construction"],
  ["research", "Research"],
  ["market", "Market"],
  ["empire", "Region"],
  ["empires", "Empires"],
  ["map", "Map"],
  ["activity", "Activity"],
  ["publiccrafts", "Public Craft Finder"],
  ["craftcalc", "Craft Calculator"],
  ["sync", "Sync"],
].map(([page, label]) => ({ id: `page:${page}`, kind: "page", page, label }));

export const ACCESS_TAB_GROUPS = {
  market: [
    { id: "live", label: "Live Listings" },
    { id: "analytics", label: "Analytics" },
    { id: "pricing", label: "Price Finder" },
    { id: "buyOrders", label: "Buy Order Finder" },
    { id: "dealWatchlist", label: "Deal Watchlist" },
  ],
  leaderboard: [
    { id: "contribution", label: "Contribution" },
    { id: "professions", label: "Professions" },
    { id: "activity", label: "Activity" },
    { id: "market", label: "Market" },
    { id: "online", label: "Online / Sessions" },
  ],
  empires: [
    { id: "overview", label: "Overview" },
    { id: "watchtowers", label: "Watchtowers" },
  ],
  activity: [
    { id: "all", label: "All" },
    { id: "storage", label: "Storage" },
    { id: "treasury", label: "Treasury" },
    { id: "supplies", label: "Supplies" },
    { id: "market", label: "Market" },
    { id: "members", label: "Members" },
    { id: "buildings", label: "Structures" },
  ],
};

const TAB_TARGETS = Object.entries(ACCESS_TAB_GROUPS).flatMap(([page, tabs]) => tabs.map((tab) => ({
  id: `tab:${page}:${tab.id}`,
  kind: "tab",
  page,
  tab: tab.id,
  label: tab.label,
  parentLabel: PAGE_TARGETS.find((target) => target.page === page)?.label ?? page,
})));

export const ACCESS_CONTROL_TARGETS = [...PAGE_TARGETS, ...TAB_TARGETS];

export function pageAccessTargets() {
  return PAGE_TARGETS;
}

export function tabAccessTargets(page) {
  return TAB_TARGETS.filter((target) => target.page === page);
}

function normalizeMode(value) {
  return ACCESS_RULE_MODES.some((entry) => entry.mode === value) ? value : "public";
}

function normalizeDiscordIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter((value) => /^\d{5,25}$/.test(value)))];
}

export function normalizeAccessControlConfig(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawRules = raw.rules && typeof raw.rules === "object" && !Array.isArray(raw.rules) ? raw.rules : {};
  const rules = {};
  const validTargets = new Set(ACCESS_CONTROL_TARGETS.map((target) => target.id));
  for (const [targetId, ruleValue] of Object.entries(rawRules)) {
    if (!validTargets.has(targetId)) continue;
    const rule = ruleValue && typeof ruleValue === "object" && !Array.isArray(ruleValue) ? ruleValue : {};
    const mode = normalizeMode(rule.mode);
    const allowedDiscordIds = mode === "specificUsers" ? normalizeDiscordIds(rule.allowedDiscordIds) : [];
    if (mode !== "public" || allowedDiscordIds.length) rules[targetId] = { mode, allowedDiscordIds };
  }
  return { rules };
}

export function accessRuleFor(config, targetId) {
  return config?.rules?.[targetId] ?? { mode: "public", allowedDiscordIds: [] };
}

export function publicAccessDecision(config, targetId, subject = {}) {
  const rule = accessRuleFor(config, targetId);
  const user = subject.user ?? null;
  const discordId = String(user?.discordId ?? user?.discord_id ?? "").trim();
  const characterStatus = String(user?.characterStatus ?? user?.character_status ?? "");
  const modeInfo = ACCESS_RULE_MODES.find((entry) => entry.mode === rule.mode) ?? ACCESS_RULE_MODES[0];
  if (rule.mode === "public") return { allowed: true, mode: rule.mode, reason: "" };
  if (rule.mode === "discord") return { allowed: Boolean(discordId), mode: rule.mode, reason: modeInfo.deniedReason };
  if (rule.mode === "verified") return { allowed: Boolean(discordId) && characterStatus === "approved", mode: rule.mode, reason: modeInfo.deniedReason };
  if (rule.mode === "specificUsers") return { allowed: Boolean(discordId) && rule.allowedDiscordIds.includes(discordId), mode: rule.mode, reason: modeInfo.deniedReason };
  return { allowed: true, mode: "public", reason: "" };
}

export function targetIdForPage(page) {
  return `page:${page}`;
}

export function targetIdForTab(page, tab) {
  return `tab:${page}:${tab}`;
}

export function firstAllowedPage(config, subject = {}, preferred = "dashboard") {
  const preferredTarget = PAGE_TARGETS.find((target) => target.page === preferred);
  if (preferredTarget && publicAccessDecision(config, preferredTarget.id, subject).allowed) return preferredTarget.page;
  return PAGE_TARGETS.find((target) => publicAccessDecision(config, target.id, subject).allowed)?.page ?? "dashboard";
}

export function firstAllowedTab(config, page, subject = {}) {
  const tabs = tabAccessTargets(page);
  return tabs.find((target) => publicAccessDecision(config, target.id, subject).allowed)?.tab ?? null;
}

export function effectiveTargetAllowed(effectiveAccess, targetId) {
  return effectiveAccess?.targets?.[targetId]?.allowed !== false;
}

export function publicEffectiveAccess(config, subject = {}) {
  return {
    targets: Object.fromEntries(ACCESS_CONTROL_TARGETS.map((target) => {
      const decision = publicAccessDecision(config, target.id, subject);
      return [target.id, { allowed: decision.allowed, mode: decision.mode, reason: decision.allowed ? "" : decision.reason }];
    })),
  };
}