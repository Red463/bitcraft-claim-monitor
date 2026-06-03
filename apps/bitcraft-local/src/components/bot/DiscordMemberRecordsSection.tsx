import React from "react";
import { AlertTriangle, FileText, RefreshCw, User } from "lucide-react";

type RecordsDraft = Record<string, string>;

export function DiscordMemberRecordsSection({
  confirmModeration,
  discordToolResult,
  memberIdSelect,
  onAddNote,
  onAddWarning,
  onClearWarnings,
  onLoadCaseLog,
  onLoadNotes,
  onLoadProfile,
  onLoadWarnings,
  onSync,
  recordsDraft,
  renderDiscordToolResult,
  setRecordsDraft,
}: {
  confirmModeration: (message: string) => boolean;
  discordToolResult: Record<string, any> | null;
  memberIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  onAddNote: () => void;
  onAddWarning: () => void;
  onClearWarnings: () => void;
  onLoadCaseLog: () => void;
  onLoadNotes: () => void;
  onLoadProfile: () => void;
  onLoadWarnings: () => void;
  onSync: () => void;
  recordsDraft: RecordsDraft;
  renderDiscordToolResult: (result: Record<string, any>) => React.ReactNode;
  setRecordsDraft: React.Dispatch<React.SetStateAction<RecordsDraft>>;
}) {
  return (
    <section className="form-card discord-channel-card bot-moderation-card">
      <div className="split-header">
        <div>
          <h3>
            <FileText size={17} /> Member Records
          </h3>
          <p className="legend">Warnings, mod notes, case log and profile cards for Discord members.</p>
        </div>
        <button className="toolbar-button" onClick={onSync}>
          <RefreshCw size={15} /> Sync Members
        </button>
      </div>
      <div className="moderation-grid">
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <AlertTriangle size={15} /> Warning System
          </h4>
          <label className="field">
            <span>Member</span>
            {memberIdSelect(recordsDraft.userId, (value) => setRecordsDraft((current) => ({ ...current, userId: value })))}
          </label>
          <label className="field">
            <span>Reason</span>
            <textarea value={recordsDraft.reason} onChange={(event) => setRecordsDraft((current) => ({ ...current, reason: event.target.value }))} />
          </label>
          <button className="toolbar-button primary" disabled={!recordsDraft.userId || !recordsDraft.reason.trim()} onClick={onAddWarning}>
            <AlertTriangle size={14} /> Add Warning
          </button>
          <button className="toolbar-button" disabled={!recordsDraft.userId} onClick={onLoadWarnings}>
            Load Warnings
          </button>
          <button
            className="toolbar-button danger"
            disabled={!recordsDraft.userId}
            onClick={() => confirmModeration("Clear active warnings for this member?") && onClearWarnings()}
          >
            Clear Warnings
          </button>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <FileText size={15} /> Mod Notes
          </h4>
          <label className="field">
            <span>Member</span>
            {memberIdSelect(recordsDraft.userId, (value) => setRecordsDraft((current) => ({ ...current, userId: value })))}
          </label>
          <label className="field">
            <span>Note</span>
            <textarea value={recordsDraft.note} onChange={(event) => setRecordsDraft((current) => ({ ...current, note: event.target.value }))} />
          </label>
          <button className="toolbar-button primary" disabled={!recordsDraft.userId || !recordsDraft.note.trim()} onClick={onAddNote}>
            <FileText size={14} /> Add Note
          </button>
          <button className="toolbar-button" disabled={!recordsDraft.userId} onClick={onLoadNotes}>
            Load Notes
          </button>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <User size={15} /> Member Profile
          </h4>
          <label className="field">
            <span>Member</span>
            {memberIdSelect(recordsDraft.userId, (value) => setRecordsDraft((current) => ({ ...current, userId: value })))}
          </label>
          <button className="toolbar-button" disabled={!recordsDraft.userId} onClick={onLoadProfile}>
            <User size={14} /> Load Profile
          </button>
          <button className="toolbar-button" onClick={onLoadCaseLog}>
            <FileText size={14} /> Load Case Log
          </button>
        </div>
      </div>
      {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
    </section>
  );
}
