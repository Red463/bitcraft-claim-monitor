# BitCraft Mechanics Not Confirmed From Public Code

This file records mechanics that were requested or considered during the public repo analysis but could not be confirmed fully from `clockworklabs/BitCraftPublic` alone.

Use this list to avoid accidental guessing in app logic, documentation, or user-facing explanations.

## Exact Claim Treasury Hex Per Craft

Confirmed:

- Crafting XP can mint claim treasury hex coins.
- The formula is `floor((previous_remainder_xp + gained_xp) / xp_to_mint_hex_coin)`.
- The threshold comes from learned `ClaimTechDesc.xp_to_mint_hex_coin`.

Not confirmed:

- The exact current live `xp_to_mint_hex_coin` values for each claim technology.
- The exact amount of hex produced by a named craft without also knowing the live recipe XP values and the claim's learned tech threshold.

Reason: the public repo exposes the formula and table schema, but not the live `claim_tech_desc` and recipe data records.

## Exact Rare Drop Rates

Confirmed:

- Loot/drop systems use probability fields and weighted selection helpers.
- `ProbabilisticItemStack`, `ItemList`, `PlaceableState`, `QuestDropDesc`, `LootTableDesc`, and `LootRarityDesc` are present.

Not confirmed:

- Exact current drop rates for rare items.
- Exact loot chest probabilities.
- Exact quest drop rates.

Reason: the roll formulas are public, but the live static-data records/pools are not included in the public repo review.

## Exact Resource Spawn Rates

Confirmed:

- Resource extraction and follow-up resource spawning use probability checks.
- World generation code references biome chances and noise-based placement.

Not confirmed:

- Exact current regional resource spawn percentages.
- Exact active-world resource density per biome.
- Whether current seasonal region tuning differs from public/default data.

Reason: the repo exposes logic, but not enough live world/static data to compute exact spawn outcomes.

## Normal Market Auction Tax Or Claim Fee

Confirmed:

- Auction buy/sell orders and closed listings are represented by public state tables.
- Barter stalls can add to or spend from town treasury.

Not confirmed:

- A normal auction listing tax that goes to claim treasury.
- A normal market listing fee that goes to claim treasury.

Reason: no claim treasury tax/fee path was confirmed in the searched auction listing state and player trade handler code. Barter stall treasury handling is confirmed but should not be generalized to all market listings.

## Crafting Failure Chance

Confirmed:

- The reviewed craft reducer checks requirements, then applies progress and XP.

Not confirmed:

- A general crafting success/failure chance for ordinary craft progress.

Reason: no general craft failure roll was found in the reviewed craft reducer. There may be other systems or future code paths outside the searched area.

## Live Static Data Values

Not confirmed:

- Exact recipe inputs/outputs for all items.
- Exact item tiers/rarities if not pulled from live APIs.
- Exact technology costs, research times, supply caps, tile caps, member caps, and XP-to-coin thresholds.
- Exact global parameter values such as minimum distance between claims.

Reason: public code defines the static-data schemas and reads the tables at runtime, but the committed repo review did not locate a live static-data dump.

## BitJita Data Collection Internals

Not confirmed from this public BitCraft repo:

- How BitJita collects, caches, and normalizes its API data.
- Whether BitJita is reading directly from public SpacetimeDB tables, using client-observed data, running its own subscriptions, or combining multiple sources.

Reason: this analysis inspected the public BitCraft server repository, not BitJita's private implementation.

