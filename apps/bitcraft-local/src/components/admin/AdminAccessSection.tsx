import React from "react";
import { Ban, CheckCircle2, Clock, MessageCircle, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import type { AnyRecord } from "../../main-app-data";
import type { AppUser } from "../../types/settings";
import { dateLabel, formatNumber } from "../../utils/format";
import { memberDisplayName, memberTrackingId } from "../../utils/memberTracking";
import { Dialog } from "../main/Dialog";

type NewAdminUser = { discordId: string; displayName: string; role: string };

type AdminAccessSectionProps = {
  tab: "users" | "accounts";
  data: {
    users: AnyRecord[];
    linkedAccounts: AppUser[];
    members: AnyRecord[];
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
  onCharacterAssignment: (account: AppUser, member: AnyRecord | null) => void;
  onAccountPrivacyDeletion: (account: AppUser) => Promise<boolean>;
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
  onCharacterAssignment,
  onAccountPrivacyDeletion,
}: AdminAccessSectionProps) {
  const [characterAssignments, setCharacterAssignments] = React.useState<Record<number, string>>({});
  const [privacyDeletionTarget, setPrivacyDeletionTarget] = React.useState<AppUser | null>(null);
  const [privacyDeletionConfirmation, setPrivacyDeletionConfirmation] = React.useState("");
  const approvedCharacterOwners = new Map(
    data.linkedAccounts
      .filter((account) => account.characterStatus === "approved" && account.characterPlayerId)
      .map((account) => [String(account.characterPlayerId), account.id]),
  );
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
        <>
        <section className="form-card linked-accounts-card">
          <div className="split-header">
            <h3><MessageCircle size={17} /> Discord Linked Accounts</h3>
            <button className={`toolbar-button${pending("linked-accounts-refresh") ? " is-loading" : ""}`} disabled={pending("linked-accounts-refresh")} onClick={onRefreshLinkedAccounts}><RefreshCw size={14} /> {pending("linked-accounts-refresh") ? "Refreshing..." : "Refresh"}</button>
          </div>
          <p className="legend">Users can sign in with Discord and request a BitCraft character link. Approval is manual because Discord identity does not prove character ownership by itself.</p>
          <div className="linked-account-list">
            {data.linkedAccounts.length ? data.linkedAccounts.map((account) => {
              const selectedCharacterId = characterAssignments[account.id] ?? account.characterPlayerId ?? "";
              const selectedMember = data.members.find((member) => memberTrackingId(member) === selectedCharacterId) ?? null;
              const selectedOwnerId = approvedCharacterOwners.get(selectedCharacterId);
              const selectedCharacterUnavailable = selectedOwnerId != null && selectedOwnerId !== account.id;
              return (
                <div className="linked-account-row" key={account.id}>
                  <div className="linked-account-user">
                    {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{(account.globalName || account.username || "?").slice(0, 1).toUpperCase()}</span>}
                    <div>
                      <strong>{account.globalName || account.username || "Discord user"}</strong>
                      <small>{account.username ? `@${account.username}` : account.discordId} | Last login {dateLabel(account.lastLoginAt)}</small>
                    </div>
                  </div>
                  <div className="linked-account-character">
                    <div>
                      <strong>{account.characterName || "No character selected"}</strong>
                      <small>{account.characterPlayerId || "No BitCraft player ID"}</small>
                    </div>
                    {account.characterStatus === "approved" ? (
                      <button
                        className="toolbar-button"
                        disabled={pending(`account-character:${account.id}`)}
                        onClick={() => {
                          setCharacterAssignments((current) => ({ ...current, [account.id]: "" }));
                          onCharacterAssignment(account, null);
                        }}
                      >
                        <RefreshCw size={14} /> Unassign character
                      </button>
                    ) : (
                      <div className="linked-account-character-actions">
                        <label className="field compact-field">
                          <span>Assign character</span>
                          <select
                            value={selectedCharacterId}
                            disabled={pending(`account-character:${account.id}`)}
                            onChange={(event) => setCharacterAssignments((current) => ({ ...current, [account.id]: event.target.value }))}
                          >
                            <option value="">Select a settlement character</option>
                            {data.members.map((member) => {
                              const playerId = memberTrackingId(member);
                              const ownerId = approvedCharacterOwners.get(playerId);
                              return (
                                <option key={playerId || memberDisplayName(member)} value={playerId} disabled={ownerId != null && ownerId !== account.id}>
                                  {memberDisplayName(member)}{ownerId != null && ownerId !== account.id ? " (already assigned)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <button
                          className="toolbar-button primary"
                          disabled={!selectedMember || selectedCharacterUnavailable || pending(`account-character:${account.id}`)}
                          onClick={() => onCharacterAssignment(account, selectedMember)}
                        >
                          <UserPlus size={14} /> Assign & approve
                        </button>
                      </div>
                    )}
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
                    <button
                      className="toolbar-button danger"
                      disabled={pending(`account-privacy-delete:${account.id}`)}
                      title="Permanently remove this user's app account and associated app data."
                      onClick={() => {
                        setPrivacyDeletionConfirmation("");
                        setPrivacyDeletionTarget(account);
                      }}
                    >
                      <Trash2 size={14} /> Delete account data
                    </button>
                  </div>
                </div>
              );
            }) : <p className="legend">No Discord users have signed in yet.</p>}
          </div>
        </section>
        <Dialog
          open={privacyDeletionTarget != null}
          title="Delete linked account data"
          description="Permanently delete this user's app account and associated app data."
          closeOnBackdrop={!privacyDeletionTarget || !pending(`account-privacy-delete:${privacyDeletionTarget.id}`)}
          onClose={() => {
            if (privacyDeletionTarget && pending(`account-privacy-delete:${privacyDeletionTarget.id}`)) return;
            setPrivacyDeletionTarget(null);
            setPrivacyDeletionConfirmation("");
          }}
          className="admin-modal account-privacy-deletion-dialog"
          backdropClassName="admin-modal-backdrop"
        >
          <header>
            <div>
              <Trash2 size={20} />
              <div>
                <h2>Delete linked account data</h2>
                <p>{privacyDeletionTarget?.globalName || privacyDeletionTarget?.username || "Discord user"}</p>
              </div>
            </div>
          </header>
          <div className="account-privacy-deletion-copy">
            <p>This permanently removes the ordinary user app account, its character link, saved settings, sessions, market watches, and associated app data.</p>
            <p>The user's Discord server membership and any separate administrator identity are not changed. Affected-user identifiers in required moderation and administrator audit records are retained only in de-identified or pseudonymised form.</p>
            <p>The app will try to notify the user by Discord DM after deletion. Deletion still completes if that DM cannot be delivered.</p>
            <label className="field">
              <span>Type DELETE to confirm</span>
              <input
                value={privacyDeletionConfirmation}
                autoComplete="off"
                onChange={(event) => setPrivacyDeletionConfirmation(event.target.value)}
                placeholder="DELETE"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="toolbar-button"
              disabled={Boolean(privacyDeletionTarget && pending(`account-privacy-delete:${privacyDeletionTarget.id}`))}
              onClick={() => {
                setPrivacyDeletionTarget(null);
                setPrivacyDeletionConfirmation("");
              }}
            >
              Cancel
            </button>
            <button
              className="toolbar-button danger"
              disabled={
                privacyDeletionConfirmation !== "DELETE"
                || Boolean(privacyDeletionTarget && pending(`account-privacy-delete:${privacyDeletionTarget.id}`))
              }
              onClick={async () => {
                if (!privacyDeletionTarget || privacyDeletionConfirmation !== "DELETE") return;
                const target = privacyDeletionTarget;
                const deleted = await onAccountPrivacyDeletion(target);
                if (!deleted) return;
                setPrivacyDeletionTarget(null);
                setPrivacyDeletionConfirmation("");
              }}
            >
              <Trash2 size={14} /> Permanently delete
            </button>
          </div>
        </Dialog>
        </>
      ) : null}
    </>
  );
}
