import React from "react";
import { MessageCircle, Palette, RefreshCw, X } from "lucide-react";

type DiscordRole = Record<string, any>;
type ColourRole = Record<string, any>;

export function DiscordColourRolesSection({
  addDiscordColourRole,
  channelIdSelect,
  colourRoles,
  colourRolesChannelId,
  discoveredRoles,
  discordColorToHex,
  hexToDiscordColor,
  memberCountWarning,
  onPostSelector,
  onSyncRoles,
  removeDiscordColourRole,
  roleStatusText,
  updateDiscord,
  updateDiscordColourRole,
}: {
  addDiscordColourRole: () => void;
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  colourRoles: ColourRole[];
  colourRolesChannelId: string;
  discoveredRoles: DiscordRole[];
  discordColorToHex: (value: unknown) => string;
  hexToDiscordColor: (value: string) => number;
  memberCountWarning: React.ReactNode;
  onPostSelector: () => void;
  onSyncRoles: () => void;
  removeDiscordColourRole: (key: string) => void;
  roleStatusText: (role: DiscordRole) => string;
  updateDiscord: (patch: Record<string, unknown>) => void;
  updateDiscordColourRole: (key: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <section className="form-card discord-channel-card bot-colour-card">
      <div className="split-header">
        <h3>
          <Palette size={17} /> Colour Roles
        </h3>
        <div className="toolbar">
          <button className="toolbar-button" onClick={addDiscordColourRole}>
            <Palette size={15} /> Add Colour
          </button>
          <button className="toolbar-button" onClick={onSyncRoles}>
            <RefreshCw size={15} /> Create/Sync Roles
          </button>
          <button className="toolbar-button primary bot-post-button" onClick={onPostSelector}>
            <MessageCircle size={15} /> Post Selector
          </button>
        </div>
      </div>
      <p className="legend">
        Define the name colours the bot should own. Create/sync will create missing Discord roles, update names and colours, remove deleted managed roles,
        and keep them below Mosswick where Discord allows it.
      </p>
      {memberCountWarning}
      <label className="field colour-channel-field">
        <span>Selector channel</span>
        {channelIdSelect(colourRolesChannelId, (value) => updateDiscord({ colourRolesChannelId: value }))}
      </label>
      <div className="colour-role-grid">
        {colourRoles.map((entry) => {
          const role = discoveredRoles.find((item) => String(item.id) === String(entry.roleId));
          const hex = discordColorToHex(entry.color);
          return (
            <div className="colour-role-editor" key={entry.key}>
              <div className="colour-role-sample" style={{ borderColor: hex, background: `${hex}22` }}>
                <span className="role-swatch" style={{ backgroundColor: hex }} />
                <input
                  aria-label={`${entry.label} name`}
                  value={entry.label}
                  onChange={(event) => updateDiscordColourRole(entry.key, { label: event.target.value, roleName: event.target.value })}
                />
                <small>{entry.roleId ? role ? roleStatusText(role) : `Synced role ${entry.roleId}` : "Not synced yet"}</small>
              </div>
              <label className="colour-picker-field">
                <input
                  type="color"
                  value={hex}
                  onChange={(event) => updateDiscordColourRole(entry.key, { color: hexToDiscordColor(event.target.value) })}
                />
                <code>{hex}</code>
              </label>
              <button className="icon-button danger" title={`Delete ${entry.label}`} onClick={() => removeDiscordColourRole(entry.key)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {!colourRoles.length ? <div className="error">No colour roles configured. Add a colour, then create/sync roles.</div> : null}
    </section>
  );
}
