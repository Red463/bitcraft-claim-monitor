# Mixed Planner Routes Design

## Goal

Show every valid acquisition route when an item can be obtained through both gathering and crafting or processing. For Sturdy Pebbles, this means keeping the Ancient Rubble routes and exposing the Stone Chunk processing route.

## Behaviour

- Keep gathering routes first so the existing default remains stable when no override is saved.
- Keep crafting and processing routes in the same alternatives list instead of discarding them whenever gathering exists.
- Continue allowing the saved route override to select either route type.
- Apply the rule to every mixed-source item, not only Sturdy Pebbles.

## Scope

Change only the shared planner route ordering/filtering logic and its focused tests. Do not change catalogue ingestion, probability calculations, route identifiers, or UI layout.

## Verification

- Add a regression fixture with gathering producers and a crafting producer for the same output.
- Assert all route types remain visible, gathering remains the default, and a crafting override selects the processing route and its input.
- Run the focused planner tests, production build, and full app test suite.
