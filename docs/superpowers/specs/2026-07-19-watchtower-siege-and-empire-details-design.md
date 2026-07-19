# Watchtower Siege and Empire Details

## Context

BitJita represents a single active siege as participant records: one defender record and one or more attacker records. The Watchtowers table currently condenses those records into an **Under Siege** badge, but the badge does not explain who is attacking or defending. Empire names on the overview also have no focused detail view.

This feature turns the badge into a drill-down and introduces one reusable Empire Details dialog for both the siege flow and the Empires overview.

## User experience

### Siege details

The **Under Siege** badge becomes a real button while retaining its compact danger-pill appearance. Activating it opens a viewport-fixed **Siege Details** dialog and does not trigger the watchtower row's existing details action.

The dialog contains:

- the tower name and map coordinates;
- an active-siege summary with the **Under Siege** state, start time, and elapsed duration;
- one red attacker section per active attacker participant;
- one green defender section per active defender participant;
- each participant's empire name and reported siege energy;
- a **View Empire** action for each participant that has an empire identifier.

Only records whose `active` value is `true` participate in the dialog or cause the table badge to appear. Historical or inactive BitJita records remain excluded. If BitJita returns several active attackers, each is shown separately rather than being collapsed into a misleading siege count.

Elapsed duration is derived from the earliest valid active participant start time. It refreshes once per minute while the dialog is open. Missing start times or energy values render as `Unavailable` rather than zero.

### Empire details

**View Empire** replaces the Siege Details content in the same dialog surface. A **Back to Siege Details** action restores the previous view, avoiding stacked modal focus traps. Closing either view closes the shared dialog.

The empire name on the Empires overview becomes a keyboard-accessible button that opens the same Empire Details dialog directly. Directly opened empire details do not show the siege back action.

The Empire Details dialog uses a dense summary followed by four views:

1. **Overview** — leader, member count, claims, territory chunks, Hexite energy, Watchtower energy, and available activity/freshness information.
2. **Members** — username, empire rank, relevant access indicators, and last login.
3. **Claims** — claim name, tier, owner, coordinates, supplies, and treasury when available.
4. **Towers** — tower name, location, energy, upkeep, active state, inactivity risk, and siege state.

The Overview view opens by default. Tabs remain within the dialog's viewport-bounded scrolling region so the page behind the dialog never needs to scroll. Missing collections receive explicit empty states. Loading, partial-data, and request-error states appear inside the dialog without dismissing it.

## Components and boundaries

Use the existing shared `Dialog` component for focus trapping, Escape handling, portal rendering, and body-scroll locking.

Add focused components rather than expanding the Empires page with all detail markup:

- `SiegeDetailsDialog` owns the active participant presentation and siege-to-empire transition.
- `EmpireDetailsDialog` owns loading and presentation of one selected empire.
- A small siege presentation helper filters active records, separates roles, and derives the earliest start time.

The Empires page remains responsible for selected tower/empire state and opening the appropriate dialog. Existing tower-row behavior remains unchanged outside the **Under Siege** button.

The interface follows the current dark operational dashboard: existing tokens, typography, spacing, and Lucide icons; red and green are reserved for attacker and defender semantics. The supplied BitJita screenshots guide information hierarchy, not the surrounding site chrome.

## API and data flow

Add a focused read-only endpoint:

```text
GET /api/local/empires/details?empireId=<entity-id>&regionId=<region-id>&inactiveDays=<days>
```

The endpoint validates the identifiers, fetches or reuses the existing BitJita sources for the selected empire, and returns one normalized detail payload. It must not trigger the all-empires regional watchtower scan solely to open one dialog.

The payload includes:

- normalized empire summary and capital/claim metadata;
- normalized current members and derived activity counts;
- current claims associated with the empire;
- current watchtowers with active siege participants retained;
- the latest available Hexite reserve snapshot and its freshness/coverage state;
- non-fatal source errors so partial data can still render.

The frontend requests details only when an empire is selected. Reopening the same empire during the page session reuses the successful result. A new selection aborts or ignores the previous in-flight response so stale data cannot replace the newly selected empire.

The existing watchtower response changes from counting every raw siege record to exposing active siege participants and an active-siege boolean/count derived only from `active === true`. Existing risk presentation continues to treat an active siege as risk.

## Accessibility and responsive behavior

- The siege pill and empire names are semantic buttons with visible focus treatment and descriptive accessible labels.
- Button activation stops propagation to the containing table row.
- Dialog titles are announced through the shared dialog foundation.
- Tabs expose selected state and support normal keyboard activation.
- Status is never communicated by colour alone; attacker/defender labels and icons remain visible.
- The dialog is fixed to the current viewport, bounded by `max-height`, and internally scrollable on desktop and mobile.
- Dense metric layouts collapse to a single column where needed without horizontal page overflow.
- No new animation library or frontend dependency is introduced.

## Error and edge states

- A siege with no usable participants shows the existing tower information and an explicit unavailable state.
- Unknown empire identifiers disable the participant's **View Empire** action.
- A failed empire-detail request offers an inline retry action.
- Partial endpoint results show available sections plus a concise warning that identifies unavailable sources.
- Empty member, claim, or tower collections show `No current ... data available` rather than zero-valued placeholder rows.
- Dates and numbers use the app's existing formatting conventions and tolerate null or malformed source values.

## Testing and verification

- Add server tests for request validation, selected-empire normalization, partial errors, and active-only siege semantics.
- Add focused presentation tests for participant role separation, earliest start time, missing values, and active-siege risk.
- Add boundary tests for semantic trigger buttons, stopped row propagation, shared dialog usage, viewport-fixed modal CSS, tab state, and siege-to-empire navigation.
- Run the full BitCraft Local test suite and production build.
- Browser-check the Empires overview, Siege Details, nested empire navigation, keyboard focus, error/empty states, and responsive modal layout.

## Non-goals

- Do not add a standalone empire route or reproduce BitJita's full empire site navigation.
- Do not introduce editing, moderation, or admin-only actions.
- Do not refresh every empire when one detail dialog opens.
- Do not redesign the surrounding Empires page or existing tower detail dialog.

