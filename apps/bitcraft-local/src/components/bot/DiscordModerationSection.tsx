import React from "react";
import { Ban, CheckCircle2, Clock, RefreshCw, Shield, Trash2, User, Users } from "lucide-react";

type ModerationDraft = Record<string, string>;

export function DiscordModerationSection({
  channelIdSelect,
  confirmModeration,
  discordToolResult,
  discoveredMemberCount,
  memberIdSelect,
  moderationDraft,
  onBan,
  onKick,
  onLoadBans,
  onPurge,
  onRemoveTimeout,
  onSync,
  onTempBan,
  onTimeout,
  onUnban,
  renderDiscordToolResult,
  setModerationDraft,
}: {
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  confirmModeration: (message: string) => boolean;
  discordToolResult: Record<string, any> | null;
  discoveredMemberCount: number;
  memberIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  moderationDraft: ModerationDraft;
  onBan: () => void;
  onKick: () => void;
  onLoadBans: () => void;
  onPurge: () => void;
  onRemoveTimeout: () => void;
  onSync: () => void;
  onTempBan: () => void;
  onTimeout: () => void;
  onUnban: () => void;
  renderDiscordToolResult: (result: Record<string, any>) => React.ReactNode;
  setModerationDraft: React.Dispatch<React.SetStateAction<ModerationDraft>>;
}) {
  return (
    <section className="form-card discord-channel-card bot-moderation-card">
      <div className="split-header">
        <div>
          <h3>
            <Shield size={17} /> Moderation
          </h3>
          <p className="legend">Admin-only Discord actions for member timeouts, kicks, bans, unbans and channel cleanup.</p>
        </div>
        <button className="toolbar-button" onClick={onSync}>
          <RefreshCw size={15} /> Sync Server
        </button>
      </div>
      {!discoveredMemberCount ? (
        <div className="error">No Discord members synced yet. Use Setup &gt; Sync Discord Server. You can still paste a user ID manually below.</div>
      ) : null}
      <div className="moderation-grid">
        <div className="discord-panel-editor moderation-panel moderation-member-panel">
          <h4>
            <Users size={15} /> Member Actions
          </h4>
          <p className="legend">Timeout is reversible. Kick and ban are stronger actions and will be recorded in Discord audit logs.</p>
          <label className="field">
            <span>Member</span>
            {memberIdSelect(moderationDraft.userId, (value) => setModerationDraft((current) => ({ ...current, userId: value })))}
          </label>
          <label className="field">
            <span>Manual user ID</span>
            <input
              value={moderationDraft.userId}
              onChange={(event) => setModerationDraft((current) => ({ ...current, userId: event.target.value }))}
              placeholder="Paste Discord user ID if not in the list"
            />
          </label>
          <label className="field">
            <span>Reason</span>
            <textarea
              value={moderationDraft.reason}
              onChange={(event) => setModerationDraft((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Shown in Discord audit log"
            />
          </label>
          <div className="moderation-action-grid">
            <label className="field">
              <span>Timeout minutes</span>
              <input
                type="number"
                min={0}
                max={40320}
                value={moderationDraft.timeoutMinutes}
                onChange={(event) => setModerationDraft((current) => ({ ...current, timeoutMinutes: event.target.value }))}
              />
            </label>
            <button className="toolbar-button primary" disabled={!moderationDraft.userId.trim()} onClick={onTimeout}>
              <Clock size={14} /> Timeout
            </button>
            <button className="toolbar-button" disabled={!moderationDraft.userId.trim()} onClick={onRemoveTimeout}>
              <Clock size={14} /> Remove Timeout
            </button>
            <button
              className="toolbar-button danger"
              disabled={!moderationDraft.userId.trim()}
              onClick={() => confirmModeration("Kick this Discord member from the server?") && onKick()}
            >
              <User size={14} /> Kick
            </button>
            <label className="field">
              <span>Delete message seconds</span>
              <input
                type="number"
                min={0}
                max={604800}
                value={moderationDraft.deleteMessageSeconds}
                onChange={(event) => setModerationDraft((current) => ({ ...current, deleteMessageSeconds: event.target.value }))}
              />
            </label>
            <button
              className="toolbar-button danger"
              disabled={!moderationDraft.userId.trim()}
              onClick={() => confirmModeration("Ban this Discord member from the server?") && onBan()}
            >
              <Ban size={14} /> Ban
            </button>
            <label className="field">
              <span>Temporary ban hours</span>
              <input
                type="number"
                min={1}
                max={8760}
                value={moderationDraft.timeoutMinutes}
                onChange={(event) => setModerationDraft((current) => ({ ...current, timeoutMinutes: event.target.value }))}
              />
            </label>
            <button
              className="toolbar-button danger"
              disabled={!moderationDraft.userId.trim()}
              onClick={() => confirmModeration("Temporarily ban this Discord member?") && onTempBan()}
            >
              <Ban size={14} /> Temp Ban
            </button>
          </div>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <Trash2 size={15} /> Channel Cleanup
          </h4>
          <p className="legend">Deletes the newest messages in a channel. Discord bulk delete only allows messages newer than 14 days.</p>
          <label className="field">
            <span>Channel</span>
            {channelIdSelect(moderationDraft.channelId, (value) => setModerationDraft((current) => ({ ...current, channelId: value })))}
          </label>
          <label className="field">
            <span>Message limit</span>
            <input
              type="number"
              min={1}
              max={100}
              value={moderationDraft.purgeLimit}
              onChange={(event) => setModerationDraft((current) => ({ ...current, purgeLimit: event.target.value }))}
            />
          </label>
          <button
            className="toolbar-button danger"
            disabled={!moderationDraft.channelId.trim()}
            onClick={() => confirmModeration("Delete the newest messages from this Discord channel?") && onPurge()}
          >
            <Trash2 size={14} /> Purge Messages
          </button>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <Ban size={15} /> Ban List
          </h4>
          <p className="legend">Review current bans or remove a ban by Discord user ID.</p>
          <label className="field">
            <span>User ID to unban</span>
            <input
              value={moderationDraft.unbanUserId}
              onChange={(event) => setModerationDraft((current) => ({ ...current, unbanUserId: event.target.value }))}
              placeholder="Discord user ID"
            />
          </label>
          <button className="toolbar-button" onClick={onLoadBans}>
            <RefreshCw size={14} /> Load Ban List
          </button>
          <button
            className="toolbar-button danger"
            disabled={!(moderationDraft.unbanUserId || moderationDraft.userId).trim()}
            onClick={() => confirmModeration("Remove this Discord server ban?") && onUnban()}
          >
            <CheckCircle2 size={14} /> Unban User
          </button>
        </div>
      </div>
      {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
    </section>
  );
}
