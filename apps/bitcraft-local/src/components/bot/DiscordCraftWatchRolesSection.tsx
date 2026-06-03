import React from "react";
import { Bell } from "lucide-react";

type DiscordRole = Record<string, any>;

function professionLabel(key: string) {
  return key === "leatherworking" ? "Leatherworking" : `${key[0].toUpperCase()}${key.slice(1)}`;
}

export function DiscordCraftWatchRolesSection({
  craftRoleKeys,
  craftRoles,
  discoveredRoles,
  memberCountWarning,
  roleIdSelect,
  roleStatusText,
  updateDiscordRole,
}: {
  botOnly: boolean;
  craftRoleKeys: readonly string[];
  craftRoles: Record<string, string> | undefined;
  discoveredRoles: DiscordRole[];
  memberCountWarning: React.ReactNode;
  roleIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  roleStatusText: (role: DiscordRole) => string;
  updateDiscordRole: (key: string, value: string) => void;
}) {
  return (
    <section className="form-card discord-channel-card bot-routing-card">
      <div className="split-header">
        <div>
          <h3>
            <Bell size={17} /> Craft Watch Roles
          </h3>
          <p className="legend">Role IDs used by watch buttons and craft pings</p>
        </div>
      </div>
      <p className="legend">
        Choose roles discovered by the bot. When someone clicks Watch on a craft notification, the bot toggles the matching role on that Discord member.
      </p>
      {!discoveredRoles.length ? <div className="error">No Discord roles synced yet. Use Setup &gt; Sync Discord Server.</div> : null}
      {memberCountWarning}
      <div className="craft-channel-grid">
        {craftRoleKeys.map((key) => {
          const roleId = craftRoles?.[key] ?? "";
          const role = discoveredRoles.find((entry) => String(entry.id) === String(roleId));
          return (
            <label className="field" key={key}>
              <span>
                {professionLabel(key)}
                <small>{role ? roleStatusText(role) : roleId ? "Role not found in latest sync" : "No role selected"}</small>
              </span>
              {roleIdSelect(roleId, (value) => updateDiscordRole(key, value))}
            </label>
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
