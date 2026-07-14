# Settlement Current State Design

**Status:** Approved design
**Date:** 14 July 2026
**Area:** Server polling, activity history, and database storage

## Purpose

Replace the append-only settlement snapshot system with one current baseline row per settlement. Historical snapshot charts are no longer required. Permanent user-facing history remains in `activity_events`.

## Current Problem

The worker records settlement values repeatedly in `snapshots`. The application now uses only the latest values to detect changes in supplies, treasury, member count, building count, and market listing count. The Dashboard still requests daily snapshots but does not render them. Snapshot APIs, retention settings, pruning controls, indexes, and admin counters therefore maintain legacy data without supporting an active feature.

## Data Model

Add `settlement_state_current` with one row per `claim_id`:

- `claim_id` primary key.
- `captured_at` for baseline freshness.
- `supplies`.
- `treasury`.
- `members_count`.
- `buildings_count`.
- `market_count`.
- `updated_at`.

No raw payload or historical rows are stored.

## Collection Flow

For each worker collection:

1. Build the existing scalar settlement summary.
2. Read the current row for the settlement.
3. If no row exists, insert a baseline without creating activity events.
4. If a row exists, create the same change events currently produced for changed scalar values.
5. Upsert the new current row in the same database transaction as those events.

A failed transaction leaves both the activity history and baseline unchanged. The next successful poll can retry from the previous consistent state.

## Migration and Removal

The additive schema migration creates `settlement_state_current` and seeds it from the newest snapshot for each settlement. After successful seeding, the legacy `snapshots` table and its indexes are dropped.

Remove:

- Snapshot insert and latest-snapshot prepared statements.
- Snapshot history queries and `/api/local/snapshots`.
- Snapshot inclusion in `/api/local/history` and the Dashboard history request.
- Snapshot retention settings, validation, admin controls, and pruning endpoint.
- Snapshot collector configuration and snapshot counts in admin/server-health displays.
- Legacy snapshot-specific tests and copy.

Keep:

- `activity_events` and all existing activity behaviour.
- Live BitJita page data and refresh intervals.
- Market, contribution, monitoring, and Craft Planner history.
- The pre-migration VPS database backup until post-deployment verification is accepted.

## Compatibility and Performance

The migration intentionally removes historical snapshot API compatibility. No active page consumes those records. Multiple users and live page freshness are unaffected because the worker owns baseline writes and normal pages continue using live BitJita data.

The steady-state database stores one small row per monitored settlement instead of one row per polling interval. Dashboard responses also stop requesting unused snapshot history.

## Verification

- Unit-test first-baseline creation, unchanged state, each change type, and transactional upsert behaviour.
- Test migration seeding chooses the newest snapshot per settlement before dropping the legacy table.
- Update backend and frontend boundary tests to prove snapshot routes, settings, controls, and requests are removed.
- Run the full application test suite and production build.
- On the VPS, deploy with services stopped by the updater, verify the current row matches the latest legacy snapshot, confirm the old table is absent, and run `PRAGMA integrity_check`.
- Verify activity generation after a real worker poll, health response, Craft Planner response, service state, database size, and memory usage.

## Rollback

Retain `/var/lib/bitcraft-claim-monitor/backups/bitcraft-local-pre-snapshot-compact-20260714.sqlite` during rollout. If migration verification fails, stop the services, restore that database, deploy the previous release, and restart the services.
