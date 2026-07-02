import React from "react";
import { Bell } from "lucide-react";

type DiscordRole = Record<string, any>;
type DiscordEmoji = Record<string, any>;

function professionLabel(key: string) {
  return key === "leatherworking" ? "Leatherworking" : `${key[0].toUpperCase()}${key.slice(1)}`;
}

function normalizeEmojiName(value: string) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function DiscordCraftWatchRolesSection({
  craftRoleKeys,
  craftRoles,
  craftEmojis,
  discoveredRoles,
  discoveredEmojis,
  emojiSelect,
  memberCountWarning,
  roleIdSelect,
  roleStatusText,
  updateDiscordCraftEmoji,
  updateDiscordRole,
}: {
  botOnly: boolean;
  craftRoleKeys: readonly string[];
  craftRoles: Record<string, string> | undefined;
  craftEmojis: Record<string, string> | undefined;
  discoveredRoles: DiscordRole[];
  discoveredEmojis: DiscordEmoji[];
  emojiSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  memberCountWarning: React.ReactNode;
  roleIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  roleStatusText: (role: DiscordRole) => string;
  updateDiscordCraftEmoji: (key: string, value: string) => void;
  updateDiscordRole: (key: string, value: string) => void;
}) {
  return (
    <section className="form-card discord-channel-card bot-routing-card">
      <div className="split-header">
        <div>
          <h3>
            <Bell size={17} /> Craft Watch Roles
          </h3>
          <p className="legend">Role IDs used by watch buttons, craft pings, and profession emojis</p>
        </div>
      </div>
      <p className="legend">
        Choose roles and emojis discovered by the bot. Synced emojis named after a profession are auto-matched; override them here when Discord uses a different emoji.
      </p>
      {!discoveredRoles.length ? <div className="error">No Discord roles synced yet. Use Setup &gt; Sync Discord Server.</div> : null}
      {!discoveredEmojis.length ? <div className="error">No Discord emojis synced yet. Use Setup &gt; Sync Discord Server after adding profession emojis.</div> : null}
      {memberCountWarning}
      <div className="craft-channel-grid">
        {craftRoleKeys.map((key) => {
          const roleId = craftRoles?.[key] ?? "";
          const role = discoveredRoles.find((entry) => String(entry.id) === String(roleId));
          const emoji = craftEmojis?.[key] ?? "";
          const autoEmoji = discoveredEmojis.find((entry) => normalizeEmojiName(String(entry.name ?? "")) === key);
          return (
            <div className="field" key={key}>
              <span>
                {professionLabel(key)}
                <small>{role ? roleStatusText(role) : roleId ? "Role not found in latest sync" : "No role selected"}</small>
                <small>{autoEmoji ? `Auto-match: ${autoEmoji.mention ?? autoEmoji.name}` : "Auto-match: none"}</small>
              </span>
              {roleIdSelect(roleId, (value) => updateDiscordRole(key, value))}
              {emojiSelect(emoji, (value) => updateDiscordCraftEmoji(key, value))}
            </div>
          );
        })}
      </div>
      {discoveredRoles.length ? (
        <div className="role-directory">
          <h4>Discovered roles</h4>
          {discoveredRoles.slice(0, 80).map((role) => (
            <div key={role.id}>
              <span
                className="role-swatch"
                style={{ backgroundColor: role.color ? `#${Number(role.color).toString(16).padStart(6, "0")}` : "transparent" }}
              />{" "}
              <strong>{role.name}</strong>
              <small>
                {role.id} | {roleStatusText(role)}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}