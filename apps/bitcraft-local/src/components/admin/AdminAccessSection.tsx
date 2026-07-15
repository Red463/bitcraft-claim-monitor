import React from "react";
import { Ban, CheckCircle2, Clock, MessageCircle, RefreshCw, UserPlus, Users } from "lucide-react";
import type { AnyRecord } from "../../main-app-data";
import type { AppUser } from "../../types/settings";
import { dateLabel, formatNumber } from "../../utils/format";

type NewAdminUser = { discordId: string; displayName: string; role: string };

type AdminAccessSectionProps = {
  tab: "users" | "accounts";
  data: {
    users: AnyRecord[];
    linkedAccounts: AppUser[];
    newUser: NewAdminUser;
    adminRoles: Record<string, string>;
    canManageAdmins: boolean;
    currentUserId?: unknown;
  };
  pending: (key: string) => boolean;
  error?: string | null;
  result?: { message: string; kind: "success" | "info" } | null;
  onNewUserChange: (user: NewAdminUser) => void;
  onAddUser: () => void;
  onRoleChange: (user: AnyRecord, role: string) => void;
  onClearSessions: (user: AnyRecord) => void;
  onToggleStatus: (user: AnyRecord) => void;
  onRefreshLinkedAccounts: () => void;
  onAccountApproval: (account: AppUser, status: "approved" | "pending" | "rejected") => void;
};

export function AdminAccessSection({
  tab,
  data,
  pending,
  error,
  result,
  onNewUserChange,
  onAddUser,
  onRoleChange,
  onClearSessions,
  onToggleStatus,
  onRefreshLinkedAccounts,
  onAccountApproval,
}: AdminAccessSectionProps) {
  return (
    <>
      {error ? <div className="admin-message error" role="alert" aria-live="assertive">{error}</div> : null}
      {result ? <div className={`admin-message ${result.kind}`} role="status" aria-live="polite">{result.message}</div> : null}
      {tab === "users" ? (
        <div className="admin-grid">
          <section className="form-card">
            <h3><UserPlus size={17} /> Add Discord Administrator</h3>
            {!data.canManageAdmins ? <p className="legend">Your administrator role can view this page but cannot create or change administrator accounts.</p> : null}
            <p className="legend">Add the user's Discord ID and choose the app admin role they should receive when signing in with Discord.</p>
            <label className="field"><span>Discord user ID</span><input value={data.newUser.discordId} onChange={(event) => onNewUserChange({ ...data.newUser, discordId: event.target.value })} placeholder="145544610234630144" /></label>
            <label className="field"><span>Display name</span><input value={data.newUser.displayName} onChange={(event) => onNewUserChange({ ...data.newUser, displayName: event.target.value })} placeholder="red463" /></label>
            <label className="field"><span>Role</span><select value={data.newUser.role} onChange={(event) => onNewUserChange({ ...data.newUser, role: event.target.value })}>{Object.entries(data.adminRoles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
            <button className="toolbar-button primary" title="Create an admin allow-list entry for this Discord user." disabled={!data.canManageAdmins || pending("admin-user-add")} onClick={onAddUser}><UserPlus size={15} /> Add Administrator</button>
          </section>
          <section className="form-card">
            <h3><Users size={17} /> Administrators</h3>
            <div className="admin-users">{data.users.length ? data.users.map((entry) => <div key={entry.id}><strong>{entry.username}</strong><span>{entry.active ? "Active" : "Disabled"} | Discord ID {entry.discord_id || "not linked"} | {entry.roleLabel ?? data.adminRoles[entry.role] ?? entry.role ?? "Viewer"} | {formatNumber(entry.sessions)} sessions | Last login {dateLabel(entry.last_login_at)}</span><label className="field compact-field"><span>Role</span><select value={entry.role ?? "viewer"} disabled={!data.canManageAdmins || entry.id === data.currentUserId || pending(`admin-user-role:${entry.id}`)} onChange={(event) => onRoleChange(entry, event.target.value)}>{Object.entries(data.adminRoles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label><div className="toolbar"><button className="toolbar-button" title="Sign this administrator out of all active sessions." disabled={!data.canManageAdmins || pending(`admin-user-sessions:${entry.id}`)} onClick={() => onClearSessions(entry)}>Clear Sessions</button><button className="toolbar-button" title={entry.active ? "Disable this administrator account." : "Re-enable this administrator account."} disabled={!data.canManageAdmins || entry.id === data.currentUserId || pending(`admin-user-status:${entry.id}`)} onClick={() => onToggleStatus(entry)}>{entry.active ? "Disable" : "Enable"}</button></div></div>) : <p className="legend">No administrator accounts are configured yet.</p>}</div>
          </section>
        </div>
      ) : null}

      {tab === "accounts" ? (
        <section className="form-card linked-accounts-card">
          <div className="split-header">
            <h3><MessageCircle size={17} /> Discord Linked Accounts</h3>
            <button className={`toolbar-button${pending("linked-accounts-refresh") ? " is-loading" : ""}`} disabled={pending("linked-accounts-refresh")} onClick={onRefreshLinkedAccounts}><RefreshCw size={14} /> {pending("linked-accounts-refresh") ? "Refreshing..." : "Refresh"}</button>
          </div>
          <p className="legend">Users can sign in with Discord and request a BitCraft character link. Approval is manual because Discord identity does not prove character ownership by itself.</p>
          <div className="linked-account-list">
            {data.linkedAccounts.length ? data.linkedAccounts.map((account) => (
              <div className="linked-account-row" key={account.id}>
                <div className="linked-account-user">
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{(account.globalName || account.username || "?").slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{account.globalName || account.username || "Discord user"}</strong>
                    <small>{account.username ? `@${account.username}` : account.discordId} | Last login {dateLabel(account.lastLoginAt)}</small>
                  </div>
                </div>
                <div>
                  <strong>{account.characterName || "No character selected"}</strong>
                  <small>{account.characterPlayerId || "No BitCraft player ID"}</small>
                </div>
                <em className={`link-status ${account.characterStatus}`}>{account.characterStatus || "unlinked"}</em>
                <div className="toolbar">
                  {(["approved", "pending", "rejected"] as const).map((status) => (
                    <button
                      className={`toolbar-button ${account.characterStatus === status ? "primary" : ""}`}
                      disabled={!account.characterPlayerId || pending(`account-approval:${account.id}`)}
                      title={`Mark this character link as ${status}.`}
                      key={status}
                      onClick={() => onAccountApproval(account, status)}
                    >
                      {status === "approved" ? <CheckCircle2 size={14} /> : status === "pending" ? <Clock size={14} /> : <Ban size={14} />}
                      {status[0].toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )) : <p className="legend">No Discord users have signed in yet.</p>}
          </div>
        </section>
      ) : null}
    </>
  );
}
