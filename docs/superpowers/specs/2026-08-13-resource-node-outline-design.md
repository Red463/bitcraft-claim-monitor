# Resource Node Outline Design

## Goal

Make dense resource nodes easier to distinguish against terrain and from neighbouring nodes when the native map is zoomed out.

## Design

- Preserve each resource node's existing tier-based and stable variant fill colour.
- Draw a subtle near-black `1.25px` outline around every resource node.
- Preserve the current resource node radius, canvas renderer, viewport culling, level-of-detail behavior, and layer ordering.
- Apply the outline only to the resource canvas. Enemy and player presentation remains unchanged.

The outline is passed as an optional presentation setting to the existing dense canvas layer. This keeps the renderer reusable while making the resource-specific choice explicit at its construction site.

## Verification

- A focused renderer boundary test proves the resource layer enables the dark outline while the enemy layer does not.
- The production build verifies the React and TypeScript integration.
- The smoke map is refreshed and checked at a zoomed-out view with multiple resource nodes visible.

