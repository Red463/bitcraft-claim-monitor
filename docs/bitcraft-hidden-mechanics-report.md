# BitCraft Hidden Mechanics Report

Player-facing findings from the public BitCraft server code, the existing mechanics guide, and a read-only live SpacetimeDB dump captured from region 19 on 2026-06-18.

This report is written for players. It focuses on what can be calculated, what cannot be proven yet, and what the captured Timbersteel Trade data showed at the time of the dump.

## Fast Answers

| Question | Can We Calculate It? | Confidence | Short Answer |
| --- | --- | --- | --- |
| Rent income from housing | Yes, partly | High | Automatic player-housing income can be calculated from live housing and building tables. Separate rental-contract income needs `rent_state`, which was empty in this dump. |
| Rare drop chances | Yes, for several drop systems | High | Extraction drops, variable item-list outputs, and animal harvest side drops expose probability data. Chest loot needs extra rarity tables that were not present in the captured dump. |
| Chance that crafted tools become rare | Not found | High for reviewed normal crafting path | Normal crafting recipes appear to output fixed item stacks. No random rarity-upgrade roll was found in the recipe rows or craft collection reducer. This is separate from recipes that output weighted side-result containers such as Animal Output. |
| Other useful hidden data | Yes | High | Housing treasury income, XP-to-treasury minting threshold, exact extraction probabilities, resource follow-up spawn chances, item-list outcome weights, permissions, storage activity, market state, and empire membership can all be inspected. |

## What Was Checked

The findings combine:

- The existing public mechanics guide in `docs/bitcraft-mechanics-guide.md`.
- Public server code from `clockworklabs/BitCraftPublic`, cloned locally at `C:\tmp\BitCraftPublic`.
- Live SpacetimeDB tables from `bitcraft-live-19`, captured on 2026-06-18 under `.dev-data/bitcraft-live-db/dumps/`.
- Timbersteel Trade claim id: `1369094286777412590`.

Important ID note: some exported JSON tooling rounded 64-bit BitCraft entity IDs because they exceed JavaScript's safe integer range. Joins in this analysis were made against the rounded dump value where needed, but future extraction should preserve IDs as strings or BigInts.

## Treasury Income From Housing

### Confirmed Server Behaviour

The public server has two different systems that can add housing/rental-style income to claim treasury.

Automatic player housing income:

- Runs from `player_housing_income_agent`.
- Loops over every `player_housing_state` row.
- Finds the entrance building for that housing row.
- Reads `housing_income` from the building description.
- Adds that amount to the owning claim treasury.
- Repeats daily.

Separate rental income:

- Runs from `rent_collector_agent`.
- Loops over `rent_state`.
- If `daily_rent > 0`, enough `paid_rent` exists, and the rent is not being evicted, it adds `daily_rent` to the claim treasury.
- If the renter cannot pay, the rent can be marked defaulted.

### Timbersteel Trade Snapshot

The live dump showed:

| Metric | Value |
| --- | ---: |
| Player housing rows linked to Timbersteel buildings | 8 |
| Building type | Sturdy Residential House |
| Income per housing row | 16 treasury coins/day |
| Calculated automatic housing income | 128 treasury coins/day |
| Rows marked `is_empty=false` | 2 |
| Rows marked `is_empty=true` | 6 |
| `rent_state` rows in the captured region | 0 |
| Calculated rental-contract income | 0 treasury coins/day |

Important caveat: the player housing income agent does not filter on the `is_empty` flag. It adds income for every `player_housing_state` row it can connect to a claim building. That means the captured code path calculates `8 x 16 = 128` treasury coins/day for Timbersteel, even though only 2 of the rows were marked not empty.

### Housing Income Values Found In Building Data

The live building descriptions exposed these housing income values:

| Building | Income Per Housing Row |
| --- | ---: |
| Rough Residential Hut | 7 |
| Simple Residential House | 13 |
| Sturdy Residential House | 16 |
| Sturdy Large Residential House | 16 |
| Fine Residential House | 21 |
| Exquisite Residential House | 27 |
| Exquisite Large Residential House | 27 |
| PlayerHousing_3_Slots | 100 |

Player-facing takeaway: if this code path is still live, housing can be a steady daily treasury source. Timbersteel's captured setup was worth about 128 treasury coins per day from player housing entries.

## Rare Drop Chances

### Extraction Drops

Extraction recipes include `extracted_item_stacks`, and the public server rolls them through `ProbabilisticItemStack`.

The formula is:

```txt
For each damage_output roll:
  roll random number from 0.0 to 1.0
  if roll <= probability:
    add the configured item quantity
```

So the table value is a per-roll chance when it is between 0 and 1. If the value is greater than or equal to 1, it is effectively guaranteed for each roll.

If a player wants to estimate the chance of getting at least one rare drop over multiple rolls:

```txt
chance_at_least_one = 1 - (1 - per_roll_chance) ^ number_of_rolls
```

The live dump contained:

| Metric | Value |
| --- | ---: |
| Extraction recipes checked | 484 |
| Probabilistic extraction outputs checked | 708 |
| Lowest observed per-roll chance | 0.00000786% |
| Highest observed probability field | 200% |

The 200% value should not be read as a 200% chance. The server compares the value to a 0-1 roll, so values above 100% are guaranteed per roll and may represent guaranteed output scaling.

Example rare extraction entries from the dump:

| Source | Output | Rarity | Per-Roll Chance |
| --- | --- | --- | ---: |
| Unreasonably Chummed Paranensis Pod | Fihs, the Fish of Myths | Mythic | 0.00000786% |
| School Of Azure Sphyra | Pungent Cat Fish | Epic | 0.00024% |
| School Of Rocky Doimaach | Pungent Cat Fish | Epic | 0.00024% |
| Snow Pile | Patterned Winter Mittens | Rare | 0.0004% |
| Snow Pile | Warm Winter Mittens | Rare | 0.0004% |
| Snow Pile | Whimsical Winter Mittens | Rare | 0.0004% |
| Blossom Tree | Deed: Mask Pattern - Flower Crown Blossoming | Epic | 0.0012% |
| Pumpkin | Pumpkin Hat | Epic | 0.0012% |
| Sunflower | Sunflower Hat | Epic | 0.0012% |

Player-facing takeaway: for gathering/extraction, rare drop rates are definitely present in the live data and can be calculated per roll. The exact practical chance per action depends on how many rolls the action creates.

### Item List Outcomes

Item lists are weighted outcome tables. The server:

1. Sums the weights in a list.
2. Rolls against the total.
3. Picks the selected outcome.
4. Recursively resolves nested item lists.

That means the real chance is:

```txt
outcome_chance = outcome_weight / total_weight_for_that_list
```

Example item-list outcomes from the live dump:

| List | Outcome | Rarity | Normalized Chance |
| --- | --- | --- | ---: |
| SentinelLootMoreThan100 | Feral Sentinel's Headpiece | Epic | 0.0008% |
| SentinelLootMoreThan100 | Energized Sentinel's Claymore | Epic | 0.0034% |
| SentinelDungeonSkitch | Hardened Shell | Rare | 0.01% |
| SentinelDungeonJakyl | Jakyl Fang | Rare | 0.02% |
| Lusul Egg | Deed: Pet Lusul (Orange and Yellow) | Mythic | 0.0434% |
| Croaklin Egg | Deed: Pet Croaklin (Red and Orange) | Mythic | 0.0437% |
| Bucket Tier 1 | 10x Empty Bucket plus Bucket Helmet | Epic | 0.0667% |
| Owl Egg | Deed: Pet Owl White | Mythic | 0.25% |
| Ornate Geode | Coralith | Legendary | 0.5% |

Player-facing takeaway: some loot systems expose exact weighted chances, including extremely rare cosmetic, pet, sentinel, and geode-style outcomes.

### Variable Processing Outputs

The animal-processing example is a real mechanic, but it is not the same as a tool randomly upgrading rarity when crafted.

In the captured data, hunting station recipes named `Harvest {0}` consume animals such as Sagi Bird, Nubi Goat, Cervus, Scrofa, Ardea, Rangifer, Plains Ox, and Yagi. These recipes output tiered items like `Rough Animal Output`, `Simple Animal Output`, `Infused Animal Output`, `Fine Animal Output`, and so on. Those output items point to `item_list_desc` rows, and those item lists resolve into weighted result bundles.

That is how the UI can show an output like `0-1 Animal Hair`: the recipe guarantees the animal-output result, but that result can resolve into a bundle that either includes or does not include animal hair.

Examples from the live dump:

| Processing Output | Animal Hair Result | Normalized Chance |
| --- | --- | ---: |
| Tier 1 Animal Output | 1x Rough Animal Hair plus raw pelt and raw meat | 25% |
| Tier 2 Animal Output | 1x Simple Animal Hair plus raw pelt and raw meat | 25% |
| Tier 3 Animal Output | 1x Sturdy Animal Hair plus raw pelt and raw meat | 25% |
| Tier 4 Animal Output | 1x Fine Animal Hair plus raw pelt and raw meat | 25% |
| Tier 5 Animal Output | 1x Exquisite Animal Hair plus raw pelt and raw meat | 25% |
| Tier 6 Animal Output | 1x Peerless Animal Hair plus raw pelt and raw meat | 25% |
| Tier 7 Animal Output | 1x Ornate Animal Hair plus raw pelt and raw meat | 25% |
| Tier 8 Animal Output | 1x Pristine Animal Hair plus raw pelt and raw meat | 25% |
| Tier 9 Animal Output | 1x Magnificent Animal Hair plus raw pelt and raw meat | 25% |
| Tier 10 Animal Output | 1x Flawless Animal Hair plus raw pelt and raw meat | 25% |

There are also special animal-output lists that use different weights. For example, the captured `Tier 3 Animal Output - SwiftCervusGold` list had two animal-hair outcomes: 70% for 2x Sturdy Animal Hair and 30% for 3x Sturdy Animal Hair.

Player-facing takeaway: variable processing outputs can be calculated when the output item links to an item list. If the UI says `0-1`, the best explanation found in the data is a weighted item-list branch, not a hidden craft-quality upgrade.

### Loot Chests

The dump included `loot_table_desc` and `loot_chest_desc`, but did not include populated `chest_rarity_desc` or `loot_rarity_desc` tables in the checked capture.

The public server code shows the logic:

1. A chest has a set of possible loot tables.
2. Chest rarity weights select a loot table.
3. The selected loot table rolls each configured item stack by probability.

Because the captured rarity-weight tables were missing or empty, this report cannot safely calculate full chest probabilities. It can only say that the mechanism is probabilistic and the pieces needed for full calculation are known.

## Rare Craft Chances

Normal crafting was checked in two ways:

- Live `crafting_recipe_desc` rows.
- Public craft collection reducer.

Findings:

- `crafting_recipe_desc` contained 7,618 recipes.
- No probability, chance, random, roll, or rarity-upgrade fields were found in the reviewed recipe rows.
- The craft collection reducer maps `crafted_item_stacks` directly into output items.
- No random rarity upgrade roll was found in the normal craft collection path.
- No fixed rare craft outputs were found by checking crafted outputs against item/cargo rarity descriptors in this dump.

Player-facing conclusion: based on the reviewed normal crafting path, there is no evidence that a tool or item randomly becomes Rare/Epic/Legendary when crafted. If rare crafted tools exist, they are likely represented as separate recipe/output definitions or another system not present in the reviewed path, rather than a hidden random upgrade chance on every craft.

Important distinction: this conclusion only covers hidden rarity upgrades on the crafted item itself. It does not rule out variable side outputs. The animal harvest data above confirms that some processing recipes produce output containers that roll weighted results such as `0-1 Animal Hair`.

## Other Useful Hidden Data

### XP-To-Treasury Minting

The existing mechanics guide confirms that crafting XP can mint treasury coins into a claim.

The formula is:

```txt
threshold = minimum positive xp_to_mint_hex_coin from learned claim tech
total_xp = previous_xp_remainder + gained_xp
minted_coins = floor(total_xp / threshold)
new_remainder = total_xp % threshold
treasury += minted_coins
```

In the Timbersteel dump, the effective observed threshold was 400 XP per treasury coin.

Player-facing takeaway: high-XP settlement crafting can directly create claim treasury coins once the settlement has the relevant learned tech.

### Follow-Up Resource Spawn Chances

Some resources can spawn another resource when destroyed. The live `resource_desc` table includes `on_destroy_yield_resource_id` and `on_destroy_yield_resource_chance`.

The public server checks the chance as:

```txt
if chance >= 1.0:
  spawn is guaranteed
else:
  roll 0.0 to 1.0 and spawn if roll <= chance
```

The captured dump contained 115 resources with follow-up spawn settings. Many were guaranteed transformation-style entries, such as doors, pedestals, bridges, and dungeon interactables.

Player-facing takeaway: follow-up resource spawning is data-driven and calculable where the table exposes the target and chance.

### Settlement And Player Ops Data

The live dump also exposed several operational facts useful for the app:

- Claim members and permission booleans.
- Recruitment settings.
- Building lists and building nicknames.
- Storage activity logs tied to settlement buildings.
- Marketplace buildings, active orders, and closed listing rows.
- Empire membership, empire treasury, and member donations.
- Player profession XP stacks.
- Claim research state and learned tech.

These are not hidden combat/drop mechanics, but they are valuable for settlement dashboards because they come from game state rather than estimates.

## What We Still Cannot Prove

| Area | Why It Is Still Uncertain |
| --- | --- |
| Full chest loot percentages | Rarity-weight tables needed for complete chest calculations were not populated in the captured dump. |
| Whether another separate rare-craft system exists | The reviewed normal crafting path has no rarity roll, but another unrevealed system could exist outside the checked reducer/data. |
| Permanent balance values | Live static data can change. Treat these values as observed on 2026-06-18, not permanent rules. |
| Exact practical rare drop chance per player action | Extraction per-roll chances are known, but practical action chance depends on `damage_output`, tool power, crit, and action context. |

## Player Summary

The dump gives enough information to calculate several mechanics that are usually opaque:

- Timbersteel's captured player housing setup appeared to generate 128 treasury coins per day.
- Rental-contract income was not active in the captured region table.
- Extraction rare drop rates are real and calculable per roll.
- Item-list loot and processing-output chances are real and calculable after normalizing the weights.
- Normal crafting does not appear to have a hidden random rarity-upgrade roll, but some processing recipes can output weighted side-result containers.
- Settlement crafting can mint treasury coins through the XP-to-coin technology threshold.

The most useful app feature opportunities from this are:

- A treasury breakdown showing housing income, craft XP minting, deposits, and rent if `rent_state` becomes populated.
- A rare-drop lookup that shows per-roll chance and estimated chance over multiple rolls.
- A loot-table explorer that normalizes item-list weights into readable percentages.
- A variable-output recipe viewer that expands item-list outputs such as Animal Output into guaranteed and possible side results.
- A claim tech calculator that shows how much XP is needed before the next treasury coin is minted.
