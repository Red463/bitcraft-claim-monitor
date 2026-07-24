# Empire Membership History Design

**Issue:** [#53 — Cairn Empire Join List](https://github.com/Red463/bitcraft-claim-monitor/issues/53)  
**Status:** Approved design  
**Date:** 2026-07-24

## Summary

Add an administrator-only Empire Membership page that shows:

- current empire members ordered by their locally observed join or rejoin time;
- members observed joining or rejoining within the last 30 days;
- members observed leaving within the last 30 days;
- all retained current and departed membership records on demand.

BitJita exposes the current empire roster but does not expose an empire join timestamp. The monitor will therefore build an accurate local timeline from deployment onward. Members present in the first successful roster will be labelled **Present when tracking began**, not assigned a fabricated join date.

The implementation will store membership periods rather than recurring roster snapshots. This keeps the database footprint small while supporting departures, rejoins, name updates, and retention.

## Goals

- Give administrators a clear current-member and recent-membership-change view.
- Track joins, confirmed departures, and rejoins from the feature's deployment onward.
- Exclude players who later rejoined from the departed-member list.
- Avoid false departures caused by transient BitJita failures or incomplete responses.
- Keep database growth bounded without storing repeated roster payloads.
- Preserve existing settlement and empire pages and their public access behavior.

## Non-goals

- Reconstructing empire membership before tracking begins.
- Treating claim membership timestamps as empire membership timestamps.
- Exposing membership history to non-administrators.
- Recording every poll as a historical snapshot.
- Exporting the membership list in the first version.
- Sending Discord notifications for joins or departures in the first version.

## Terminology

- **Tracked empire:** The empire currently associated with the configured settlement.
- **Membership period:** One continuous locally observed period during which a player belongs to an empire.
- **Initial roster member:** A player present in the first complete roster observed for an empire.
- **Observed join:** A player appearing after an empire's initial tracking baseline.
- **Observed rejoin:** A player appearing after a previous membership period was closed.
- **Suspected departure:** A current member absent from one successful complete roster.
- **Confirmed departure:** A current member absent from two consecutive successful complete rosters.
- **Tracking session:** The period during which a particular empire is the configured settlement's active empire.

## Source limitations

The BitJita empire detail endpoint returns the current member roster, player identity, rank, and activity-related fields, but not the timestamp at which each player joined the empire. The claim-members endpoint has a `createdAt` field, but it represents claim membership and must not be reused as an empire join date.

Consequently:

- initial members have an unknown historical join date;
- locally observed join/rejoin timestamps are accurate to the collector interval;
- locally observed departure timestamps are accurate to the first successful roster in which the member is absent;
- the UI must consistently distinguish observed timestamps from authoritative game timestamps.

## Architecture

### Collection

Add a focused empire-membership synchronizer to the server's background collection path.

On a due collection:

1. Resolve the configured settlement and its current empire ID.
2. Fetch the empire detail endpoint and validate that it contains a complete, usable roster.
3. Normalize member identity using the stable player entity ID and retain the latest display name.
4. Synchronize the roster against open membership periods in one database transaction.
5. Update collector diagnostics and the tracking record after a successful transaction.
6. Run bounded retention cleanup if the previous cleanup was at least seven days ago.

The feature should use a dedicated `empireMembership` collector setting with a default interval of 60 seconds. This keeps its purpose and diagnostics separate from the existing claim-member collector while avoiding excessive upstream traffic.

### Storage model

Add two additive SQLite tables.

#### `empire_membership_tracking`

One row per tracking session:

- `id` — integer primary key;
- `empire_id`;
- `empire_name` — latest observed name;
- `tracking_started_at`;
- `last_success_at`;
- `tracking_ended_at` — null for the active session;
- `initial_roster_complete` — whether the first valid roster has been established;
- `last_cleanup_at`;
- `updated_at`.

Only one session may be active. A new session is created when tracking begins, the configured settlement changes empire, or tracking returns to a previously tracked empire after an unobserved gap. This prevents an empire/configuration change from being interpreted as a mass departure.

#### `empire_membership_periods`

One row per continuous membership:

- `id` — integer primary key;
- `tracking_session_id`;
- `empire_id`;
- `player_entity_id`;
- `player_name` — latest observed name for the period;
- `observed_joined_at`;
- `first_seen_at`;
- `last_seen_at`;
- `first_missing_at`;
- `observed_left_at`;
- `departure_confirmed_at`;
- `period_ended_at`;
- `end_reason` — null, `departure`, or `tracking_ended`;
- `initial_roster` — true for members present at bootstrap;
- `rejoin` — true when an earlier closed period exists;
- `missing_checks` — consecutive complete rosters from which the member was absent;
- `created_at`;
- `updated_at`.

An open period has `period_ended_at IS NULL`. A partial unique index on `(tracking_session_id, player_entity_id)` for open periods prevents duplicate active memberships within a session. Supporting indexes cover the active session, current members, recent joins, recent departures, and retention queries.

No raw empire response or repeated roster snapshot is stored.

## Synchronization rules

### Initial roster

For the first valid roster of an empire:

- create one open period per member;
- set `initial_roster = 1`;
- set `first_seen_at` and `last_seen_at` to the collection time;
- leave `observed_joined_at` null;
- mark the tracking baseline complete.

These records display **Present when tracking began**.

### Existing current member

When a player has an open period and remains in the roster:

- update `player_name` if it changed;
- update `last_seen_at`;
- reset `first_missing_at` and `missing_checks`.

No historical row is inserted.

### Join or rejoin

When a player appears without an open period:

- create a new open period;
- set `observed_joined_at`, `first_seen_at`, and `last_seen_at` to the collection time;
- set `initial_roster = 0`;
- set `rejoin = 1` if a closed period exists for that empire/player pair.

### Suspected and confirmed departure

When an open member is absent from a valid roster:

- first omission: set `first_missing_at` and `missing_checks = 1`;
- second consecutive omission: close the period using `first_missing_at` as `observed_left_at` and `period_ended_at`, set `departure_confirmed_at` to the current collection time, set `end_reason = 'departure'`, and set `missing_checks = 2`.

If the member returns before confirmation, clear the suspected-departure fields.

### Invalid collection

The synchronizer must not mutate membership periods when:

- the upstream request fails;
- the response cannot be parsed;
- the roster field is absent;
- the result is marked partial;
- the response is unexpectedly empty while previously tracking a non-empty empire, unless a later explicit rule can prove the empty roster is authoritative.

The collector records a warning and preserves the last valid state.

### Empire or configuration changes

When the configured settlement resolves to a different empire:

- set `tracking_ended_at` on the previous active tracking session;
- close that session's open periods with `end_reason = 'tracking_ended'`, without setting `observed_left_at` or creating departure records;
- create a new tracking session and establish an initial baseline for the new empire;
- show only the currently configured empire on the admin page.

If tracking later returns to a previously tracked empire, create another tracking session. Its first complete roster is a new initial baseline, because continuity across the unobserved gap cannot be proved. Previous `tracking_ended` periods are not shown as departures.

## Retention

- Keep open membership periods indefinitely.
- Keep ended periods for 12 months after `period_ended_at`.
- Run cleanup during a successful membership collection no more than once every seven days.
- Delete only ended periods older than the retention threshold.
- Do not run automatic `VACUUM`; SQLite may reuse freed pages, avoiding deployment or collector stalls.

Because the database stores only membership transitions, expected growth is small. Even thousands of membership periods should consume only a few megabytes including indexes.

## Admin API

Add a read-only authenticated endpoint:

`GET /api/local/admin/empire-membership`

It returns:

- tracking status and current empire identity;
- current-member count;
- joined/rejoined count for the last 30 days;
- departed count for the last 30 days;
- current member rows;
- departed member rows;
- any current collector warning.

The endpoint requires a valid administrator session through the existing server-side admin authentication boundary. All administrator roles may view it; it has no mutation.

The retained dataset is intentionally small, so the first version can return all current and retained departed rows. Search and the 30-day/all selectors can operate in the browser without pagination.

## Admin interface

Add **Empire Membership** under **Admin → Insights** as a focused component rather than expanding the main `AdminPanel.tsx` rendering block.

### Header and status

Show:

- current empire name;
- tracking start date;
- last successful collection;
- a warning if current collection is degraded.

### Summary

Show compact operational metrics:

- current members;
- joined in the last 30 days;
- departed in the last 30 days;
- rejoins in the last 30 days.

### Current members

Controls:

- player-name search;
- **Joined in last 30 days** / **All current members** selector.

Ordering:

1. observed joins and rejoins, newest first;
2. initial-roster members afterwards, alphabetically.

Rows show:

- player name;
- **Joined** or **Rejoined** status where known;
- observed timestamp;
- **Present when tracking began** for initial members.

### Departed members

Controls:

- shared player-name search;
- **Departed in last 30 days** / **All retained departures** selector.

Rows are ordered by observed departure, newest first. Only periods with `end_reason = 'departure'` are eligible. A player with an open period in the active tracking session is excluded, even if older departure periods exist. Each currently absent player appears once using their latest confirmed departure; earlier periods remain retained for rejoin detection and auditability without creating duplicate names in the operational list.

### Empty and loading states

Distinguish:

- tracking has not established its first baseline;
- no joins or departures match the selected period;
- no search results;
- collection is temporarily degraded while retained data remains available.

## Security and privacy

- Enforce admin authentication in the API route.
- Do not expose the membership endpoint through public app configuration or proxy routes.
- Store only public game identity and locally observed membership timing.
- Do not include admin credentials, Discord identity, IP data, or unrelated settlement data.
- Keep the page inside the existing admin access boundary.

## Diagnostics

Extend collector status with:

- last successful roster synchronization;
- current tracked empire ID/name;
- current/open period count;
- suspected-departure count;
- rows created, updated, closed, or pruned during the last run;
- latest validation or upstream warning.

The admin page should preserve retained results when the newest collection fails.

## Testing

### Data and migration

- Existing databases receive both tables and indexes additively.
- Applying the migration twice is safe.
- The open-period uniqueness rule prevents duplicate active rows.

### Synchronizer

- Initial roster creates baseline periods without join timestamps.
- Repeated unchanged rosters update in place without adding rows.
- New members create observed joins.
- Name changes update the current period.
- One omission creates a suspected departure.
- A return after one omission clears the suspicion.
- Two consecutive complete omissions confirm a departure.
- A rejoin creates a distinct period marked as a rejoin.
- Failed, partial, malformed, and suspiciously empty responses do not create departures.
- Changing empire/configuration does not create mass departures.
- Cleanup removes only eligible closed periods and preserves open periods.

### Repository and API

- Current-member ordering follows observed join/rejoin time.
- Initial members appear after observed joins.
- Departed queries exclude players with an open rejoined period.
- Thirty-day summaries and retained-history results are correct at boundary dates.
- Unauthenticated requests receive `401`.
- Authenticated administrators receive the response without private unrelated data.

### Frontend

- The tab appears under Admin → Insights.
- Status, summary, search, and selectors render correctly.
- Joined, rejoined, initial, departed, empty, loading, and warning states are distinguishable.
- Filters and ordering are stable.
- The focused component remains within the existing admin responsive layout.

### Verification

- Run the complete `@workspace/bitcraft-local` test suite.
- Run the production frontend build.
- Browser-smoke the admin tab with baseline, join, departure, rejoin, empty, and degraded fixtures where practical.

## Rollout

No manual VPS migration is required beyond the normal application deployment. The additive schema bootstrap creates the tables automatically. The first successful membership collection establishes the initial roster and tracking timestamp; no historical join dates are inferred.
