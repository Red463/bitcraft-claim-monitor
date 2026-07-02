import React from "react";
import {
  ArrowDown,
  Bell,
  ExternalLink,
  FileText,
  KeyRound,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Shield,
} from "lucide-react";
import packageJson from "../package.json";
import { useBitjitaData } from "./api/bitjita";
import { useDealAlerts, useLocalHistory, useNotificationActivity } from "./api/localHistory";
import { AdminPanel } from "./components/admin/AdminPanel";
import { ApiErrorState, ApiStatusBanner, AppSkeleton, RefreshStatus, type ApiStatusDiagnostics } from "./components/main/AppChrome";
import { CommandPalette } from "./components/main/CommandPalette";
import { NotificationDrawer, ToastStack } from "./components/main/Notifications";
import { AppPopupManager } from "./components/main/AppPopupManager";
import { UserSettingsDialog } from "./components/main/UserSettingsDialog";
import { BuyMeCoffeeButton, DiscordIcon } from "./components/main/SupportLinks";
import { CookieBanner, DedicatedLegalPage, DiscordSignInPrompt, HelpCenter, PrivacyDialog, TermsDialog } from "./components/main/LegalDialogs";
import { useBrowserNotificationSmoke } from "./notifications/useBrowserNotificationSmoke";
import { useBrowserNotificationSources } from "./notifications/useBrowserNotificationSources";
import { useToastNotifications } from "./notifications/useToastNotifications";
import { normalizeUserToastSettings } from "./notifications/userToastSettings";
import { clearBrowserLocalSettings, hasPersistedState, usePersistedState } from "./hooks/usePersistedState";
import { toNumber, type AnyRecord } from "./main-app-data";
import { DEFAULT_CLAIM_ID, DEFAULT_SETTINGS, DEFAULT_SYNC_URL, DEFAULT_USER_TOAST_SETTINGS } from "./settingsDefaults";
import { DEFAULT_SIDEBAR_GROUPS, NAV, NAV_GROUPS, panelHref, updateQueryState, urlPanel } from "./navigation";
import { readAnalyticsConsent, setAnalyticsPreference, syncAnalyticsConsent, trackAnalyticsEvent, type AnalyticsConsent } from "./utils/analytics";
import { normalizeAppSettings } from "./utils/appSettings";
import { applyMemberTrackingFilter } from "./utils/memberTracking";
import { getTrackedOwnerName } from "./utils/ownership";
import { normalizeData } from "./utils/normalize";
import { urlMapFocus } from "./utils/mapFocus";
import type { ActivePanel } from "./types/app";
import type { AppSettings, UserAuthState, UserToastSettings } from "./types/settings";
import { Construction } from "./pages/ConstructionPage";
import { Empires } from "./pages/EmpiresPage";
import { CraftCalculatorPage } from "./pages/CraftCalculatorPage";
import { Members } from "./pages/MembersPage";
import { Research } from "./pages/ResearchPage";
import { Region } from "./pages/RegionPage";
import { Skills } from "./pages/SkillsPage";
import { SyncPanel } from "./pages/SyncPage";
import { Dashboard } from "./pages/DashboardPage";
import { ActivityPanel } from "./pages/ActivityPage";
import { Inventory } from "./pages/InventoryPage";
import { Leaderboard } from "./pages/LeaderboardPage";
import { MapPanel } from "./pages/MapPage";
import { PublicCraftFinder } from "./pages/PublicCraftFinderPage";
import { Production } from "./pages/ProductionPage";
import { Market } from "./pages/MarketPage";
import type { MapFocus } from "./pages/map/mapUtils";
import { applyTheme, DEFAULT_THEME, normalizeThemeCandidate, type ThemeSettings } from "./theme";

/*
 * Top-level browser application shell.
 *
 * This module coordinates the public claim monitor, the admin console, and the
 * dedicated /bot dashboard route. Page-level rendering has mostly been moved to
 * focused modules, but cross-cutting state remains here because routing,
 * persisted browser settings, auth, analytics consent, notifications, and the
 * current BitJita payload all need to meet in one place.
 */

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor";
const DISCORD_URL = "https://discord.gg/ET4bteqbG5";
const APP_VERSION = packageJson.version;

function hasProductionPayload(raw: AnyRecord | null): boolean {
  return Boolean(raw && Object.prototype.hasOwnProperty.call(raw, "crafts"));
}

/**
 * Main public application route.
 *
 * This component owns public navigation, BitJita refreshes, browser-local
 * preferences, user Discord auth state, notifications, and page composition.
 */
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
  const [historyAutoRefreshToken, setHistoryAutoRefreshToken] = React.useState(0);
  const [notificationRefreshToken, setNotificationRefreshToken] = React.useState(0);
  const [dealRefreshToken, setDealRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [mapFocus, setMapFocus] = usePersistedState<MapFocus>("map.focus", urlMapFocus());
  const [selectedMemberId, setSelectedMemberId] = usePersistedState("production.member", "All");
  const [userToastSettings, setUserToastSettings] = usePersistedState<UserToastSettings>("user.notifications", DEFAULT_USER_TOAST_SETTINGS);
  const normalizedUserToastSettings = React.useMemo(() => normalizeUserToastSettings(userToastSettings), [userToastSettings]);
  const { toasts, notificationLog, dismissToast, pushToast, markNotificationLogRead } = useToastNotifications({ soundSettings: normalizedUserToastSettings });
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
  const [accountSettingsHydratedFor, setAccountSettingsHydratedFor] = React.useState("");
  const state = useBitjitaData(refreshToken, claimId, active);
  const excludedMemberIds = appSettings.excludedMemberIds;
  const data = React.useMemo(() => {
    // BitJita payloads vary by endpoint. Normalize them once here, then apply
    // the admin-controlled member visibility filter before any page receives
    // app data.
    const normalized = normalizeData(state.data);
    return applyMemberTrackingFilter({ ...normalized, raw: state.data }, excludedMemberIds);
  }, [state.data, excludedMemberIds]);
  const localHistory = useLocalHistory(historyAutoRefreshToken + historyRefreshToken, claimId, active);
  const notificationActivity = useNotificationActivity(notificationRefreshToken, claimId);
  const dealAlerts = useDealAlerts(dealRefreshToken);
  const dealAlertSource = React.useMemo(
    () => ({ ...dealAlerts, userKey: userAuth.user?.discordId ?? "" }),
    [dealAlerts, userAuth.user?.discordId],
  );
  const discordAuthHref = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
  const selectedProductionMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  syncAnalyticsConsent(consent);
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
  const accountSettingsFingerprint = React.useMemo(() => JSON.stringify(userAuth.user?.settings ?? {}), [userAuth.user?.settings]);
  const applyAccountSettings = React.useCallback((saved: AnyRecord) => {
    if (saved.density === "comfortable" || saved.density === "compact") setDensity(saved.density);
    if (saved.toastSettings && typeof saved.toastSettings === "object") setUserToastSettings(normalizeUserToastSettings(saved.toastSettings));
    const savedTheme = normalizeThemeCandidate(saved.theme)?.theme;
    if (savedTheme) setBrowserTheme(savedTheme);
    if (typeof saved.sidebarCollapsed === "boolean") setSidebarCollapsed(saved.sidebarCollapsed);
    if (saved.sidebarGroups && typeof saved.sidebarGroups === "object" && !Array.isArray(saved.sidebarGroups)) setSidebarGroups({ ...DEFAULT_SIDEBAR_GROUPS, ...saved.sidebarGroups });
    if (typeof saved.selectedMemberId === "string") setSelectedMemberId(saved.selectedMemberId);
  }, [setBrowserTheme, setDensity, setSelectedMemberId, setSidebarCollapsed, setSidebarGroups, setUserToastSettings]);
  React.useEffect(() => {
    const discordId = userAuth.user?.discordId ?? "";
    if (!discordId) {
      setAccountSettingsHydratedFor("");
      return;
    }
    applyAccountSettings(userAuth.user?.settings ?? {});
    setAccountSettingsHydratedFor(`${discordId}:${accountSettingsFingerprint}`);
  }, [accountSettingsFingerprint, applyAccountSettings, userAuth.user?.discordId, userAuth.user?.settings]);
  const syncAccountSettings = React.useCallback(async (settings: AnyRecord) => {
    const response = await fetch(`${LOCAL_API}/auth/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to sync account settings");
    setUserAuth((current) => ({ ...current, user: body.user }));
  }, []);
  React.useEffect(() => {
    const discordId = userAuth.user?.discordId ?? "";
    if (!discordId || accountSettingsHydratedFor !== `${discordId}:${accountSettingsFingerprint}`) return;
    const settings = { ...(userAuth.user?.settings ?? {}), density, toastSettings: normalizedUserToastSettings, theme: browserTheme, sidebarCollapsed, sidebarGroups, selectedMemberId };
    if (JSON.stringify(settings) === accountSettingsFingerprint) return;
    const timeout = window.setTimeout(() => {
      void syncAccountSettings(settings).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [accountSettingsFingerprint, accountSettingsHydratedFor, browserTheme, density, normalizedUserToastSettings, selectedMemberId, sidebarCollapsed, sidebarGroups, syncAccountSettings, userAuth.user?.discordId, userAuth.user?.settings]);
  const setDiscordMarketSaleDm = React.useCallback(async (enabled: boolean) => {
    const settings = { ...(userAuth.user?.settings ?? {}), discordMarketSaleDm: enabled };
    const response = await fetch(`${LOCAL_API}/auth/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to save Discord notification preference");
    setUserAuth((current) => ({ ...current, user: body.user }));
  }, [userAuth.user?.settings]);
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
  useBrowserNotificationSmoke({ active, pushToast });


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
    // Analytics are first-party and consent-gated. Duration is sent on page exit
    // so feature usage can be measured without tracking identifiable users.
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
    const intervalMs = appSettings.refreshSeconds * 1000;
    const visibleBump = (setter: React.Dispatch<React.SetStateAction<number>>) => {
      if (document.visibilityState !== "hidden") setter((x) => x + 1);
    };
    const timers: number[] = [];
    const schedule = (setter: React.Dispatch<React.SetStateAction<number>>, delayMs: number) => {
      const start = window.setTimeout(() => {
        visibleBump(setter);
        timers.push(window.setInterval(() => visibleBump(setter), intervalMs));
      }, delayMs);
      timers.push(start);
    };
    schedule(setRefreshToken, 0);
    schedule(setHistoryAutoRefreshToken, Math.min(5000, Math.floor(intervalMs * 0.25)));
    schedule(setNotificationRefreshToken, Math.min(10000, Math.floor(intervalMs * 0.5)));
    schedule(setDealRefreshToken, Math.min(15000, Math.floor(intervalMs * 0.75)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
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
    const serverTime = state.updatedAt ?? state.data.serverFreshness?.lastSuccessAt ?? state.data.serverFreshness?.collectedAt ?? state.data.serverFreshness?.cachedAt;
    setLastUpdated(serverTime ? new Date(serverTime) : new Date());
  }, [state.data, state.updatedAt]);
  React.useEffect(() => {
    if (selectedMemberId !== "All" && state.data && !selectedProductionMember) setSelectedMemberId("All");
  }, [selectedMemberId, selectedProductionMember, state.data]);
  useBrowserNotificationSources({
    claimId,
    appToastSettings: appSettings.toastSettings,
    userToastSettings: normalizedUserToastSettings,
    notificationActivity,
    dealAlerts: dealAlertSource,
    productionCrafts: data.crafts,
    productionCraftCatalog: data.raw?.crafts ?? state.data?.crafts,
    hasProductionData: hasProductionPayload(state.data),
    pushToast,
  });
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
    dashboard: <Dashboard data={data} activity={localHistory.activity} snapshots={localHistory.snapshots} marketHistory={localHistory.market} dashboardSummary={localHistory.dashboard} lastUpdated={lastUpdated} onNavigate={navigate} />,
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
    empires: <Empires monitoredRegionId={String(data.claim.regionId ?? "")} />,
    map: <MapPanel data={data} focus={mapFocus} onClearFocus={() => { setMapFocus(null); updateQueryState({ mapName: null, mapX: null, mapZ: null }); }} />,
    sync: <SyncPanel syncUrl={syncUrl} />,
    activity: <ActivityPanel activity={localHistory.activity} activityTotal={localHistory.activityTotal} claimId={claimId} error={localHistory.error} />,
    admin: <AdminPanel settings={appSettings} members={normalizeData(state.data).members} onAuthChanged={setAdminAuth} onSettingsSaved={(settings) => { setAppSettings(settings); setClaimId(settings.claimId); setSyncUrl(settings.syncUrl ?? DEFAULT_SYNC_URL); setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); }} />,
  };
  const activePanel = panels[active] ?? panels.dashboard;
  const apiWarnings = React.useMemo(() => {
    const partialErrors = Array.isArray(data.raw?.partialErrors) ? data.raw.partialErrors.map((error) => String(error)) : [];
    const staleWarning = state.stale
      ? `Showing cached data${lastUpdated ? ` from ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""} while refresh continues.`
      : "";
    return [
      ...(state.error ? [`Main BitJita refresh failed: ${state.error}`] : []),
      ...(staleWarning ? [staleWarning] : []),
      ...partialErrors,
    ];
  }, [data.raw?.partialErrors, lastUpdated, state.error, state.stale]);
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
        <div className={`page-refresh-line ${state.loading ? "is-visible" : ""}`} aria-hidden="true" />
        {state.loading && !state.data ? <AppSkeleton /> : state.error && !state.data ? <ApiErrorState message={state.error} /> : (
          <>
            <ApiStatusBanner warnings={apiWarnings} lastUpdated={lastUpdated} diagnostics={apiDiagnostics} />
            <div className="page-view" key={active}>{activePanel}</div>
          </>
        )}
      <footer className="app-footer">
          <div className="footer-links">
            <span className="footer-copy">
              &copy; {new Date().getFullYear()} Timbersteel Claim Monitor - unofficial fan-made tool.
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
        <button onClick={() => { setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); setNotificationRefreshToken((x) => x + 1); setDealRefreshToken((x) => x + 1); }} aria-label="Refresh data now" title="Refresh data now" disabled={state.loading}><RefreshCw size={18} /></button>
        <button onClick={() => setUserSettingsOpen(true)} aria-label="Browser settings" title="Browser settings"><Settings size={18} /></button>
        <button className="notification-button" onClick={() => { setNoticeOpen(true); markNotificationLogRead(); }} aria-label="Updates" title="Updates"><Bell size={18} />{notificationLog.some((notice) => !notice.read) ? <b>{notificationLog.filter((notice) => !notice.read).length}</b> : null}</button>
        <button className="floating-help" onClick={() => setHelpOpen(true)} aria-label="Help and application information" title="Help and application information">?</button>
      </div>
      <ToastStack notices={toasts} onDismiss={dismissToast} />
      {noticeOpen ? <NotificationDrawer notices={notificationLog} onClose={() => setNoticeOpen(false)} onOpenNotice={(notice) => { setNoticeOpen(false); navigate(notice.destination ?? "activity"); }} /> : null}
      {commandOpen ? <CommandPalette navItems={NAV} members={data.members} onClose={() => setCommandOpen(false)} onNavigate={(panel, tab) => navigate(panel, tab)} onSelectMember={setSelectedMemberId} /> : null}
      {!discordPromptDismissed && userAuth.discordLoginEnabled && !userAuth.user ? <DiscordSignInPrompt authHref={discordAuthHref} onDiscordLogin={discordLogin} onClose={() => setDiscordPromptDismissed(true)} onSettings={() => { setDiscordPromptDismissed(true); setUserSettingsOpen(true); }} /> : null}
      {userSettingsOpen ? <UserSettingsDialog density={density} onDensityChange={setDensity} toastSettings={normalizedUserToastSettings} onToastSettingsChange={(settings) => setUserToastSettings(normalizeUserToastSettings(settings))} theme={{ ...DEFAULT_THEME, ...browserTheme }} onThemeChange={setBrowserTheme} auth={userAuth} members={data.members} onDiscordLogin={discordLogin} onDiscordLogout={discordLogout} onLinkCharacter={linkDiscordCharacter} onDiscordMarketSaleDmChange={setDiscordMarketSaleDm} showAdminTools={Boolean(adminAuth.authenticated)} onOpenAdmin={() => { setUserSettingsOpen(false); navigate("admin"); }} onResetSettings={() => { clearBrowserLocalSettings(); window.location.reload(); }} onClose={() => setUserSettingsOpen(false)} /> : null}
      {helpOpen ? <HelpCenter version={APP_VERSION} onClose={() => setHelpOpen(false)} onPrivacy={() => setPrivacyOpen(true)} onTerms={() => setTermsOpen(true)} /> : null}
      {consent == null && !privacyOpen ? <CookieBanner onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); }} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      {privacyOpen ? <PrivacyDialog consent={consent} onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); setPrivacyOpen(false); }} onClose={() => setPrivacyOpen(false)} /> : null}
      {termsOpen ? <TermsDialog onClose={() => setTermsOpen(false)} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      <AppPopupManager enabled={active !== "admin" && !userSettingsOpen && !helpOpen && !privacyOpen && !termsOpen && !commandOpen && !noticeOpen} />
    </div>
  );
}

/**
 * Dedicated bot dashboard route.
 *
 * This keeps bot administration separate from the public app while still using
 * the same AdminPanel implementation and server-side admin permissions.
 */
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

export default function App() {
  const dedicatedLegalPath = window.location.pathname === "/terms" ? "terms" : window.location.pathname === "/privacy" ? "privacy" : null;
  const dedicatedBotPath = window.location.pathname === "/bot" || window.location.hostname.toLowerCase().startsWith("bot.");
  // Route-level branching happens before mounting DashboardApp so legal pages
  // and the bot console do not initialise public page data unnecessarily.
  if (dedicatedLegalPath) return <DedicatedLegalPage type={dedicatedLegalPath} />;
  if (dedicatedBotPath) return <BotControlApp />;
  return <DashboardApp />;
}

