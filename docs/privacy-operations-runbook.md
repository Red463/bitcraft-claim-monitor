# Privacy Operations Runbook

Controller: Thomas Bush, operating Timbersteel Claim Monitor and BitCraft Claim Monitor (not a company or separate legal entity)
Contacts: privacy@timbersteeltrade.com for Timbersteel; privacy@claim-monitor.com for the public Claim Monitor profile

This is an operational checklist, not legal advice. Preserve the minimum evidence needed to handle a request and do not ask for identity documents when the signed-in Discord account or an existing verified email exchange is sufficient.

## Data-rights requests

1. Record the request date, requested right, response deadline, and the minimum contact details needed to reply.
2. Ask the requester to use the signed-in **Privacy & Data** screen when possible. Its export and deletion controls are the preferred verification path.
3. If sign-in is unavailable, verify control of the known Discord account or reply through the established privacy email thread. Do not collect a postal address or unnecessary identity documents.
4. For access/portability, provide the app JSON export and explain exclusions for other users, secrets, security material, and public BitJita game data.
5. For correction, correct account identity/link data where supported or remove the incorrect link. Public BitJita data must be corrected at its source.
6. For objection/restriction, withdraw analytics, disable optional processing, and document any processing that must remain for security/legal claims.
7. For erasure, use recent Discord reauthentication and self-service account deletion. If self-service is impossible, verify the requester, create a protected operational record, then use **Admin → Linked Accounts → Delete account data** and type `DELETE`. This uses the same signed deletion coordinator; never use direct ad-hoc SQL. The deletion remains complete if its Discord DM fails.
8. Reply with the non-sensitive receipt and scope. Keep privacy correspondence in Proton only as needed, normally no longer than 24 months unless a dispute or legal obligation requires longer.

Public Claim Monitor requests use the separate signed-in public **Settings →
Privacy & Data** flow and `privacy@claim-monitor.com`. Public OAuth, sessions,
plans, memberships, bearer links, acceptance records, exports and moderation
live in the additive `public_*` boundary. Never satisfy a public request by
changing a Timbersteel account or administrator. Public account deletion
requires recent same-account Discord reauthentication plus an explicit
transfer-or-delete disposition for every owned plan; retained plan events are
anonymised. Never use ad-hoc SQL for either profile.

## Deletion and restore safety

- The current ledger is `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`.
- Its HMAC key is `/etc/bitcraft-claim-monitor/privacy-ledger.key`, owned by root with group `bitcraft`, mode `0640`.
- Temporary exception accepted by the owner on 2026-07-25: regular full-VPS backups are the current ledger recovery copy. They protect database-only recovery but are not independent of the VPS or HostWorld failure domain.
- Never roll the live ledger back merely because an older application database snapshot is selected.
- Verify every ledger signature before starting the service. A verification failure is a production blocker.
- After restoring SQLite, run the replay helper with explicit database, ledger, and key paths before service start. Startup also replays as a safety net.
- Retain current and previous ledger verification keys during rotation until every record under the old key ID has expired (90 days). Never rewrite signed historical records.
- At canonical cutover, the migrated old key is a previous verification key only. Retire that previous verification key as soon as no unexpired record bears its key ID, and never keep it beyond the remaining 90-day signed-record lifetime. Verify both current and configured previous keys before replay; do not log key values.
- The restore/preflight replay reads the current key path argument plus the
  comma-separated `PRIVACY_LEDGER_PREVIOUS_KEY_FILES` path configuration. It
  rejects missing, malformed, duplicate, out-of-root, symlinked, or unverifying
  key inputs before mutation. Its bounded result contains only record/key counts
  and per-profile status/scanned/deleted counts.
- Replay routes `discord:` subjects only through the Timbersteel deletion path
  and `public-profile:discord:` subjects only through the public account/plan
  deletion path. Both profiles commit together or roll back together. A receipt
  for one profile cannot delete the same Discord ID in the other profile.
- For database-only recovery, preserve the live ledger, restore SQLite, verify the ledger, and replay committed deletions before starting either service.
- For full-VPS recovery, restore the newest available full-VPS backup, identify and verify the newest ledger captured by it, and replay it before service start. Record that deletions after the backup timestamp may need reconstruction from protected privacy correspondence or non-sensitive audit receipts.
- Off-VPS hardening is deferred to uniquely named snapshots under `Proton Drive/My files/Timbersteel Claim Monitor/Privacy Recovery/Deletion Ledger/`. Keep the signing key separate. Remove this exception only after upload and restore verification pass.

## Encrypted backups and restore

1. Provision `/etc/bitcraft-claim-monitor/backup-encryption.key` as one base64url-encoded 32-byte value, root-owned mode `0600`.
2. The backup service makes a protected SQLite partial, runs `PRAGMA quick_check`, encrypts with AES-256-GCM and a fresh nonce, decrypts to a protected validation partial, runs `quick_check` again, and atomically publishes only `.sqlite.enc`.
3. Ensure plaintext partials are removed on success and failure. Never copy the encryption key into the backup directory.
4. For restore, decrypt to a mode-0600 temporary file, run `quick_check`, install the database, replay the newest deletion ledger, then start services.
5. Test a full encrypted restore and ledger replay at least quarterly. Record date, operator, selected recovery point, ledger key IDs, checks, and result without personal data.

## Retention and inactive accounts

Review the daily `privacy-retention` job in Admin scheduled-job diagnostics. Investigate any failed deletion or warning delivery, but a closed Discord DM must not extend retention. Accounts are warned once about 30 days before deletion and removed after 24 calendar months of inactivity. A successful login clears the warning state.

For BitCraft Claim Monitor, apply its separately published retention table:
public sessions 30 days, deletion reauthentication 10 minutes, full-IP security
logs 7 days, hashed/anonymised security logs 180 days, privacy correspondence
normally 24 months, encrypted backups normally no more than 90 days, and signed
deletion-restoration receipts 90 days. A public account is purge-eligible after
24 months without login only under the policy's owned-plan and accepted-editor
membership conditions. Do not silently apply the Timbersteel inactivity job to
public tables without a reviewed public retention implementation.

## Incident and breach triage

1. Contain access, preserve relevant logs, rotate affected secrets, and avoid destroying evidence.
2. Identify data types, people, duration, recipients, encryption state, and likely consequences.
3. Record the incident timeline and mitigations without copying unnecessary personal data.
4. Assess notification obligations promptly, including the UK ICO 72-hour personal-data-breach window where applicable. Obtain legal advice for material incidents.
5. Notify affected people when required, using clear practical risk and mitigation information.
6. Afterward, update controls, provider disclosures, retention, and this runbook.

## Change review

Review Terms, Privacy, legitimate-interest assessments, providers, international transfers, and Discord Developer Portal URLs whenever functionality, hosting, DNS/email, donations, analytics, or providers change. Current disclosed providers include Namecheap, HostWorld, Proton, GitHub, Discord, Buy Me a Coffee, and BitJita. Reconfirm the production arrangement rather than assuming this list remains accurate.
