# Admin Character Assignment Design

## Purpose

Allow an authorized app administrator to assign a BitCraft character directly to a Discord user who has already signed in, without requiring that user to submit a link request first.

The assignment becomes approved immediately. Admins are informed through the existing Discord moderation-log notification path.

## Existing Behavior

- Discord sign-in creates or updates a `user_accounts` row.
- A signed-in user can select a settlement character and submit a pending link request.
- An administrator can approve, return to pending, or reject that requested link from **Admin > Linked Accounts**.
- Character-link requests notify the configured Discord moderation-log channel, falling back to mod-notes and then the default notification channel.

## User Experience

Each row in **Admin > Linked Accounts** will include an inline character-assignment control.

- For an account without an approved character, the administrator can select a character from the same settlement-member list used by the user settings flow.
- The primary action is labelled **Assign & approve**.
- Completing the action updates the row immediately to show the selected character and an `approved` status.
- An account with an approved character exposes **Unassign character** instead of allowing a replacement selection.
- The administrator must unassign the current character before selecting a different one.
- Existing pending-link approval, pending, and rejection controls remain available.

The control will reuse the existing field and toolbar-button vocabulary. It remains inline in the account row rather than introducing a modal.

## Server API

Add a dedicated authenticated admin mutation:

```text
PUT /api/local/admin/user-accounts/character
```

Assignment request:

```json
{
  "userId": 12,
  "characterPlayerId": "12345678",
  "characterName": "Settlement Member"
}
```

Unassignment request:

```json
{
  "userId": 12,
  "characterPlayerId": "",
  "characterName": ""
}
```

The route requires the existing `accounts.manage` permission and the normal authenticated admin mutation and CSRF checks.

On assignment, the server validates:

- the target app user exists;
- the player ID contains at least eight digits, matching the existing user-link validation;
- the character name is present and no longer than 80 characters;
- the target account is not already approved for a different character;
- no different app user already has the same player ID with `character_status = 'approved'`.

If the target account already has a different approved character, or the selected character is already approved for another Discord account, the server returns HTTP 409 with a clear error explaining which account must be unassigned first.

On a successful assignment, the route saves the player ID and name with `character_status = 'approved'`. On unassignment, it clears both character fields and saves `character_status = 'unlinked'`.

The response returns the refreshed public account list so the UI can update without a second request.

## Audit and Discord Notifications

Successful assignment records a `linked_account.character_assigned` admin audit event containing:

- target account ID;
- target Discord ID;
- character player ID;
- character name;
- acting administrator, supplied by the existing audit infrastructure.

Successful unassignment records `linked_account.character_unassigned` with the same target identifiers and the previous character details.

Both actions send a Discord embed through the existing moderation-log target selection:

1. configured mod-log channel;
2. configured mod-notes channel;
3. default Discord notification channel.

The embed identifies the action, acting administrator, target Discord account, character name, and player ID. Discord mentions are disabled so the target user is not pinged.

Discord delivery is best-effort. A missing configuration or delivery failure does not roll back the database change. The existing Discord delivery diagnostics record sent, skipped, or failed delivery using distinct assignment and unassignment event types.

## Duplicate and Replacement Rules

- One approved character may belong to only one Discord account.
- A duplicate approved assignment is blocked until the existing account is explicitly unassigned.
- The server enforces this rule; disabling UI options alone is insufficient.
- An approved account cannot be silently changed to a different character. It must be unassigned first.
- Pending or rejected requests do not count as approved assignments, but approving an existing pending request must also respect the same approved-character uniqueness rule.

The last rule closes the alternate path through the existing approval endpoint so it cannot bypass assignment exclusivity.

## Error Handling

- Invalid user, character ID, or character name returns a specific 400 or 404 response.
- Duplicate approved character assignment returns 409.
- Permission failures continue to use the existing admin authorization response.
- The inline action uses the existing pending-action guard to prevent duplicate submissions.
- Server errors are shown in the existing admin message area and leave the current account list unchanged.

## Testing

Focused server integration coverage will verify:

- an authorized admin can assign a character and the result is immediately approved;
- assignment persists the selected name and player ID;
- assigning a character approved for another account returns 409 without changing either account;
- unassignment clears the character fields and status;
- the previously assigned character can be assigned elsewhere after unassignment;
- the existing approval path cannot approve a duplicate character;
- the new route maps to `accounts.manage`;
- assignment and unassignment create the expected audit entries;
- Discord notification delivery is invoked without allowing a delivery failure to undo the account change.

A focused frontend boundary test will verify that the Linked Accounts row exposes the character selector, **Assign & approve**, and **Unassign character** actions and passes the selected settlement member to the admin handler.

Final verification will run the app build and the full app test command because the change affects frontend logic, backend authorization, SQLite updates, auditing, and Discord delivery.

## Out of Scope

- Creating Discord accounts for users who have never signed in.
- Assigning characters that are not present in the current settlement-member data.
- Automatically transferring a character between Discord accounts.
- Adding a new Discord channel setting.
- Sending a direct message to the affected user.
- Changing the ordinary user's self-service request and approval workflow.
