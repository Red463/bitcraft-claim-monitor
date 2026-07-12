# VPS Server Health Implementation Plan

**Goal:** Add secure owner-only VPS and application monitoring with seven-day history and deduplicated owner alerts.

**Architecture:** A root-owned systemd timer writes sanitized host snapshots. The existing web/worker processes persist bounded application aggregates and incidents in SQLite, expose a permission-protected read-only API, and render a focused Admin page.

## Deliverables

- Add snapshot normalization, redaction, thresholds, history, and log filtering with focused tests.
- Add the collector script, systemd units, deployment installation, retention, and safe file permissions.
- Add request, planner, BitJita, Node, SQLite, and incident telemetry with three-sample opening/recovery and owner DMs.
- Add the owner-only API and responsive Server Health Admin page.
- Verify focused tests, full tests, production build, static UI audit, and VPS deployment checklist.
