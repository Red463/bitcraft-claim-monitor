# Craft Planner Player Bank Tracking Design

## Summary

Add player settlement banks as an optional confirmed-stock source in the Craft Planner. Bank tracking is configured independently for each player, counts every BitJita-visible settlement bank returned for that player, and remains disabled by default.

## Goals

- Let administrators count a player's bank stock without also counting that player's personal inventory or active crafts.
- Support banks from every settlement because players may use remote settlement banks while gathering.
- Preserve player and settlement ownership in stock-location details.
- Avoid duplicate requests and duplicate stock when multiple source families are enabled for one player.
- Keep existing plans unchanged until an administrator explicitly enables bank tracking.

## Non-goals

- Do not add individual toggles for each settlement bank.
- Do not assume banks with the same name or settlement belong to a shared inventory.
- Do not persist bank contents in a new database table.
- Do not count stale, estimated, or unavailable bank quantities.
- Do not change Craft Planner targets, recipe routing, effort weighting, or Discord configuration.

## Configuration

Extend the normalized Craft Planner source rules with:

```ts
bankPlayerIds: string[]
```

`bankPlayerIds` is independent of:

- `playerIds` for personal inventory.
- `craftPlayerIds` for active crafts.
- `deployableContainerIds` for carts, caches, and other deployables.

Missing or invalid `bankPlayerIds` values normalize to an empty array. This applies to existing plans and new plans, so bank stock is never enabled implicitly.

## Source Discovery and Classification

The existing `/players/{playerId}/inventories` response already contains personal inventory, deployables, and settlement-bank rows. Extend the player inventory parser to return three distinct source families:

- One aggregated personal-inventory source.
- Zero or more individual bank sources.
- Zero or more deployable sources.

A bank is identified using the existing settlement-bank naming rules. Each source uses a player-scoped identity such as `playerId:bankInventoryId`, preventing banks from different players from being merged even when BitJita returns the same bank or settlement name.

Each bank source retains:

- Player ID and display name.
- Raw bank inventory ID.
- Bank inventory name.
- Settlement or claim name when provided.
- Confirmed visible item and cargo stacks.
- Source type `Player bank`.

Duplicate bank rows within one response are deduplicated by the player-scoped bank source ID before quantities enter the plan.

## Request and Calculation Flow

For a live plan calculation, build the unique union of players referenced by `playerIds` and `bankPlayerIds`. Fetch each player's inventory endpoint once, then route its parsed source families independently:

- Add personal inventory only when the player is in `playerIds`.
- Add all visible banks only when the player is in `bankPlayerIds`.
- Add explicitly selected deployables using the existing deployable allow-list behavior.

Active crafts continue using the separate crafts endpoint and `craftPlayerIds`.

Bank sources enter the existing confirmed-stock calculation path. Consequently, their quantities consistently affect target coverage, material shortages, effort progress, Fishing route progress, item details, and Discord Craft Planner reports without special-case calculations.

No bank content is inferred. Only positive item or cargo quantities returned by BitJita count.

## Admin Interface

Under **Manage Plan → Players & Deployables**, each player card exposes three independent toggles:

1. Inventory
2. Crafts
3. Banks

The Banks control appears beneath Crafts on narrow cards and aligns with the existing compact controls at wider widths. The player card uses its included state when any of these controls is enabled.

Supporting copy explains that enabling Banks counts every BitJita-visible settlement bank for that player, including banks belonging to other settlements, and that this stock is treated as confirmed stock.

The saved configuration and audit metadata report bank-player selections separately from personal-inventory players.

## Stock-location Presentation

Bank contributions appear in the existing **Stock locations** section. Labels include the player, bank, and settlement when available, for example:

- `Modular — Town Bank — Timbersteel Trade`
- `Modular — Town Bank — Remote Settlement`

The player name remains part of the source identity and display grouping, so two players using banks with identical names remain visibly separate.

## Failure Handling

- If a selected player's inventory request fails, every selected source family that depends on that response is represented as unavailable for that player and contributes zero stock.
- A bank failure does not disable or alter other players' bank sources.
- Partial or malformed bank rows are ignored rather than guessed.
- Item and cargo identities continue to use BitJita `itemType` semantics, preventing numeric ID collisions.
- Bank selection remains saved when BitJita is temporarily unavailable.

## Performance and Compatibility

- Fetch at most once per player per calculation, even when both Inventory and Banks are enabled.
- Reuse the existing BitJita proxy cache and Craft Planner live-response cache.
- Add no new external dependency, route, database table, or background polling job.
- Preserve existing source behavior and deployable selection.
- Keep API response growth bounded by using existing compact plan responses; full source stacks remain in the existing lazy item-detail path.

## Testing

Add focused tests for:

- Configuration normalization and bank tracking defaulting off.
- Inventory, Crafts, and Banks toggles remaining independent.
- Classification of Town Bank rows separately from personal inventory and deployables.
- Multiple banks from different settlements for one player.
- Isolation of identically named banks belonging to different players.
- Deduplication of repeated bank rows.
- One inventory request when both Inventory and Banks are enabled.
- Bank-only players being fetched even when Inventory and Crafts are disabled.
- Selected bank stock entering confirmed availability and effort progress.
- Item and cargo identity preservation.
- Player-specific unavailable-source reporting.
- Stock-location labels retaining player and settlement context.
- Manager layout and copy at desktop and narrow widths.

Run the focused source/config/page tests, the complete application test suite, and the production build. Browser-check the manager and a populated item detail at desktop and narrow widths when suitable live or fixture data is available.

## Decisions

- Bank tracking is independent per player.
- One Banks toggle includes all visible banks for that player.
- Banks from every settlement may count.
- Bank quantities are confirmed stock, not estimated output.
- Existing and new player selections default Banks to off.
