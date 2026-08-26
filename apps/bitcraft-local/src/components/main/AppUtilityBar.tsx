import type React from "react";
import { Bell, CircleHelp, KeyRound, RefreshCw, Search, Settings } from "lucide-react";

export type AppUtilityBarProps = {
  pageLabel: string;
  adminHref: string;
  adminActive: boolean;
  adminVisible: boolean;
  unreadCount: number;
  refreshing: boolean;
  coolingDownSeconds: number;
  refreshDisabled: boolean;
  refreshLabel: string;
  onAdminNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onOpenCommand: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenHelp: () => void;
};

export function AppUtilityBar({
  pageLabel,
  adminHref,
  adminActive,
  adminVisible,
  unreadCount,
  refreshing,
  coolingDownSeconds,
  refreshDisabled,
  refreshLabel,
  onAdminNavigate,
  onOpenCommand,
  onRefresh,
  onOpenSettings,
  onOpenNotifications,
  onOpenHelp,
}: AppUtilityBarProps) {
  return (
    <div className="app-utility-bar" aria-label="Application tools" data-tour="floating-actions">
      <div className="app-utility-context">
        <span>Workspace</span>
        <strong>{pageLabel}</strong>
      </div>
      <button className="app-utility-command" onClick={onOpenCommand} aria-label="Search commands" title="Search commands">
        <Search size={15} /><span>Search commands</span><kbd>Ctrl K</kbd>
      </button>
      <div className="app-utility-actions">
        {adminVisible ? <a className={adminActive ? "active" : ""} href={adminHref} onClick={onAdminNavigate} aria-label="Admin console" title="Admin console"><KeyRound size={16} /></a> : null}
        <button className={`app-utility-refresh ${refreshing ? "is-refreshing" : coolingDownSeconds > 0 ? "is-cooldown" : ""}`} onClick={onRefresh} aria-label={refreshLabel} title={refreshLabel} aria-busy={refreshing} aria-disabled={refreshDisabled} disabled={refreshDisabled}>
          {coolingDownSeconds > 0 && !refreshing ? <span className="refresh-cooldown-countdown" aria-hidden="true">{coolingDownSeconds}s</span> : <RefreshCw size={16} />}
        </button>
        <button onClick={onOpenSettings} aria-label="Browser settings" title="Browser settings"><Settings size={16} /></button>
        <button className="notification-button" onClick={onOpenNotifications} aria-label="Updates" title="Updates"><Bell size={16} />{unreadCount > 0 ? <b>{unreadCount}</b> : null}</button>
        <button onClick={onOpenHelp} aria-label="Help and application information" title="Help and application information"><CircleHelp size={16} /></button>
      </div>
    </div>
  );
}
