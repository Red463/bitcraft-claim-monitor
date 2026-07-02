import React from "react";
import { createPortal } from "react-dom";
import { Bell, Edit3, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { POPUP_MODES, POPUP_PAGE_OPTIONS, POPUP_TYPES, popupPageLabel, type AppPopup, type PopupMode, type PopupPage, type PopupType } from "../../popups/appPopups";
import type { AnyRecord } from "../../main-app-data";

const EMPTY_DRAFT = { id: "", title: "", message: "", type: "info" as PopupType, mode: "oneTime" as PopupMode, page: "any" as PopupPage, enabled: true, hasExpiry: false, expiresAt: "" };

type PopupDraft = typeof EMPTY_DRAFT;

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

function popupModeLabel(mode: PopupMode) {
  return mode === "oneTime" ? "One-time OK" : "Repeat until do not show again";
}

function popupTypeLabel(type: PopupType) {
  return type[0].toUpperCase() + type.slice(1);
}

function popupExpiryLabel(popup: AppPopup) {
  return popup.expiresAt ? `Expires ${popup.expiresAt}` : "No expiry";
}

function draftFromPopup(popup?: AppPopup): PopupDraft {
  return popup ? { id: popup.id, title: popup.title, message: popup.message, type: popup.type, mode: popup.mode, page: popup.page, enabled: popup.enabled, hasExpiry: Boolean(popup.expiresAt), expiresAt: popup.expiresAt } : EMPTY_DRAFT;
}

export function AdminPopupsSection({ api }: AdminPopupsSectionProps) {
  const [popups, setPopups] = React.useState<AppPopup[]>([]);
  const [editorDraft, setEditorDraft] = React.useState<PopupDraft>(EMPTY_DRAFT);
  const [editingPopupIndex, setEditingPopupIndex] = React.useState<number | null>(null);
  const [popupEditorOpen, setPopupEditorOpen] = React.useState(false);
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

  function openPopupEditor(index: number | null = null) {
    setEditingPopupIndex(index);
    setEditorDraft(draftFromPopup(index === null ? undefined : popups[index]));
    setPopupEditorOpen(true);
    setMessage(null);
  }

  function closePopupEditor() {
    setPopupEditorOpen(false);
    setEditingPopupIndex(null);
    setEditorDraft(EMPTY_DRAFT);
  }

  function savePopupDraft() {
    const title = editorDraft.title.trim();
    const body = editorDraft.message.trim();
    const expiresAt = editorDraft.hasExpiry ? editorDraft.expiresAt.trim() : "";
    if (!title || !body) {
      setMessage("Add a title and message before saving this popup.");
      return;
    }
    if (editorDraft.hasExpiry && !expiresAt) {
      setMessage("Choose an expiry date or turn expiry off before saving this popup.");
      return;
    }
    const id = editorDraft.id.trim() || popupIdFromTitle(title);
    const next = stampPopup({ id, title, message: body, type: editorDraft.type, mode: editorDraft.mode, page: editorDraft.page, expiresAt, enabled: editorDraft.enabled, updatedAt: "" });
    setPopups((current) => {
      if (editingPopupIndex === null) return [...current.filter((popup) => popup.id !== id), next];
      return current.flatMap((popup, index) => {
        if (index === editingPopupIndex) return [next];
        if (popup.id === id) return [];
        return [popup];
      });
    });
    closePopupEditor();
    setMessage(editingPopupIndex === null ? "Popup added. Save changes to publish it." : "Popup updated. Save changes to publish it.");
  }

  function togglePopup(index: number, enabled: boolean) {
    setPopups((current) => current.map((popup, currentIndex) => currentIndex === index ? stampPopup({ ...popup, enabled }) : popup));
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
          <p className="legend">Publish short in-app messages without filling the admin page with editing forms.</p>
        </div>
        <div className="toolbar">
          <button className="toolbar-button" disabled={busy} onClick={refresh}><RefreshCw size={14} /> Refresh</button>
          <button className="toolbar-button" onClick={() => openPopupEditor()}><Plus size={14} /> New Popup</button>
          <button className="toolbar-button primary" disabled={busy} onClick={savePopups}><Save size={14} /> Save Popups</button>
        </div>
      </div>
      {message ? <div className={`admin-message ${message.includes("saved") || message.includes("added") || message.includes("updated") ? "success" : "info"}`}>{message}</div> : null}
      <div className="popup-admin-table" role="table" aria-label="Configured app popups">
        <div className="popup-admin-table-row header" role="row">
          <span>Status</span>
          <span>Title</span>
          <span>Type</span>
          <span>Dismissal</span>
          <span>Message</span>
          <span>Actions</span>
        </div>
        {popups.length ? popups.map((popup, index) => (
          <div className={`popup-admin-table-row ${popup.enabled ? "" : "is-disabled"}`} role="row" key={popup.id}>
            <label className="toggle-line compact-toggle"><span>{popup.enabled ? "Enabled" : "Disabled"}</span><input type="checkbox" checked={popup.enabled} onChange={(event) => togglePopup(index, event.target.checked)} /></label>
            <span className="popup-title-cell"><strong>{popup.title}</strong><small>{popupPageLabel(popup.page)} - {popupExpiryLabel(popup)}</small></span>
            <span className={`popup-type-badge ${popup.type}`}>{popupTypeLabel(popup.type)}</span>
            <span>{popupModeLabel(popup.mode)}</span>
            <small className="popup-message-preview">{popup.message}</small>
            <div className="toolbar popup-row-actions">
              <button className="toolbar-button" onClick={() => openPopupEditor(index)}><Edit3 size={14} /> Edit</button>
              <button className="toolbar-button danger" title="Remove this popup after saving." onClick={() => setPopups((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={14} /> Remove</button>
            </div>
          </div>
        )) : <div className="empty-state"><Bell size={28} /><strong>No popups configured</strong><span>Create an app popup when you need an announcement, warning, or reusable tip.</span></div>}
      </div>
      {popupEditorOpen ? createPortal(
        <div className="admin-modal-backdrop" role="presentation" onClick={closePopupEditor}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="popup-editor-title" onClick={(event) => event.stopPropagation()}>
            <div className="split-header">
              <div>
                <h3 id="popup-editor-title"><Bell size={17} /> {editingPopupIndex === null ? "New Popup" : "Edit Popup"}</h3>
                <p className="legend">Choose the content, page, expiry, and dismissal behavior users will see in the app.</p>
              </div>
              <button className="toolbar-button icon-only" aria-label="Close popup editor" onClick={closePopupEditor}><X size={16} /></button>
            </div>
            <div className="popup-editor-grid">
              <label className="field"><span>Key</span><input value={editorDraft.id} onChange={(event) => setEditorDraft({ ...editorDraft, id: event.target.value })} placeholder="auto from title" /></label>
              <label className="field"><span>Title</span><input value={editorDraft.title} onChange={(event) => setEditorDraft({ ...editorDraft, title: event.target.value })} /></label>
              <label className="field"><span>Type</span><select value={editorDraft.type} onChange={(event) => setEditorDraft({ ...editorDraft, type: event.target.value as PopupType })}>{POPUP_TYPES.map((type) => <option key={type} value={type}>{popupTypeLabel(type)}</option>)}</select></label>
              <label className="field"><span>Dismissal</span><select value={editorDraft.mode} onChange={(event) => setEditorDraft({ ...editorDraft, mode: event.target.value as PopupMode })}>{POPUP_MODES.map((mode) => <option key={mode} value={mode}>{popupModeLabel(mode)}</option>)}</select></label>
              <label className="field"><span>Show on page</span><select value={editorDraft.page} onChange={(event) => setEditorDraft({ ...editorDraft, page: event.target.value as PopupPage })}>{POPUP_PAGE_OPTIONS.map(([page, label]) => <option key={page} value={page}>{label}</option>)}</select></label>
              <label className="toggle-line"><span>Expiry date</span><input type="checkbox" checked={editorDraft.hasExpiry} onChange={(event) => setEditorDraft({ ...editorDraft, hasExpiry: event.target.checked, expiresAt: event.target.checked ? editorDraft.expiresAt : "" })} /></label>
              {editorDraft.hasExpiry ? <label className="field"><span>Expires on</span><input type="date" value={editorDraft.expiresAt} onChange={(event) => setEditorDraft({ ...editorDraft, expiresAt: event.target.value })} /></label> : null}
              <label className="field popup-message-field"><span>Message</span><textarea value={editorDraft.message} onChange={(event) => setEditorDraft({ ...editorDraft, message: event.target.value })} /></label>
              <label className="toggle-line compact-toggle"><span>Enabled</span><input type="checkbox" checked={editorDraft.enabled} onChange={(event) => setEditorDraft({ ...editorDraft, enabled: event.target.checked })} /></label>
            </div>
            <div className={`popup-editor-preview app-popup-${editorDraft.type}`}>
              <strong>{editorDraft.title.trim() || "Popup title"}</strong>
              <span>{editorDraft.message.trim() || "Popup message preview"}</span>
              <small>{popupPageLabel(editorDraft.page)} - {editorDraft.hasExpiry && editorDraft.expiresAt ? `Expires ${editorDraft.expiresAt}` : "No expiry"} - {popupModeLabel(editorDraft.mode)}</small>
            </div>
            <div className="modal-actions">
              <button className="toolbar-button" onClick={closePopupEditor}>Cancel</button>
              <button className="toolbar-button primary" onClick={savePopupDraft}><Save size={14} /> Save Popup</button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
