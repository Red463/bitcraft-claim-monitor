# Task 1 implementation report — Freeze Timbersteel behavior and harden security

## What changed

- Restricted owner-role grants and revocations to active owner sessions. The final active owner cannot be disabled or demoted; successful status and role mutations retain their existing session revocation and audit behavior.
- Rejected every non-PING Discord interaction whose guild does not exactly match the configured Timbersteel guild before autocomplete, command, component, role, moderation, or downstream Discord API dispatch.
- Retired password setup/login as Admin-session sources. The only Admin-session factory is now explicitly owned by the Timbersteel Discord OAuth completion flow.
- Converted existing server integration tests that used password setup/login into isolated, database-seeded test sessions. Production has no test-only route or session bypass.

## Files

- `apps/bitcraft-local/server.mjs`
- `apps/bitcraft-local/src/server/preparedStatements.mjs`
- `apps/bitcraft-local/test/server-security-boundaries.test.mjs`
- `apps/bitcraft-local/test/server.test.mjs`
- `apps/bitcraft-local/test/server-discord-sandbox-integration.test.mjs`
- `apps/bitcraft-local/test/server-schema-health-redaction.test.mjs`

## TDD evidence

1. Owner-role protection
   - RED: `node --experimental-strip-types --test --test-name-pattern="non-owners cannot grant" test/server-security-boundaries.test.mjs`
   - Observed expected failure: a non-owner role promotion returned `200`, not the required `403`.
   - GREEN: the same command passed after the owner-count guard and route checks were added.

2. Configured Discord guild fence
   - RED: `node --experimental-strip-types --test --test-name-pattern="Discord commands from another guild" test/server-security-boundaries.test.mjs`
   - Observed expected failure: a valid signed `/help` interaction from another guild dispatched and returned the Help embed.
   - GREEN: the same command passed after the pre-dispatch configured-guild guard was added.

3. OAuth-only Admin-session creation
   - RED: `node --experimental-strip-types --test --test-name-pattern="password setup cannot create" test/server-security-boundaries.test.mjs`
   - Observed expected failure: password setup with the legacy flag enabled returned `200` and a session.
   - GREEN: the same command passed after setup/login were changed to `410` and the Admin-session factory was restricted to the Timbersteel OAuth path.

## Verification

Focused tests passed:

```text
node --experimental-strip-types --test test/server-security-boundaries.test.mjs
4 passed, 0 failed

node --experimental-strip-types --test test/server-discord-sandbox-integration.test.mjs test/server-schema-health-redaction.test.mjs
record-mode Admin sandbox test passed
maintenance-hold Discord test passed

node --experimental-strip-types --test test/server-schema-health-redaction.test.mjs
1 passed, 0 failed

node --experimental-strip-types --test --test-name-pattern="retired recipe catalog" test/server.test.mjs
1 passed, 0 failed
```

Required full commands completed successfully:

```text
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

`git diff --check` completed without whitespace errors.

## Self-review

- Owner checks operate only on authenticated sessions, which already require `active = 1`.
- The active-owner count is consulted before both owner demotion and owner disablement; session revocation/auditing remains after successful mutations only.
- Discord PING remains accepted as Discord requires, while all other interaction types must match the configured guild before handler dispatch.
- Admin-session creation has one production call site, `createAdminSessionForDiscordProfile`, which runs only inside the Timbersteel Discord OAuth callback.
- No version, changelog, database schema, worker, history, outbox, claim fence, or unrelated application behavior was changed.

## Concerns

- The direct fallback that attempted to pass every discovered test file as individual Windows command-line arguments could not start because the command line exceeded Windows' filename-length limit. The required package-manager full test command completed successfully, and the affected integration tests were also run directly.
