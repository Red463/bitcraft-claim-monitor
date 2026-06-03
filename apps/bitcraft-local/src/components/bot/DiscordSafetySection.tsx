import React from "react";
import { AlertTriangle, CheckCircle2, Clock, Lock, RefreshCw, Search, Shield, Users } from "lucide-react";

type SafetyDraft = Record<string, string>;

export function DiscordSafetySection({
  channelIdSelect,
  confirmModeration,
  discordToolResult,
  onApplySlowmode,
  onCreateAutomodRule,
  onLoadAutomodRules,
  onLockChannel,
  onNicknameReport,
  onSync,
  onUnlockChannel,
  renderDiscordToolResult,
  safetyDraft,
  setSafetyDraft,
}: {
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  confirmModeration: (message: string) => boolean;
  discordToolResult: Record<string, any> | null;
  onApplySlowmode: () => void;
  onCreateAutomodRule: () => void;
  onLoadAutomodRules: () => void;
  onLockChannel: () => void;
  onNicknameReport: () => void;
  onSync: () => void;
  onUnlockChannel: () => void;
  renderDiscordToolResult: (result: Record<string, any>) => React.ReactNode;
  safetyDraft: SafetyDraft;
  setSafetyDraft: React.Dispatch<React.SetStateAction<SafetyDraft>>;
}) {
  return (
    <section className="form-card discord-channel-card bot-moderation-card">
      <div className="split-header">
        <div>
          <h3>
            <Lock size={17} /> Safety Rules
          </h3>
          <p className="legend">Configure Discord-native auto moderation, slowmode, lockdown and nickname checks.</p>
        </div>
        <button className="toolbar-button" onClick={onSync}>
          <RefreshCw size={15} /> Sync Server
        </button>
      </div>
      <div className="moderation-grid">
        <div className="discord-panel-editor moderation-panel moderation-member-panel">
          <h4>
            <AlertTriangle size={15} /> Auto-Moderation Rules
          </h4>
          <p className="legend">
            Creates a Discord-native keyword filter that blocks matching messages and alerts the mod notes channel. Discord always exempts users with
            Administrator or Manage Server permissions, so test with a normal member account.
          </p>
          <label className="field">
            <span>Rule name</span>
            <input value={safetyDraft.ruleName} onChange={(event) => setSafetyDraft((current) => ({ ...current, ruleName: event.target.value }))} />
          </label>
          <label className="field">
            <span>Blocked words or phrases</span>
            <textarea
              value={safetyDraft.blockedWords}
              onChange={(event) => setSafetyDraft((current) => ({ ...current, blockedWords: event.target.value }))}
              placeholder="One per line, or comma separated"
            />
          </label>
          <div className="toolbar">
            <button className="toolbar-button primary" onClick={onCreateAutomodRule}>
              <Shield size={14} /> Create Rule
            </button>
            <button className="toolbar-button" onClick={onLoadAutomodRules}>
              <RefreshCw size={14} /> Load Rules
            </button>
          </div>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <Clock size={15} /> Slowmode
          </h4>
          <label className="field">
            <span>Channel</span>
            {channelIdSelect(safetyDraft.lockdownChannelId, (value) => setSafetyDraft((current) => ({ ...current, lockdownChannelId: value })))}
          </label>
          <label className="field">
            <span>Seconds per message</span>
            <input
              type="number"
              min={0}
              max={21600}
              value={safetyDraft.slowmodeSeconds}
              onChange={(event) => setSafetyDraft((current) => ({ ...current, slowmodeSeconds: event.target.value }))}
            />
          </label>
          <button className="toolbar-button primary" disabled={!safetyDraft.lockdownChannelId} onClick={onApplySlowmode}>
            <Clock size={14} /> Apply Slowmode
          </button>
        </div>
        <div className="discord-panel-editor moderation-panel">
          <h4>
            <Lock size={15} /> Lockdown
          </h4>
          <p className="legend">Locks or unlocks sending for @everyone in the selected channel.</p>
          <label className="field">
            <span>Channel</span>
            {channelIdSelect(safetyDraft.lockdownChannelId, (value) => setSafetyDraft((current) => ({ ...current, lockdownChannelId: value })))}
          </label>
          <button
            className="toolbar-button danger"
            disabled={!safetyDraft.lockdownChannelId}
            onClick={() => confirmModeration("Lock this channel for @everyone?") && onLockChannel()}
          >
            <Lock size={14} /> Lock Channel
          </button>
          <button
            className="toolbar-button"
            disabled={!safetyDraft.lockdownChannelId}
            onClick={() => confirmModeration("Unlock this channel for @everyone?") && onUnlockChannel()}
          >
            <CheckCircle2 size={14} /> Unlock Channel
          </button>
        </div>
      </div>
      <div className="discord-panel-editor moderation-panel">
        <h4>
          <Users size={15} /> Nickname Format Enforcement
        </h4>
        <p className="legend">Reports members whose current nickname/display name does not match the pattern. This does not rename anyone automatically.</p>
        <label className="field">
          <span>Regex pattern</span>
          <input
            value={safetyDraft.nicknamePattern}
            onChange={(event) => setSafetyDraft((current) => ({ ...current, nicknamePattern: event.target.value }))}
          />
        </label>
        <button className="toolbar-button" onClick={onNicknameReport}>
          <Search size={14} /> Run Nickname Report
        </button>
      </div>
      {discordToolResult ? <div className="discord-tool-output">{renderDiscordToolResult(discordToolResult)}</div> : null}
    </section>
  );
}
