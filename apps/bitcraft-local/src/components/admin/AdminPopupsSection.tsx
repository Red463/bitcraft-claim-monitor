import React from "react";
import { Bell, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { POPUP_MODES, POPUP_TYPES, type AppPopup, type PopupMode, type PopupType } from "../../popups/appPopups";
import type { AnyRecord } from "../../main-app-data";

const EMPTY_DRAFT = { id: "", title: "", message: "", type: "info" as PopupType, mode: "oneTime" as PopupMode, enabled: true };

type AdminPopupsSectionProps = {
  api: (path: string, options?: RequestInit) => Promise<AnyRecord>;
};

function popupIdFromTitle(title: string) {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || `popup-${Date.now()}`;
}

function stampPopup(popup: AppPopup): AppPopup {
  return { ...popup, updatedAt: new Date().toISOString() };
}

export function AdminPopupsSection({ api }: AdminPopupsSectionProps) {
  const [popups, setPopups] = React.useState<AppPopup[]>([]);
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const result = await api("/admin/popups");
      setPopups(result.popups ?? []);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  function addPopup() {
    const title = draft.title.trim();
    const body = draft.message.trim();
    if (!title || !body) {
      setMessage("Add a title and message before adding a popup.");
      return;
    }
    const id = draft.id.trim() || popupIdFromTitle(title);
    const next = stampPopup({ id, title, message: body, type: draft.type, mode: draft.mode, enabled: draft.enabled, updatedAt: "" });
    setPopups((current) => [...current.filter((popup) => popup.id !== id), next]);
    setDraft(EMPTY_DRAFT);
    setMessage("Popup added. Save changes to publish it.");
  }

  function updatePopup(index: number, patch: Partial<AppPopup>) {
    setPopups((current) => current.map((popup, currentIndex) => currentIndex === index ? stampPopup({ ...popup, ...patch }) : popup));
  }

  async function savePopups() {
    setBusy(true);
    try {
      const result = await api("/admin/popups", { method: "PUT", body: JSON.stringify({ popups }) });
      setPopups(result.popups ?? []);
      setMessage("Popup settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card app-popups-card">
      <div className="split-header">
        <div>
          <h3><Bell size={17} /> App Popups</h3>
          <p className="legend">Publish short in-app messages. One-time popups are dismissed with OK; repeatable tips return on the next visit unless users choose Do not show again.</p>
        </div>
        <div className="toolbar">
          <button className="toolbar-button" disabled={busy} onClick={refresh}><RefreshCw size={14} /> Refresh</button>
          <button className="toolbar-button primary" disabled={busy} onClick={savePopups}><Save size={14} /> Save Popups</button>
        </div>
      </div>
      {message ? <div className={`admin-message ${message.includes("saved") || message.includes("added") ? "success" : "info"}`}>{message}</div> : null}
      <div className="popup-builder-grid">
        <label className="field"><span>Key</span><input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="auto from title" /></label>
        <label className="field"><span>Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as PopupType })}>{POPUP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="field"><span>Dismissal</span><select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as PopupMode })}>{POPUP_MODES.map((mode) => <option key={mode} value={mode}>{mode === "oneTime" ? "One-time OK" : "Repeat until do not show again"}</option>)}</select></label>
        <label className="field popup-message-field"><span>Message</span><textarea value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
        <label className="toggle-line compact-toggle"><span>Enabled</span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label>
        <button className="toolbar-button" onClick={addPopup}><Plus size={14} /> Add Popup</button>
      </div>
      <div className="popup-admin-list">
        {popups.length ? popups.map((popup, index) => (
          <article className={`popup-admin-row ${popup.enabled ? "" : "is-disabled"}`} key={popup.id}>
            <div className="popup-admin-controls">
              <label className="toggle-line compact-toggle"><span>{popup.enabled ? "Enabled" : "Disabled"}</span><input type="checkbox" checked={popup.enabled} onChange={(event) => updatePopup(index, { enabled: event.target.checked })} /></label>
              <label className="field"><span>Title</span><input value={popup.title} onChange={(event) => updatePopup(index, { title: event.target.value })} /></label>
              <label className="field"><span>Type</span><select value={popup.type} onChange={(event) => updatePopup(index, { type: event.target.value as PopupType })}>{POPUP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className="field"><span>Dismissal</span><select value={popup.mode} onChange={(event) => updatePopup(index, { mode: event.target.value as PopupMode })}>{POPUP_MODES.map((mode) => <option key={mode} value={mode}>{mode === "oneTime" ? "One-time OK" : "Repeat until do not show again"}</option>)}</select></label>
            </div>
            <label className="field popup-message-field"><span>Message</span><textarea value={popup.message} onChange={(event) => updatePopup(index, { message: event.target.value })} /></label>
            <button className="toolbar-button danger" title="Remove this popup after saving." onClick={() => setPopups((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={14} /> Remove</button>
          </article>
        )) : <p className="legend">No popups are configured yet.</p>}
      </div>
    </section>
  );
}
