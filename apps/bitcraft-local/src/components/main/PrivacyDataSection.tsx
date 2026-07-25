import React from "react";
import { BarChart3, Download, Link2Off, RotateCcw, Settings2, ShoppingCart, Trash2 } from "lucide-react";

import type { AppUser, UserAuthState } from "../../types/settings";
import { currentAnalyticsSessionId } from "../../utils/analytics";

const LOCAL_API = "/api/local";

type DestructiveAction = "character" | "settings" | "market-data" | "analytics" | "browser";

type PrivacyDataSectionProps = {
  auth: UserAuthState;
  onUserChanged: (user: AppUser, reason: "character" | "settings") => void;
  onAnalyticsCleared: () => void;
  onResetBrowserSettings: () => void;
  onDeleteAccount: () => void;
};

const ACTION_COPY: Record<DestructiveAction, { title: string; detail: string; confirm: string }> = {
  character: {
    title: "Unlink BitCraft character?",
    detail: "The Discord account remains signed in. The character link is removed immediately and Discord notices are attempted after removal.",
    confirm: "Unlink character",
  },
  settings: {
    title: "Clear saved account preferences?",
    detail: "Synced density, notification, theme, sidebar, and selected-member preferences are reset. Settlement records are not affected.",
    confirm: "Clear saved preferences",
  },
  "market-data": {
    title: "Delete saved market data?",
    detail: "Your deal watches and their alert history are permanently removed. Shared public market history is not personal account data and is not removed.",
    confirm: "Delete market data",
  },
  analytics: {
    title: "Clear this browser's analytics?",
    detail: "Analytics events tied to this browser or current browser session are removed where identifiable, and analytics consent is withdrawn.",
    confirm: "Clear analytics",
  },
  browser: {
    title: "Reset this browser's settings?",
    detail: "Browser-only app preferences are reset and the page reloads. Server, admin, and settlement data are not affected.",
    confirm: "Reset browser settings",
  },
};

function countMessage(label: string, deleted: Record<string, number>) {
  const total = Object.values(deleted).reduce((sum, value) => sum + Number(value || 0), 0);
  return total > 0 ? `${label} ${total} record${total === 1 ? "" : "s"}.` : `${label} No matching records remained.`;
}

export function PrivacyDataSection({
  auth,
  onUserChanged,
  onAnalyticsCleared,
  onResetBrowserSettings,
  onDeleteAccount,
}: PrivacyDataSectionProps) {
  const [confirming, setConfirming] = React.useState<DestructiveAction | null>(null);
  const [busy, setBusy] = React.useState<DestructiveAction | "export" | null>(null);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const user = auth.user;

  async function downloadExport() {
    setBusy("export");
    setStatus("");
    setError("");
    try {
      const response = await fetch(`${LOCAL_API}/auth/privacy/export`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to create your data export");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "timbersteel-claim-monitor-data.json";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setStatus("Your JSON data export was downloaded.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create your data export");
    } finally {
      setBusy(null);
    }
  }

  async function runDeletion(action: Exclude<DestructiveAction, "browser">) {
    setBusy(action);
    setStatus("");
    setError("");
    try {
      const response = await fetch(`${LOCAL_API}/auth/privacy/${action}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(auth.csrfToken ?? ""),
        },
        body: action === "analytics" ? JSON.stringify({ analyticsSessionId: currentAnalyticsSessionId() }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to remove the selected data");
      if (action === "character" && body.user) onUserChanged(body.user, "character");
      if (action === "settings" && body.user) onUserChanged(body.user, "settings");
      if (action === "analytics") onAnalyticsCleared();
      const labels: Record<typeof action, string> = {
        character: "Character link removed.",
        settings: "Saved preferences cleared.",
        "market-data": "Saved market data removed.",
        analytics: "Analytics consent withdrawn and data cleared.",
      };
      setStatus(countMessage(labels[action], body.deleted ?? {}));
      setConfirming(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove the selected data");
    } finally {
      setBusy(null);
    }
  }

  function confirmAction(action: DestructiveAction) {
    setError("");
    setStatus("");
    setConfirming(action);
  }

  function executeConfirmedAction() {
    if (!confirming || busy) return;
    if (confirming === "browser") {
      onResetBrowserSettings();
      return;
    }
    void runDeletion(confirming);
  }

  const acceptedAt = auth.legal.acceptedAt
    ? new Date(auth.legal.acceptedAt).toLocaleString()
    : "Not recorded for the current version";

  return (
    <section className="privacy-data-section">
      <div className="settings-section-heading">
        <div>
          <h3>Privacy &amp; Data</h3>
          <p className="legend">Download or remove data connected to your signed-in Discord account. Deletions are designed to be safe to repeat.</p>
        </div>
      </div>

      <div className="privacy-legal-summary">
        <strong>Current legal version {auth.legal.version}</strong>
        <span>Accepted: {acceptedAt}</span>
        <span><a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> · <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a></span>
      </div>

      {!user ? (
        <p className="privacy-empty">Sign in with Discord to export or remove account data. Browser-only settings can still be reset below.</p>
      ) : (
        <div className="privacy-action-list">
          <article className="privacy-action-row">
            <Download size={18} />
            <div><strong>Download my data</strong><span>Receive a JSON copy of account, legal acceptance, character, preferences, watches, and account-related activity retained by the service.</span></div>
            <button className="toolbar-button" disabled={busy != null} onClick={() => void downloadExport()}><Download size={14} /> {busy === "export" ? "Preparing…" : "Download"}</button>
          </article>
          <article className="privacy-action-row">
            <Link2Off size={18} />
            <div><strong>Remove character link</strong><span>Unlink {user.characterName || "the current character"} from this Discord login. The account itself remains active.</span></div>
            <button className="toolbar-button" disabled={busy != null || user.characterStatus === "unlinked"} onClick={() => confirmAction("character")}>Unlink</button>
          </article>
          <article className="privacy-action-row">
            <Settings2 size={18} />
            <div><strong>Clear saved preferences</strong><span>Remove account-synchronised display and notification preferences.</span></div>
            <button className="toolbar-button" disabled={busy != null} onClick={() => confirmAction("settings")}>Clear</button>
          </article>
          <article className="privacy-action-row">
            <ShoppingCart size={18} />
            <div><strong>Delete saved market data</strong><span>Remove your deal watches and personal alert history. Public market history remains.</span></div>
            <button className="toolbar-button danger" disabled={busy != null} onClick={() => confirmAction("market-data")}>Delete</button>
          </article>
          <article className="privacy-action-row">
            <BarChart3 size={18} />
            <div><strong>Withdraw analytics and clear this browser</strong><span>Remove identifiable analytics for this browser/session and ask again before any future analytics collection.</span></div>
            <button className="toolbar-button" disabled={busy != null} onClick={() => confirmAction("analytics")}>Clear</button>
          </article>
          <article className="privacy-action-row privacy-account-delete">
            <Trash2 size={18} />
            <div><strong>Delete my account and personal data</strong><span>Requires a recent Discord reauthentication and exact typed confirmation. This does not remove a separate administrator login.</span></div>
            <button className="toolbar-button danger" disabled={busy != null} onClick={onDeleteAccount}>Delete account</button>
          </article>
        </div>
      )}

      <article className="privacy-action-row privacy-browser-reset">
        <RotateCcw size={18} />
        <div><strong>Reset browser-only settings</strong><span>Clear local app preferences stored only in this browser.</span></div>
        <button className="toolbar-button" disabled={busy != null} onClick={() => confirmAction("browser")}>Reset</button>
      </article>

      {confirming ? (
        <div className="privacy-confirm-panel" role="alertdialog" aria-labelledby="privacy-confirm-title">
          <Trash2 size={18} />
          <div>
            <strong id="privacy-confirm-title">{ACTION_COPY[confirming].title}</strong>
            <span>{ACTION_COPY[confirming].detail}</span>
          </div>
          <div>
            <button className="toolbar-button danger" disabled={busy != null} onClick={executeConfirmedAction}>{busy ? "Working…" : ACTION_COPY[confirming].confirm}</button>
            <button className="toolbar-button" disabled={busy != null} onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {status ? <p className="privacy-status" role="status">{status}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
