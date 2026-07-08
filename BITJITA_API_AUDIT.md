# BitJita API Audit

Initially tested on 2026-05-25 against the official documentation at <https://bitjita.com/docs/api> and the live API at <https://bitjita.com>. Rechecked against the updated public API documentation on 2026-07-08.

## Method

- Requests included an `x-app-identifier` header and remained below the documented 250 requests/minute limit.
- Data-bearing calls used the monitored settlement (`1369094286777412590`), an actual member, current listing, active craft, house, catalog item, resource, and empire ID so detail routes were tested with valid inputs.
- Response shapes and counts were inspected. This report intentionally does not preserve player chat text, inventory contents, or other sensitive payload data.
- The authentication validation endpoint was not submitted because it requires a real in-game verification code and is not a read endpoint.


## 2026-07-08 Documentation Recheck

BitJita's API documentation has been expanded into a much more useful reference for application work. The public docs now describe the API as a RESTful JSON interface for BitCraft data across players, market, claims, empires, items, and related game data. The app should continue to treat BitJita as the live source of truth and keep all browser calls behind the local `/api/bitjita/*` proxy so caching, rate limiting, CORS avoidance, stale-if-error handling, and the `x-app-identifier` header stay centralized.

### Current App Coverage

The maintained app now uses more of the public API than the original May audit captured:

| Area | Current usage |
| --- | --- |
| Claims | Claim summary, members, citizens, buildings, construction, inventories, layout, recruitment, research, and claim market listings. |
| Production | Claim craft queues, member craft queues, craft contribution detail, active craft normalization, and production activity history. |
| Market | Search, claim listings, item/cargo price history, player trades, player order history, trade-volume stats, deal alerts, and confirmed sale matching. |
| Players | Player details, equipment, equipment presets, inventories, housing, market collections, passive crafts, and live map/member status helpers. |
| Planning and recipes | Item/cargo detail lookups, crafting recipes, alternate route selection, research tier presets, settlement storage, player inventories, deployable-style player storage, and active craft offsets. |
| Empires | Empire list, empire detail, empire towers, tower member access data, aligned claims, and claim member drilldown. |
| Region and map | Regions, region status, regional claims, resources, creatures, skills, and trade-volume summary data. |
| Logs and history | Storage logs, market activity history, production activity history, and background collector snapshots. |

### Documentation/Implementation Gaps

The updated docs make several local gaps clearer:

1. `lib/api-spec/openapi.yaml` is no longer representative of the public API surface. It only models a small set of local proxy routes and includes older paths such as `/bitjita/claims/{claimId}/productions`, while the app now mainly uses `/crafts?claimEntityId=...` plus many player, market, empire, resource, and planning endpoints.
2. Craft Planning still discovers player deployables by interpreting `/players/{id}/inventories` container names. The updated docs expose deployables as their own API family, so we should verify whether player-owned carts, wagons, personal caches, and other containers can be joined to `/api/deployables` or player housing/container detail instead of relying on name heuristics.
3. Recipe and item handling should prefer documented item/cargo detail fields over local fallbacks. The current planner now avoids tier guessing for needs-board placement, but the generated client types do not help enforce that contract yet.
4. The proxy cache policy should be reviewed against the now clearer endpoint families. Static catalog endpoints can keep long TTLs; player inventory, craft, market listing, and storage-log endpoints should remain short-lived.
5. Several useful player endpoints are used directly in page-specific code but are not reflected in local API docs: equipment, presets, housing, market collections, passive crafts, and inventories.

### Suggested Changes From The Updated Docs

1. **Regenerate or replace the local API spec.** Update `lib/api-spec/openapi.yaml` so generated clients cover the actual BitJita proxy endpoints we use today: player detail subroutes, item/cargo detail, market price history/trades/history, empire towers/claims, resources/creatures, and craft contribution routes. This will reduce stringly-typed endpoint drift.
2. **Audit deployable source discovery against documented deployable/player storage routes.** Confirm the exact BitJita relationship between `/api/deployables`, `/api/players/{id}/inventories`, `/api/players/{id}/housing`, and any container IDs returned in those payloads. Then replace Craft Planning deployable name matching with ID/type-based normalization where the docs and live payloads support it.
3. **Add endpoint shape fixtures for Craft Planning.** Capture safe, redacted examples for item detail, cargo detail, player inventory, player housing, and deployable/container payloads. Use them in tests so tier grouping, route overrides, stock locations, and deployable cards are driven by documented fields.
4. **Document endpoint ownership in code.** Add a small maintained map of BitJita endpoint families used by each app feature: Dashboard, Members, Production, Inventory, Market, Empires, Map, Activity, and Craft Planning. This would make future API-doc changes faster to assess.
5. **Review caching per endpoint family.** Add explicit cache policies for player housing, equipment, market collections, passive crafts, empire tower data, and deployables if we keep using those routes. Avoid relying on the proxy default TTL for operationally important live data.
6. **Keep final target and material semantics explicit.** For Craft Planning, continue to separate target items, craftable intermediates, raw gathered materials, vendor/NPC materials, and uncertain drops. The updated docs should let us use official item/cargo tags, tiers, and recipe fields instead of name-based classification.

## Endpoint Results

The docs expose 79 routes: 77 `/api` routes plus two `/static/experience` files. Of these, 78 routes were exercised successfully; the remaining auth validation route was deliberately not submitted.

| Family | Routes tested | Result | Data available |
| --- | --- | --- | --- |
| Buildings | `GET /api/buildings`, `/api/buildings/[id]` | `200` | Structure catalog, functions, maintenance, construction recipe, required items/cargo |
| Cargo | `GET /api/cargo`, `/api/cargo/[id]` | `200` | Cargo catalog, orders, recipes using cargo, skills, market stats |
| Chat | `GET /api/chat` | `200` | Channel/target, username, text, timestamp, region; privacy-sensitive |
| Claims | `GET /api/claims`, `/[id]`, `/buildings`, `/citizens`, `/construction`, `/inventories`, `/layout`, `/members`, `/recruitment`, `/research`, `/market/listings` | `200` | Settlement metrics, structures, skill table, active construction, containers, layout coordinates, permissions/activity, recruitment, tech, market listings |
| Crafts | `GET /api/crafts`, `/[craftId]`, `/[craftId]/contributions` | `200` | Active jobs, progress, outputs, owner/building, contributor names and contribution totals/timestamps |
| Creatures | `GET /api/creatures`, `/[id]` | `200` | Creature tier/combat data and assets |
| Deployables | `GET /api/deployables`, `/[id]` | `200` | Vehicles/storage/deployable capacity and movement data |
| Empires | `GET /api/empires`, `/[id]`, `/[id]/claims`, `/[id]/towers` | `200` | Empire member totals, donations, claims with upkeep/supplies, towers and siege state |
| Food | `GET /api/food`, `/[itemId]` | `200` | Restoration values and buff effects |
| Hexite | `GET /api/hexite-exchange`, `/history` | `200` | Store package value metrics and historical bonus/pricing data |
| Items | `GET /api/items`, `/[itemId]` | `200` | 7,361 item entries; recipes, ingredients/usages, skills, equipment/food/tool stats, market stats |
| Leaderboards | `GET /api/leaderboard/cargo/[id]`, `/items/[id]`, `/exploration`, `/playtime`, `/skills` | `200` | Holdings summaries, global exploration/playtime/skills rankings |
| Logs | `GET /api/logs/storage` | `200` | Player/container storage movements with timestamps and resolved items/cargo |
| Market | `GET /api/market`, `/[itemOrCargo]/[id]`, `/price-history`, `/deals`, `/player/[id]`, `/history`, `/trades`; `POST /api/market/prices/bulk` | `200` | Current orders, listing timestamp, VWAP/time buckets, completed trades, order statuses, arbitrage, bulk prices |
| Players | `GET /api/players`, `/[id]`, `/buffs`, `/crafts`, `/equipment`, `/equipment/presets`, `/exploration`, `/housing`, `/housing/[houseId]`, `/inventories`, `/market`, `/market-collections`, `/passive-crafts`, `/skill-rankings`, `/stats`, `/traveler-tasks`, `/vault` | `200` | Online/activity data, buffs, equipment, exploration, personal stores/housing, market collections, crafts, rankings, tasks, collectibles |
| Regions | `GET /api/regions`, `/status` | `200` | Region names plus current signed-in/queued player counts and sync status |
| Resources | `GET /api/resources`, `/[resourceId]` | `200` | 512 resources with tier, rarity, health and respawn information |
| Skills | `GET /api/skills` | `200` | 12 profession skills and 6 adventure skills |
| Stats | `GET /api/stats/hexcoin`, `/skills`, `/trade-volume` | `200` | Hexcoin circulation, aggregate skill XP and regional/time-bucketed market volume |
| Status | `GET /api/status`, `/chart`, `/dau-mau` | `200` with note below | Population, DAU/MAU, population timeseries and Twitch viewers |
| Wind | `GET /api/wind` | `200` | World wind parameters |
| Static XP | `GET /static/experience/levels.json`, `/levels.csv` | `200` | XP thresholds for 120 levels |
| Authentication | `POST /api/auth/chat/validate` | Not submitted | Requires a real in-game authentication code |

## Live Settlement Findings

These figures are a point-in-time confirmation that the returned data is populated, not stored application metrics:

| Endpoint | Live data found |
| --- | --- |
| Claim structures | 142 structures |
| Settlement citizens/members | 10 records |
| Settlement inventories | 30 containers, resolved item/cargo catalog references |
| Settlement layout | 135 placements with coordinate/direction data |
| Settlement recruitment | 1 recruitment configuration record |
| Research | 146 technology records with requirements and completion state |
| Active settlement crafts | 4 jobs; a tested craft returned contribution history |
| Settlement market listings | Listings include `timestamp`, `createdAt`/`updatedAt` where applicable, owner, quantity, side, region and price |
| Member market data | Active orders, order history status, completed trade records and market collections all populated |
| Member operational data | Buffs, equipment, housing inventories, passive crafts, traveler tasks and vault all populated |
| Item market history | Daily price buckets and recent trades populated for an active listed item |
| Global trade volume | Time buckets, top items and regional totals populated |

## Documentation Issue

`GET /api/status/chart` is documented with optional `bucket` and `limit` parameters, but a request containing only those parameters returns:

```json
{"error":"Missing from/to parameters"}
```

Providing `from` and `to` ISO timestamps succeeds and returns population buckets with `regions`, `totalSignedIn`, `twitchViewers` and `era`.

## Existing App Coverage

The current frontend already reads claim detail, members, citizen skills, structures, inventories, construction, research, claim market listings, active crafts, layout, player detail and region claim rankings. The production server polls claim summary, members, structures and claim market listings for local history and sale reconciliation.

## Implemented From This Audit

- Market analytics now reads member order history and confirmed trades directly from BitJita, correlating trades to settlement orders rather than equating completed or disappeared listings with sales.
- Production now reads craft contributions and shows contributor progress and recency.
- Activity now incorporates public storage movement logs with an explicit Storage filter.
- Region now uses live region status/trade-volume data and resolves settlement detail for owner names.
- Members, Inventory, Production and Construction now offer public API-backed drill-down information where BitJita exposes suitable detail data.

## Further Additions

1. **Item price intelligence.** Add selectable `/api/market/items/[id]/price-history` charts for individual listed or stored items.
2. **Storage persistence.** Persist `/api/logs/storage` in SQLite if longer-term local searching and exports are required beyond the public API retention period.
3. **Inventory demand classification.** Expand item/cargo recipe detail into stock-versus-needed planning for queued crafts and future research.

## Lower-Priority Data

Global DAU/MAU, hexite exchange, world wind parameters, creature catalogs, deployables, and global holdings/leaderboards are functioning but do not directly improve day-to-day settlement operations unless a broader game-information section is desired.
