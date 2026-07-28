import React from "react";
import { Ban, CheckCircle2, EllipsisVertical, MessageCircle, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
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
  membersLoading: boolean;
  membersError?: string | null;
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
  membersLoading,
  membersError,
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
  const orderedLinkedAccounts = [...data.linkedAccounts].sort(
    (left, right) => Number(right.characterStatus === "pending") - Number(left.characterStatus === "pending"),
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
          {membersError ? <div className="admin-message error" role="alert" aria-live="assertive">{membersError} Refresh and retry.</div> : null}
          <div className="linked-account-list">
            {orderedLinkedAccounts.length ? orderedLinkedAccounts.map((account) => {
              const accountDisplayName = account.globalName || account.username || "Discord user";
              const accountState = account.characterStatus === "approved"
                || account.characterStatus === "pending"
                || account.characterStatus === "rejected"
                ? account.characterStatus
                : "unlinked";
              const selectedCharacterId = characterAssignments[account.id] ?? "";
              const selectedMember = selectedCharacterId
                ? data.members.find((member) => memberTrackingId(member) === selectedCharacterId) ?? null
                : null;
              const selectedOwnerId = approvedCharacterOwners.get(selectedCharacterId);
              const selectedCharacterUnavailable = selectedOwnerId != null && selectedOwnerId !== account.id;
              const selectedCharacterMatchesRequest = (accountState === "pending" || accountState === "rejected")
                && Boolean(account.characterPlayerId)
                && selectedCharacterId === String(account.characterPlayerId);
              const requestedOwnerId = account.characterPlayerId
                ? approvedCharacterOwners.get(String(account.characterPlayerId))
                : null;
              const pendingCharacterUnavailable = account.characterStatus === "pending"
                && requestedOwnerId != null
                && requestedOwnerId !== account.id;
              const accountApprovalPending = pending(`account-approval:${account.id}`);
              const accountCharacterPending = pending(`account-character:${account.id}`);
              const accountDeletionPending = pending(`account-privacy-delete:${account.id}`);
              const accountActionPending = accountApprovalPending || accountCharacterPending || accountDeletionPending;
              const assignmentControls = (
                <div className="linked-account-character-actions">
                  <label className="field compact-field">
                    <span>Assign character</span>
                    <select
                      value={selectedCharacterId}
                      disabled={membersLoading || !data.members.length || accountActionPending}
                      onChange={(event) => setCharacterAssignments((current) => ({ ...current, [account.id]: event.target.value }))}
                    >
                      <option value="">{membersLoading ? "Loading settlement characters..." : data.members.length ? "Select a settlement character" : "No settlement characters available"}</option>
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
                    disabled={membersLoading || !selectedMember || selectedCharacterUnavailable || selectedCharacterMatchesRequest || accountActionPending}
                    onClick={() => onCharacterAssignment(account, selectedMember)}
                  >
                    <UserPlus size={14} /> Assign & approve
                  </button>
                </div>
              );
              return (
                <div className={`linked-account-row is-${accountState}`} key={account.id}>
                  <div className="linked-account-user">
                    {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{(account.globalName || account.username || "?").slice(0, 1).toUpperCase()}</span>}
                    <div>
                      <strong>{accountDisplayName}</strong>
                      <small>{account.username ? `@${account.username}` : account.discordId} | Last login {dateLabel(account.lastLoginAt)}</small>
                    </div>
                  </div>
                  <div className="linked-account-character">
                    <div className="linked-account-character-heading">
                      <div>
                        <span className="linked-account-character-label">
                          {accountState === "approved" ? "Linked character" : accountState === "pending" ? "Requested character" : accountState === "rejected" ? "Previous request" : "Character"}
                        </span>
                        <strong>{accountState === "unlinked" ? "No character linked" : account.characterName || "Unknown character"}</strong>
                      </div>
                      <em className={`link-status ${accountState}`}>{accountState}</em>
                      <small>{account.characterPlayerId || "No BitCraft player ID"}</small>
                    </div>
                  </div>
                  <div className="linked-account-contextual-actions">
                    {account.characterStatus === "approved" ? (
                      <button
                        className="toolbar-button"
                        disabled={accountActionPending}
                        onClick={() => {
                          setCharacterAssignments((current) => ({ ...current, [account.id]: "" }));
                          onCharacterAssignment(account, null);
                        }}
                      >
                        <RefreshCw size={14} /> Unassign
                      </button>
                    ) : account.characterStatus === "pending" ? (
                      <>
                        <div className="linked-account-primary-actions">
                          <button
                            className="toolbar-button primary"
                            disabled={!account.characterPlayerId || pendingCharacterUnavailable || accountActionPending}
                            onClick={() => onAccountApproval(account, "approved")}
                          >
                            <CheckCircle2 size={14} /> Approve request
                          </button>
                          <button
                            className="toolbar-button"
                            disabled={accountActionPending}
                            onClick={() => onAccountApproval(account, "rejected")}
                          >
                            <Ban size={14} /> Reject
                          </button>
                        </div>
                        {pendingCharacterUnavailable ? (
                          <p className="linked-account-inline-warning" role="status">
                            This character is already approved for another Discord account. Choose a different character or reject the request.
                          </p>
                        ) : null}
                        <details className="linked-account-assignment-disclosure">
                          <summary>Choose different character</summary>
                          {assignmentControls}
                        </details>
                      </>
                    ) : account.characterStatus === "rejected" ? (
                      <>
                        <button
                          className="toolbar-button"
                          disabled={!account.characterPlayerId || accountActionPending}
                          onClick={() => onAccountApproval(account, "pending")}
                        >
                          <RefreshCw size={14} /> Review again
                        </button>
                        <details className="linked-account-assignment-disclosure">
                          <summary>Choose different character</summary>
                          {assignmentControls}
                        </details>
                      </>
                    ) : (
                      assignmentControls
                    )}
                  </div>
                  <details className="linked-account-more-actions">
                    <summary aria-label={`More actions for ${accountDisplayName}`} title={`More actions for ${accountDisplayName}`}>
                      <EllipsisVertical size={17} />
                    </summary>
                    <div className="linked-account-more-menu">
                      <button
                        className="toolbar-button danger"
                        disabled={accountActionPending}
                        title="Permanently remove this user's app account and associated app data."
                        onClick={() => {
                          setPrivacyDeletionConfirmation("");
                          setPrivacyDeletionTarget(account);
                        }}
                      >
                        <Trash2 size={14} /> Delete account data
                      </button>
                    </div>
                  </details>
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
