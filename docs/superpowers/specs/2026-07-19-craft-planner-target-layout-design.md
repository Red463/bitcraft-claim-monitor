# Craft Planner Target Layout

## Context

The Craft Planning Targets section currently permits 300px-wide outer grid cells, while each target's three-column content requires approximately 552px before content-driven expansion. At desktop widths this causes target names, progress details, and status values to overflow into neighbouring targets.

The section also occupies substantial vertical space even when users primarily need the summary metrics and Needs Board.

## User experience

Targets render as responsive two-column rows when the available content width can safely support both rows. The layout collapses to one column when it cannot. Target content must remain contained within its assigned grid cell without overlapping adjacent targets or creating page-level horizontal overflow.

The Targets section header becomes a semantic disclosure control. It starts collapsed for users who have not chosen a preference. Expanding or collapsing the section remembers that choice through the app's existing persisted-state mechanism. The summary metric band remains visible while the section is collapsed, so active target and missing-quantity totals remain available without opening the detailed list.

The disclosure control includes a chevron that communicates state without relying on colour. Activating the heading by mouse, touch, Enter, or Space toggles the target list.

## Components and boundaries

Keep the change within the existing `CraftPlanningPage` and its owned `craft-planning.css` stylesheet.

- `CraftPlanningPage` owns one persisted boolean under `planning.targetsCollapsed`, defaulting to `true`.
- The existing Targets heading becomes a button with `aria-expanded` and `aria-controls` connected to the target-list region.
- The target-list region remains mounted and uses the native `hidden` state while collapsed, keeping the disclosure relationship valid without occupying layout space.
- Existing target item, progress, and status markup remains unchanged.
- The outer target grid owns safe column sizing; the target row continues to own its internal item, progress, and status columns.

No new component, dependency, animation, or state library is introduced.

## Layout behavior

Use a safe target-grid minimum derived from the target row's actual minimum tracks rather than the previous 300px card width. At wide content widths, the list displays two equal columns. When two safe columns no longer fit, CSS automatically falls back to one column.

The one-column fallback is based on available container width rather than only the existing 760px viewport breakpoint, because the persistent sidebar reduces the planner's usable width independently of the viewport.

The existing dense operational spacing, typography, status colours, and progress presentation remain unchanged. This is a containment and disclosure repair, not a visual redesign.

## Persistence and accessibility

- First-time/default state: collapsed.
- Subsequent state: the user's latest expanded or collapsed choice is restored.
- Persistence uses the existing `usePersistedState` browser/account settings pathway and the `planning.targetsCollapsed` key.
- The toggle is a native button with a descriptive accessible name.
- `aria-expanded` reflects the current state.
- `aria-controls` always references the mounted target-list region.
- Focus styling follows the existing section/button vocabulary.
- The chevron may rotate through the existing short transition conventions, with the global reduced-motion behavior respected.

## Error and edge states

- Zero-target and unavailable-plan states retain their current behavior; the disclosure appears only with an active plan containing targets.
- Long target names may wrap within their label column but must not expand or paint into adjacent grid cells.
- A single remaining target fills the available row without changing its internal information hierarchy.
- Persisted values that are absent or invalid resolve to the collapsed default.

## Testing and verification

- Add a focused CSS boundary test that fails against the current incompatible 300px outer grid and asserts a safe responsive minimum with a one-column fallback.
- Add a page boundary test for the persisted collapsed state, native disclosure button, `aria-expanded`, `aria-controls`, and the target list's native `hidden` state.
- Run the focused Craft Planning boundary tests before and after implementation.
- Run the production build.
- Browser-check expanded and collapsed states at the reported desktop width and at a narrower width, confirming no overlap or horizontal page overflow.

## Non-goals

- Do not redesign target contents or change target calculations.
- Do not change summary metrics or Needs Board behavior.
- Do not add drag-and-drop, target sorting, or per-target disclosure controls.
- Do not modify backend planning data or persistence schemas.
