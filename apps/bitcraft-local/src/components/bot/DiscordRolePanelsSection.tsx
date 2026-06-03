import React from "react";
import { Hash, MessageCircle, Settings, UserPlus, X } from "lucide-react";

type AnyRecord = Record<string, any>;
type DiscordRoleOption = { key: string; label: string; roleId: string; emoji: string };
type DiscordRolePanel = { key: string; label: string; channelId: string; messageId: string; title: string; description: string; mode: "single" | "multi"; showHelperText: boolean; options: DiscordRoleOption[] };
type DiscordWelcomeFlow = { enabled: boolean; channelId: string; messageId: string; title: string; message: string; readyRoleId: string; showNextStep: boolean };

const ROLE_EMOJI_PRESETS = [
  ["", "None/custom"],
  ["🌲", "Forestry"],
  ["🪚", "Carpentry"],
  ["🪨", "Masonry"],
  ["⛏️", "Mining"],
  ["🔨", "Smithing"],
  ["🪶", "Scholar"],
  ["🐾", "Leatherworking"],
  ["🧵", "Tailoring"],
  ["🌱", "Farming"],
  ["🎣", "Fishing"],
  ["🍳", "Cooking"],
  ["🍄", "Foraging"],
  ["🏹", "Hunting"],
  ["✅", "Ready"],
  ["🎉", "Event"],
  ["🌍", "Timezone"],
] as const;

function roleEmojiPresetValue(value: string) {
  return ROLE_EMOJI_PRESETS.some(([emoji]) => emoji === value) ? value : "";
}

function optionStatusLabel(panel: DiscordRolePanel) {
  return `${panel.options.length} options | ${panel.mode === "single" ? "Single select" : "Multi select"} | ${panel.channelId ? "Channel set" : "No channel"}`;
}

export function DiscordRolePanelsSection({
  expandedRoleOption,
  roleById,
  roleIdSelect,
  rolePanels,
  channelIdSelect,
  onAddOption,
  onPostPanel,
  onPostWelcome,
  onRemoveOption,
  onSetExpandedRoleOption,
  onUpdateOption,
  onUpdatePanel,
  onUpdateWelcomeFlow,
  welcomeFlow,
}: {
  expandedRoleOption: string | null;
  roleById: (id: string) => AnyRecord | undefined;
  roleIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  rolePanels: DiscordRolePanel[];
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  onAddOption: (panelKey: string) => void;
  onPostPanel: (panelKey: string, panelLabel: string) => void;
  onPostWelcome: () => void;
  onRemoveOption: (panelKey: string, optionKey: string) => void;
  onSetExpandedRoleOption: (value: string | null) => void;
  onUpdateOption: (panelKey: string, optionKey: string, patch: Partial<DiscordRoleOption>) => void;
  onUpdatePanel: (panelKey: string, patch: Partial<DiscordRolePanel>) => void;
  onUpdateWelcomeFlow: (patch: Partial<DiscordWelcomeFlow>) => void;
  roleStatusText: (role: AnyRecord | undefined | null) => string;
  welcomeFlow: DiscordWelcomeFlow;
}) {
  return (
    <section className="form-card discord-channel-card bot-community-card">
      <h3><UserPlus size={17} /> Community Role Panels</h3>
      <p className="legend">Create reusable self-assign role messages for access, professions, events and timezones. Posting a panel updates its existing Discord message when one has already been posted.</p>
      <div className="discord-panel-grid">{rolePanels.map((panel) => (
        <details className="discord-panel-editor" key={panel.key} open={panel.key === rolePanels[0]?.key}>
          <summary>
            <span>
              <strong>{panel.label}</strong>
              <small>{optionStatusLabel(panel)}</small>
            </span>
          </summary>
          <div className="discord-panel-editor-body">
            <div className="split-header">
              <h4>{panel.label}</h4>
              <button className="toolbar-button bot-post-button" onClick={() => onPostPanel(panel.key, panel.label)}><MessageCircle size={14} /> Post/Update</button>
            </div>
            <label className="field"><span>Channel</span>{channelIdSelect(panel.channelId, (value) => onUpdatePanel(panel.key, { channelId: value }))}</label>
            <label className="field"><span>Title</span><input value={panel.title} onChange={(event) => onUpdatePanel(panel.key, { title: event.target.value })} /></label>
            <label className="field"><span>Description</span><textarea value={panel.description} onChange={(event) => onUpdatePanel(panel.key, { description: event.target.value })} /></label>
            <label className="field"><span>Mode</span><select value={panel.mode} onChange={(event) => onUpdatePanel(panel.key, { mode: event.target.value === "single" ? "single" : "multi" })}><option value="multi">Multi select</option><option value="single">Single select</option></select></label>
            <label className="toggle-line">
              <span>{panel.mode === "single" ? "Show Selection section" : "Show Selections section"}</span>
              <input type="checkbox" checked={panel.showHelperText !== false} onChange={(event) => onUpdatePanel(panel.key, { showHelperText: event.target.checked })} />
            </label>
            <div className="role-panel-preview">
              <span className="discord-preview-label">Discord Preview</span>
              <div className="discord-preview-message">
                <div className="discord-preview-avatar">T</div>
                <div className="discord-preview-body">
                  <div className="discord-preview-author">Timbersteel Trade <small>APP</small></div>
                  <div className="discord-preview-embed">
                    <strong>{panel.title || panel.label}</strong>
                    <p>{panel.description || "No description set."}</p>
                    {panel.showHelperText !== false ? <dl>
                      <dt>{panel.mode === "single" ? "Selection" : "Selections"}</dt>
                      <dd>{panel.mode === "single" ? "Only one role from this panel can be active at once." : "Click again to remove a role."}</dd>
                    </dl> : null}
                  </div>
                  <div className="discord-preview-buttons">{panel.options.map((option) => <span key={option.key}>{option.emoji ? <b>{option.emoji}</b> : null}{option.label || "Unnamed"}</span>)}</div>
                </div>
              </div>
            </div>
            <div className="role-option-list">
              {panel.options.map((option) => {
                const editKey = `${panel.key}:${option.key}`;
                const role = roleById(option.roleId);
                const isExpanded = expandedRoleOption === editKey;
                const status = role ? "Linked" : option.roleId ? "Unknown role" : "No role";
                return <div className={`role-option-card ${isExpanded ? "expanded" : ""}`} key={option.key}>
                  <div className="role-option-summary">
                    <span className="role-option-emoji">{option.emoji || <Hash size={15} />}</span>
                    <div>
                      <strong>{option.label || "Unnamed role"}</strong>
                      <small>{role?.name ?? (option.roleId ? "Role not found in latest sync" : "Choose a Discord role")}</small>
                    </div>
                    <span className={`role-option-status ${role ? "ok" : option.roleId ? "warn" : ""}`}>{status}</span>
                    <div className="role-option-actions">
                      <button className="icon-button" onClick={() => onSetExpandedRoleOption(isExpanded ? null : editKey)} title={isExpanded ? "Close editor" : "Edit option"}><Settings size={14} /></button>
                      <button className="icon-button danger" onClick={() => onRemoveOption(panel.key, option.key)} title="Remove option"><X size={14} /></button>
                    </div>
                  </div>
                  {isExpanded ? <div className="role-option-edit">
                    <label className="field"><span>Emoji preset</span><select value={roleEmojiPresetValue(option.emoji)} onChange={(event) => onUpdateOption(panel.key, option.key, { emoji: event.target.value })} title="Emoji preset">
                      {ROLE_EMOJI_PRESETS.map(([emoji, label]) => <option key={label} value={emoji}>{emoji ? `${emoji} ${label}` : label}</option>)}
                    </select></label>
                    <label className="field"><span>Custom emoji</span><input value={option.emoji} onChange={(event) => onUpdateOption(panel.key, option.key, { emoji: event.target.value })} placeholder="Optional" title="Custom emoji" /></label>
                    <label className="field"><span>Button label</span><input value={option.label} onChange={(event) => onUpdateOption(panel.key, option.key, { label: event.target.value })} placeholder="Label" /></label>
                    <label className="field"><span>Discord role</span>{roleIdSelect(option.roleId, (value) => onUpdateOption(panel.key, option.key, { roleId: value }))}</label>
                    {option.roleId ? <p className="role-option-meta">Role ID: {option.roleId}</p> : null}
                  </div> : null}
                </div>;
              })}
              <button className="toolbar-button" onClick={() => onAddOption(panel.key)}><UserPlus size={14} /> Add option</button>
            </div>
            {panel.messageId ? <p className="legend">Message ID: {panel.messageId}</p> : null}
          </div>
        </details>
      ))}</div>
      <details className="discord-panel-editor welcome-flow-editor">
        <summary>
          <span>
            <strong>Welcome Flow</strong>
            <small>{welcomeFlow.channelId ? "Channel set" : "No channel"} | {welcomeFlow.readyRoleId ? "Ready role set" : "No ready role"}</small>
          </span>
        </summary>
        <div className="discord-panel-editor-body">
          <div className="split-header"><h4>Welcome Flow</h4><button className="toolbar-button bot-post-button" onClick={onPostWelcome}><MessageCircle size={14} /> Post/Update</button></div>
          <label className="field"><span>Welcome channel</span>{channelIdSelect(welcomeFlow.channelId, (value) => onUpdateWelcomeFlow({ channelId: value }))}</label>
          <label className="field"><span>Title</span><input value={welcomeFlow.title} onChange={(event) => onUpdateWelcomeFlow({ title: event.target.value })} /></label>
          <label className="field"><span>Message</span><textarea value={welcomeFlow.message} onChange={(event) => onUpdateWelcomeFlow({ message: event.target.value })} /></label>
          <label className="field"><span>Ready role</span>{roleIdSelect(welcomeFlow.readyRoleId, (value) => onUpdateWelcomeFlow({ readyRoleId: value }))}</label>
          <label className="toggle-line">
            <span>Show Next step section</span>
            <input type="checkbox" checked={welcomeFlow.showNextStep !== false} onChange={(event) => onUpdateWelcomeFlow({ showNextStep: event.target.checked })} />
          </label>
          <div className="role-panel-preview">
            <span className="discord-preview-label">Discord Preview</span>
            <div className="discord-preview-message">
              <div className="discord-preview-avatar">T</div>
              <div className="discord-preview-body">
                <div className="discord-preview-author">Timbersteel Trade <small>APP</small></div>
                <div className="discord-preview-embed">
                  <strong>{welcomeFlow.title || "Welcome"}</strong>
                  <p>{welcomeFlow.message || "No welcome message set."}</p>
                  {welcomeFlow.showNextStep !== false ? <dl>
                    <dt>Next step</dt>
                    <dd>{welcomeFlow.readyRoleId ? "Click Ready when you have read the welcome steps." : "Configure a Ready role if you want the button to assign access."}</dd>
                  </dl> : null}
                </div>
                <div className="discord-preview-buttons"><span><b>✅</b>Ready</span></div>
              </div>
            </div>
          </div>
          {welcomeFlow.messageId ? <p className="legend">Message ID: {welcomeFlow.messageId}</p> : null}
        </div>
      </details>
    </section>
  );
}
