function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const defaultCraftChannels = {
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

export const defaultCraftRoles = {
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

export const defaultDiscordChannels = {
  notifications: "",
  announcements: "",
  modNotes: "1509972023927902218",
  modLog: "",
  ...defaultCraftChannels,
};

export const defaultNotificationChannels = {
  marketListings: "notifications",
  marketSales: "notifications",
  lowSupplies: "notifications",
  appUpdates: "notifications",
  youtubeVideos: "announcements",
  supplyReport: "modNotes",
  productionStarted: "profession",
  productionCompleted: "profession",
};

export const defaultColourRoles = [
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

export const defaultRolePanels = [
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
      { key: "citizen", label: "Citizen", roleId: "", emoji: "1️⃣" },
      { key: "visitor", label: "Visitor", roleId: "", emoji: "2️⃣" },
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
    options: Object.keys(defaultCraftRoles).map((key) => ({
      key,
      label: key === "leatherworking" ? "Leatherworking" : key[0].toUpperCase() + key.slice(1),
      roleId: defaultCraftRoles[key],
      emoji: "",
    })),
  },
  { key: "events", label: "Event Roles", channelId: "", messageId: "", title: "Event Roles", description: "Choose event pings you want.", mode: "multi", showHelperText: true, options: [] },
  { key: "timezones", label: "Timezone Roles", channelId: "", messageId: "", title: "Timezone Roles", description: "Choose your timezone group.", mode: "single", showHelperText: true, options: [] },
];

export const defaultWelcomeFlow = {
  enabled: false,
  channelId: "",
  messageId: "",
  title: "Welcome to Timbersteel Trade",
  message: "Read the welcome steps, choose your roles, then click Ready.",
  readyRoleId: "",
  showNextStep: true,
};

export const defaultYouTubeMonitorSettings = {
  enabled: true,
  pollIntervalMinutes: 10,
};

export const defaultDiscordPresence = {
  enabled: true,
  status: "online",
  activityType: "watching",
  activityText: "app.timbersteeltrade.com",
};

export const defaultDiscordSettings = {
  enabled: false,
  applicationId: "",
  publicKey: "",
  guildId: "",
  channelId: "",
  minSaleValue: 0,
  marketSalesDelivery: "channel",
  supplyRunwayDaysThreshold: 7,
  productionMinXp: 40000,
  productionMinAgeMinutes: 5,
  productionUsers: "",
  supplyReportIntervalDays: 3,
  youtube: defaultYouTubeMonitorSettings,
  channels: defaultDiscordChannels,
  notificationChannels: defaultNotificationChannels,
  craftChannels: defaultCraftChannels,
  craftRoles: defaultCraftRoles,
  colourRolesChannelId: "",
  colourRolesMessageId: "",
  colourRoles: defaultColourRoles,
  rolePanels: defaultRolePanels,
  welcomeFlow: defaultWelcomeFlow,
  presence: defaultDiscordPresence,
  notify: {
    marketListings: false,
    marketSales: true,
    production: true,
    productionStarted: true,
    productionCompleted: true,
    lowSupplies: false,
    appUpdates: true,
    supplyReports: true,
    youtubeVideos: true,
  },
};

export function normalizeDiscordRoleOption(value = {}, index = 0) {
  const label = String(value.label ?? `Role ${index + 1}`).trim() || `Role ${index + 1}`;
  return {
    key: String(value.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `role-${index + 1}`)).trim(),
    label,
    roleId: String(value.roleId ?? "").trim(),
    emoji: String(value.emoji ?? "").trim().slice(0, 16),
  };
}

export function normalizeDiscordRolePanel(value = {}, fallback = {}, index = 0) {
  const label = String(value.label ?? fallback.label ?? `Panel ${index + 1}`).trim() || `Panel ${index + 1}`;
  const options = Array.isArray(value.options) ? value.options : fallback.options ?? [];
  return {
    key: String(value.key ?? fallback.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `panel-${index + 1}`)).trim(),
    label,
    channelId: String(value.channelId ?? fallback.channelId ?? "").trim(),
    messageId: String(value.messageId ?? fallback.messageId ?? "").trim(),
    title: String(value.title ?? fallback.title ?? label).trim() || label,
    description: String(value.description ?? fallback.description ?? "").trim(),
    mode: String(value.mode ?? fallback.mode ?? "multi") === "single" ? "single" : "multi",
    showHelperText: value.showHelperText !== undefined ? value.showHelperText !== false : fallback.showHelperText !== false,
    options: options.map((option, optionIndex) => normalizeDiscordRoleOption(option, optionIndex)).filter((option) => option.label),
  };
}

export function normalizeDiscordWelcomeFlow(value = {}) {
  return {
    ...defaultWelcomeFlow,
    ...value,
    enabled: value.enabled === true,
    channelId: String(value.channelId ?? "").trim(),
    messageId: String(value.messageId ?? "").trim(),
    title: String(value.title ?? defaultWelcomeFlow.title).trim() || defaultWelcomeFlow.title,
    message: String(value.message ?? defaultWelcomeFlow.message).trim() || defaultWelcomeFlow.message,
    readyRoleId: String(value.readyRoleId ?? "").trim(),
    showNextStep: value.showNextStep !== false,
  };
}

export function normalizeDiscordPresence(value = {}) {
  const status = ["online", "idle", "dnd", "invisible"].includes(String(value.status)) ? String(value.status) : defaultDiscordPresence.status;
  const activityType = ["playing", "watching", "listening", "competing"].includes(String(value.activityType)) ? String(value.activityType) : defaultDiscordPresence.activityType;
  const activityText = String(value.activityText ?? defaultDiscordPresence.activityText).trim().slice(0, 128) || defaultDiscordPresence.activityText;
  return {
    ...defaultDiscordPresence,
    ...value,
    enabled: value.enabled !== false,
    status,
    activityType,
    activityText,
  };
}

export function normalizeYouTubeMonitorSettings(value = {}) {
  return {
    ...defaultYouTubeMonitorSettings,
    enabled: value.enabled !== false,
    pollIntervalMinutes: Math.min(Math.max(toNumber(value.pollIntervalMinutes) || defaultYouTubeMonitorSettings.pollIntervalMinutes, 1), 1440),
  };
}

function normalizeChannelMap(value = {}) {
  return Object.fromEntries(Object.entries({ ...defaultDiscordChannels, ...(value ?? {}) }).map(([key, channelId]) => [key, String(channelId ?? "").trim()]));
}

export function normalizeDiscordSettings(value = {}) {
  const notify = { ...defaultDiscordSettings.notify, ...(value.notify ?? {}) };
  const savedColourRoles = Array.isArray(value.colourRoles) ? value.colourRoles : [];
  const colourRoleSource = Array.isArray(value.colourRoles) ? savedColourRoles : defaultColourRoles;
  const rolePanelSource = Array.isArray(value.rolePanels) ? value.rolePanels : defaultRolePanels;
  return {
    ...defaultDiscordSettings,
    ...value,
    enabled: value.enabled === true,
    applicationId: String(value.applicationId ?? "").trim(),
    publicKey: String(value.publicKey ?? "").trim(),
    guildId: String(value.guildId ?? "").trim(),
    channelId: String(value.channelId ?? "").trim(),
    minSaleValue: Math.max(toNumber(value.minSaleValue), 0),
    marketSalesDelivery: String(value.marketSalesDelivery ?? "channel") === "dm" ? "dm" : "channel",
    supplyRunwayDaysThreshold: Math.max(toNumber(value.supplyRunwayDaysThreshold) || 7, 0.25),
    productionMinXp: Math.max(value.productionMinXp == null ? 40000 : toNumber(value.productionMinXp), 0),
    productionMinAgeMinutes: Math.max((value.productionMinAgeMinutes ?? value.productionMinAgeMins) == null ? 5 : toNumber(value.productionMinAgeMinutes ?? value.productionMinAgeMins), 0),
    productionUsers: String(value.productionUsers ?? "").trim(),
    supplyReportIntervalDays: Math.max(toNumber(value.supplyReportIntervalDays) || 3, 1),
    youtube: normalizeYouTubeMonitorSettings(value.youtube ?? {}),
    channels: { ...normalizeChannelMap(value.channels ?? {}), notifications: String(value.channelId ?? value.channels?.notifications ?? "").trim() },
    notificationChannels: { ...defaultNotificationChannels, ...(value.notificationChannels ?? {}) },
    craftChannels: { ...defaultCraftChannels, ...(value.channels ?? {}), ...(value.craftChannels ?? {}) },
    craftRoles: { ...defaultCraftRoles, ...(value.craftRoles ?? {}) },
    colourRolesChannelId: String(value.colourRolesChannelId ?? "").trim(),
    colourRolesMessageId: String(value.colourRolesMessageId ?? "").trim(),
    colourRoles: colourRoleSource.map((item, index) => {
      const entry = defaultColourRoles[index] ?? {};
      const saved = item ?? {};
      const savedRoleName = String(saved.roleName ?? "");
      const label = String(saved.label ?? entry.label ?? "New Colour").trim() || "New Colour";
      return {
        key: String(saved.key ?? entry.key ?? `colour-${index + 1}`).trim() || `colour-${index + 1}`,
        label,
        roleName: savedRoleName.trim() || String(entry.roleName ?? label),
        roleId: String(saved.roleId ?? "").trim(),
        color: Math.max(toNumber(saved.color ?? entry.color), 0),
      };
    }),
    rolePanels: rolePanelSource.map((panel, index) => normalizeDiscordRolePanel(panel, defaultRolePanels[index], index)),
    welcomeFlow: normalizeDiscordWelcomeFlow(value.welcomeFlow ?? {}),
    presence: normalizeDiscordPresence(value.presence ?? {}),
    notify: {
      marketListings: false,
      marketSales: notify.marketSales !== false,
      production: notify.production !== false,
      productionStarted: notify.productionStarted ?? notify.production ?? true,
      productionCompleted: notify.productionCompleted ?? notify.production ?? true,
      lowSupplies: notify.lowSupplies === true,
      appUpdates: notify.appUpdates !== false,
      supplyReports: notify.supplyReports !== false,
      youtubeVideos: notify.youtubeVideos !== false,
    },
  };
}

