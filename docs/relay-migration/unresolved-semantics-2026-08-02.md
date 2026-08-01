# Relay unresolved-semantics review — 2026-08-02

## Decision summary

This review found no new authoritative signal for any of the three remaining
parity questions. Production behavior must therefore remain:

| Question | Current defensible behavior | Status |
|---|---|---|
| Empire siege cancellation | `removed_or_unknown`; never label a disappearance or inactive row as cancelled | Unresolved |
| Completed-sale purchaser | Seller, item, quantity, price, and proceeds may be recorded when the existing unique correlation succeeds; purchaser remains `null` | Unresolved |
| Regional trade volume | Derive clearly labelled, progressive aggregates only from locally observed confirmed sales and expose `observedSince` | Direct historical aggregate unavailable |

None of these findings authorizes an implementation change. In particular,
current open orders, uncollected closure rows, or reducer names must not be
relabelled as completed trade history.

## Sources and observation method

Only first-party sources were used:

- the generated TypeScript bindings captured from Relay and their
  [schema manifest](../../apps/bitcraft-local/src/server/game-data/bindings/schema-manifest.json);
- the Relay operator's pinned
  [`relay-cache` HTTP router](https://github.com/ekscrypto/bitcraft-relay/blob/8dca2179ad963556122eca03244b0c00db54f3dd/crates/relay-cache/src/serve.rs)
  and
  [protobuf contract](https://github.com/ekscrypto/bitcraft-relay/blob/8dca2179ad963556122eca03244b0c00db54f3dd/crates/relay-cache/proto/relay_cache.proto);
- the live public Relay health/cache endpoints and typed read-only
  subscriptions; and
- the official SpacetimeDB
  [TypeScript client reference](https://spacetimedb.com/docs/clients/typescript/),
  [subscription semantics](https://spacetimedb.com/docs/clients/subscriptions/semantics/),
  and [subscription SQL reference](https://spacetimedb.com/docs/reference/sql/).

The checked-in manifest identifies global fingerprint
`5e44626f1c24e9f8392ebce8bdc9de135f76a58747b208d5e4aa455dd411036a`
and regional fingerprint
`762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`.
On 2026-08-02 BST, maintained live verifiers rediscovered
`bitcraft-live-global` and `bitcraft-live-19` with those exact fingerprints.
`/health` reported Region 19 live with all 274 mirrored tables live, while
`/cache-health` reported the cache ready.

The official Relay page and pinned router expose health, proto, claim,
member/citizen, inventory, craft, player, deposit, and storage-log routes.
The router and protobuf define no market-history, trade-volume, Empire, or
siege endpoint. Live requests to `/openapi.json`, `/swagger.json`, and
`/api-docs` returned `404`, so there is no separate advertised HTTP contract
that fills these gaps.

## 1. Empire siege cancellation

### Exact candidate tables and fields

The generated
[`EmpireNotificationType`](../../apps/bitcraft-local/src/server/game-data/bindings/global/types.ts#L1966)
union has `MarkedForSiege`, `StartedSiege`, `StartedDefense`,
`SuccessfulSiege`, `SuccessfulDefense`, `FailedSiege`, and `FailedDefense`.
It has no cancellation variant.

[`empire_notification_state`](../../apps/bitcraft-local/src/server/game-data/bindings/global/empire_notification_state_table.ts#L18)
contains:

- `entity_id`;
- recipient `empire_entity_id`;
- `notification_type`;
- `text_replacement`; and
- an integer timestamp.

That table can prove an outcome only when the two participant notifications
form one exact timestamp-and-replacement pair. It has no terminal reason
outside its typed notification union.

[`empire_node_siege_state`](../../apps/bitcraft-local/src/server/game-data/bindings/regional/empire_node_siege_state_table.ts#L14)
contains only siege entity ID, building entity ID, attacker Empire ID, energy,
active state, and optional start timestamp. Joining
`building_entity_id` to `empire_node_state.entity_id` identifies the current
defending node owner, but neither row contains a completion reason.

The generated
[`cheat_empire_siege_cancel`](../../apps/bitcraft-local/src/server/game-data/bindings/global/cheat_empire_siege_cancel_reducer.ts#L14)
input contains only `siegeNodeEntityId`. A reducer input proves that a
cancellation operation exists in module code; it does not define an emitted,
subscriber-visible cancellation event.

### Current observability

The maintained read-only command:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run verify:relay-siege-live
```

reproduced the existing bounded proof:

- 24 exact recipient Empire IDs;
- 5,108 scoped notifications;
- 392 recognized siege notifications;
- 22 paired starts;
- 9 attacker-win pairs;
- 14 defender-win pairs;
- 92 unmatched terminal groups; and
- zero ambiguous start or terminal groups.

Its authoritative output remained
`"cancellationSemantics": "unavailable"`. Successful and failed outcomes are
therefore observable from exact paired notifications. Cancellation is not.

A deleted current row, `active = false`, zero energy, a missing counterpart,
or a `MarkedForSiege` notification without a later retained event can each
also represent expiry, cleanup, abandonment, or incomplete retention.
Consequently none is a cancellation signal.

### Next controlled evidence

Cancellation can become authoritative only after one of:

1. a controlled in-game cancellation while a bounded typed subscription
   captures the exact row update/delete and notification sequence for the
   already known attacker and defender;
2. first-party BitCraft/Relay operator documentation naming a distinct
   subscriber-visible cancellation signal in the current schema; or
3. a future schema revision adding an explicit cancellation notification or
   terminal-reason field.

Until then, retain `removed_or_unknown`.

## 2. Completed-sale purchaser identity

### Exact candidate tables and joins

[`closed_listing_state`](../../apps/bitcraft-local/src/server/game-data/bindings/regional/closed_listing_state_table.ts#L18)
contains only:

- closure entity ID;
- `owner_entity_id`;
- market claim ID;
- one typed item stack; and
- timestamp.

The owner is the listing owner. There is no order ID, side, counterparty, or
purchaser field.

[`sell_order_state`](../../apps/bitcraft-local/src/server/game-data/bindings/regional/sell_order_state_table.ts#L14)
and
[`buy_order_state`](../../apps/bitcraft-local/src/server/game-data/bindings/regional/buy_order_state_table.ts#L14)
contain the current order ID, owner, claim, typed item, price threshold,
remaining quantity, timestamp, and stored coins. Neither row points to a
closure or counterparty.

`trade_session_state` does name an initiator and acceptor, but it has no
market claim, listing, or order reference. It represents direct player trade
state and has no proven join to marketplace execution.

There is one technically plausible live-only candidate:

```text
row callback ReducerEvent.callerIdentity
  -> user_state.identity
  -> user_state.entity_id
  -> player_username_state.entity_id
```

The official TypeScript reference defines `ReducerEvent.callerIdentity` and
the generated
[`user_state`](../../apps/bitcraft-local/src/server/game-data/bindings/regional/user_state_table.ts#L14)
provides the indexed identity-to-player mapping. This is not yet a purchaser
join:

- initial subscribed rows contain no reducer history;
- a transaction may be reported only as the generic `Transaction` event;
- no observed reducer has been proven to mean “this caller purchased this
  exact sell order”; and
- the posting reducer's caller may be the seller or a buy-order owner rather
  than the counterparty relevant to a later match.

The current seller-side correlation remains valid: a new Hex Coin closure may
prove proceeds only when it uniquely matches one same-owner sell-order
quantity transition. That proves the seller and sale value, not the buyer.

### Current observability

The maintained regional-market verifier observed:

- 4,085 current Region 19 orders, all with marketplace locations;
- 6,521 closure rows across 32 market claims and 830 owners;
- 6,424 Item closures and 97 Cargo closures; and
- no normalization warning.

The claim-scoped verifier observed 44 sell orders, no buy order, two
sale-proceeds rows, one returned listing, and one marketplace for Timbersteel
Trade.

A separate read-only two-minute Region 19 event watch subscribed to all 3,872
sell orders, 213 buy orders, and 6,523 closure rows then listened for
post-apply changes. It observed no post-apply market mutation, so it produced
no reducer caller that could be tested as a purchaser. The initial snapshot
cannot supply that missing event context.

Purchaser identity is therefore not observable from current retained rows and
was not observed live during this review.

### Next controlled evidence

Run one controlled sale with two known players while capturing, in one
regional typed session:

1. the exact sell-order update/delete;
2. all closure inserts in that transaction;
3. the callback event tag, reducer name/arguments, caller identity, status,
   and timestamp;
4. an equality-filtered `user_state.identity` lookup for that caller; and
5. the resulting player username.

Repeat with both a direct purchase and a matching posted buy order, plus a
seller cancellation. The signal is acceptable only if the buyer mapping is
unique across all three cases and survives reconnect semantics. A buyer-owned
non-Hex closure is not sufficient by itself because its row shape cannot
distinguish purchased inventory from returned inventory.

Until that controlled proof exists, keep purchaser fields `null`.

## 3. Regional trade-volume and aggregate semantics

### Exact candidate tables and fields

A full scan of the generated global and regional bindings found no public
table or field for:

- completed marketplace trades;
- regional trade counts;
- regional traded value;
- item sale volume; or
- an immutable market transaction ledger.

The only generated fields literally named `volume` are catalog fields on
[`item_desc`](../../apps/bitcraft-local/src/server/game-data/bindings/global/item_desc_table.ts#L21)
and
[`cargo_desc`](../../apps/bitcraft-local/src/server/game-data/bindings/global/cargo_desc_table.ts#L21)
(plus their regional copies). Those describe physical inventory volume, not
trade volume.

The remaining candidates do not provide an equivalent aggregate:

- buy/sell order rows describe current liquidity, not completed volume;
- closure rows are current uncollected outputs and do not form a complete,
  immutable sale ledger;
- `trade_order_state` describes barter-stall offers and remaining stock;
- `trade_session_state` is transient direct-trade state with no market/order
  join; and
- Relay HTTP/protobuf exposes no market endpoint.

SpacetimeDB subscriptions replicate whole rows from one selected table; they
do not publish an aggregate that is absent from the schema. Aggregate
calculation therefore belongs locally after an authoritative sale transition
has been observed.

### Observable semantics

The legacy Region feature displayed two values for a selected 30-day API
window: `overall.totalTrades` and `overall.totalValue`. No Relay row reproduces
that pre-existing window.

The clone can truthfully derive, per configured region and time window:

- `tradeCount = count(distinct confirmed local sale identity)`;
- `unitQuantity = sum(confirmed sale quantity)`; and
- `tradedValue = sum(exact confirmed total price)`.

Those values are authoritative for the app's locally observed confirmed-sale
window only. They are incomplete for:

- time before `observedSince`;
- provider outages;
- ambiguous removed/cancelled closures; and
- any region that was not actively subscribed.

They must therefore retain `observedSince`, exact region scope, and an
explicit “locally observed confirmed sales” label. They are not a replacement
for a complete historical 30-day regional aggregate until the observation
window itself covers the requested period without a gap.

### Next controlled evidence

There is no further join to try in the current schema for a historical
aggregate. Continue immediate idempotent persistence of uniquely confirmed
sale transitions and mature the local window. Re-run schema capability review
after a fingerprint change or after the Relay operator publishes a market
trade route/table. Do not infer volume from order churn or all closure rows.

## Cutover impact

These three gaps are explicit product limitations, not hidden ingestion jobs
waiting to be implemented:

- successful/failed siege outcome parity is implemented; cancelled outcome
  parity remains unavailable;
- market history and aggregates are live-first and progressively observed;
  purchaser identity remains unavailable; and
- the retired Region cards must not be restored with current-order or closure
  counts under their old labels.

Full cutover still requires either explicit owner acceptance of those
limitations or the controlled evidence described above. Their absence does
not justify adding a cache table or scheduled crawl: neither would create an
authoritative source signal.
