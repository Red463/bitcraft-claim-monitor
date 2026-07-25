# Legal, Privacy, Consent, and Self-Service Data Controls Design

**Date:** 2026-07-25  
**Status:** Approved design  
**Application:** `apps/bitcraft-local`  
**Controller:** Thomas Bush  
**Privacy contact:** `privacy@timbersteeltrade.com`

## Purpose

Expand Timbersteel Claim Monitor's Terms of Service and Privacy Policy so they accurately describe the application, its Discord integration, its administrator features, and its personal-data processing. Align application behavior with those documents through versioned legal acceptance, privacy-preserving administrator character assignment, self-service data export and deletion, explicit retention, and recovery-safe deletion.

This design reduces legal and platform-compliance risk but is not a substitute for advice from a qualified solicitor. The final documents must be independently reviewed before being treated as comprehensive legal advice.

## Operator and service status

The public documents identify the operator as:

> Thomas Bush is the individual developer and operator of Timbersteel Claim Monitor, a free, unofficial community project. Timbersteel Claim Monitor is not a company or separate legal entity.

The public privacy contact is `privacy@timbersteeltrade.com`. No postal address is published in this version. The documentation must flag the geographic-address question and the ICO data-protection fee self-assessment for independent review.

The service:

- is operated from England;
- is governed by the laws of England and Wales;
- remains available worldwide;
- preserves mandatory rights that apply in a user's location;
- is free to use;
- has an optional Buy Me a Coffee donation link;
- does not grant features, priority, or other consideration in exchange for donations;
- is limited to people aged 18 or over;
- is unofficial and is not affiliated with Clockwork Labs, BitCraft, BitJita, Discord, HostWorld, Namecheap, Proton, GitHub, or Buy Me a Coffee.

## Selected approach

Implement legal documents and enforceable privacy controls together. A copy-only update is rejected because policy wording cannot cure processing that is undisclosed, unexpected, or unsupported by matching application behavior.

The selected approach includes:

1. Comprehensive and separate Terms of Service and Privacy Policy.
2. Versioned acceptance before Discord sign-in.
3. Renewed acceptance after material legal changes.
4. Mandatory user notification before administrator character assignment.
5. Self-service export, granular clearing, unlinking, analytics deletion, and full account deletion.
6. Explicit retention and automated pruning.
7. A documented legitimate-interests assessment for administrator linking, security, administration, and moderation.
8. Recovery-safe deletion that is not silently undone by restoring an old database backup.

## Legal documents

### Terms of Service

The Terms cover:

- operator identity and contact details;
- eligibility and the 18+ requirement;
- worldwide availability and England and Wales governing law;
- anonymous use and signed-in account use;
- Discord OAuth, account security, sessions, and saved preferences;
- user-requested and administrator-assigned character links;
- public BitJita data and derived calculations;
- Discord bot commands, notifications, guild tools, role management, moderation, polls, events, and diagnostics;
- market watches, alerts, production tools, history, analytics, backups, and administration;
- acceptable use;
- suspension and termination;
- intellectual property and third-party trademarks;
- optional donations;
- service changes and availability;
- fair liability limitations;
- complaints and contact routes;
- changes to the Terms;
- severability, waiver, assignment, and entire-agreement wording.

Users must not:

- impersonate another person;
- submit a knowingly false character link;
- bypass access controls;
- attack, overload, probe, or disrupt the service;
- scrape restricted or personal data;
- misuse Discord or BitCraft identifiers;
- misuse another person's personal information;
- abuse bot, moderation, notification, or administrator functions;
- submit unlawful, infringing, deceptive, or harmful content;
- breach applicable law or relevant platform rules.

The service may restrict access for security, abuse prevention, Discord/community moderation, or legal reasons. Where appropriate, the user receives a reason and may request review.

### Fair liability language

The Terms may state that:

- the service does not guarantee uninterrupted availability;
- public third-party game data and derived estimates can be incomplete, delayed, unavailable, or inaccurate;
- users must not rely on the app as the sole source for important settlement or financial decisions;
- the operator is not responsible for losses caused solely by user misuse, unauthorised third-party conduct, or matters genuinely outside reasonable control.

The Terms must not:

- attempt to exclude liability for death or personal injury caused by negligence;
- exclude fraud, deliberate wrongdoing, data-protection duties, or liability that law does not permit to be excluded;
- use a blanket "liable for nothing" clause;
- remove mandatory consumer or privacy rights;
- hide material restrictions or give the operator unbalanced unilateral powers.

### Privacy Policy

The Privacy Policy identifies:

- Thomas Bush as the individual controller;
- `privacy@timbersteeltrade.com` as the rights and complaints contact;
- each personal-data category;
- the source of each category;
- the purpose and lawful basis for each use;
- recipients and service providers;
- international processing;
- retention periods or criteria;
- security measures at an appropriate, non-sensitive level;
- self-service privacy controls;
- rights-request procedures;
- the user's right to complain to the UK Information Commissioner's Office;
- the 18+ requirement;
- policy version, effective date, and change process;
- the absence of solely automated decisions with legal or similarly significant effects;
- that special-category information is not intentionally requested.

## Data inventory and lawful bases

### Discord account and application account data

Data:

- Discord user ID;
- username, global/display name, and avatar reference;
- OAuth and session metadata;
- account creation and login timestamps;
- saved application settings;
- legal acceptance versions and timestamps.

Sources:

- the user;
- Discord OAuth;
- normal server activity.

Purposes and bases:

- providing requested signed-in account features: contract;
- session and account security: legitimate interests;
- demonstrating current legal acceptance: contract and legitimate interests;
- legal compliance and claims where necessary: legal obligation or legitimate interests, depending on the specific requirement.

### Character-link data

Data:

- BitCraft player ID;
- character name;
- link status;
- whether the link was user-requested or administrator-assigned;
- assignment, approval, notification, unassignment, and deletion timestamps;
- responsible administrator identity in protected audit records.

Sources:

- the user;
- authorised administrators;
- public BitJita settlement/member data.

Purposes and bases:

- user-requested links and verified access: contract;
- administrator assignment for settlement access and account administration: legitimate interests, subject to the approved LIA and safeguards;
- audit and abuse prevention: legitimate interests.

### User-selected features

Data:

- saved preferences and themes;
- selected member;
- notification preferences;
- market deal watches;
- personal deal alerts and read status;
- Discord craft watches;
- poll and RSVP votes;
- user-triggered commands and interaction metadata.

Purposes and bases:

- providing requested features: contract;
- reliable delivery and troubleshooting: legitimate interests.

### Discord guild administration and moderation

Data:

- guild, channel, role, and message identifiers;
- moderation cases, warnings, notes, temporary bans, and reasons;
- role and nickname administration;
- component interactions;
- delivery results and diagnostics;
- administrator or moderator identity.

Purposes and bases:

- operating authorised community-management features: legitimate interests;
- community safety, abuse prevention, and auditability: legitimate interests;
- performing a user's explicit bot request where applicable: contract.

Free-text fields must warn administrators not to enter special-category or unnecessary personal information.

### Security and administration

Data:

- administrator accounts, roles, permissions, and sessions;
- administrator login events and audit records;
- request time, route group, status class, IP address, anonymised IP prefix, IP hash, visitor key, user-agent hash, country, and city where configured;
- server and delivery diagnostics.

Purposes and bases:

- service security, fraud and abuse prevention, operational diagnosis, and accountability: legitimate interests;
- legal compliance where a specific obligation applies: legal obligation.

### Optional analytics

Data:

- random browser and session identifiers;
- page/section visits;
- high-level feature actions;
- engagement duration.

Purpose and basis:

- product improvement: consent.

Analytics consent is separate from the Terms. Declining analytics does not prevent use of the app or account features.

### Public game and settlement data

Data can include public character names, player IDs, professions, skills, membership, production, storage, activity, market, and related game records returned by BitJita.

Purposes and bases:

- settlement monitoring and community operations: legitimate interests;
- providing user-requested app views: contract where the user is signed in and requests the feature.

Public game history exists independently of a Discord account. Account deletion does not automatically delete public BitJita history, but a user may object or raise a specific request through the privacy email.

### Privacy correspondence

Data:

- requester contact details;
- request contents;
- identity-verification evidence limited to what is reasonably necessary;
- response and completion records.

Purposes and bases:

- legal compliance and protecting users from unauthorised disclosure or deletion: legal obligation and legitimate interests.

### Donations

The app links to Buy Me a Coffee. It does not collect or store card or payment-account details. Buy Me a Coffee and its payment provider process donations under their own terms and privacy policies. Any supporter information made available to Thomas Bush through Buy Me a Coffee must be used only for administering the voluntary contribution and related legal/accounting obligations.

## Service providers and external services

The policy names:

- **HostWorld Internet Limited** — UK VPS, application, and database hosting;
- **Namecheap** — domain registration and authoritative DNS;
- **Discord Inc.** — OAuth identity, Discord APIs, bot interactions, direct messages, guild functions, and moderation actions;
- **BitJita** — public BitCraft game-data source;
- **Proton AG** — privacy correspondence mailbox provider;
- **Buy Me a Coffee / Publisherr Inc.** — optional external contribution service, with its payment processor;
- **GitHub** — source, issue, and release links opened only when selected by a user.

The app does not:

- sell personal information;
- run behavioural advertising;
- share Discord API data with donation or advertising services;
- add Discord account identifiers to BitJita API requests.

The policy explains that some providers may process data outside the UK under their own legal frameworks and transfer safeguards. It links to current provider privacy information without claiming control over provider practices.

### Deployment-specific public legal configuration

The maintained Timbersteel deployment defaults to Thomas Bush and the providers listed above. Public legal configuration is explicit and contains only information intended for publication:

- individual controller name;
- project name and non-company status;
- privacy email;
- country of operation and governing law;
- minimum age;
- named hosting, domain/DNS, email, donation, platform, and data providers;
- policy versions and effective date.

Self-hosters must replace these values before enabling Discord login or public deployment. The UI must not silently present Thomas Bush as controller for a differently operated deployment.

## Retention schedule

| Data | Retention |
|---|---|
| Discord account, settings, character link, and legal acceptance | While active; automatically delete after 24 months without login, with a 30-day Discord warning where deliverable |
| User sessions | 30 days |
| Administrator sessions | 7 days |
| Deal watches | Until removed or the account is deleted |
| Personal deal alerts | 180 days |
| Character-assignment and administrator audit records | 12 months; scrub affected-user identifiers after account deletion |
| Discord moderation records | While active, then up to 12 months; delete or anonymise user-linked records after account deletion unless a documented legal requirement prevents it |
| Discord delivery diagnostics | 90 days or the latest 250 records, whichever removes records sooner |
| Poll/RSVP votes and temporary interaction records | 90 days after the event ends |
| Analytics events | 90 days |
| Analytics consent and browser identifier | 180 days |
| Full IP address | 7 days |
| Hashed/anonymised security statistics | 180 days |
| Craft Plan progress audit | 14 days |
| Empire membership history | 365 days |
| Server health metrics | 7 days |
| Privacy correspondence | Up to 24 months after the request closes |
| Daily backups | Seven recovery points, normally no more than seven days |
| Migration backups | Three recovery points with an absolute maximum of 90 days |
| Manual backups | Three recovery points with an absolute maximum of 90 days |
| HMAC deletion-restoration ledger | 90 days |

Retention jobs must enforce the published periods. Legal or security holds require a documented reason, limited access, and deletion when the hold ends.

## Legal acceptance

### Current legal version

The application defines:

- a public legal-policy version;
- a Terms content digest;
- a Privacy Policy content digest;
- an effective date;
- the minimum age.

Content cannot change silently while retaining the same acceptance identifier. A material change increments the policy version and requires acceptance again.

### New Discord sign-in

Before Discord OAuth begins:

1. Show links to the current Terms and Privacy Policy.
2. Require an explicit Terms acceptance checkbox.
3. Require an explicit confirmation that the user is at least 18.
4. POST the decision to a legal-preparation endpoint.
5. Set a short-lived, signed, HTTP-only acceptance-state cookie.
6. Redirect to the existing Discord OAuth start route.
7. Validate and consume the acceptance state during the OAuth callback.
8. Create or update the account.
9. Store the legal version, content digests, acceptance time, age confirmation, and acceptance source.

The acceptance-state cookie is one-time, expires quickly, is bound to the OAuth state, and cannot be replayed.

### Existing Discord accounts

`/api/local/auth/me` reports whether the current account has accepted the current version. On the next visit after this feature is deployed, an existing account with no current acceptance sees a blocking legal-review screen.

Before acceptance, authenticated account routes are denied except:

- legal content and legal status;
- acceptance;
- export;
- account deletion;
- logout;
- public application routes.

Users can review the documents, export or delete their data, and sign out without accepting.

### Analytics separation

Terms acceptance does not grant analytics consent. The analytics cookie and existing consent decision remain separate, optional, and revocable.

## Administrator character assignment

### Safeguards

An administrator assignment requires:

- an authenticated administrator;
- `accounts.manage`;
- CSRF validation;
- a target account that accepted the current legal version;
- a known settlement character;
- no conflicting approved owner;
- an approved legitimate-interests assessment;
- successful direct Discord notice to the target user before assignment.

### Assignment flow

1. Validate permission, CSRF, account, legal acceptance, character, and duplicate ownership.
2. Send a Discord DM to the target user. The message identifies the character, explains that an administrator initiated the assignment, names the project, links to privacy/removal information, and explains self-service removal.
3. If the DM fails, return a clear error and make no assignment.
4. After DM success, begin an immediate database transaction and repeat the ownership check.
5. Commit the approved assignment and audit record.
6. Send the existing administrator/mod-log notification.
7. If the final transaction fails after the DM, attempt a corrective DM explaining that the assignment did not complete and record diagnostics.

The application does not use another channel or email as a fallback for the user notice.

### Legitimate-interests assessment

Before the feature is enabled in production, add a reviewed LIA under `docs/legal/` that records:

- the specific settlement access/account-administration purpose;
- why administrator assignment is necessary instead of relying only on user linking;
- the user's reasonable expectations after accepting the current documents;
- privacy risks from an incorrect or unwanted association;
- alternatives considered;
- the successful-DM requirement;
- restricted visibility;
- duplicate and race protections;
- self-service unlinking and deletion;
- objection handling;
- the balancing-test conclusion;
- review triggers and review date.

Separate LIA sections cover security logging and Discord community moderation rather than treating every legitimate-interest use as one generic purpose.

### Unassignment

Administrator unassignment:

1. removes the character link first;
2. writes an audit record;
3. attempts the user DM and administrator/mod-log notification;
4. records delivery success or failure.

Failed user notification never restores or blocks a privacy-protective unassignment.

User self-service unassignment remains available and is surfaced in the Privacy & Data section.

## Self-service Privacy & Data section

User Settings gains a dedicated Privacy & Data section.

### Download my data

Export a readable JSON file containing only the requesting user's:

- account profile;
- legal acceptances;
- character-link history;
- saved settings;
- market watches and alerts;
- notification preferences;
- Discord craft watches;
- poll/RSVP records;
- relevant moderation and delivery records that can be disclosed without exposing other people or protected administrator information.

The export excludes:

- tokens and secret values;
- session hashes;
- other users' information;
- unrestricted administrator notes;
- security information that would impair abuse prevention;
- protected third-party information.

The response uses `Cache-Control: no-store` and a safe download filename.

### Granular actions

Provide:

- Unlink my character;
- Clear saved preferences;
- Delete market watches and personal alert history;
- Delete this browser's analytics history and withdraw analytics consent.

Each action is authenticated where account data is involved, CSRF-protected, rate-limited, and reports category-level results.

### Delete my account and personal data

Full deletion requires:

- a current authenticated account session;
- recent Discord reauthentication;
- an explicit typed destructive-action confirmation.

Deletion:

1. attempts a final confirmation DM and records the outcome without allowing failure to block deletion;
2. opens a database transaction;
3. revokes all user sessions;
4. deletes the Discord profile, avatar reference, settings, character link, and acceptance records;
5. deletes watches, alerts, notification choices, craft watches, votes, RSVPs, warnings, notes, temporary bans, and other records keyed to the Discord user;
6. deletes moderation records that concern only the departing user and removes that user's identifiers from shared cases that must remain intelligible for other affected people;
7. scrubs the user's Discord and character identifiers from delivery diagnostics and administrator audit metadata;
8. removes current-browser analytics and security identifiers where they can be reliably matched;
9. commits the transaction;
10. writes an HMAC-only deletion-restoration record outside the main database;
11. clears account cookies;
12. returns category-level deletion counts and a non-personal receipt ID.

Failure rolls back the database transaction and leaves the account intact. A failed confirmation DM does not block user-requested deletion.

After deletion, the user may sign in again. This creates a new account and requires current legal acceptance.

### Administrator accounts

Ordinary user accounts and administrator identities remain separate.

- Deleting an ordinary user account does not silently delete an administrator role.
- Removing an administrator role does not silently delete ordinary user data.
- A sole owner cannot delete the administrator identity while it is required to control the deployment.
- The owner must transfer ownership or remove the administrator role before requesting deletion of that administrator identity.
- Ordinary user-account data can still be deleted independently.

### Users who cannot sign in

Users may contact `privacy@timbersteeltrade.com`. Identity checks use only information reasonably necessary to prevent disclosure or deletion of another person's data. Requests normally receive a response within one month.

## Backup-safe deletion

Deleted data disappears from the live database immediately. Restricted backup copies may retain data only for the published backup window and are not used for ordinary application processing.

A separate append-only deletion-restoration ledger stores:

- an HMAC of the Discord ID;
- deletion time;
- expiry time;
- a random non-personal receipt ID.

It stores no plaintext Discord ID, username, character name, or exported account content. Its HMAC secret is not stored in the ledger.

On restoration:

1. restore and validate the database;
2. before starting public services, scan active ledger entries;
3. match restored account Discord IDs by HMAC;
4. run the same deletion/scrubbing service for matches;
5. record the recovery cleanup result;
6. start services only after the deletion pass succeeds.

Ledger records expire after 90 days, matching the longest backup window.

## Inactive-account deletion

A scheduled privacy-retention job:

1. finds accounts approaching 24 months without login;
2. sends a warning DM 30 days before deletion where deliverable;
3. deletes accounts at 24 months even if warning delivery was unavailable;
4. uses the same deletion and backup-ledger service as self-service deletion;
5. records non-personal completion diagnostics.

Signing in resets the inactivity period.

## Rights and complaints

The Privacy Policy explains rights to:

- information;
- access;
- rectification;
- erasure;
- restriction;
- objection;
- applicable portability;
- withdrawal of analytics consent;
- complaint to Thomas Bush;
- complaint to the UK Information Commissioner's Office.

The policy explains that rights can have lawful limits and that the operator will provide reasons where a request cannot be fulfilled in full.

## Security and error handling

- Legal, privacy, export, deletion, and assignment routes have focused rate limits.
- Mutations use same-origin and CSRF protection.
- Acceptance and reauthentication state is signed, short-lived, one-time, and HTTP-only.
- Export and privacy responses use no-store headers.
- Free-text fields discourage unnecessary or special-category data.
- Error messages do not expose Discord API internals, secrets, other accounts, or moderation details.
- Assignment DM failure leaves the link unchanged.
- Unassignment and deletion are not blocked by failed notifications.
- Deletion is transactional.
- Backup restoration fails closed if the deletion-ledger pass cannot complete.
- Public legal configuration exposes only deliberately public operator/provider information.
- Bot tokens, OAuth secrets, HMAC keys, session hashes, and admin secrets never appear in legal configuration or exports.

### Encryption-at-rest release gate

Discord's Developer Terms require commercially reasonable protection for API data, including encryption at rest. The legal documents must not claim encryption that has not been verified.

Before release:

1. confirm and document whether the HostWorld production volume and provider snapshots are encrypted at rest;
2. encrypt application-created database backups with a separately stored recovery key;
3. ensure temporary backup files are protected and removed after encryption or failure;
4. restrict database, deletion-ledger, backup, and recovery-key permissions to the production service/administrator identities that require them;
5. verify restoration from an encrypted backup, including deletion-ledger replay;
6. record the result in deployment documentation.

If production-volume encryption cannot be confirmed, the deployment must add an approved host/filesystem or application-layer encryption control before enabling the expanded Discord account processing. This is a deployment blocker, not wording that can be waived in the Terms.

## Application structure

Prefer focused modules:

- a shared legal-policy definition consumed by pages and dialogs;
- a legal-acceptance server module;
- a user-privacy server module;
- a deletion-ledger module;
- a Privacy & Data React section;
- a blocking legal-review component;
- focused CSS beside existing legal/settings patterns.

The current `LegalDialogs.tsx` should become a renderer of structured legal content rather than the only source of policy text. The dedicated `/terms` and `/privacy` routes and in-app dialogs must render the same current source.

Suggested public/authenticated interfaces:

- `GET /api/local/legal`;
- `POST /api/local/auth/legal/prepare`;
- `PUT /api/local/auth/legal/accept`;
- `GET /api/local/auth/privacy/export`;
- `DELETE /api/local/auth/privacy/analytics`;
- `DELETE /api/local/auth/privacy/preferences`;
- `DELETE /api/local/auth/privacy/market`;
- Discord OAuth reauthentication with a signed privacy-deletion purpose;
- `DELETE /api/local/auth/account`.

Exact helper names may follow existing repository conventions, but the behavior and security boundaries are fixed by this design.

## Database changes

Add an append-only acceptance table containing:

- acceptance ID;
- user ID;
- legal-policy version;
- Terms digest;
- Privacy digest;
- accepted timestamp;
- age-confirmed flag;
- acceptance source.

Preserve existing account and session data during migration. Existing accounts start in "acceptance required" state without being deleted or signed out before they have an opportunity to review the documents.

Deletion statements must explicitly cover every user-linked table. Do not rely only on foreign-key cascades because current tables do not consistently declare cascading relationships.

## Verification

### Legal and configuration coverage

- public Terms and Privacy pages use the same policy source;
- operator identity is accurate and does not imply a company;
- provider disclosures and links are present;
- 18+, worldwide use, governing law, donations, rights, and fair liability language are present;
- no postal address is invented;
- analytics consent remains separate.

### Acceptance

- safe schema migration on an existing database;
- new-user pre-OAuth acceptance;
- explicit 18+ confirmation;
- signed state expiry, tamper rejection, one-time use, and replay rejection;
- callback acceptance persistence;
- existing-account next-visit prompt;
- material-version renewal;
- account-route blocking before acceptance;
- continued access to legal, export, deletion, logout, and public routes.

### Character assignment

- current acceptance required;
- successful DM precedes assignment;
- failed DM prevents assignment;
- duplicate approved ownership remains blocked;
- final ownership recheck prevents races;
- failed final transaction records and attempts correction;
- administrator notification remains;
- user and administrator unassignment;
- failed unassignment DM does not restore the link.

### Self-service privacy

- export is scoped and redacted;
- preferences clearing;
- market-data deletion;
- current-browser analytics deletion and consent withdrawal;
- user unlinking;
- recent reauthentication and typed confirmation;
- complete cross-table deletion;
- JSON metadata scrubbing;
- session revocation and cookie clearing;
- failed transaction rollback;
- sole-owner handling;
- re-sign-in creates a new account requiring acceptance.

### Retention and recovery

- each published retention rule has focused pruning coverage;
- inactive warning and deletion;
- HMAC ledger contains no plaintext identity;
- simulated old-backup restoration reapplies deletion;
- expired ledger entries are pruned;
- restoration fails closed if deletion replay fails.

### Full verification

- focused server, permission, schema, OAuth, Discord delivery, privacy, retention, and frontend tests;
- production build;
- full application test suite;
- browser verification of legal pages, acceptance, Privacy & Data controls, desktop layout, narrow layout, and console errors;
- no real Discord notification during automated tests;
- no real user data in fixtures.

## Documentation and compliance follow-up

Update:

- README privacy, Discord, account, and provider documentation;
- deployment documentation for public legal configuration and deletion ledger;
- Discord Developer Portal Terms and Privacy URLs;
- backup restoration procedure;
- retention and privacy-request operating notes.

Thomas Bush should:

1. use the ICO fee self-assessment and register/pay if required;
2. obtain independent UK solicitor review of the final documents;
3. review whether a geographic correspondence address must be published;
4. keep provider agreements and transfer safeguards under review;
5. review the legitimate-interests assessments when the feature or data use changes;
6. periodically test export, deletion, backup restoration, and rights-request procedures.

## Authoritative references

- ICO: information required under UK GDPR  
  <https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment/what-information-you-must-supply-under-the-gdpr/>
- ICO: legitimate interests  
  <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/>
- ICO: storage limitation  
  <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/>
- ICO: data-protection fee  
  <https://ico.org.uk/for-organisations/data-protection-fee/>
- CMA: writing fair consumer contracts  
  <https://www.gov.uk/guidance/writing-a-fair-contract-for-customers>
- Discord Developer Terms  
  <https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service>
- Discord Developer Policy  
  <https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy>
- HostWorld privacy policy  
  <https://hostworld.uk/privacy-policy/>
- Proton privacy policy  
  <https://proton.me/legal/privacy>
- Buy Me a Coffee privacy policy  
  <https://buymeacoffee.com/privacy-policy>
- Namecheap privacy details  
  <https://www.namecheap.com/legal/general/details-for-specific-products-services/>
- BitJita API documentation  
  <https://bitjita.com/docs/api>
