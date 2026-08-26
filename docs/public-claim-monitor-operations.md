# Public Claim Monitor operations

This runbook adds `https://claim-monitor.com` to the existing BitCraft Claim
Monitor Relay deployment. It does not create another Node service, worker,
database, scheduler, timer, backup regime, or Caddy instance. Repository work
does not change DNS, create a mailbox or Discord application, deploy, or send a
Discord message.

## Architecture and isolation boundary

- `app.timbersteeltrade.com` remains the complete Timbersteel product.
- `claim-monitor.com` is a distinct public host profile. Caddy sends both apex
  hosts to the same loopback-only web process at `127.0.0.1:19430`; the existing
  worker, collector and backup timers, SQLite database, and production data
  directory remain unchanged.
- Caddy overwrites `Host`, `X-Forwarded-For`, `X-Forwarded-Host`, and
  `X-Forwarded-Proto` at the loopback trust boundary. The Node server accepts a
  forwarded host only from loopback and resolves an exact allowlisted profile
  before API routing. Unknown production hosts receive `421`.
- `www.claim-monitor.com` permanently redirects to the public apex and preserves
  the path and query. It must never redirect to Timbersteel.
- The schema change is additive. Public accounts, sessions, legal acceptance,
  plans, members, invitations, bearer links, and events use `public_*` tables.
  Deploying those tables with all public flags off is the first rollout stage;
  do not copy or transform Timbersteel rows into them.
- Public settlement reads are on demand through the server-owned provider seam.
  They do not create durable provider generations, settlement history, market
  transitions, notification records, Discord work, outbox rows, map leases, or
  Timbersteel settings. Public settlements are selections, not tenants or
  managed workspaces.

Public-host exclusions are deliberate: no `/api/local/**`, `/api/discord/**`,
`/bot`, Admin, Timbersteel account, configured-claim, active-plan, notification,
Discord gateway, or continuous-monitoring capability is exposed. Timbersteel
denies `/api/public/**`. The public service does not promise Discord delivery,
background settlement monitoring, or correction of upstream BitCraft Relay
data.

The public response cache, Relay concurrency gate, plan computation cache, and
IP limiters are in-process and safe only for the current one-replica topology.
Before adding another web replica, replace or coordinate cache invalidation,
single-flight work, abuse/rate limits, and operational counters through a
shared bounded store. Do not horizontally scale while these controls are
replica-local.

## Configuration and operator-owned prerequisites

The checked-in environment example keeps all public gates disabled:

```env
PUBLIC_PROFILE_ENABLED=false
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false
PUBLIC_ORIGIN=https://claim-monitor.com
PUBLIC_DISCORD_OAUTH_CLIENT_ID=
PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=
PUBLIC_PLAN_TOKEN_HMAC_KEY=
```

The operator must complete and verify these external actions before activation:

1. Create DNS `A` records for exact hosts `claim-monitor.com` and
   `www.claim-monitor.com` pointing to the current VPS. Add `AAAA` records only
   if IPv6 reaches this same Caddy instance; otherwise omit them. Verify both
   authoritative answers and remove stale conflicting records before asking
   Caddy to obtain certificates.
2. Create and test receipt at `privacy@claim-monitor.com`. Keep this mailbox
   separate from application credentials and use it for public-profile rights
   requests and policy contact.
3. Create a separate Discord OAuth application for BitCraft Claim Monitor. Do
   not reuse the Timbersteel application, bot token, guild configuration, or
   Admin identity. Register exactly
   `https://claim-monitor.com/api/public/auth/discord/callback` and request the
   `identify` scope only. Store its client ID and secret only in the protected
   installed environment file.
4. Review the public Terms, Privacy Policy, provider list, retention table,
   effective date, and controller details before setting
   `PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=true`. Repository presence is not legal
   approval.
5. Generate `PUBLIC_PLAN_TOKEN_HMAC_KEY` once as at least 32 random bytes,
   encoded for the environment file. Persist it with protected configuration
   and include it in encrypted recovery procedures. Invitations and share links
   store only `HMAC-SHA-256(key, token)`. Rotating or losing the key immediately
   invalidates every outstanding invitation and bearer share link; it does not
   decrypt or recover a token.

Do not put OAuth secrets, the HMAC key, backup keys, or privacy-ledger keys in a
release, Git, command output, screenshots, or the runbook evidence bundle.

## Preflight: evidence before schema or flags

Run the preflight from one supervised root shell. Do not send Discord test
notifications. Leave the existing worker and timers in their normal topology.

1. Record the reviewed release SHA, current symlink, installed environment-file
   hash, Caddy hash, service/timer status, local health, Timbersteel public
   health, configured claim, active craft plan, and Admin/bot/Discord health.
   Record only non-secret responses. Confirm existing Timbersteel cookies and
   browser preferences in an isolated browser profile; a deployment must not
   rename or clear them.
2. Run the repository build, full tests, focused deployment tests, and the safe
   host-profile/public fixture smoke listed below. Validate both tracked Caddy
   files with `caddy validate` when the binary is installed.
3. Create a manual encrypted database backup through the existing helper. Then
   independently decrypt it to a protected temporary path and verify SQLite:

```sh
set -euo pipefail
RELEASE="$(readlink -f /opt/bitcraft-claim-monitor-relay/current)"
REVISION="$(basename "$RELEASE")"
DATABASE="/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite"
BACKUP_ROOT="/var/backups/bitcraft-claim-monitor-relay"
BACKUP_KEY="/etc/bitcraft-claim-monitor-relay/backup-encryption.key"
BACKUP_CRYPTO="/usr/local/lib/bitcraft-claim-monitor-relay/backup-crypto.mjs"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$BACKUP_ROOT/public-profile-preflight-${REVISION:0:12}-$STAMP"
install -d -o root -g root -m 0700 "$EVIDENCE"

BACKUP_DIR="$EVIDENCE" \
  /usr/local/bin/backup-bitcraft-claim-monitor-relay manual --revision "$REVISION" \
  >"$EVIDENCE/backup.log"
chmod 0600 "$EVIDENCE/backup.log"

set -- "$EVIDENCE"/bitcraft-local-manual-"${REVISION:0:12}"-*.sqlite.enc
test "$#" -eq 1
ENCRYPTED_BACKUP="$1"
VERIFY_DATABASE="$EVIDENCE/decrypt-verify.sqlite"
node "$BACKUP_CRYPTO" decrypt "$ENCRYPTED_BACKUP" "$VERIFY_DATABASE" "$BACKUP_KEY"
test "$(sqlite3 "$VERIFY_DATABASE" 'PRAGMA integrity_check;')" = "ok"
test -z "$(sqlite3 "$VERIFY_DATABASE" 'PRAGMA foreign_key_check;')"
```

4. Replay the signed privacy deletion ledger against the decrypted verification
   copy. This is both signature verification and proof that deleted Timbersteel
   or public accounts will not reappear after restore. A signature/replay error
   blocks rollout. Never run the preflight replay against the live database.
   Export the exact comma-separated, path-only
   `PRIVACY_LEDGER_PREVIOUS_KEY_FILES` value from the protected installed
   environment first. During the current rotation that value is the installed
   previous-production key path shown below; use an empty value only after the
   previous key is formally retired. Do not print the environment file or any
   key contents.

```sh
export PRIVACY_LEDGER_PREVIOUS_KEY_FILES="/etc/bitcraft-claim-monitor-relay/privacy-ledger.previous-production.key"
DATA_DIR="$EVIDENCE" \
BACKUP_DIR="$BACKUP_ROOT" \
CONFIG_DIR="/etc/bitcraft-claim-monitor-relay" \
node "$RELEASE/deploy/replay-privacy-deletions.mjs" \
  "$VERIFY_DATABASE" \
  "$BACKUP_ROOT/privacy-deletion-ledger.jsonl" \
  /etc/bitcraft-claim-monitor-relay/privacy-ledger.key \
  >"$EVIDENCE/privacy-replay.json"
chmod 0600 "$EVIDENCE/privacy-replay.json"
test "$(sqlite3 "$VERIFY_DATABASE" 'PRAGMA integrity_check;')" = "ok"
test -z "$(sqlite3 "$VERIFY_DATABASE" 'PRAGMA foreign_key_check;')"
rm -f -- "$VERIFY_DATABASE"
```

The replay verifies every ledger record with the current key plus those
configured previous keys, then applies the Timbersteel and public-profile
subjects in one database transaction. Its JSON output contains only overall
record/key counts and per-profile `status`, `scanned`, and `deleted` counts; it
never contains account identifiers, receipt subjects, or key values. A public
status of `not-present` is acceptable only for a verified pre-additive backup.
Any non-zero exit, other status, invalid/duplicate key configuration, or replay
error blocks rollout and leaves the verification database unchanged.

5. Capture bounded Timbersteel history/outbox fingerprints before rollout. The
   fixture test is the authoritative proof that public reads perform zero writes
   to these repositories; production hashes add evidence that pre-existing rows
   did not change. Because the live worker may append legitimate rows and finish
   pending delivery, record row counts/statuses and compare stable prefixes with
   the same bounds, investigating rather than deleting any difference.

```sh
for TABLE in \
  market_events market_trades activity_events \
  provider_transition_outbox discord_notification_outbox
do
  MAX_ROWID="$(sqlite3 -readonly -noheader "$DATABASE" \
    "SELECT COALESCE(MAX(rowid),0) FROM $TABLE;")"
  HASH="$(sqlite3 -readonly -noheader -separator '|' "$DATABASE" \
    "SELECT * FROM $TABLE WHERE rowid <= $MAX_ROWID ORDER BY rowid;" | sha256sum | cut -d' ' -f1)"
  printf '%s|%s|%s\n' "$TABLE" "$MAX_ROWID" "$HASH"
done >"$EVIDENCE/timbersteel-history-outbox-before.sha256"
chmod 0600 "$EVIDENCE/timbersteel-history-outbox-before.sha256"
sqlite3 -readonly -header -column "$DATABASE" \
  "SELECT status, COUNT(*) AS rows FROM discord_notification_outbox GROUP BY status ORDER BY status;" \
  >"$EVIDENCE/timbersteel-outbox-status-before.txt"
chmod 0600 "$EVIDENCE/timbersteel-outbox-status-before.txt"
```

Retain the encrypted backup, its hash, the privacy replay receipt, integrity
results, fingerprints, route-smoke results, and the exact release SHA together.
Delete only the plaintext verification copy after successful checks.

## Staged rollout

Every stage uses the same web service, worker, database, timers, and Caddy
instance. Apply schema migrations only through the normal reviewed release.
They are additive and are never rolled back.

### Stage 0: additive schema, public disabled

Deploy with all three flags `false`, OAuth values blank, and the public HMAC key
already stored if collaboration will later be enabled. Restart through the
normal deployment workflow. Confirm:

- `app.timbersteeltrade.com` routes, configured claim, active plan, cookies,
  preferences, history, notifications, Discord, bot, Admin, and worker health
  match the preflight;
- the public apex returns `/api/profile` with all public feature flags `false`,
  while `/api/public/**` returns `404`;
- cross-profile denials remain `404`, unknown production hosts remain `421`,
  and no public request changes the Timbersteel fixture fingerprints or outbox.

Do not populate `public_*` tables and do not enable a flag in this stage.

### Stage 1: read-only public profile, then observe for 24 hours

After the policy and mailbox reviews, set:

```env
PUBLIC_PROFILE_ENABLED=true
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=true
```

Run the manual **Enable public Claim Monitor read-only profile** workflow
from production `main`, enter `claim-monitor.com` exactly, and admit its
`relay-cutover` approval. The revision-bound helper applies only these public
Stage 1 values, restarts only the web service, verifies the worker PID is
unchanged, and rolls the environment back if public search or Timbersteel
health does not pass.

Leave public OAuth credentials blank unless they have already been installed
dormant through the protected Stage 2 credential workflow while all three
public gates were `false`. Restart only the existing web service; do not stop
or replace the worker. Smoke anonymous search, exact settlement ID,
overview/members/inventory/crafts, recipe/catalog/icon reads, stale/unavailable
warnings, public unsupported routes, and every cross-profile denial. Observe for
24 continuous hours before proceeding: review Caddy/Node errors, public cache
and limiter pressure, Relay queue/rejection status, latency/429s, memory/CPU,
SQLite integrity, Timbersteel health, worker generations, history and outbox.
Do not create a new observation timer or service.

### Stage 2: prepare separate OAuth while collaboration remains closed

The credentials may be installed dormant before the 24-hour read-only
observation finishes; doing so does not authorize advancing to Stage 2 or
enabling any public feature. Configure these GitHub environment secrets in
`relay-preview`:

- `PUBLIC_DISCORD_OAUTH_CLIENT_ID`
- `PUBLIC_DISCORD_OAUTH_CLIENT_SECRET`

Run `Install public Claim Monitor OAuth credentials` from `main`, enter
`claim-monitor.com` exactly, and approve its `relay-cutover` gate. The workflow
sends both values only through SSH stdin to a revision-bound root helper. It
atomically replaces only the two public OAuth environment values, restarts only
the web service, verifies the running process loaded the credentials, confirms
the worker PID did not change, and rolls the environment back on failure. It
must finish with all three public flags still `false` and the public OAuth start
route returning `404`.

After the 24-hour read-only observation succeeds, verify the exact callback and
`identify` scope in the Discord Developer Portal. Keep
`PUBLIC_COLLABORATION_ENABLED=false`, so login, sessions, mutations, and plans
remain unreachable. This is a configuration preflight, not an OAuth launch.

### Stage 3: enable OAuth and collaboration

Set `PUBLIC_COLLABORATION_ENABLED=true` only after Stage 2 succeeds and the
persistent `PUBLIC_PLAN_TOKEN_HMAC_KEY` is backed up. Restart only the web
service. Smoke login/callback without a real production message, legal
acceptance, CSRF/logout, export, recent reauthentication/deletion preflight,
plan create/edit/compute/archive, invitation acceptance, bearer redaction,
revision conflicts, quotas, moderation suspend/restore, and exact-token
revocation. Confirm a matching Timbersteel administrator Discord ID cannot gain
Timbersteel Admin through public OAuth.

Repeat the bounded fingerprints and operational checks after every stage. A
public test must never send a bot message, drain or enqueue the Timbersteel
Discord outbox, alter the configured claim/active plan, or write Timbersteel
history.

## Safe validation and smoke matrix

Run from the repository root with local fixtures. These commands disable live
Relay polling and Discord network delivery inside their tests.

```sh
node --test --test-name-pattern="semantic Caddy validation" scripts/test/deploy-cutover-system.test.mjs
node --test scripts/test/deploy-runtime-config.test.mjs
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
```

The final smoke evidence must cover:

| Profile | Flow | Expected proof |
| --- | --- | --- |
| Timbersteel | Every currently visible navigation route plus `/bot`, Admin, login/account/settings, market, map, planning, activity/history, notifications and configured-claim data | No blank page/console error; existing cookies/preferences and access behavior unchanged |
| Public, flags off | `/api/profile`, `/api/public/**`, `/api/local/**`, `/api/discord/**`, `/bot`, Admin | Profile reports all flags false; everything else denied; Timbersteel remains operational |
| Public read-only | `/`, search by name and exact ID, settlement overview/members/inventory/crafts, catalog/recipe/icon, unsupported public route | Supported reads render; unsupported and private namespaces deny without leakage |
| Cross-profile | Timbersteel requesting `/api/public/**`; public requesting any Timbersteel/Admin/Discord route; unknown production host | `404`, `404`, and `421` respectively, before session lookup |
| Public collaboration | Login/callback/session/legal/CSRF/logout/export/reauth/deletion preflight; owner/editor/viewer/bearer plan paths; conflicts, quotas, moderation | Separate public cookies/tables and role projections; no Timbersteel Admin promotion or outbox/history writes |
| Flags restored off | Repeat both profiles after setting public gates false | Public capability closes without schema rollback; all Timbersteel routes and worker behavior remain healthy |

Use browser developer tools to record status and console failures, not cookie
values or bearer fragments. The focused `host-profile-boundaries.test.mjs`
fixture proves public search/snapshot reads leave Timbersteel settings,
repositories, history, transition outbox, and Discord outbox byte-identical.

## Privacy, retention, moderation, and recovery

The same controller operates a separate BitCraft Claim Monitor policy and uses
`privacy@claim-monitor.com`. Public anonymous lookups do not require an account.
Optional accounts use Discord OAuth `identify` only. Necessary `__Host-`
cookies are Secure, HttpOnly, SameSite=Lax, Path `/`, and have no Domain;
Timbersteel cookie names and browser storage are not reused.

Apply the retention table published by the server-owned public policy: sessions
30 days; recent deletion reauthentication 10 minutes; full IP security logs 7
days; hashed/anonymised security logs 180 days; privacy correspondence normally
24 months; encrypted backups normally no more than 90 days; pseudonymous
deletion-restoration receipts 90 days. Inactive public accounts become purge
eligible after 24 months only under the policy's plan/membership rules. Plans,
memberships, links, and legal records follow their documented event/deletion
criteria. Generated exports are returned directly and are not retained as a
separate server file.

Self-service deletion requires recent reauthentication by the same Discord
account and an explicit transfer-or-delete disposition for every owned plan.
Retained plan events are anonymised. The signed privacy ledger and restore
replay protect both profiles against resurrection after database restore.
Never perform ad-hoc deletion SQL.

Public moderation is reachable only through the existing authenticated
Timbersteel Admin boundary. Use exact account, plan, invitation, or share-link
identifiers. Suspension revokes sessions/capabilities; member access receives
the documented locked response while bearer access stays generic. Restore only
through the moderated action, and preserve the existing audit trail. Moderator
tools do not edit plan documents or reveal raw tokens.

## Rollback and public maintenance

Rollback is feature-gated and non-destructive. First set:

```env
PUBLIC_PROFILE_ENABLED=false
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false
```

Restart only `bitcraft-claim-monitor-relay.service`, verify the public profile
reports disabled flags and public APIs return `404`, then smoke Timbersteel.
Do not stop the Timbersteel worker, collector or timers. Do not restore an old
database, revert additive schema, delete `public_*` rows, rotate the plan-token
HMAC key, drain/modify the outbox, or clear cookies/preferences.

If an explicit public maintenance page is needed, change only the
`claim-monitor.com` site block to an unproxied `503` with `Retry-After`, while
leaving every Timbersteel block and `www`-to-apex redirect intact. Validate and
reload the same Caddy instance. Never redirect public traffic to Timbersteel,
and never remove the public hostname after it has served users. Restore the
reviewed public proxy block only after the fault is understood; the flags remain
off until a new staged rollout is approved.

Record rollback time, reason, flag values, Caddy hash, web restart result,
Timbersteel health, worker health, SQLite checks, outbox status, fingerprints,
and the retained release/backup evidence. Required operator follow-up is to fix
forward, repeat preflight, and begin again at Stage 0; there is no schema or data
rollback step.
