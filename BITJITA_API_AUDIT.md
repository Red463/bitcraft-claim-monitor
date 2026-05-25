# BitJita API Audit

Tested on 2026-05-25 against the official documentation at
<https://bitjita.com/docs/api> and the live API at <https://bitjita.com>.

## Method

- Requests included an `x-app-identifier` header and remained below the documented 250 requests/minute limit.
- Data-bearing calls used the monitored settlement (`1369094286777412590`), an actual member, current listing, active craft, house, catalog item, resource, and empire ID so detail routes were tested with valid inputs.
- Response shapes and counts were inspected. This report intentionally does not preserve player chat text, inventory contents, or other sensitive payload data.
- The authentication validation endpoint was not submitted because it requires a real in-game verification code and is not a read endpoint.

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
- Members, Inventory and Structures now offer public API-backed drill-down information.

## Further Additions

1. **Item price intelligence.** Add selectable `/api/market/items/[id]/price-history` charts for individual listed or stored items.
2. **Storage persistence.** Persist `/api/logs/storage` in SQLite if longer-term local searching and exports are required beyond the public API retention period.
3. **Inventory demand classification.** Expand item/cargo recipe detail into stock-versus-needed planning for queued crafts and future research.

## Lower-Priority Data

Global DAU/MAU, hexite exchange, world wind parameters, creature catalogs, deployables, and global holdings/leaderboards are functioning but do not directly improve day-to-day settlement operations unless a broader game-information section is desired.
