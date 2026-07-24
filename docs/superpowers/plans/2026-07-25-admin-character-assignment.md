# Admin Character Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized administrator assign and immediately approve a settlement character for an existing Discord login, block duplicate approved ownership, support explicit unassignment, and notify the existing Discord admin channel.

**Architecture:** Extend the existing Linked Accounts feature without changing its storage model. A dedicated `accounts.manage` admin route will perform assignment or unassignment, enforce approved-character exclusivity, write audit records, and dispatch best-effort Discord diagnostics; the existing approval route will share the same duplicate check. The React admin row will reuse the settlement member list and existing field/button patterns for inline controls.

**Tech Stack:** Node.js 24 HTTP server, built-in `node:sqlite`, React 19, TypeScript 5.9, plain CSS, Node test runner, pnpm/Corepack.

## Global Constraints

- Work only in `apps/bitcraft-local` and the focused tests listed below.
- Preserve the existing user-driven pending-request workflow.
- The new mutation must require `accounts.manage`, authenticated admin mutation handling, and CSRF validation.
- An admin assignment becomes `approved` immediately.
- One approved character may belong to only one Discord account; transfer is never automatic.
- An approved account must be unassigned before a different character can be assigned.
- Discord delivery is best-effort and must not roll back a successful database change.
- Reuse the existing mod-log, mod-notes, then default-channel fallback; add no Discord setting.
- Use existing `field`, `toolbar-button`, `link-status`, and linked-account row styles.
- Do not add dependencies, change versions, or edit `CHANGELOG.md`.

---

### Task 1: Add the secured assignment mutation, exclusivity rule, audit events, and Discord diagnostics

**Files:**
- Modify: `apps/bitcraft-local/test/server-admin-permissions.test.mjs:37-60`
- Modify: `apps/bitcraft-local/test/server.test.mjs:1137-1141`
- Modify: `apps/bitcraft-local/src/server/adminPermissions.mjs:47-50`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs:343-361`
- Modify: `apps/bitcraft-local/server.mjs:3862-3922`
- Modify: `apps/bitcraft-local/server.mjs:10147-10160`

**Interfaces:**
- Consumes: existing `updateUserCharacter`, `updateUserCharacterStatus`, `listUserAccounts`, `publicAppUser`, `audit`, `discordModLogTarget`, `sendDiscordMessage`, and `recordDiscordDeliverySafe`.
- Produces: `PUT /api/local/admin/user-accounts/character` accepting `{ userId: number, characterPlayerId: string, characterName: string }`; `statements.approvedUserAccountByCharacterId.get(characterPlayerId, excludedUserId)`; Discord event types `character_link_assigned` and `character_link_unassigned`.

- [ ] **Step 1: Add the failing permission mapping assertion**

Add this assertion beside the existing user-account approval assertion in `server-admin-permissions.test.mjs`:

```js
assert.equal(adminPermissionFor("PUT", "/api/local/admin/user-accounts/character"), "accounts.manage");
```

- [ ] **Step 2: Run the focused permission test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-admin-permissions.test.mjs
```

Expected: FAIL because the unrecognized route falls back to `status.view`.

- [ ] **Step 3: Map the new route to the existing account-management permission**

Extend the account route block in `src/server/adminPermissions.mjs`:

```js
if (pathname === "/api/local/admin/user-accounts") return "accounts.manage";
if (pathname === "/api/local/admin/user-accounts/approval") return "accounts.manage";
if (pathname === "/api/local/admin/user-accounts/character") return "accounts.manage";
```

- [ ] **Step 4: Re-run the permission test and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-admin-permissions.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add failing server integration coverage**

Immediately after the existing Linked Accounts GET assertion in `server.test.mjs`, create a second signed-in account and exercise assignment, duplicate blocking, approval blocking, unassignment, reassignment, audit entries, and Discord diagnostics:

```js
  const characterAssignmentDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  characterAssignmentDb.prepare(`
    INSERT INTO user_accounts (
      discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at
    ) VALUES (?, ?, ?, NULL, NULL, NULL, 'unlinked', '{}', ?, ?)
  `).run("second-discord-user", "SecondUser", "Second User", new Date().toISOString(), new Date().toISOString());
  const secondUserId = Number(characterAssignmentDb.prepare("SELECT id FROM user_accounts WHERE discord_id = ?").get("second-discord-user").id);
  characterAssignmentDb.close();

  const assignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: dealUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(assignCharacter.status, 200);
  const assignedAccounts = (await assignCharacter.json()).accounts;
  assert.deepEqual(
    assignedAccounts.find((account) => account.id === dealUserId),
    {
      ...assignedAccounts.find((account) => account.id === dealUserId),
      characterPlayerId: "87654321",
      characterName: "Assigned Character",
      characterStatus: "approved",
    },
  );

  const duplicateAssignment = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(duplicateAssignment.status, 409);
  assert.match((await duplicateAssignment.json()).error, /unassign/i);

  const pendingDuplicateDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  pendingDuplicateDb.prepare("UPDATE user_accounts SET character_player_id = ?, character_name = ?, character_status = 'pending' WHERE id = ?")
    .run("87654321", "Assigned Character", secondUserId);
  pendingDuplicateDb.close();
  const duplicateApproval = await fetch(`${origin}/api/local/admin/user-accounts/approval`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, status: "approved" }),
  });
  assert.equal(duplicateApproval.status, 409);

  const unassignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: dealUserId, characterPlayerId: "", characterName: "" }),
  });
  assert.equal(unassignCharacter.status, 200);
  const unassignedAccount = (await unassignCharacter.json()).accounts.find((account) => account.id === dealUserId);
  assert.equal(unassignedAccount.characterPlayerId, "");
  assert.equal(unassignedAccount.characterName, "");
  assert.equal(unassignedAccount.characterStatus, "unlinked");

  const reassignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(reassignCharacter.status, 200);
  assert.equal((await reassignCharacter.json()).accounts.find((account) => account.id === secondUserId).characterStatus, "approved");

  const assignmentEvidenceDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  const assignmentAuditActions = assignmentEvidenceDb.prepare(`
    SELECT action FROM admin_audit_log
    WHERE action IN ('linked_account.character_assigned', 'linked_account.character_unassigned')
    ORDER BY id
  `).all().map((row) => row.action);
  const assignmentDeliveryEvents = assignmentEvidenceDb.prepare(`
    SELECT event_type FROM discord_delivery_log
    WHERE event_type IN ('character_link_assigned', 'character_link_unassigned')
    ORDER BY id
  `).all().map((row) => row.event_type);
  assignmentEvidenceDb.close();
  assert.deepEqual(assignmentAuditActions.slice(-3), [
    "linked_account.character_assigned",
    "linked_account.character_unassigned",
    "linked_account.character_assigned",
  ]);
  assert.deepEqual(assignmentDeliveryEvents.slice(-3), [
    "character_link_assigned",
    "character_link_unassigned",
    "character_link_assigned",
  ]);
```

- [ ] **Step 6: Run the server integration test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because `/api/local/admin/user-accounts/character` is not implemented and duplicate approval still returns 200.

- [ ] **Step 7: Add the prepared exclusivity lookup**

Add this statement beside the existing app-user statements in `preparedStatements.mjs`:

```js
  approvedUserAccountByCharacterId: db.prepare(`
    SELECT *
    FROM user_accounts
    WHERE character_player_id = ?
      AND character_status = 'approved'
      AND id <> ?
    LIMIT 1
  `),
```

- [ ] **Step 8: Add best-effort assignment and unassignment notifications**

Add this helper after `sendDiscordCharacterLinkRequest` in `server.mjs`:

```js
async function sendDiscordCharacterLinkAdminAction(userRow, action, administrator, settings = getDiscordSettingsRaw()) {
  const assigned = action === "assigned";
  const eventType = assigned ? "character_link_assigned" : "character_link_unassigned";
  const { channelId, channelKey } = discordModLogTarget(settings);
  const accountName = String(userRow.discord_global_name || userRow.discord_username || "Discord user");
  const characterName = String(userRow.character_name || "Unknown character");
  const characterPlayerId = String(userRow.character_player_id || "");
  const summary = `Character link ${assigned ? "assigned" : "unassigned"}: ${characterName}`;
  const metadata = {
    eventType,
    enabled: Boolean(settings.enabled),
    hasBotToken: Boolean(settings.botToken),
    channelId,
    channelKey,
    administrator: String(administrator || "Administrator"),
    accountId: userRow.id,
    discordId: String(userRow.discord_id ?? ""),
    discordUsername: String(userRow.discord_username ?? ""),
    characterName,
    characterPlayerId,
  };
  if (!settings.enabled || !settings.botToken || !channelId) {
    const reason = "Discord disabled, bot token missing, or mod-log channel not configured";
    recordDiscordDeliverySafe({ status: "skipped", eventType, channelId, channelKey, summary, reason, metadata });
    return { ok: true, skipped: true, reason };
  }
  try {
    const response = await sendDiscordMessage({
      embeds: [discordCommandEmbed(
        assigned ? "Character Assigned" : "Character Unassigned",
        `**${metadata.administrator}** ${assigned ? "assigned and approved" : "unassigned"} a BitCraft character for **${accountName}**.`,
        [
          { name: "Discord", value: `<@${userRow.discord_id}>`, inline: true },
          { name: "Character", value: characterName, inline: true },
          { name: "Player ID", value: characterPlayerId || "Not provided", inline: false },
        ],
        assigned ? 0x4ee28a : 0xf0c64f,
      )],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({
      status: "sent",
      eventType,
      channelId,
      channelKey,
      summary,
      metadata,
      response: { id: response?.id, channel_id: response?.channel_id },
    });
    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType, channelId, channelKey, summary, error: message, metadata });
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 9: Implement assignment, unassignment, and duplicate-safe approval**

Add the dedicated route immediately after the Linked Accounts GET route in `server.mjs`:

```js
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user-accounts/character") {
        const body = await readJson(req, BODY_LIMITS.auth);
        const userId = Number(body.userId);
        const characterPlayerId = String(body.characterPlayerId ?? "").trim();
        const characterName = String(body.characterName ?? "").trim();
        if (!userId) return send(res, 400, { error: "Choose a Discord account" });
        const target = db.prepare("SELECT * FROM user_accounts WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Linked account not found" });

        if (!characterPlayerId && !characterName) {
          statements.updateUserCharacter.run("", "", "unlinked", userId);
          audit(user, "linked_account.character_unassigned", {
            userId,
            discordId: target.discord_id,
            characterPlayerId: target.character_player_id,
            characterName: target.character_name,
          });
          void sendDiscordCharacterLinkAdminAction(target, "unassigned", user.username);
          return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
        }

        if (!/^\d{8,}$/.test(characterPlayerId)) return send(res, 400, { error: "Choose a valid BitCraft character" });
        if (!characterName || characterName.length > 80) return send(res, 400, { error: "Character name is required" });
        if (
          String(target.character_status ?? "") === "approved"
          && String(target.character_player_id ?? "")
          && String(target.character_player_id) !== characterPlayerId
        ) {
          return send(res, 409, { error: "Unassign this account's approved character before assigning a different one" });
        }
        const existing = statements.approvedUserAccountByCharacterId.get(characterPlayerId, userId);
        if (existing) return send(res, 409, { error: "This character is already approved for another Discord account. Unassign it there first." });

        statements.updateUserCharacter.run(characterPlayerId, characterName, "approved", userId);
        const assigned = db.prepare("SELECT * FROM user_accounts WHERE id = ?").get(userId);
        audit(user, "linked_account.character_assigned", {
          userId,
          discordId: target.discord_id,
          characterPlayerId,
          characterName,
        });
        void sendDiscordCharacterLinkAdminAction(assigned, "assigned", user.username);
        return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
      }
```

Before calling `updateUserCharacterStatus` in the existing approval route, add:

```js
        if (status === "approved") {
          if (!target.character_player_id || !target.character_name) return send(res, 400, { error: "Choose a valid BitCraft character before approval" });
          const existing = statements.approvedUserAccountByCharacterId.get(String(target.character_player_id), userId);
          if (existing) return send(res, 409, { error: "This character is already approved for another Discord account. Unassign it there first." });
        }
```

- [ ] **Step 10: Re-run backend verification**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-admin-permissions.test.mjs
node --experimental-strip-types --test apps/bitcraft-local/test/server.test.mjs
```

Expected: both commands PASS, including assignment, duplicate rejection, unassignment, reassignment, audit, and delivery assertions.

- [ ] **Step 11: Commit the backend slice**

```powershell
git add -- apps/bitcraft-local/test/server-admin-permissions.test.mjs apps/bitcraft-local/test/server.test.mjs apps/bitcraft-local/src/server/adminPermissions.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/server.mjs
git commit -m "feat: add admin character assignment API"
```

---

### Task 2: Add inline Linked Accounts assignment controls

**Files:**
- Create: `apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/components/admin/AdminAccessSection.tsx:1-115`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx:2067-2081`
- Modify: `apps/bitcraft-local/src/styles/admin.css:786-811`

**Interfaces:**
- Consumes: `AppUser[]`, sorted settlement `members: AnyRecord[]`, `memberTrackingId(member)`, `memberDisplayName(member)`, and the Task 1 admin route.
- Produces: `onCharacterAssignment(account: AppUser, member: AnyRecord | null): void`; inline **Assign & approve** and **Unassign character** actions.

- [ ] **Step 1: Add a failing frontend boundary test**

Create `admin-character-assignment-boundary.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync(new URL("../src/components/admin/AdminAccessSection.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

test("Linked Accounts exposes direct assignment and explicit unassignment", () => {
  assert.match(access, /members:\s*AnyRecord\[\]/);
  assert.match(access, /onCharacterAssignment:\s*\(account:\s*AppUser,\s*member:\s*AnyRecord\s*\|\s*null\)\s*=>\s*void/);
  assert.match(access, /Assign & approve/);
  assert.match(access, /Unassign character/);
  assert.match(access, /memberTrackingId\(member\)/);
  assert.match(access, /account\.characterStatus === "approved"/);
});

test("AdminPanel sends the selected member to the secured character route", () => {
  assert.match(panel, /members:\s*adminMemberRows/);
  assert.match(panel, /onCharacterAssignment=/);
  assert.match(panel, /\/admin\/user-accounts\/character/);
  assert.match(panel, /memberTrackingId\(member\)/);
  assert.match(panel, /memberDisplayName\(member\)/);
});

test("Linked account assignment remains dense and becomes single-column on narrow screens", () => {
  assert.match(css, /\.linked-account-character-actions/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*\.linked-account-row\s*\{[^}]*grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 2: Run the boundary test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs
```

Expected: FAIL because the assignment props, controls, API handler, and responsive CSS do not exist.

- [ ] **Step 3: Add member data, selection state, and assignment props**

In `AdminAccessSection.tsx`:

1. Import `memberDisplayName` and `memberTrackingId`:

```ts
import { memberDisplayName, memberTrackingId } from "../../utils/memberTracking";
```

2. Extend `data` and the action props:

```ts
    members: AnyRecord[];
```

```ts
  onCharacterAssignment: (account: AppUser, member: AnyRecord | null) => void;
```

3. Destructure `onCharacterAssignment`, then add state and the approved-owner map at the top of the component:

```ts
  const [characterAssignments, setCharacterAssignments] = React.useState<Record<number, string>>({});
  const approvedCharacterOwners = new Map(
    data.linkedAccounts
      .filter((account) => account.characterStatus === "approved" && account.characterPlayerId)
      .map((account) => [String(account.characterPlayerId), account.id]),
  );
```

- [ ] **Step 4: Render inline assignment and unassignment controls**

Change the linked-account map callback to a block so each row can derive its selection:

```tsx
            {data.linkedAccounts.length ? data.linkedAccounts.map((account) => {
              const selectedCharacterId = characterAssignments[account.id] ?? account.characterPlayerId ?? "";
              const selectedMember = data.members.find((member) => memberTrackingId(member) === selectedCharacterId) ?? null;
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
                          disabled={!selectedMember || pending(`account-character:${account.id}`)}
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
                  </div>
                </div>
              );
            }) : <p className="legend">No Discord users have signed in yet.</p>}
```

- [ ] **Step 5: Connect AdminPanel to the new route**

Pass the sorted member list in `AdminPanel.tsx`:

```tsx
data={{ users, linkedAccounts, members: adminMemberRows, newUser, adminRoles, canManageAdmins, currentUserId: auth.user?.id }}
```

Add the handler after `onAccountApproval`:

```tsx
onCharacterAssignment={(account, member) => run(async () => {
  const result = await api("/admin/user-accounts/character", {
    method: "PUT",
    body: JSON.stringify({
      userId: account.id,
      characterPlayerId: member ? memberTrackingId(member) : "",
      characterName: member ? memberDisplayName(member) : "",
    }),
  });
  setLinkedAccounts(result.accounts ?? []);
}, member ? "Character assigned and approved." : "Character unassigned.", `account-character:${account.id}`)}
```

- [ ] **Step 6: Add compact and responsive styles**

Update the existing linked-account rules in `admin.css`:

```css
.linked-account-row {
  border: 1px solid rgba(108,123,145,.22);
  border-radius: 8px;
  background: rgba(255,255,255,.025);
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(280px, 1.25fr) auto auto;
  gap: 12px;
  align-items: center;
}
.linked-account-character { min-width: 0; display: grid; gap: 8px; }
.linked-account-character-actions { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; }
.linked-account-character-actions .field { flex: 1 1 210px; min-width: 0; }
.linked-account-character-actions .toolbar-button { flex: 0 0 auto; }
```

Add to the existing `@media (max-width: 860px)` block:

```css
  .linked-account-row { grid-template-columns: 1fr; align-items: stretch; }
  .linked-account-row > .toolbar { justify-content: flex-start; }
```

- [ ] **Step 7: Run focused frontend verification**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: boundary test PASS and the production build completes without TypeScript or Vite errors.

- [ ] **Step 8: Browser-check the Linked Accounts layout**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=admin`, authenticate with the local admin setup, and inspect **Linked Accounts** at desktop and a viewport narrower than 860px.

Expected:

- assignment controls remain inside the relevant Discord row;
- an approved row shows **Unassign character**;
- unapproved rows show the settlement character selector and **Assign & approve**;
- already-approved characters are labelled and disabled for other accounts;
- narrow rows stack into one column without clipped controls;
- no console errors occur.

- [ ] **Step 9: Run full required verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: both commands PASS.

- [ ] **Step 10: Commit the frontend slice**

```powershell
git add -- apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs apps/bitcraft-local/src/components/admin/AdminAccessSection.tsx apps/bitcraft-local/src/components/admin/AdminPanel.tsx apps/bitcraft-local/src/styles/admin.css
git commit -m "feat: add admin character assignment controls"
```

---

## Completion Check

- [ ] Inspect `git diff --check` and `git status --short`.
- [ ] Confirm only the planned feature files and the already-approved plan/spec documents are part of feature commits.
- [ ] Confirm no database file, log file, `.codex-dev/`, version, or changelog change is included.
- [ ] Report build, full test, focused test, browser-smoke results, and any skipped check.
