# Empire Hexite Reserves Combined Column Design

## Summary

Replace the three Empire Overview columns for Hexite Energy, Capsules, and Watchtower Energy with one sortable **Hexite Reserves** column. The column answers the primary operational question—how much known Watchtower energy an empire can deploy—while keeping its stored HE and ready Capsule composition visible and moving provenance into an accessible disclosure.

The displayed total is a known lower bound because completed but uncollected Foundry Capsules remain unavailable through the documented BitJita REST API.

## Goals

- Make empire Watchtower readiness scannable in one column.
- Remove repeated scan status and explanatory text from every row.
- Describe Foundry exclusion honestly as a known limitation, not a balanced estimate.
- Preserve sorting by the exact unformatted known Watchtower-energy total.
- Keep source composition, coverage, Reserve-building count, errors, and exact values accessible on demand.
- Repair old persisted aggregates that still use the previous 100-energy Capsule conversion.

## Non-goals

- Direct BitCraft/SpacetimeDB Foundry integration.
- Changes to the existing Treasury column.
- New dashboard cards, modals, filters, or decorative visualizations.
- Changing the six-hour collection schedule or inventory ownership rules.

## Calculation and data contract

The known Watchtower-energy minimum remains:

```text
stored HE = treasury + player Hexite Energy + shared-claim Hexite Energy
ready Capsules = player Capsules + shared-claim Capsules
known Watchtower energy = stored HE + (ready Capsules × 1,000)
```

`capsuleEnergyCost` remains the live crafting cost from BitJita parameters and is shown only in details. `capsuleWatchtowerEnergyValue` remains `1,000`.

Published aggregates must not trust an older stored `estimatedEnergyEquivalent` value. Whenever an aggregate is read for the API, the server will recompute the known Watchtower-energy total from its stored `energy.total` and `capsules.readyTotal` components using the current Watchtower value. This repairs existing rows created by the previous ×100 behavior without requiring a destructive database migration or a completed rescan.

If the component totals needed for a safe recalculation are unavailable, the value remains unavailable rather than being displayed as zero.

Foundry Capsules remain `null`, excluded from the calculation, and described as unavailable.

## Table presentation

The Overview table will contain one new column instead of three:

```text
HEXITE RESERVES
≥ 584.6K tower energy
37.6K HE + 547 Capsules
Known inventories scanned · 4h ago
Details
```

- **Primary:** compact known Watchtower-energy minimum, prefixed with `≥`.
- **Secondary:** compact stored HE and ready Capsule composition.
- **Status:** one shared source/freshness line.
- **Details:** a native, keyboard-focusable disclosure inside the cell.
- **Sort value:** exact recomputed Watchtower-energy number; unavailable values sort last.

The global explanatory note will be shortened to:

> Known minimum from treasury and inventories; completed Foundry output is unavailable.

The Capsule conversion rule belongs in Details rather than in the persistent table note.

## Status language

Status describes inventory-source quality separately from the permanent Foundry limitation:

- All current sources fresh: `Known inventories scanned · {age}` with muted styling.
- One or more reused sources and none missing: `Some inventory data reused · {age}` with warning styling.
- One or more missing sources: `Inventory scan incomplete · {age}` with warning styling.
- First sweep pending: `Queued` or `Scanning`; never zero.
- No usable aggregate: `Unavailable` with error styling.

Coverage percentages and exact fresh/reused/missing counts move to Details. The UI will no longer show contradictory copy such as `Partial · 100% scanned`.

## Accessible details

Use a native `<details>`/`<summary>` disclosure in the Hexite cell so keyboard, touch, and screen-reader users can open it without relying on a hover-only `title` attribute.

The disclosure contains:

- Exact known Watchtower-energy minimum.
- Exact stored HE total and treasury/player/shared-claim breakdown.
- Exact ready Capsule total.
- Capsules physically stored in Hexite Reserve buildings, identified as a subset of the ready total.
- The live Capsule crafting cost and 1,000 Watchtower-energy deployment value.
- Player and claim fresh/reused/missing coverage.
- Foundry exclusion.
- Up to three scan errors when present.

Only the selected row grows when Details is opened. No modal is introduced.

## Responsive behavior

- Preserve the existing contained horizontal table scroll.
- Reduce the Hexite footprint from three columns to one approximately 230-pixel column.
- Keep the Empire name and Hexite primary value on one line where practical.
- Allow detail text to wrap inside the expanded disclosure.
- Do not create root-level horizontal overflow at mobile widths.

## Implementation seams

- Extend `hexitePresentation.ts` with one combined summary presenter that returns primary, secondary, status, tone, exact sort value, and detail lines.
- Keep calculation normalization in the backend aggregate-read boundary so every API consumer receives corrected totals.
- Update `EmpiresPage.tsx` to render one Hexite column and native disclosure.
- Remove obsolete three-column width variants from `empires.css` and add focused combined/disclosure styles.
- Preserve existing compatibility exports unless removing them is proven safe by repository search and tests.

## Testing

- Presentation tests for compact lower-bound output, HE/Capsule composition, exact sort value, each source-quality state, unavailable states, and detail contents.
- Regression test proving an aggregate persisted with a ×100 total is recomputed as HE plus Capsules ×1,000 when read.
- Page boundary test proving only one Hexite Reserves column remains and that native accessible Details is present.
- Build and full test suite.
- Desktop and 390px browser checks for row scanning, disclosure behavior, sorting, contained overflow, and console errors.

## Acceptance criteria

- The Overview contains one sortable Hexite Reserves column, not three Hexite metric columns.
- Each calculated row shows one lower-bound Watchtower-energy total, one composition line, and one status line.
- The screenshot scenario displays `≥ 584.6K tower energy` and `37.6K HE + 547 Capsules`, never `547 capsules × 0` or a ×100-derived total.
- Foundry exclusion is visible globally and in Details without being repeated three times per row.
- Source provenance remains fully accessible through a focusable disclosure.
- Existing stale aggregates are corrected on read without waiting for the next sweep.
