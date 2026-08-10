# Craft Monitor Contributor Copy Design

## Goal

Show end users who contributed and how much without exposing internal attribution terminology.

## Presentation

Each Craft Monitor contributor row displays only:

- contributor name;
- total progress contributed;
- total XP contributed.

Labels such as `Matched action` and `Craft owner` are not rendered on Craft Monitor. Attribution confidence remains in the data model for internal accuracy, diagnostics, and persistence; this change does not alter contribution collection or attribution behavior.

## Scope

Update the existing contributor rendering in `apps/bitcraft-local/src/pages/ProductionPage.tsx`. Do not change backend schemas, API payloads, contribution calculations, or other pages.

## Verification

Update the focused Production page boundary test to reject end-user rendering of technical attribution labels. Run that test and the production frontend build, then browser-check the Craft Monitor contributor row.
