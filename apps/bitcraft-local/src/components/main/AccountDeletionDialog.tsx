import React from "react";
import { ExternalLink, ShieldAlert, Trash2, X } from "lucide-react";

import type { UserAuthState } from "../../types/settings";
import { Dialog } from "./Dialog";

const LOCAL_API = "/api/local";

type AccountDeletionDialogProps = {
  auth: UserAuthState;
  onClose: () => void;
  onDeleted: () => void;
};

export function AccountDeletionDialog({ auth, onClose, onDeleted }: AccountDeletionDialogProps) {
  const initiallyReady = new URLSearchParams(window.location.search).get("privacy") === "delete-ready";
  const [reauthenticated, setReauthenticated] = React.useState(initiallyReady);
  const [confirmation, setConfirmation] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [receiptId, setReceiptId] = React.useState("");

  async function beginReauthentication() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${LOCAL_API}/auth/privacy/reauth/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(auth.csrfToken ?? ""),
        },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to start Discord reauthentication");
      window.location.assign(body.authorizeUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start Discord reauthentication");
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${LOCAL_API}/auth/privacy/account`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(auth.csrfToken ?? ""),
        },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.code === "recent_discord_reauthentication_required") setReauthenticated(false);
        throw new Error(body.error ?? "Unable to delete your account");
      }
      setReceiptId(String(body.receipt?.receiptId ?? ""));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
      onDeleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="Delete account and personal data"
      description="Irreversible account deletion."
      closeOnBackdrop={false}
      onClose={busy ? () => {} : onClose}
      className="account-deletion-dialog"
      backdropClassName="account-deletion-overlay"
    >
      <header>
        <div><ShieldAlert size={20} /><h2>Delete account and personal data</h2></div>
        {!busy ? <button onClick={onClose} aria-label="Close account deletion"><X size={16} /></button> : null}
      </header>
      {receiptId ? (
        <div className="account-deletion-complete">
          <Trash2 size={24} />
          <h3>Account deletion completed</h3>
          <p>Your app account and linked personal data were removed. A separate administrator identity or Discord server membership was not changed.</p>
          <p>Receipt: <code>{receiptId}</code></p>
          <button className="toolbar-button primary" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <div className="account-deletion-body">
            <p>This permanently removes your ordinary Timbersteel Claim Monitor account, sessions, legal acceptance records, character link, synced preferences, personal market watches and alerts, and supported Discord interaction records.</p>
            <p>Security and moderation records that must be retained are anonymized. A separate administrator login is kept active so deleting your user account cannot lock the service owner out.</p>
            <p>Encrypted backups may retain protected copies until their retention period expires. Recovery safeguards prevent a completed deletion from silently recreating the account after a restore.</p>
            <p>You can <a href="/api/local/auth/privacy/export">download your data first <ExternalLink size={13} /></a>.</p>
            {!reauthenticated ? (
              <div className="account-deletion-reauth">
                <strong>Confirm the Discord account first</strong>
                <span>Discord reauthentication is valid for 10 minutes and must match the account currently signed in.</span>
                <button className="toolbar-button primary" disabled={busy} onClick={() => void beginReauthentication()}>{busy ? "Opening Discord…" : "Reauthenticate with Discord"}</button>
              </div>
            ) : (
              <label className="field account-deletion-confirm">
                <span>Type <strong>DELETE</strong> exactly</span>
                <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
              </label>
            )}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </div>
          <footer>
            {reauthenticated ? <button className="toolbar-button danger" disabled={confirmation !== "DELETE" || busy} onClick={() => void deleteAccount()}><Trash2 size={14} /> {busy ? "Deleting…" : "Permanently delete account"}</button> : null}
            <button className="toolbar-button" disabled={busy} onClick={onClose}>Cancel</button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
