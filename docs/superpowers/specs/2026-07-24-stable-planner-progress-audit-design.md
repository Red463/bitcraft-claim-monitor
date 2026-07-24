# Stable Planner Progress and Audit Design

## Summary

The Craft Planner will separate confirmed progress from projected progress so probabilistic active-craft output cannot make the headline percentage appear to move backwards. Confirmed progress may still decrease when genuinely counted stock or guaranteed craft output disappears.

The planner will also record an admin-only diagnostic history. This history will explain percentage changes in terms of stock, sources, crafts, requirements, configuration, and catalogue revisions, and can be exported after several days for investigation.

## Goals

- Make the headline percentage represent confirmed, observable progress.
- Keep estimated active-craft output useful for material planning without presenting it as completed effort.
- Preserve legitimate decreases caused by sold, consumed, moved, or otherwise unavailable stock.
- Avoid treating an upstream API failure as zero stock.
- Explain baseline changes instead of presenting them as ordinary progress.
- Capture enough diagnostic history to identify the exact cause of future changes.

## Non-goals

- The percentage will not be forced to increase monotonically.
- Stock movements will not be hidden or smoothed.
- The audit will not retain raw BitJita HTTP responses.
- The audit will not contain authentication tokens, sessions, bot tokens, or admin secrets.
- Existing target, route, safety-buffer, and source-selection behaviour will not otherwise change.

## Progress Definitions

### Canonical baseline

The baseline is the total zero-stock effort required for the configured plan. It is calculated from:

- Targets and target quantities
- Selected producer routes
- Gathered-item overrides
- Safety buffers and material multipliers
- The active probability and effort model
- The validated catalogue revision

Live stock, active crafts, completed building progress, and temporary source availability do not alter the baseline.

Completing a building target reduces remaining effort against the original building target baseline. It does not shrink the baseline itself.

The baseline revision changes only when an input listed above changes. Display-only changes such as section labels and row names do not create a new baseline revision. Adding or removing a counted stock source changes coverage, not the baseline.

### Confirmed progress

Confirmed progress is the headline value. Its remaining-effort calculation uses:

- Stock in successfully refreshed, configured sources
- Guaranteed output from active crafts
- Guaranteed output from completed crafts that are ready to collect
- Confirmed building completion

It excludes all probabilistic or expected-only output.

Formula:

```text
confirmed progress = 1 - confirmed remaining effort / canonical baseline effort
```

The value is bounded to `0–100%` and rounded to one decimal place.

### Projected progress

Projected progress is a secondary planning value. It starts from confirmed coverage and also includes expected probabilistic output from tracked active or ready-to-collect crafts.

Formula:

```text
projected progress = 1 - projected remaining effort / canonical baseline effort
```

Projected progress must never be lower than confirmed progress.

### Needs Board

The Needs Board and Gather Next guidance continue to use the projected plan. This avoids asking players to gather inputs already expected from active crafts.

Rows affected by estimated output retain a clear visual indicator and expose both:

- Confirmed remaining quantity
- Projected remaining quantity after estimated active output

## State Transitions

- Starting a guaranteed craft may increase confirmed progress.
- Moving guaranteed output from an active or ready-to-collect craft into a tracked stock source must not cause a percentage jump.
- Estimated output appearing or disappearing may change projected progress and planning guidance, but not confirmed progress.
- Selling, consuming, or moving stock outside configured sources may lower confirmed progress.
- Removing a configured stock source may lower confirmed progress and creates an audit event.
- Changing the plan or catalogue inputs creates a new baseline revision and an explicit baseline-change notice.

## Missing and Stale Data

A failed source refresh is unknown data, not zero stock.

The planner publishes a new confirmed percentage only from a complete successful refresh of all configured sources needed by the calculation. If one or more sources fail:

- Retain the last successful confirmed and projected summaries.
- Mark the summaries as stale.
- Show the last successful calculation time.
- Identify the unavailable source types and labels.
- Record the failure in the audit.
- Do not emit a false progress decrease.

Once all required sources refresh successfully, publish a new calculation and clear the stale state.

The last successful summary is persisted so a process restart during an upstream outage does not erase the value used for the stale state.

## API Shape

Extend `effortProgress` with:

```text
baselineRevision
confirmed.overall
confirmed.sections
projected.overall
projected.sections
stale
staleSince
lastSuccessfulAt
unavailableSources
```

For compatibility:

- `effortProgress.overall` remains an alias of `confirmed.overall`.
- `effortProgress.sections` remains an alias of `confirmed.sections`.
- Existing route identifiers and material fields remain unchanged.

Fishing variants expose matching confirmed and projected summaries.

## User Interface

### Craft Planning

The large metric is labelled `Confirmed progress`.

When estimated active output exists, show a smaller secondary value:

```text
72.8% confirmed
76.1% projected after active crafts
```

Each profession shows the same confirmed/projected distinction. Tooltips explain:

- Confirmed: tracked stock and guaranteed active or ready-to-collect output
- Projected: confirmed progress plus probabilistic expected output

When data is stale, retain the values and show:

```text
Last confirmed 18 minutes ago
Waiting for Player inventory: Mosswick
```

When the baseline revision changes, show a visible `Plan baseline changed` notice with the reason.

### Discord reports

Discord reports lead with confirmed progress. Projected progress appears on a separate line only when it differs:

```text
Confirmed effort complete: 72.8%
Projected after active crafts: 76.1%
```

Stale reports include the last successful time and unavailable sources. Reports generated after a baseline change state that the plan baseline changed.

## Progress Audit

### Capture

Audit capture observes each attempted fresh planner calculation. Successful calculations may create snapshots and change events; failed or incomplete refreshes create diagnostic failure events without replacing the last successful snapshot.

- Skip calculations whose normalized input and output fingerprint is identical to the previous entry.
- Store a full snapshot when auditing begins.
- Store another full snapshot whenever the baseline revision changes.
- Store a periodic full snapshot every six hours.
- Store compact change events between full snapshots.
- Retain 14 days and remove older entries automatically.

Audit persistence must not block or fail the planner response. A write failure is logged and surfaced in admin diagnostics.

### Full snapshot contents

Each full snapshot contains:

- Timestamp, application version, and build ID
- Catalogue revision and probability/effort model versions
- Baseline revision, baseline effort, and plan configuration fingerprint
- Targets, quantities, routes, gathered overrides, buffers, and tracked-source configuration
- Confirmed and projected progress overall and by profession
- Material required, available, guaranteed active, estimated active, and missing quantities
- Stock quantities by exact item and exact source
- Active and ready-to-collect crafts, including craft ID, player, station, status, direct output, guaranteed output, and estimated output
- Configured source identities, labels, availability, and refresh status
- Building completion inputs used by the planner

### Change event contents

Events record before/after values and attribution for:

- Confirmed or projected percentage changes
- Remaining-effort changes
- Stock increases and decreases by item and source
- Sources added, removed, unavailable, stale, or restored
- Crafts added, removed, completed, collected, or changed
- Guaranteed and estimated output changes
- Material requirements expanding or collapsing
- Targets, routes, buffers, gathered overrides, and tracked-source configuration changes
- Catalogue, probability-model, effort-model, or baseline revision changes
- Refresh failures and recovery

Each percentage event lists the materials with the largest positive and negative remaining-effort contribution.

The audit distinguishes observed facts from inferred transitions. For example, a craft disappearing is observed; collection is inferred only when a matching stock increase appears. Inferred causes include a confidence and the evidence used, so the diagnostics never present a guess as a confirmed event.

Example:

```text
Confirmed progress -2.1%
450 Simple Ink no longer supplied by completed crafts
Basic Flower requirement +8,000
Simple Flower requirement +7,500
```

### Storage

Use additive SQLite tables for:

- Full progress audit snapshots
- Progress audit change events
- Audit retention and capture status

Full snapshot payloads are compressed. Change events store compact structured JSON. Fingerprints prevent duplicate writes.

### Admin diagnostics

Add a Progress Audit section to the Craft Planner admin dialog showing:

- Current confirmed and projected values
- Last successful capture
- Current baseline revision
- Audit storage size and retention
- Recent attributed events
- Any audit write or source-refresh warning

### Export

Provide an authenticated admin-only endpoint:

```text
GET /api/local/admin/craft-plan/progress-audit/export?range=3d
```

The endpoint returns a gzip-compressed JSON diagnostic archive with a descriptive `.json.gz` filename. The admin UI offers:

- Last 24 hours
- Last 3 days
- Last 7 days
- Full retained history

The export contains a manifest, full snapshots, and ordered change events. It includes original player names, player IDs, storage names, storage IDs, craft IDs, and source labels for maximum debugging value.

The export excludes tokens, cookies, sessions, Discord secrets, admin credentials, and unrelated application configuration.

## Failure Handling

- Audit write failure never changes the planner result.
- A corrupt audit entry is skipped during export and reported in the export manifest.
- Retention cleanup runs in bounded batches.
- Export generation is read-only and rate-limited.
- A missing last-good planner snapshot produces an unavailable state rather than a fabricated percentage.
- A baseline revision cannot be compared as ordinary progress with a previous revision.

## Testing

Focused tests cover:

- Estimated output appearing or disappearing changes projected progress only.
- Confirmed stock disappearing lowers confirmed progress.
- Guaranteed craft output moving into stock leaves confirmed progress unchanged.
- Ready-to-collect guaranteed output remains confirmed.
- A configured source failure retains the last successful values and marks them stale.
- Recovery publishes a fresh value and records a recovery event.
- Building completion reduces remaining effort without shrinking the baseline.
- Plan and catalogue changes create a new baseline revision.
- Display-only configuration changes do not create a new baseline revision.
- Projected progress cannot be lower than confirmed progress.
- Compatibility fields resolve to confirmed progress.
- Audit fingerprints suppress duplicate entries.
- Full snapshots and deltas reconstruct the ordered diagnostic history.
- Retention removes only expired audit data.
- Exports include debugging identities but exclude secrets.
- Discord and web UI use confirmed progress as the primary value.

Run the full application build and test suite, then browser-smoke the Craft Planning header, profession summaries, stale state, baseline-change notice, admin audit timeline, and audit download.

## Rollout

After deployment:

1. Create the initial baseline revision and full audit snapshot.
2. Display confirmed progress as the headline and projected progress as secondary.
3. Allow the audit to run for several days.
4. Export the three-day or seven-day bundle for review.
5. Use the captured attribution to refine any remaining edge cases without changing historical audit entries.
