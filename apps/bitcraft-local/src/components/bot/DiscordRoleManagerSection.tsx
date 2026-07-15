import React from "react";
import { RefreshCw, Users } from "lucide-react";
import { ActionButton } from "../main/ActionButton";

type DiscordRole = Record<string, any>;

export function DiscordRoleManagerSection({
  discoveredRoles,
  formatNumber,
  memberCountWarning,
  isPending,
  onCreateRole,
  onSyncRoles,
  roleDraft,
  roleStatusText,
  setRoleDraft,
}: {
  discoveredRoles: DiscordRole[];
  formatNumber: (value: unknown) => string;
  memberCountWarning: React.ReactNode;
  isPending: (key: string) => boolean;
  onCreateRole: () => void;
  onSyncRoles: () => void;
  roleDraft: { name: string; color: string; hoist: boolean; mentionable: boolean };
  roleStatusText: (role: DiscordRole) => string;
  setRoleDraft: React.Dispatch<React.SetStateAction<{ name: string; color: string; hoist: boolean; mentionable: boolean }>>;
}) {
  return (
    <section className="form-card discord-channel-card bot-role-manager-card">
      <div className="split-header">
        <h3>
          <Users size={17} /> Role Manager
        </h3>
        <ActionButton className="toolbar-button" pending={isPending("discord-role-sync")} pendingLabel="Syncing roles..." onClick={onSyncRoles}>
          <RefreshCw size={15} /> Sync Roles
        </ActionButton>
      </div>
      <p className="legend">Create Discord roles directly from the app, then use them in craft watches, colour selectors, role panels or welcome flows.</p>
      <div className="role-manager-layout">
        <div className="discord-panel-editor">
          <h4>Create Role</h4>
          <label className="field">
            <span>Role name</span>
            <input
              value={roleDraft.name}
              onChange={(event) => setRoleDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Event Squad"
            />
          </label>
          <label className="colour-picker-field">
            <input type="color" value={roleDraft.color} onChange={(event) => setRoleDraft((current) => ({ ...current, color: event.target.value }))} />
            <code>{roleDraft.color}</code>
          </label>
          <label className="toggle-line">
            <input type="checkbox" checked={roleDraft.hoist} onChange={(event) => setRoleDraft((current) => ({ ...current, hoist: event.target.checked }))} />
            <span>Show separately in Discord member list</span>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={roleDraft.mentionable}
              onChange={(event) => setRoleDraft((current) => ({ ...current, mentionable: event.target.checked }))}
            />
            <span>Allow members to mention this role</span>
          </label>
          <ActionButton className="toolbar-button primary" pending={isPending("discord-role-create")} pendingLabel="Creating role..." disabled={!roleDraft.name.trim()} onClick={onCreateRole}>
            <Users size={15} /> Create Role
          </ActionButton>
        </div>
        <div className="role-directory role-directory-large">
          <div className="split-header">
            <h4>Discovered Roles</h4>
            <small>{formatNumber(discoveredRoles.length)} synced</small>
          </div>
          {!discoveredRoles.length ? <p className="legend">No Discord roles synced yet. Use Setup &gt; Sync Discord Server.</p> : null}
          {memberCountWarning}
          {discoveredRoles.slice(0, 140).map((role) => (
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
      </div>
    </section>
  );
}
