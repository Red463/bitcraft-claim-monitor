# BitCraft Mechanics Guide Sources

Source repository reviewed: `clockworklabs/BitCraftPublic`, cloned locally to `C:\tmp\BitCraftPublic`.

All source paths below are relative to the public repository root.

## High-Value Files

| File | Lines | Why It Matters |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/messages/components.rs` | 640-651 | Defines `InventoryState`, the core inventory/pocket state shape. |
| `BitCraftServer/packages/game/src/messages/components.rs` | 1185-1194 | Defines `ClaimState`, including owner player, owner building, name, and neutral flag. |
| `BitCraftServer/packages/game/src/messages/components.rs` | 1207-1223 | Defines `ClaimLocalState`, including supplies, maintenance, tile count, treasury, and XP remainder for coin minting. |
| `BitCraftServer/packages/game/src/messages/components.rs` | 1235-1251 | Defines `ClaimMemberState`, including member username and claim permission flags. |
| `BitCraftServer/packages/game/src/messages/components.rs` | 1722-1754 | Defines auction buy/sell listing state and closed listing state. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 666-675 | Defines `CargoDesc`. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 790-805 | Defines `ItemDesc` key fields. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 941-967 | Defines `CraftingRecipeDesc`. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 969-990 | Defines `ConstructionRecipeDesc`. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 1436-1442 | Defines contribution loot metadata, including weighted flag. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 1714-1727 | Defines loot table and rarity descriptor tables. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 2119-2135 | Defines `ClaimTechDesc`, including supplies cost, research time, caps, and `xp_to_mint_hex_coin`. |
| `BitCraftServer/packages/game/src/messages/static_data.rs` | 2600 | Defines `QuestDropDesc`. |

## Treasury And Economy

| File | Lines | Confirmed Behaviour |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/game/entities/claim_tech_state.rs` | 40-54 | Finds the minimum positive `xp_to_mint_hex_coin` from learned claim technologies. |
| `BitCraftServer/packages/game/src/game/claim_helper.rs` | 374-393 | Converts gained XP into minted claim treasury hex coins and stores the remainder. |
| `BitCraftServer/packages/game/src/game/handlers/player_craft/craft.rs` | 449-477 | Awards crafting XP and sends that XP quantity into claim treasury minting when the building is inside a claim. |
| `BitCraftServer/packages/game/src/game/handlers/claim/claim_treasury_deposit.rs` | 12-35 | Owner/co-owner deposit flow removes hex coins and adds them to claim treasury. |
| `BitCraftServer/packages/game/src/game/handlers/claim/claim_withdraw_from_treasury.rs` | 12-34 | Owner/co-owner withdraw flow subtracts treasury and adds hex coins to inventory. |
| `BitCraftServer/packages/game/src/agents/rent_collector_agent.rs` | 72-93 | Paid rent can add `daily_rent` to claim treasury. |
| `BitCraftServer/packages/game/src/agents/player_housing_income_agent.rs` | 82-113 | Player housing income can be accumulated and added to claim treasury. |
| `BitCraftServer/packages/game/src/game/handlers/player_trade/barter_stall_order_accept.rs` | 304-331 | Barter stall transactions can spend from claim treasury. |
| `BitCraftServer/packages/game/src/game/handlers/player_trade/barter_stall_order_accept.rs` | 350-364 | Barter stall transactions can add gained coins to claim treasury. |

## XP And Leveling

| File | Lines | Confirmed Behaviour |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/game/entities/experience_stack.rs` | 6-43 | Defines max level, XP formula, XP-to-next-level calculation, and level lookup from XP. |

## Claims And Placement

| File | Lines | Confirmed Behaviour |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/game/claim_helper.rs` | 56-84 | Cached footprint-to-claim lookup requires all walkable/hitbox footprint tiles to be under the same claim. |
| `BitCraftServer/packages/game/src/game/claim_helper.rs` | 86-112 | Non-cached footprint-to-claim lookup with same same-claim requirement. |
| `BitCraftServer/packages/game/src/game/claim_helper.rs` | 296-310 | Claims tiles around the claim building and assigns buildings under claimed tiles. |
| `BitCraftServer/packages/game/src/game/claim_helper.rs` | 313-345 | Claim totem placement rejects nearby totems/claims and prohibited biomes. |

## Crafting, Gathering, Loot, And Resources

| File | Lines | Confirmed Behaviour |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/game/handlers/player_craft/craft.rs` | 430-437 | Crafting checks level requirements. |
| `BitCraftServer/packages/game/src/game/handlers/player_craft/craft.rs` | 442-503 | Crafting progresses only after tool/level requirements, then updates action progress and durability. |
| `BitCraftServer/packages/game/src/game/handlers/player/extract.rs` | 348-365 | Extraction consumables can be consumed based on chance. |
| `BitCraftServer/packages/game/src/game/handlers/player/extract.rs` | 371-389 | Extraction damage and XP damage use tool power and crit multiplier. |
| `BitCraftServer/packages/game/src/game/handlers/player/extract.rs` | 398-410 | Extraction rolls item stacks and quest drops. |
| `BitCraftServer/packages/game/src/game/handlers/player/extract.rs` | 413-430 | Extraction XP is proportional to progress/damage. |
| `BitCraftServer/packages/game/src/game/handlers/player/extract.rs` | 439-455 | Spawned placeable chance scales with damage output and clamps to 0-1. |
| `BitCraftServer/packages/game/src/game/entities/probabilistic_item_stack.rs` | 5-26 | Performs one probability roll per count and adds quantity on success. |
| `BitCraftServer/packages/game/src/game/entities/placeable_state.rs` | 63-85 | Placeable offspawn chance check. |
| `BitCraftServer/packages/game/src/game/entities/placeable_state.rs` | 123-145 | Weighted growth outcome selection. |
| `BitCraftServer/packages/game/src/game/entities/resource_deposit.rs` | 211-225 | Resource deposits can spawn another resource on destruction based on chance. |
| `BitCraftServer/packages/game/src/game/entities/item_list.rs` | 61-78 | Weighted item list selection. |

## Research

| File | Lines | Confirmed Behaviour |
| --- | ---: | --- |
| `BitCraftServer/packages/game/src/game/handlers/claim/claim_tech_learn.rs` | 16-100 | Research start checks owner/co-owner, range, prerequisites, item inputs, supply threshold, and schedules timer. |
| `BitCraftServer/packages/game/src/game/handlers/claim/claim_tech_unlock_tech.rs` | 23-77 | Research completion clears active research, learns the tech, and recursively unlocks child techs. |

## Source Review Notes

- A search for committed `.json`, `.csv`, `.ron`, `.toml`, `.yaml`, and `.yml` static-data records in `C:\tmp\BitCraftPublic` did not find live recipe/loot/table dumps in this review.
- That means exact recipe values, drop rates, market tuning, claim tech thresholds, and parameter values often require live static-data access rather than the public code alone.
- Some files include internal comments or TODOs from Clockwork Labs. Those were treated as context, not as stable public API guarantees.

## Live SpacetimeDB Dump Sources

The guide also references a local, read-only SpacetimeDB inspection captured on 2026-06-18. These files are not committed source-of-truth game code; they are observed live data for the captured region/time and should be treated as evidence for current behaviour only.

Useful captured files:

| Local dump file | Why It Matters |
| --- | --- |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_state.json` | Timbersteel Trade claim identity, owner player id, and claim name. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_local_state.json` | Timbersteel Trade supplies, treasury, tile count, location, and XP remainder. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_member_state.json` | Settlement member names and permission booleans. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_tech_state.json` | Learned claim tech and active research state. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_tech_desc.json` | Live claim tech thresholds, caps, and XP-to-coin values. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/building_state.json` | Buildings assigned to the claim. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/building_desc.json` | Building description names for `building_state` joins. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/building_nickname_state.json` | User-facing storage/building names. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-44-10Z/bitcraft-live-19/tables/claim_recruitment_state.json` | Recruitment stock, requirement, and approval settings. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-45-56Z/bitcraft-live-19/tables/crafting_recipe_desc.json` | Live recipe rows needed for craft and treasury calculations. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-45-56Z/bitcraft-live-19/tables/experience_state.json` | Per-player `experience_stacks` arrays. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-45-56Z/bitcraft-live-19/tables/skill_desc.json` | Skill/profession names for experience stack IDs. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-48-35Z/bitcraft-live-19/tables/storage_log_state.json` | Settlement-scoped storage activity rows. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-50-18Z/bitcraft-live-19/tables/marketplace_state.json` | Marketplace building to claim linkage. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-50-18Z/bitcraft-live-19/tables/sell_order_state.json` | Active sell orders scoped by claim. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-50-18Z/bitcraft-live-19/tables/buy_order_state.json` | Active buy orders scoped by claim. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-50-18Z/bitcraft-live-19/tables/closed_listing_state.json` | Closed market listing rows scoped by claim. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-53-41Z/bitcraft-live-19/tables/empire_settlement_state.json` | Claim to empire linkage and member donations. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-53-41Z/bitcraft-live-19/tables/empire_state.json` | Empire name, claim count, and treasury. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-53-41Z/bitcraft-live-global/tables/region_connection_info.json` | Region module discovery. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-53-41Z/bitcraft-live-global/tables/world_region_name_state.json` | Player-facing region names. |
| `.dev-data/bitcraft-live-db/dumps/2026-06-18T17-53-41Z/bitcraft-live-global/tables/region_population_info.json` | Region population metadata. |

Important data handling note: several BitCraft entity IDs exceed JavaScript's safe integer range. Future dumps should preserve IDs as strings or BigInts before joining records. Plain JavaScript JSON parsing can round IDs and make exact joins unreliable.
