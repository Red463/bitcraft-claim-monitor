# BitCraft Live Database Inspection

This project normally uses BitJita because it is public, convenient, and safe to consume from the app. Some low-level game mechanics, such as exact claim treasury minting thresholds, require live SpacetimeDB tables that are not present in the public `clockworklabs/BitCraftPublic` repository.

Use `scripts/bitcraft-live-db.mjs` for local-only investigation. It can request a BitCraft email access code, exchange that code for a local JWT, connect to the live SpacetimeDB WebSocket endpoint, and dump schema/table data into ignored local files.

On Windows the CLI uses a small PowerShell `ClientWebSocket` helper for live table reads by default. The Node `ws` client can complete the HTTP upgrade but has been observed to close before BitCraft sends the SpacetimeDB `IdentityToken`, while the PowerShell websocket path matches the repeatable working test.

`scripts/bitcraft-spacetime-inspect.mjs` remains useful for anonymous schema checks, but live table rows on the current BitCraft host require the authenticated WebSocket path used by `bitcraft-live-db.mjs`.

## Safety Rules

- Do not paste player tokens into chat, issues, commits, screenshots, or docs.
- Do not store tokens in the app database or browser local storage.
- Prefer a one-session PowerShell environment variable.
- Output is written to `.dev-data/bitcraft-live-db/`, which is ignored by Git.
- Review output before sharing it because live table rows may contain player or settlement data.

## Required Values

The script defaults to the values discovered from the live game client:

- SpacetimeDB host: `https://bitcraft-early-access.spacetimedb.com`
- Global module: `bitcraft-live-global`
- Regional module pattern: `bitcraft-live-{regionId}`, for example `bitcraft-live-19`
- Schema version: `9`

The script can also use a manually supplied token through `BITCRAFT_PLAYER_TOKEN`, but the recommended local workflow is the email access-code flow below.

## PowerShell Usage

Request an access code:

```powershell
node scripts/bitcraft-live-db.mjs request-code --email your@email.example
```

Exchange the emailed code for a local JWT:

```powershell
node scripts/bitcraft-live-db.mjs exchange-code --email your@email.example --code 123456
```

The JWT is saved to:

```txt
.dev-data/bitcraft-live-db/token.json
```

This file is ignored by Git. Treat it as sensitive.

Dump global schema/table names:

```powershell
node scripts/bitcraft-live-db.mjs schema --database bitcraft-live-global
```

Run a safe global query:

```powershell
node scripts/bitcraft-live-db.mjs query --database bitcraft-live-global --sql "SELECT * FROM region_connection_info"
```

Scan known global discovery tables:

```powershell
node scripts/bitcraft-live-db.mjs scan --database bitcraft-live-global --include region_connection_info,world_region_name_state,region_population_info
```

Dump selected regional tables:

```powershell
node scripts/bitcraft-live-db.mjs scan --database bitcraft-live-19 --include claim,tech,recipe --confirm-session-risk
```

Dump every public table in a regional module:

```powershell
node scripts/bitcraft-live-db.mjs scan --database bitcraft-live-19 --all-tables --confirm-session-risk
```

Run one query:

```powershell
node scripts/bitcraft-live-db.mjs query --database bitcraft-live-19 --sql "SELECT * FROM claim_local_state" --confirm-session-risk
```

To force the experimental Node websocket transport for comparison:

```powershell
node scripts/bitcraft-live-db.mjs query --database bitcraft-live-global --sql "SELECT * FROM region_connection_info" --transport node
```

Output is written under:

```txt
.dev-data/bitcraft-live-db/dumps/
```

## Session Risk

Regional SpacetimeDB connections made with a normal player JWT can sign that player out of the live game. Prefer a dedicated collector account for scans. At minimum, avoid running regional scans while actively playing on the same account.

The global module is safer for discovery because it does not attach to a specific active world shard in the same way.

## What To Look For

For claim treasury mechanics, inspect:

- `claim_local_state`: live treasury value and XP remainder if table names match the public server schema.
- `claim_tech_state`: learned claim technologies for the settlement.
- `claim_tech_desc`: live `xp_to_mint_hex_coin` values for learned technologies.
- `crafting_recipe_desc`: live recipe XP values.

The public code shows the treasury formula, but the live static data records determine the actual current values.

## References

- SpacetimeDB HTTP SQL endpoint: `POST /v1/database/:name_or_identity/sql`.
- SpacetimeDB schema endpoint: `GET /v1/database/:name_or_identity/schema`.
- Public BitCraft server source reviewed in `docs/bitcraft-mechanics-guide-sources.md`.
