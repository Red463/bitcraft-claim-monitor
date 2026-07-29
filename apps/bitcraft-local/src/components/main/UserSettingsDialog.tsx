import React from "react";
import {
  Activity,
  Bell,
  Download,
  HardDrive,
  KeyRound,
  LogOut,
  MessageCircle,
  RefreshCw,
  Save,
  Settings,
  Share2,
  Shield,
  Star,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import type { AnyRecord } from "../../main-app-data";
import { resolveUserSettingsMembers } from "../../api/settlementMembers";
import { DEFAULT_USER_TOAST_SETTINGS } from "../../settingsDefaults";
import {
  clampThemeNumber,
  CUSTOM_THEME_STORAGE_KEY,
  DEFAULT_THEME,
  loadSavedCustomTheme,
  normalizeThemeCandidate,
  THEME_FIELD_GROUPS,
  THEME_FIELDS,
  THEME_GRADIENT_RANGE_FIELDS,
  THEME_PRESETS,
  THEME_RANGE_FIELD_CONFIG,
  validateThemeContrast,
  type ThemeColorKey,
  type ThemeRangeKey,
  type ThemeSettings,
} from "../../theme";
import type { AppSettings, AppUser, NotificationSoundId, NotificationSoundType, UserAuthState, UserToastSettings } from "../../types/settings";
import { memberDisplayName, memberTrackingId } from "../../utils/memberTracking";
import { NOTIFICATION_SOUND_OPTIONS, previewNotificationSound } from "../../utils/notificationSounds";
import { Dialog } from "./Dialog";
import { PrivacyDataSection } from "./PrivacyDataSection";

/**
 * Browser-local preferences dialog.
 *
 * These settings intentionally follow the browser rather than the installation:
 * density, toast preferences, page defaults, linked account controls, and custom
 * themes should not be written into global admin configuration.
 */
const SOUND_TYPE_OPTIONS: Array<{ key: NotificationSoundType; label: string }> = [
  { key: "marketListings", label: "New market listings" },
  { key: "marketSales", label: "Confirmed market sales" },
  { key: "dealAlerts", label: "Deal watcher alerts" },
  { key: "productionStarted", label: "Craft started" },
  { key: "productionCompleted", label: "Craft completed" },
];
export type UserSettingsDialogProps = {
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  toastSettings: UserToastSettings;
  appToastSettings: AppSettings["toastSettings"];
  onToastSettingsChange: (settings: UserToastSettings) => void;
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  auth: UserAuthState;
  claimId: string;
  members: AnyRecord[];
  onDiscordLogin: () => void;
  onDiscordLogout: () => Promise<void>;
  onLinkCharacter: (member: AnyRecord | null) => Promise<void>;
  onDiscordMarketSaleDmChange: (enabled: boolean) => Promise<void>;
  showAdminTools: boolean;
  onOpenAdmin: () => void;
  onPrivacyUserChanged: (user: AppUser, reason: "character" | "settings") => void;
  onAnalyticsCleared: () => void;
  onDeleteAccount: () => void;
  onResetSettings: () => void;
  onClose: () => void;
  modal?: boolean;
};

export function UserSettingsDialog({
  density,
  onDensityChange,
  toastSettings,
  appToastSettings,
  onToastSettingsChange,
  theme,
  onThemeChange,
  auth,
  claimId,
  members,
  onDiscordLogin,
  onDiscordLogout,
  onLinkCharacter,
  onDiscordMarketSaleDmChange,
  showAdminTools,
  onOpenAdmin,
  onPrivacyUserChanged,
  onAnalyticsCleared,
  onDeleteAccount,
  onResetSettings,
  onClose,
  modal = true,
}: UserSettingsDialogProps) {
  const [settingsSection, setSettingsSection] = React.useState<"account" | "theme" | "preferences" | "data">("account");
  const [themeExpanded, setThemeExpanded] = React.useState(false);
  const [themeShareOpen, setThemeShareOpen] = React.useState(false);
  const [themeImportText, setThemeImportText] = React.useState("");
  const [themeShareStatus, setThemeShareStatus] = React.useState("");
  const [customTheme, setCustomTheme] = React.useState<ThemeSettings>(() => loadSavedCustomTheme());
  const [customThemeStatus, setCustomThemeStatus] = React.useState("");
  const [lastThemeChoice, setLastThemeChoice] = React.useState("");
  const [selectedCharacterId, setSelectedCharacterId] = React.useState(auth.user?.characterPlayerId ?? "");
  const [accountStatus, setAccountStatus] = React.useState("");
  const [fallbackMembers, setFallbackMembers] = React.useState<AnyRecord[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [membersError, setMembersError] = React.useState("");
  React.useEffect(() => setSelectedCharacterId(auth.user?.characterPlayerId ?? ""), [auth.user?.characterPlayerId]);
  React.useEffect(() => {
    const controller = new AbortController();
    if (!auth.user || members.length || !claimId.trim()) {
      setFallbackMembers([]);
      setMembersLoading(false);
      setMembersError("");
      return () => controller.abort();
    }

    setMembersLoading(true);
    setMembersError("");
    void resolveUserSettingsMembers(
      members,
      claimId,
      (input, init) => fetch(input, { ...init, signal: controller.signal }),
    )
      .then((loadedMembers) => {
        if (!controller.signal.aborted) setFallbackMembers(loadedMembers);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFallbackMembers([]);
          setMembersError(error instanceof Error ? error.message : "Unable to load settlement characters.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMembersLoading(false);
      });

    return () => controller.abort();
  }, [auth.user, claimId, members]);
  const availableMembers = members.length ? members : fallbackMembers;
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
    const contrast = validateThemeContrast(theme);
    if (!contrast.valid) {
      onThemeChange(customTheme);
      setCustomThemeStatus(`Theme not saved. Improve contrast for: ${contrast.failures.map((failure) => `${failure.role} (${failure.ratio}:1; needs ${failure.minimum}:1)`).join(", ")}. The last valid custom theme is active.`);
      return;
    }
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
      const contrast = validateThemeContrast(result.theme);
      if (!contrast.valid) throw new Error(`Theme not imported. Improve contrast for: ${contrast.failures.map((failure) => `${failure.role} (${failure.ratio}:1; needs ${failure.minimum}:1)`).join(", ")}.`);
      onThemeChange(result.theme);
      setLastThemeChoice("custom-editing");
      setThemeExpanded(true);
      setThemeShareStatus(`Imported ${result.count} theme setting${result.count === 1 ? "" : "s"}. Save as Custom if you want to keep it in the preset list.`);
    } catch (error) {
      setThemeShareStatus(error instanceof Error ? error.message : "Could not import that theme JSON.");
    }
  };
  const selectedCharacter = availableMembers.find((member) => memberTrackingId(member) === selectedCharacterId) ?? null;
  const soundVolumePercent = Math.round((toastSettings.soundVolume ?? DEFAULT_USER_TOAST_SETTINGS.soundVolume) * 100);
  const handleSoundVolumeChange = (event: React.FormEvent<HTMLInputElement>) => onToastSettingsChange({ ...toastSettings, soundVolume: Number(event.currentTarget.value) / 100 });
  const defaultSoundLabel = NOTIFICATION_SOUND_OPTIONS.find((sound) => sound.id === toastSettings.soundId)?.label ?? "Default";
  const updateSoundTypeSetting = (key: NotificationSoundType, value: string) => {
    const soundByType = { ...(toastSettings.soundByType ?? {}) };
    if (value) soundByType[key] = value as NotificationSoundId;
    else delete soundByType[key];
    onToastSettingsChange({ ...toastSettings, soundByType });
  };
  const accountName = auth.user?.globalName || auth.user?.username || "Discord user";
  const discordMarketSaleDm = auth.user?.settings?.discordMarketSaleDm !== false;
  const characterLinkApproved = auth.user?.characterStatus === "approved" && Boolean(auth.user?.characterPlayerId);
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
    <Dialog open title="User Settings" modal={modal} onClose={onClose} className="help-dialog settings-dialog" backdropClassName="help-overlay" dataTour="user-settings">
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
              ["data", "Privacy & Data", HardDrive],
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
                <p className="legend">Optional sign-in lets you link your Discord account to a BitCraft character and synchronize supported preferences across browsers.</p>
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
                    <select value={selectedCharacterId} disabled={characterLinkApproved} onChange={(event) => setSelectedCharacterId(event.target.value)}>
                      <option value="">{membersLoading ? "Loading settlement characters..." : availableMembers.length ? "Select your character" : "No settlement characters available"}</option>
                      {auth.user.characterPlayerId && !availableMembers.some((member) => memberTrackingId(member) === String(auth.user?.characterPlayerId)) ? <option value={auth.user.characterPlayerId}>{auth.user.characterName || auth.user.characterPlayerId}</option> : null}
                      {availableMembers.map((member) => {
                        const playerId = memberTrackingId(member);
                        return <option key={playerId || memberDisplayName(member)} value={playerId}>{memberDisplayName(member)}</option>;
                      })}
                    </select>
                  </label>
                  {characterLinkApproved ? <button className="toolbar-button" onClick={() => runAccountAction(() => onLinkCharacter(null), "Character link removed. You can request a new character link now.")}><RefreshCw size={14} /> Unlink character</button> : <button className="toolbar-button primary" disabled={!selectedCharacter} onClick={() => runAccountAction(() => onLinkCharacter(selectedCharacter), "Character link request saved for admin approval.")}><UserPlus size={14} /> Request link approval</button>}
                </div>
                {membersError ? <p className="theme-share-status" role="alert">{membersError} Refresh and retry.</p> : null}
                <label className="toggle-row"><input type="checkbox" checked={discordMarketSaleDm} onChange={(event) => runAccountAction(() => onDiscordMarketSaleDmChange(event.target.checked), event.target.checked ? "Discord market sale DMs enabled." : "Discord market sale DMs disabled.")} /><span>Send me Discord DMs for my confirmed market sales</span></label>
                <p className="theme-share-status">Settings sync automatically while you are signed in with Discord.</p>
                {accountStatus ? <p className="theme-share-status">{accountStatus}</p> : null}
              </div>
            )}
          </section> : null}
          {settingsSection === "account" ? <section>
            <h3>This Browser</h3>
            <p className="legend">Density, toast preferences, theme, sidebar state and groups, and your selected production member sync automatically while you are signed in with Discord. Page and filter choices stay in this browser. Local storage is still used on this device for signed-out browsing and instant loading.</p>
          </section> : null}
          {settingsSection === "account" ? <section>
            <h3>Administrator Access</h3>
            <p className="legend">For approved settlement monitor administrators. Administrator sign-in and tools open in the protected console.</p>
            <button className="toolbar-button" onClick={onOpenAdmin}><KeyRound size={14} /> {showAdminTools ? "Open Admin Console" : "Administrator sign-in"}</button>
          </section> : null}
          {settingsSection === "theme" ? <section className={`settings-theme-section ${themeExpanded ? "expanded" : ""}`}>
            <div className="settings-section-heading">
              <div>
                <h3>Theme</h3>
                <p className="legend">When signed in with Discord, your selected theme syncs to your account. Presets apply instantly and advanced controls can be fine-tuned below.</p>
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
            {([["marketListings", "New market listings"], ["marketSales", "Confirmed market sales"], ["production", "Production starts and completions"]] as const).map(([key, label]) => {
              const disabledByAdmin = !appToastSettings[key];
              return (
                <label className={`toggle-row ${disabledByAdmin ? "is-disabled-by-admin" : ""}`} key={key}>
                  <input type="checkbox" checked={toastSettings[key]} disabled={!appToastSettings[key]} onChange={(event) => onToastSettingsChange({ ...toastSettings, [key]: event.target.checked })} />
                  <span>{label}{disabledByAdmin ? <small>Disabled by admin</small> : null}</span>
                </label>
              );
            })}
          </section> : null}
          {settingsSection === "preferences" && auth.user ? <section>
            <h3>Discord Direct Messages</h3>
            <label className="toggle-row"><input type="checkbox" checked={discordMarketSaleDm} onChange={(event) => runAccountAction(() => onDiscordMarketSaleDmChange(event.target.checked), event.target.checked ? "Discord market sale DMs enabled." : "Discord market sale DMs disabled.")} /><span>Send me Discord DMs for my confirmed market sales</span></label>
            <p className="legend">Only applies when admins route confirmed market sale alerts to direct messages. You must keep your Discord account linked and character approved.</p>
          </section> : null}
          {settingsSection === "preferences" ? <section className="notification-sound-settings">
            <div className="settings-section-heading">
              <div>
                <h3>Notification Sound</h3>
                <p className="legend">Browser-only sounds for toast notifications. The default sound is used whenever a type does not have its own choice.</p>
              </div>
              <button className="toolbar-button" onClick={() => previewNotificationSound({ soundId: toastSettings.soundId, soundVolume: toastSettings.soundVolume })}><Bell size={14} /> Preview default</button>
            </div>
            <label className="toggle-row"><input type="checkbox" checked={toastSettings.soundEnabled} onChange={(event) => onToastSettingsChange({ ...toastSettings, soundEnabled: event.target.checked })} /><span>Play a sound for new notifications</span></label>
            <div className="notification-sound-grid">
              <label className="field">
                <span>Default sound</span>
                <select value={toastSettings.soundId} onChange={(event) => onToastSettingsChange({ ...toastSettings, soundId: event.target.value as UserToastSettings["soundId"] })}>
                  {NOTIFICATION_SOUND_OPTIONS.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
                </select>
              </label>
              <label className="field notification-volume-field">
                <span>Volume</span>
                <div>
                  <input type="range" min="0" max="100" step="1" value={soundVolumePercent} style={{ "--volume-percent": `${soundVolumePercent}%` } as React.CSSProperties} onInput={handleSoundVolumeChange} onChange={handleSoundVolumeChange} />
                  <strong>{soundVolumePercent}%</strong>
                </div>
              </label>
            </div>
            <div className="notification-sound-type-list">
              {SOUND_TYPE_OPTIONS.map(({ key, label }) => {
                const overrideSoundId = toastSettings.soundByType?.[key] ?? "";
                const soundId = overrideSoundId || toastSettings.soundId;
                const soundDescription = NOTIFICATION_SOUND_OPTIONS.find((sound) => sound.id === soundId)?.description ?? "Generated notification sound.";
                return (
                  <div className="notification-sound-type-row" key={key}>
                    <div>
                      <strong>{label}</strong>
                      <span>{overrideSoundId ? soundDescription : `Uses default: ${defaultSoundLabel}`}</span>
                    </div>
                    <select aria-label={`${label} sound`} value={overrideSoundId} onChange={(event) => updateSoundTypeSetting(key, event.target.value)}>
                      <option value="">Use default ({defaultSoundLabel})</option>
                      {NOTIFICATION_SOUND_OPTIONS.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
                    </select>
                    <button className="toolbar-button icon-only" title={`Preview ${label} sound`} aria-label={`Preview ${label} sound`} onClick={() => previewNotificationSound({ soundId: soundId, soundVolume: toastSettings.soundVolume })}><Bell size={14} /></button>
                  </div>
                );
              })}
            </div>
          </section> : null}
          {settingsSection === "data" ? (
            <PrivacyDataSection
              auth={auth}
              onUserChanged={onPrivacyUserChanged}
              onAnalyticsCleared={onAnalyticsCleared}
              onResetBrowserSettings={onResetSettings}
              onDeleteAccount={onDeleteAccount}
            />
          ) : null}
          </div>
        </div>
    </Dialog>
  );
}

