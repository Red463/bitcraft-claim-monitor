# Craft Plan Audit and Header Spacing Design

## Goal

Make every active application page header consistently spaced and responsive, and add a focused Audit tab to Manage Craft Plan that records who enabled or disabled the plan's operational toggles.

## Scope

### Header spacing

Review and cover all active primary page-header patterns:

- The shared `members-topbar` pattern used by Activity, Construction, Craft Calculator, Inventory, Map, Leaderboard, Market, Production, Public Craft Finder, Sync, Research, Region, Members, and Admin.
- The Dashboard `dashboard-topbar` pattern.
- The Skills `skills-topbar` pattern.
- The Craft Planning `craft-plan-page-header` pattern.
- The Empires `page-title-row` pattern.
- The bot/admin composite header built from `section-header` and `split-header`.

Internal section headers that happen to use `split-header` are not primary page headers and will not be globally restyled.

### Craft Plan audit

Record saved changes to:

- Public board visibility.
- Settlement storage sources.
- Player inventory sources.
- Player craft sources.
- Player deployable sources.

Target, route, row-display, and safety-buffer edits are summarized as other plan settings being updated rather than receiving itemized diffs.

## Header Findings

The application has a sound title-left, actions-right hierarchy, but shared header behavior is owned by page-specific CSS:

- `members-topbar` is defined in `styles/members.css` although fourteen other surfaces consume it.
- `dashboard-top-meta` is defined in `styles/dashboard.css` although most primary pages consume it.
- Craft Planning renders a button and two bare metadata spans. Their readability depends entirely on the globally imported Dashboard stylesheet, which is the visible failure in the supplied screenshot.
- Primary-header gaps currently mix 18px, 20px, and 22px values rather than the documented 4/8/12/16/24px spacing scale.
- The Impeccable mechanical detector reported no layout-rule violations, so the defect is an ownership and consistency issue that requires structural review rather than a detector-only fix.

## Header Design

### Shared ownership

Move the generic primary-header and metadata-row spacing contract into `src/styles.css`, the always-loaded global UI layer. Keep the established class names to avoid a broad JSX rename:

- `members-topbar` remains the common primary-header container for the pages already using it.
- `dashboard-top-meta` remains the common action/metadata row.
- Dashboard, Skills, Craft Planning, and Empires retain their existing page-specific container names where their topology or typography is intentionally different.

Remove duplicate generic ownership from `members.css` and `dashboard.css`; leave page-specific alignment and component styling in the nearest page stylesheet.

### Spacing contract

- Primary page-header columns use a 16px gap.
- Title-to-subtitle spacing uses 8px.
- Metadata/action siblings use a 12px column gap and an 8px row gap.
- Metadata rows use `display: flex`, `align-items: center`, and `flex-wrap: wrap` so controls and text never concatenate or overlap.
- Wide headers keep title content on the left and actions/metadata on the right.
- At the existing narrow breakpoint, primary headers become one column and metadata aligns to the left.

Only primary-header selectors receive these values. The global `.split-header` utility remains unchanged because it is used by many internal cards and panels.

### Intentional exceptions

- Empires keeps its `page-title-row` and `page-title-actions` structure but adopts the same 16px outer gap and responsive wrapping principles.
- The bot/admin composite keeps `section-header` nested inside `split-header`; it already has a 16px semantic gap and will only be verified, not structurally rewritten.
- Page-specific pills, claim links, filters, and toolbars keep their existing appearance and interaction behavior.

## Audit Architecture

Reuse the existing `admin_audit_log` table. No database migration or new persistence layer is required.

Add a focused, exported Craft Plan diff helper in the existing server Craft Planning module. It accepts the previous normalized config, the next normalized config, and available source-label maps, then returns ordered change records with this shape:

```js
{
  category: "public_board" | "storage" | "player_inventory" | "player_crafts" | "deployable",
  entityId: string,
  label: string,
  enabled: boolean,
}
```

The helper compares set membership rather than array order. Reordering identical IDs creates no audit change. Human labels are used when the source is discoverable; otherwise the stored identifier is shown so a historical change is never dropped.

`otherSettingsChanged` compares the normalized `name`, `targets`, `routeOverrides`, `sectionOverrides`, `rowNameOverrides`, and `multipliers` fields. Server-maintained `buildingProgress` is excluded so automatic reconciliation does not create a misleading administrator-change summary.

Each successful `PUT /api/local/admin/craft-plan` operation:

1. Reads the previous normalized config.
2. Normalizes and reconciles the submitted config.
3. Saves the new config.
4. Computes the focused toggle changes.
5. Writes one `craft_plan.update` audit row containing `changes`, existing summary counts, and an `otherSettingsChanged` boolean.
6. Returns the normal Craft Plan admin response.

Failed or rejected saves do not create audit entries.

## Audit Endpoint and Permissions

Add `GET /api/local/admin/craft-plan/audit?limit=100`.

- Permission: `audit.view`.
- Limit: clamped to 1-100.
- Query: only `craft_plan.update` entries, newest first.
- Response: parsed, presentation-safe rows containing identifier, username, timestamp, changes, summary counts, and `otherSettingsChanged`.
- Malformed legacy `details_json` is handled as an empty object rather than failing the whole response.

The existing broad Admin Audit page remains unchanged.

## Manage Plan Audit Tab

Add an Audit tab to the existing viewport-fixed Manage Craft Plan dialog.

- Load audit data only when the tab is first opened.
- Show a compact reverse-chronological timeline.
- Each entry shows administrator, timestamp, and readable change lines such as `Player crafts - Alice - Enabled`.
- Enabled and disabled states include both text and an icon/tone; colour is not the only signal.
- An entry with non-toggle edits also shows `Other plan settings updated`.
- Legacy rows without structured changes render as `Plan updated` with the available summary counts.
- The tab has explicit loading, empty, permission-error, and retry states.
- Audit loading is independent of plan editing, so an audit request failure does not prevent targets or sources from being managed.

The tab uses the existing modal tabs, body scrolling, typography, colour tokens, and control vocabulary. No new framework or dependency is introduced.

## Error Handling

- Audit diffing is deterministic and cannot block a successful save; unexpected label lookup gaps fall back to identifiers.
- Database insert failures follow the existing server error path rather than falsely reporting an audited save.
- The audit endpoint never exposes secrets or complete configuration payloads.
- The UI reports audit-specific failures inside the Audit tab and preserves the rest of the manager state.
- Rapid tab switching does not duplicate concurrent audit requests.

## Accessibility and Responsive Behavior

- Primary-header metadata wraps before collision and stays in document order.
- Header actions and metadata remain keyboard reachable with existing focus styling.
- Audit tabs use the existing button semantics and visible active state.
- Audit state icons have adjacent textual labels.
- The modal remains viewport-fixed and internally scrollable.
- At narrow widths, audit entries stack administrator/time metadata above their change list without horizontal overflow.

## Testing and Verification

Follow test-driven development.

### Automated tests

- Add focused unit tests for additions, removals, public-board changes, unchanged/reordered arrays, label fallback, and `otherSettingsChanged` detection.
- Add server permission and route tests for the Craft Plan audit endpoint, including limit clamping and malformed legacy details.
- Extend Craft Planning boundary tests for the Audit tab, lazy request, loading/empty/error states, and readable enabled/disabled labels.
- Extend CSS boundary tests to assert the shared metadata row has flex layout, wrapping, 12px column spacing, and 8px row spacing.
- Add or extend a header ownership boundary test that inventories every active primary-header pattern and ensures common metadata spacing is owned by `styles.css`, not a page-specific stylesheet.

### Build and test commands

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

### Browser verification

Build and use the stable smoke server at `http://127.0.0.1:18449/`.

- Check every active primary page at desktop width for title, subtitle, action, and metadata separation.
- Check representative wide and narrow states for the shared `members-topbar`, Dashboard, Skills, Craft Planning, Empires, and bot/admin composite patterns.
- Open Manage Plan, verify the Audit tab states, and confirm long usernames/source labels wrap without horizontal overflow.
- Re-run the Impeccable layout detector after the CSS changes and resolve every new finding.

## Non-goals

- No broad page redesign.
- No global rewrite of internal `split-header` components.
- No audit of target-by-target, route-by-route, row-display, or buffer value changes.
- No schema migration, new state library, styling framework, or dependency.
- No changelog or version bump during ordinary local implementation.
