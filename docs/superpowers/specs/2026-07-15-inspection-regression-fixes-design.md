# Inspection Regression Fixes — Design

Date: 2026-07-15

Status: approved design, pending implementation

## Scope

Fix four regressions found during visual inspection of the UI/UX remediation candidate:

1. Guided-tour targets remain blurred inside the spotlight.
2. Short Leaderboard tabs stretch their grid tracks and create oversized vertical gaps and summary cards.
3. Members displays inaccurate permission-summary pills: “Can manage settlement” and “Standard member”.
4. The custom-theme editor cannot scroll far enough to expose its final controls.

The work must remain focused on these surfaces. It must not redesign the shared app shell, all panels, or every dialog.

## Design

### Guided tour

During active guided steps, retain the existing dimmed page and gold spotlight border but disable backdrop blur on the tour overlay. Content inside the spotlight must remain crisp enough to identify. The initial welcome prompt may retain its own blur because it does not claim to highlight a page target.

The existing target geometry, card placement, keyboard behaviour, and reduced-motion treatment remain unchanged.

### Leaderboard

Set the Leaderboard page grid to align its implicit rows at the start of the container. This prevents CSS Grid’s default stretch behaviour from distributing spare viewport height across short tab content.

All tabs retain the existing 20px page rhythm and 112px minimum summary-card height. Responsive column changes at 1250px and 560px remain unchanged.

### Members permissions

Remove the derived text pill from the Permissions column entirely. Preserve the existing hammer and storage icons because they reflect the underlying build and inventory permission fields directly. Do not replace the removed pill with another inferred role label.

### User Settings theme editor

Keep the current viewport-fixed dialog, header, tabs, presets, editor fields, preview, and save actions. Make the settings shell an explicit two-row grid:

- tabs: intrinsic height;
- settings content: `minmax(0, 1fr)`.

The settings content becomes the single vertical scroll owner with `min-height: 0`, no competing viewport-derived maximum height, stable scrollbar space, and sufficient bottom padding. The dialog itself remains viewport bounded and the page underneath remains locked while modal.

## Accessibility and interaction

- Tour targets remain visually identifiable without weakening the dimmed-background cue.
- Existing focus management, Escape handling, and tour navigation remain unchanged.
- Removing member pills removes misleading information without removing direct permission indicators.
- Every custom-theme field and final action remains keyboard reachable by scrolling the settings content region.

## Verification

Each production change must be preceded by a focused failing boundary test:

- tour overlay explicitly disables blur while the prompt may retain it;
- Leaderboard page uses start-aligned grid content;
- Members no longer renders either removed permission label;
- settings shell declares bounded rows and the content region owns scrolling without a viewport-derived `max-height`.

After the focused tests pass:

1. Run the complete frontend test suite.
2. Run the production build.
3. Restart or refresh the smoke build and confirm served/local asset identity.
4. Visually verify the tour, every Leaderboard tab, Members, and the expanded custom-theme editor at the reported desktop dimensions and at a narrow viewport.

## Out of scope

- Rewording or redesigning other member roles.
- Changing the global `.panel` alignment contract.
- Changing the shared dialog primitive for unrelated dialogs.
- Redesigning the tour sequence or theme editor.
- Release, version, changelog, push, or deployment work.
