import React from "react";
import { ExternalLink, LogOut, MessageCircle, Server } from "lucide-react";

type Identity = { username?: string; displayName?: string; characterName?: string } | null | undefined;

export function AdminShellHeader({
  heading,
  description,
  admin,
  publicAccount,
  environment,
  reconciliationEnabled,
  botOnly,
  logoutPending,
  onLogout,
}: {
  heading: string;
  description: string;
  admin: Identity;
  publicAccount?: Identity;
  environment?: string;
  reconciliationEnabled?: boolean;
  botOnly?: boolean;
  logoutPending?: boolean;
  onLogout: () => void;
}) {
  const adminLabel = admin?.displayName || admin?.username || "Administrator";
  const publicLabel = publicAccount?.characterName || publicAccount?.displayName || publicAccount?.username || "Not connected";
  return (
    <header className="members-topbar admin-topbar admin-shell-header">
      <div>
        <h1>{heading}</h1>
        <p>{description}</p>
        <div className="admin-identity-row" aria-label="Signed-in identities">
          <span><strong>Admin session:</strong> {adminLabel}</span>
          <span><strong>Public account:</strong> {publicLabel}</span>
        </div>
      </div>
      <div className="dashboard-top-meta" aria-label="Admin status">
        {!botOnly ? <div className="dashboard-meta-cluster">
          <span><Server size={15} /> {environment ?? "Local"}</span>
          <span>{reconciliationEnabled ? "Reconciliation enabled" : "Reconciliation disabled"}</span>
        </div> : null}
        <div className="toolbar">
          <a className="toolbar-button" href={botOnly ? "/" : "/?page=dashboard"}><ExternalLink size={15} /> Return to app</a>
          {!botOnly ? <a className="toolbar-button" href="/bot"><MessageCircle size={15} /> Bot Console</a> : null}
          <button className="toolbar-button" disabled={logoutPending} onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </div>
    </header>
  );
}
