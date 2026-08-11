# Native Map Reliability, World Overview, Roads, and Resources Plan

## 1. Lock UI behavior with failing tests

- Update layer preference and map boundary tests to require only claims, claim areas, roads, watchtowers, players, resources, and enemies as controls.
- Require terrain/water to be mounted unconditionally and excluded from persisted preferences.
- Add a claim-badge boundary test that prevents image clipping.
- Implement the smallest React/CSS changes and run focused tests plus the frontend build.

## 2. Fix snapshot and event request storms

- Add client lifecycle tests for one initial fetch, generation-aware event handling, request coalescing, abort handling, and retry behavior.
- Split server rate limits for snapshots and event connections and add focused route/rate-limit tests.
- Implement an isolated snapshot/event coordinator used by `NativeMap`.
- Confirm rapid resource-selection changes no longer produce duplicate loads or visible abort errors.

## 3. Enable verified resource tracking

- Record the verified region-19 resource fixture and operating measurements in the developer reference.
- Add configuration and route tests proving resource collection is enabled without enabling unverified players, enemies, or waystones.
- Exercise the existing bounded resource session/projection through API tests, including type selection, region and dimension filtering, deletion, string entity IDs, and budgets.
- Enable the resource coordinate and spatial collection gates and smoke-test resource type 54.

## 4. Verify and implement roads

- Add a bounded live verifier for `paved_tile_state` and candidate coordinate joins.
- Capture schema fingerprint, sample rows, counts, bounds, deletes, and normalized payload size.
- If verified, add normalized road features to the spatial projection, canonical scope, snapshot contract, renderer, and layer freshness reporting using test-first changes.
- If no coordinate-bearing join can be verified, retain an explicit unavailable road layer and document the exact missing evidence instead of shipping guessed coordinates.

## 5. Make low zoom a durable whole-world overview

- Add tests for separate overview and detail bundles, full-world overview bounds, zoom routing, detail-first fallback, and last-good retention.
- Persist semantic source hashes in bundle metadata so restarts skip unchanged builds.
- Require complete target-region readiness before an overview build, collect overview regions sequentially, and serialize builds.
- Generate overview zooms `-5..-2`; keep active-region detail at `-1..0` and fall back to overview outside detail coverage.
- Expose coverage and build cadence in the map status endpoint.

## 6. Verify end to end

- Run focused native-map tests after each red/green cycle.
- Run the application build and full test suite.
- Restart the stable smoke server only where backend changes require it.
- Browser-smoke low zoom, claim badges, reduced controls, roads state, resource selection, request counts, console errors, desktop layout, and mobile layout.
- Request a code review, address material findings, rerun verification, and leave the smoke server available for visual review.

