# Whole-Application Obsidian Ledger Visual System

## Status

Approved design for a single coordinated visual release covering the maintained application in `apps/bitcraft-local`, including the standalone `/bot` console.

This specification records the design decisions approved on 24 August 2026. It is a design document, not an implementation plan. Implementation must not begin until the user has reviewed this written specification.

## Goal

Refresh the entire Claim Monitor so it feels like one premium BitCraft operations product rather than a collection of independently styled dashboards.

The visual direction is **Obsidian Ledger**: a premium BitCraft marketplace and trading-terminal hybrid with near-black structural surfaces, sharp information hierarchy, restrained gold identity, and vivid state colours. The interface remains readable and game-specific through plain language, item imagery, and settlement context rather than becoming a generic finance terminal.

The application must remain dense, practical, and fast to scan. The redesign should make live state, exceptions, comparisons, and the next useful action easier to identify.

## Approved Product Decisions

- Scope covers the whole maintained application, including public pages, member tools, authentication states, the main admin experience, and `/bot`.
- Delivery is one full application release after the complete visual system passes its release gate.
- The visual system uses **contextual modes** rather than applying an identical terminal layout to every screen.
- This is a **visual redesign only**. Existing pages, routes, navigation destinations, permissions, and capabilities remain intact.
- The home dashboard leads with a **settlement command centre** hierarchy.
- Default density is **adaptive balanced**: compact operational data, with more space for forms, onboarding, public pages, and explanation.
- Existing user-selectable density controls remain supported.
- The Bot/Admin console leads with **health and exceptions**.
- Global Market uses the approved **Split Exchange** desktop composition and **drill-in navigation** on mobile.
- Global Market's primary job is: **find an item and compare the best prices across regions**.

## Scope and Compatibility

### In scope

- Shared design tokens and primitive component styling.
- Main application shell, expanded and collapsed desktop navigation, mobile navigation, global actions, account presentation, freshness presentation, and footer.
- Every existing application page and its loading, empty, stale, error, restricted, signed-out, and populated states.
- Desktop, laptop, tablet, and phone composition.
- Global Market, Local Market, map, public tools, main admin, and the full `/bot` console.
- Consistent visual and interaction treatment for tables, filters, forms, cards, dialogs, toolbars, tabs, status notices, and focus states.
- Accessibility and browser visual verification.

### Preserved without redesigning the information architecture

- Current route names and URL behaviour.
- Current sidebar groups and every navigation destination.
- Current Global Market workspaces and their capabilities.
- Current Bot/Admin control sections and permissions.
- Current data contracts, Relay behaviour, API routes, SQLite schema, authentication, Discord delivery semantics, and notification rules.
- Current user settings, including theme/density and collapsed-navigation preferences.

### Out of scope

- Page merges, route removals, or navigation consolidation.
- New application features or new market semantics.
- Backend, database, Relay, polling, authentication, or Discord behaviour changes.
- New UI frameworks, styling systems, charting libraries, or heavy dependencies.
- Replacing BitCraft item imagery or existing game data with decorative generated assets.
- A staged public rollout. Work may be internally sequenced and verified, but the user-facing release is coordinated.

## Relationship to the Global Market Specification

`docs/superpowers/specs/2026-08-23-global-market-workstation-redesign.md` describes prior Global Market product work. This whole-application specification is authoritative where visual direction, responsive composition, and release scope differ.

This specification does not itself authorise additional workspace consolidation, route remapping, storage changes, or market behaviour changes. Existing implemented Global Market behaviour remains intact; the approved Split Exchange is the visual and responsive reference for the current Browse experience.

## Design Foundation

### Colour system

The application uses a restrained semantic palette:

- **Obsidian canvas**: near-black page background with minimal tonal variation.
- **Structural slate**: slightly raised panels, toolbars, inputs, and selected surfaces.
- **BitCraft gold**: product identity, keyboard focus, selection, and primary emphasis.
- **Positive green**: healthy systems, profitable outcomes, available/complete states.
- **Risk red**: failures, destructive actions, blocked work, and negative outcomes.
- **Information blue**: neutral information, route intelligence, and buy-side context where appropriate.
- **Discord violet**: contextual service identity within Bot/Admin only.

Gold is not a generic status colour. Green, red, blue, and violet are used only when they communicate meaning. Important states include icons or labels so colour is never the only signal.

Existing tier colours remain semantically distinct from operational states. Tier styling must not be repurposed for success, warning, or failure.

### Typography

- Use the existing Outfit-based interface typography for readable headings, controls, and body copy.
- Use the existing monospaced face for prices, quantities, IDs, timestamps, freshness, and compact technical labels.
- Reserve uppercase and wide tracking for micro-labels and section metadata, not paragraphs or ordinary navigation.
- Use tabular numerals for aligned market and operational values where supported.
- Ordinary operational copy should remain comfortably readable; compact density must not reduce essential table or form copy to decorative micro-type.

### Geometry and depth

- Controls use compact, slightly squared radii.
- Panels use restrained medium radii.
- Dialogs may use a modestly larger radius but remain operational rather than promotional.
- Borders and separators establish hierarchy more often than nested card shadows.
- Shadows are subtle and primarily distinguish fixed overlays, drawers, dialogs, and raised navigation.
- Decorative gradients and textures remain faint and must not obscure data.

### Spacing and density

Use a small, repeatable spacing scale based around 4, 6, 8, 12, 16, 20, and 24 pixels. Page layouts should use consistent gutters and vertical rhythm.

Adaptive balanced density means:

- Tables, queues, filters, metric strips, and navigation remain compact.
- Forms, onboarding, public utilities, legal/authentication screens, and explanatory empty states receive more space.
- Users selecting a denser mode get reduced row and control spacing without losing labels or focus visibility.
- Mobile controls prioritise touchability even when desktop density is compact.

### Motion

Motion is brief and functional: drawer transitions, dialog entry, loading feedback, and small state changes. Avoid ornamental ambient animation. Respect `prefers-reduced-motion` throughout.

## Contextual Surface Modes

### Operations mode

Used by the dashboard, members, professions, production, inventory, construction, research, activity, and related settlement tools.

- Prioritises current state, exceptions, work queues, and recent activity.
- Uses balanced spacing with compact data rows.
- Gold marks active context; operational state colours carry the decision signal.
- Headings use plain settlement language rather than finance terminology.

### Market mode

Used by Global Market and, in a less intense form, Local Market.

- Uses the densest data treatment and strongest monospaced numeric hierarchy.
- Supports side-by-side comparison, sortable tables, price/depth signals, and item imagery.
- Green highlights favourable asks/profit; red is reserved for negative or risk states; cool blue distinguishes route or buy-side intelligence.
- Market styling must remain understandable to ordinary BitCraft players and not rely on unexplained trading abbreviations.

### Immersive map mode

Used by the dedicated map.

- The map owns the viewport and application chrome recedes.
- Search, layer controls, player/resource intelligence, and selection detail use compact viewport-fixed docks.
- Panels preserve the Obsidian Ledger tokens but use transparency carefully so geography remains visible.
- Map overlays remain bounded to the viewport and do not create page-level scrolling.

### Public and guided-tool mode

Used by Public Craft Finder, Craft Calculator, Sync, authentication, legal, and other guided flows.

- Uses calmer surfaces, clear sequencing, and fewer simultaneous controls.
- Progressive disclosure keeps advanced options out of the initial path.
- Results remain data-rich but the input workflow receives comfortable spacing.

### Bot/Admin mode

Used by the standalone `/bot` console and compatible administrative surfaces.

- Health and exceptions lead; routine configuration follows.
- Discord violet identifies the external service without replacing BitCraft gold throughout the rest of the product.
- Dangerous moderation actions use explicit wording, confirmation, and reserved red styling.
- Secret values remain masked and visually distinct from ordinary editable fields.

## Shared Application Shell

### Desktop navigation

The existing sidebar groups and destinations remain unchanged:

- Overview
- Settlement
- Economy & Region
- Tools
- Admin access where authorised

Expanded navigation includes settlement identity, account state, clear group labels, destination icons, an unambiguous active state, and compact freshness at the bottom.

Collapsed navigation becomes a precise icon rail. Group separation remains visible and every icon exposes a reliable tooltip and accessible name. The collapsed state must not hide restriction status.

### Workspace utility strip

Search, help, settings, and manual refresh occupy one predictable shell-level utility area instead of floating over page content. The current route is always visible.

Data freshness and warning state are persistently available without repeating a large warning card at the top of every page. Page-specific warnings remain accessible and cannot be hidden when they materially affect interpretation.

### Mobile navigation

A compact route bar identifies the application and current destination. It opens a full-height, viewport-contained drawer with the same groups and destinations as desktop.

The drawer supports focus containment, Escape/backdrop close, and focus restoration. Content never sits underneath an open drawer as though it were still interactive.

### Footer

Legal, build, Relay attribution, support, and repository links remain available in a quieter utility footer. The footer must not compete with the page's primary work.

## Page-Family Composition

### Command and analytics

Routes: Dashboard, Leaderboard, Activity.

Composition:

1. Page title and concise purpose.
2. Current status or headline state.
3. Compact decision metrics.
4. Exceptions or rankings.
5. Supporting activity/evidence.

The Dashboard is explicitly a settlement command centre. Urgent blockers and current health lead; general statistics and historical activity are supporting information.

### People and progression

Routes: Members, Professions, Region, Empires.

Desktop uses a searchable/rankable collection with focused detail. Selection preserves list position and filters. Mobile uses list-to-detail navigation with a visible return action.

Profile, skill, membership, and contribution information share consistent labels, progress treatment, metadata alignment, and empty states.

### Work queues and resources

Routes: Craft Monitor, Craft Planning, Inventory, Construction, Research, Local Market.

Composition:

1. Search-led filter toolbar.
2. Dense queue, table, or resource list.
3. Selected detail, blocker, requirements, or next action.

Tables remain semantic tables where the data is tabular. They must not turn into compressed label/value cards whose text overlaps on mobile. Responsive priority hides or moves secondary fields into detail views.

### Guided tools and public flows

Routes: Public Craft Finder, Craft Calculator, Sync, authentication, legal, and related public states.

Use a clear sequence with one primary task at a time. Advanced controls appear progressively. Inputs, help, results, and sign-in prompts share a calmer layout and comfortable control spacing.

### Shared page anatomy

Every conventional page uses a predictable anatomy:

- One page header containing title, purpose, relevant freshness, and primary action.
- One filter toolbar led by search when search exists.
- One main workspace surface with separators before introducing nested cards.
- Consistent loading, empty, stale, error, and restricted treatments.
- A clear next valid action in empty states.

## Global Market Reference Design

### Core task

Find an item or cargo entry and compare the best available prices across observed regions.

### Desktop Split Exchange

The Browse workspace uses two persistent panes:

- **Catalogue pane**: search, compact filters, result count, item imagery, availability, observed regions, order count, and lowest relevant price.
- **Selected item pane**: item identity, best ask, best bid, spread, route signal, and a regional order book aligned for direct comparison.

Selecting an item preserves search context and catalogue position. The selected row, focus state, and keyboard navigation are visually distinct.

Regional comparison aligns region, price, quantity, order depth, and freshness. A region snapshot may support the table, but it must not duplicate the same values in decorative cards.

### Market workspaces

Overview, Browse, Opportunities, Saved, and Stalls remain available with their current implemented capabilities. They share the same page header, workspace navigation, filter language, state presentation, and responsive rules.

This visual release does not create additional workspace merges or route aliases. Existing behaviour from prior work remains compatible.

### Stale data

Stale or incomplete market data remains prominent because it changes decision quality. Present it as a compact status with access to details rather than a repeated warning block consuming most of the initial viewport.

Freshness is displayed at the level where it matters: global catalogue, selected item, region, or individual observation.

### Mobile drill-in

Catalogue results and selected item detail are separate compositions. A visible `Back to results` action restores the prior search and scroll context.

Mobile workspace navigation uses a deliberate overflow affordance. It must not depend on clipped labels, gradient overlays, or an unexplained horizontal strip.

Result rows and regional cards reserve explicit columns/areas for labels and values so text never overlaps. Price, region, availability, and freshness remain scannable at 390-pixel width.

## Bot/Admin Console

### Persistent hierarchy

The console shows:

1. Service identity and account actions.
2. Persistent health summary: gateway, delivery queue, failures, and latency or the closest existing health signals.
3. Exceptions requiring action.
4. Existing section navigation.
5. The selected configuration or diagnostic workspace.

No new top-level Bot navigation destination is required. The existing selected section remains active below the persistent health and exception hierarchy.

### Existing sections retained

- Setup
- Channels
- Notifications
- YouTube Monitor
- Role Manager
- Craft Watch
- Colour Roles
- Role Panels
- Posts & Events
- Commands
- Community Tools
- Moderation
- Safety Rules
- Member Records
- Command Tests
- Delivery Diagnostics

### Exception design

Each exception states:

- What failed or is misconfigured.
- The user-facing consequence.
- When it last occurred or was observed.
- The relevant resolution action.

Resolution actions open the existing appropriate section or diagnostic context. Routine healthy status remains compact.

### Forms and dangerous actions

- Configuration forms use consistent sections, labels, help text, validation, and save placement.
- Long forms use clear subheadings and avoid nested decorative cards.
- Destructive moderation actions are visually separated, use explicit action names, and retain confirmation safeguards.
- Pending, saved, failed, and partially configured states are clearly differentiated.

### Mobile Bot/Admin

The desktop sidebar becomes an accessible section picker that exposes the full grouped section list. Health and the current section remain visible. Forms use one column, and save actions remain reachable without covering content.

## Responsive System

Breakpoints should follow composition pressure rather than arbitrary device names. The required behaviours are:

- Wide desktop: full sidebar and multi-pane workspaces.
- Standard laptop: preserve primary panes while reducing secondary supporting panels.
- Tablet: collapse navigation, simplify metric grids, and move secondary detail into explicit views where necessary.
- Phone: single-column workflows, drill-in detail, deliberate overflow menus, and touch-sized controls.

Required visual QA viewports include at least:

- 1440 × 900
- 1024 × 768
- 768 × 1024
- 390 × 844

Responsive layouts must avoid:

- Horizontal page overflow.
- Clipped or overlaid workspace tabs.
- Labels colliding with values.
- Fixed actions obscuring content.
- Dialogs extending beyond the viewport.
- Tables losing the identity of a row or value.

## Accessibility Standard

- Meet WCAG AA contrast for essential text, controls, focus, and state indicators.
- Provide strong `:focus-visible` treatment consistent with the gold focus system.
- Preserve semantic headings, tables, labels, tab/panel relationships, dialogs, and live status regions.
- Do not use colour alone to communicate status, selection, risk, or profitability.
- Primary mobile controls target at least 42 pixels.
- Support keyboard navigation through shell navigation, tabs, catalogue selection, tables/actions, dialogs, and Bot section navigation.
- Fixed overlays contain focus, close with Escape when appropriate, and restore focus.
- Respect reduced-motion preferences.
- Loading skeletons and refresh indicators retain accessible status copy.

## State Design

Every major surface must define and visually verify:

- Initial loading.
- Incremental refresh.
- Populated data.
- Empty result after filters.
- Empty source data.
- Partial/stale data with last-good values.
- Fatal error with recovery action.
- Restricted permission.
- Signed-out state.
- Pending mutation.
- Successful mutation.
- Failed mutation.

Empty states explain why no content appears and provide the next valid action. They do not use oversized marketing illustrations.

## Implementation Boundaries

The eventual implementation should prefer:

1. Extending the existing shared CSS variables and foundational classes.
2. Updating shared shell and primitive styles.
3. Applying small contextual mode classes at page or route boundaries.
4. Updating focused page stylesheets and components only where composition requires it.

Do not introduce a new styling framework. Avoid appending all feature CSS to `styles.css`; use focused files under `apps/bitcraft-local/src/styles/` where appropriate.

Visual refactoring must preserve React hook order, route boundaries, permission checks, data mapping, and provider-neutral API usage.

## Single-Release Delivery Model

The public result ships as one coordinated full-application release. Internally, work should be sequenced into independently verifiable workstreams:

1. Foundation tokens and shared primitives.
2. Main shell and responsive navigation.
3. Shared page-family patterns and state components.
4. Settlement operations and public/tool pages.
5. Global Market and Local Market visual application.
6. Immersive map chrome.
7. Main admin and standalone Bot/Admin console.
8. Whole-application responsive, accessibility, and regression verification.

Intermediate work must not be deployed as the finished redesign. The release occurs after all scoped destinations meet the release gate.

## Verification and Release Gate

### Automated verification

- Run `corepack pnpm --filter @workspace/bitcraft-local run build` throughout implementation.
- Run `corepack pnpm --filter @workspace/bitcraft-local test` before release because the work spans frontend logic boundaries and high-risk administrative surfaces even when backend behaviour is unchanged.
- Add focused UI/boundary tests where responsive behaviour, modal containment, route state, or accessibility logic changes.

### Visual browser verification

Visual browser inspection is mandatory. Use representative data and inspect every destination in the main application and `/bot` at the required viewport sizes.

The release checklist must explicitly verify:

- No blank pages or console errors.
- No horizontal overflow, clipped navigation, overlapping labels, or obscured controls.
- Main shell expanded, collapsed, mobile-open, restricted, signed-out, and authenticated states.
- Loading, empty, stale, warning, error, and populated states.
- Keyboard focus order and visibility.
- Viewport-contained dialogs and mobile drawers.
- Global Market catalogue selection, regional comparison, workspace navigation, and mobile back-to-results flow.
- Local Market tables and responsive layout.
- Map dock containment and map interaction visibility.
- Bot health, exceptions, every section, long forms, sensitive inputs, destructive controls, tests, diagnostics, and mobile navigation.

Use the stable local smoke server when appropriate, then inspect the deployed live site after release with real data. Production visual inspection is part of completion, not an optional follow-up.

### Release completion

After verification passes:

- Update the beta version according to `VERSIONING.md`.
- Move user-facing changes into a dated `CHANGELOG.md` release section.
- Commit the complete release, push it, deploy once, and inspect production.
- Keep the previous deployed build available as the rollback point.

## Success Criteria

The redesign succeeds when:

- The whole application and Bot/Admin console visibly belong to one product.
- Each surface feels appropriate to its task rather than uniformly terminal-like.
- The Dashboard immediately communicates settlement health and required action.
- Global Market makes item discovery and regional price comparison the clearest task.
- Bot/Admin makes failures and misconfiguration visible before routine settings.
- Users can scan more useful information without cramped, overlapping, or low-contrast layouts.
- Mobile users can complete the same core workflows through deliberate drill-in layouts.
- Every existing route and capability remains available.
- The final production deployment passes live visual inspection with real data.
