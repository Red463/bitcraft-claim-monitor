# Craft Plan Item Loading Design

## Goal

Improve the Craft Planning item-detail modal so its loading state feels intentional and its close control matches the surrounding dashboard UI.

## Scope

- Update only the Craft Planning item-detail modal.
- Keep existing stock, route, and usage information visible while current item details load.
- Preserve the existing data flow and loading/error behavior.

## Loading Status

Replace the loose loading sentence beneath the modal header with a compact, full-width status strip.

The strip contains:

- A small `LoaderCircle` inside a restrained icon well.
- The title `Updating item details`.
- The supporting text `Showing saved planner data while current routes load.`

The strip remains a live status region for assistive technology. It does not cover or replace the useful planner data already rendered below it.

## Close Control

Apply a modal-specific close-button style rather than relying on an admin-area `icon-button` definition. The control uses:

- A 34px square hit area on precise pointers, while the existing coarse-pointer rule retains a 44px minimum target.
- A dark transparent background and subtle border.
- A muted close icon that becomes brighter on hover.
- The existing global focus-visible outline for keyboard users.
- No solid grey browser-default button appearance.

## Motion and Responsive Behavior

- Keep the existing spinner animation during loading.
- Respect the existing reduced-motion rule, which disables animations.
- Allow the status copy to wrap cleanly at narrow modal widths.
- Keep the status strip and close button within the modal's current viewport-bounded layout.

## Files

- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- `apps/bitcraft-local/src/styles/craft-planning.css`

## Verification

- Run `corepack pnpm --filter @workspace/bitcraft-local run build`.
- Browser-smoke the Craft Planning item-detail modal at desktop and narrow widths.
- Confirm the loading region remains announced with `role="status"` and the close button retains its accessible label.
