# Empire Hexite Reserve Columns

## Context

In-game verification established that a Hexite Capsule costs 100 Hexite Energy to create but contributes 1,000 energy when used on a Watchtower. The existing Hexite Reserves estimate incorrectly uses the crafting cost as the Capsule's operational value.

The Empires overview will separate the underlying holdings from their deployable Watchtower value so operators can see each quantity without conflating creation cost and use value.

## Table columns

Replace the single **Hexite Reserves** column with three sortable columns:

1. **Hexite Energy** — loose Hexite Energy stored in the empire treasury, current member wallets/inventories, and aligned-claim storage.
2. **Capsules** — completed physical Capsules held by current members or aligned claims. The cell tooltip identifies the Hexite Reserve-building subset.
3. **Watchtower Energy** — the combined deployable equivalent:

   ```text
   stored Hexite Energy + (ready Capsules × 1,000)
   ```

The Watchtower Energy value retains the `≈` prefix because the multi-endpoint sweep is not atomic and completed Foundry output remains unavailable.

All three columns use raw numeric sort accessors. Rows without a calculated sweep remain last in either sort direction and display `Queued`, `Scanning`, or `Unavailable` instead of zero.

## API contract

Keep `capsuleEnergyCost` as the live crafting cost returned by `/parameters`. Add:

```ts
capsuleWatchtowerEnergyValue: 1000;
```

`estimatedEnergyEquivalent` remains the combined deployable Watchtower total for compatibility, but its formula changes to use `capsuleWatchtowerEnergyValue`. The existing `energy.total` and `capsules.readyTotal` fields supply the first two columns.

The Watchtower value is a verified game-mechanics constant rather than a field currently exposed by BitJita. Keeping it separate from `capsuleEnergyCost` prevents either meaning from being lost.

## Presentation

The compact explanation above the table will state that Capsules cost 100 HE to craft but provide 1,000 Watchtower energy when deployed. The Watchtower Energy tooltip will show the loose Energy contribution, Capsule contribution, creation cost, source coverage, scan age, and the Foundry exclusion.

The layout remains a dense horizontally scrollable operational table. No modal, new card, or dashboard section is introduced.

## Error and partial states

- Before the first successful sweep, all three cells use the same queued or scanning state.
- A failed discovery renders all three cells unavailable.
- Partial sweeps still display calculated holdings with coverage and age on the Watchtower Energy cell.
- Reused stale sources remain included and reduce freshness without being presented as missing or zero.
- Foundry Capsules remain `null`, unavailable, and excluded from all three values.

## Testing

- Change the aggregate formula test from Capsule crafting cost to the 1,000 Watchtower value.
- Assert the API exposes both the live crafting cost and the Watchtower energy value.
- Test the three raw sort values and queued/error behavior.
- Test presentation copy distinguishes crafting cost from deployed Watchtower value.
- Run the full BitCraft Local test suite and production build.
- Browser-check desktop and mobile table overflow, column labels, and pending/calculated states.
