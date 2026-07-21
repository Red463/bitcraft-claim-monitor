# Craft Planner Acquisition Route Selection

## Goal

Make acquisition routes understandable and directly comparable for every planner item. The selected route must be the sole authority for whether an item is gathered, crafted, processed, received as a byproduct, or moved through a logistics recipe. Remove the separate gathered override so the planner cannot hold contradictory acquisition settings.

## Scope

This design applies globally to all item and cargo routes shown by Craft Planning, including:

- ordinary gathering;
- prospecting;
- deterministic and probabilistic crafting;
- gathering and crafting byproducts;
- processing routes;
- package, packing, and unpacking logistics routes;
- items that have no known producer route.

Gypsite is a representative example, not a special case.

## Acquisition Route Model

- Replace the `Treat this cell as gathered` control and the recipe dropdown with one acquisition-route chooser.
- Use the selected recipe's existing metadata, including `routeType`, `gatheringMode`, producer, gathering source, station, inputs, and probability fields, to determine how the planner calculates and describes the route.
- A selected gathering recipe produces gathering calculations.
- A selected crafting or processing recipe produces recipe-completion calculations.
- A selected logistics recipe remains available only as an explicit logistics choice and is never presented as ordinary production.
- An item with no known producer route remains a raw or externally supplied input automatically.
- The planner must not create a separate manual-supply route merely to replace the gathered toggle.

The legacy `gatheredItemKeys` configuration must no longer affect planner calculations. Existing gathered overrides are cleared or ignored during normalization so users are not left with an invisible setting that prevents route selection. Existing `routeOverrides` remain compatible.

## Route Chooser

Show a dense set of selectable route cards under `Choose acquisition route` when more than one route is available. Each card contains enough information to compare routes before selection:

- a meaningful route name;
- a route-kind badge such as Gathering, Crafting, Byproduct, Prospecting, or Logistics;
- the expected or guaranteed yield in the most player-friendly basis;
- the estimated whole nodes or recipe completions needed for the current requirement;
- the station, source node, or important inputs that distinguish the route.

Only authorised plan managers can change the plan-wide selection. Other users can see the alternatives and which route is selected. When only one route exists, omit the chooser and show the route summary directly.

Selecting a card must save the route override, recalculate the plan, and refresh the open modal in place. While saving, the selected card shows a pending state and competing selections are disabled. A failed save keeps the previous selection and displays an inline error.

## Route Labels

Generate labels from route metadata instead of relying on generic recipe names. Use this hierarchy:

- ordinary gathering: `Gather from {source node}`;
- gathering byproduct: `Gather byproduct from {source node}` with the primary gathered output when available;
- prospecting: `Prospect at {resource}` or the most specific prospecting source label available;
- crafting or processing: prefer the meaningful recipe name, then `{inputs} -> {output}`, and include `at {station}` when available;
- crafting byproduct: identify the producer recipe and mark the output as a byproduct;
- logistics: use the concrete action, such as `Unpack {package}`, and display a Logistics badge;
- last resort: use the catalogue recipe label and station, with a stable identifier only if otherwise identical routes remain ambiguous.

The same shared formatter must be used for need-detail routes and other Craft Planning route selectors so labels do not diverge.

## Player-Friendly Gathering Numbers

For finite ordinary gathering nodes, lead with actionable whole-node planning:

1. `Plan for {rounded-up count} full nodes`.
2. `About {expected quantity} {item} per full node`.
3. `{exact decimal} expected node equivalents` as supporting precision.

The whole-node count is the ceiling of the buffered expected node equivalents. The supporting decimal remains an expected-value quantity, not a guarantee.

Do not lead with small decimals such as `0.002 expected per resource progress`. Translate them into a reciprocal that players can interpret, such as `about 1 item per 500 node progress`, and keep the raw decimal in the technical calculation disclosure.

Use meaningful precision without displaying a probabilistic non-zero rate as zero. The safety buffer changes planned work, not the API probability or the item requirement.

## Player-Friendly Crafting Numbers

For crafting and processing routes, lead with:

1. planned recipe completions;
2. expected or guaranteed output per craft;
3. total station actions when `actions_required` makes this differ from recipe completions.

Probabilistic outputs must remain labelled as long-run expected values. Deterministic outputs may be labelled guaranteed.

## Technical Calculation Disclosure

Keep a collapsed `Show calculation` disclosure for players who want the source detail. Depending on route type, it may include:

- exact total node or extraction progress;
- expected quantity per progress;
- reciprocal progress per expected item;
- normalized item-list probability;
- extraction occurrence rate;
- node maximum health;
- resource-completion output;
- expected yield formula;
- unbuffered and buffered work;
- safety-buffer percentage;
- expected and guaranteed output per craft;
- recipe completions, actions per completion, and total actions.

Do not combine list probability and occurrence rate into wording that implies a simple per-hit chance. Tool hits remain out of scope because the catalogue describes resource progress, not player hits.

## Prospecting and Unavailable Data

Prospecting exhaustion is unknown and displayed health is not reliable finite-node health. Prospecting routes therefore do not show a full-node estimate. They show expected extraction progress and a concise explanation that a node total cannot be calculated.

If validated probability data is unavailable, keep the route visible but show `Yield calculation unavailable`. Do not replace missing data with zero and do not calculate a misleading node or completion count.

## Terminology

Replace player-facing `full resource` and `full-resource equivalent` wording with `full node` and `node equivalents` throughout Craft Planning and other public probability presentation generated from the same catalogue, including the downloadable workbook. Internal compatibility fields such as `expectedPerResource` and `expectedResourceEquivalents` may remain unchanged.

## Data and Compatibility

Extend alternative-route data only where necessary so each option can expose its own:

- route type and gathering mode;
- gathering source and primary producer context;
- station and meaningful recipe name;
- inputs;
- expected yield basis;
- expected yield per progress, full node, or craft;
- resource health;
- probability status;
- unbuffered and buffered work estimates.

Preserve existing recipe identifiers and route-override values. Route selection must continue to resolve item and cargo identities independently.

## Accessibility and Layout

- Route cards use native radio semantics or an equivalent accessible single-selection pattern.
- The selected, pending, disabled, and unavailable states are communicated without relying on colour alone.
- Cards wrap text within the modal and never introduce horizontal scrolling.
- Keyboard users can move through and select available routes.
- Dense dashboard spacing and existing visual tokens are retained.

## Testing

- A gathering selection produces gathering calculations without a gathered toggle.
- A crafting selection produces crafting calculations for the same item when both route kinds exist.
- Generic same-output recipes are differentiated by source, inputs, station, route kind, or final fallback identifier.
- Gypsite routes identify Mud Mound and Rough Sand Pile separately and show player-friendly full-node estimates.
- Small non-zero per-progress yields never display as zero.
- Whole-node planning rounds buffered expected node equivalents up while preserving the exact decimal in supporting detail.
- Prospecting omits full-node estimates.
- Unavailable probability data never produces fake zero yields.
- Logistics routes remain explicitly labelled and are not selected automatically.
- Existing route overrides continue to resolve.
- Legacy gathered overrides no longer suppress known routes.
- Item and cargo IDs remain distinct.
- Route selection refreshes the open detail view and rolls back visually on failure.
- Single-route, multi-route, read-only, keyboard, wrapped-text, and narrow-modal states are covered.
- Workbook and planner terminology use `full node` consistently.

## Out of Scope

- Inferring tool hits or real-world gathering time.
- Changing catalogue probabilities or the expected-value model.
- Adding a new manual-supply route.
- Redesigning unrelated Needs Board cells, stock rules, or tracked-craft coverage.
