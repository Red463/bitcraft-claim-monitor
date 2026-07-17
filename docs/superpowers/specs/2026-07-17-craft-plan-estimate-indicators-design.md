# Craft Planner Estimate Indicators

## Goal

Separate the two meanings currently represented by the Craft Planner's single grey estimate marker so users can distinguish an approximate requirement from estimated active output that is excluded from progress.

## Scope

This is a focused presentation and accessibility change to the Craft Planner Needs Board. It does not change recipe selection, expected-yield calculations, required quantities, stock accounting, or progress calculations.

## Cell indicators

- Render Lucide's `EqualApproximately` icon when any item in a cell has `estimatedRequirement === true`.
- Give the icon the accessible label `Approximate requirement`.
- Render a muted grey Lucide `Factory` icon when `estimatedInProgress > 0`.
- Give that icon the accessible label `Estimated active output; not counted toward progress`.
- Continue rendering the existing blue `Factory` indicator for `guaranteedInProgress > 0`, labelled `Actively being crafted`.
- When more than one state applies, show every applicable icon without overlap.

## Tooltip wording

The cell's native tooltip will keep the relevant quantity details while using distinct language:

- Estimated active output: `<quantity> estimated active output (not counted toward progress)`.
- Approximate requirement: `requirement estimated from expected processing yield`.

The approximate-requirement message must not say that the requirement is excluded from progress because the estimated yield is used to calculate the displayed requirement.

## Legend

Replace the combined `Estimated; not counted` entry with two entries:

- `Approximate requirement`, using `EqualApproximately`.
- `Estimated active output; not counted`, using a muted grey `Factory`.

Keep the existing blue `Guaranteed craft counted` legend entry and the other status entries unchanged. Icon-based legend entries will use the same icons and colour treatment as the cells.

## Styling

- Use the existing compact Needs Board visual language and spacing.
- Keep both estimate indicators muted so they do not compete with shortages, confirmed supply, or blocked states.
- Place cell indicators in a small non-overlapping indicator row within the cell's existing top padding.
- Preserve the current responsive table dimensions and hit target.

## Tests and verification

- Add focused boundary coverage proving that both distinct legend labels and Lucide icons are rendered.
- Add coverage that the obsolete combined `Estimated; not counted` label and text tilde marker are removed.
- Verify TypeScript and the production build.
- Run the full application test suite because shared Craft Planner rendering is changing.

## Acceptance criteria

- A Lake Fish requirement calculated from expected Fish Oil yield displays `EqualApproximately` and is described as an approximate requirement.
- Estimated active output displays a grey `Factory` and is explicitly described as not counted toward progress.
- Guaranteed active output remains visually distinct with the existing blue `Factory` treatment.
- Cells with multiple applicable states display all indicators without overlap.
- Calculation results are unchanged.
