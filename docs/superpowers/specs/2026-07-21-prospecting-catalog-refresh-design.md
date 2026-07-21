# Prospecting-Safe Catalogue Refresh Design

## Goal

Allow the catalogue refresh to ingest recipes that contain several probability components for the same item or cargo, while preventing prospecting resources from being treated as ordinary finite-health nodes.

## Catalogue model

Every output entry supplied by BitJita is a recipe-output component. Components retain their original order, quantity, occurrence rate, item/cargo identity, and yield basis in a new additive table. The existing `game_catalog_recipe_outputs` table remains the aggregate compatibility view with one row per recipe and output identity.

For repeated components, expected quantity is the sum of `quantity x occurrence rate`. The aggregate compatibility row stores that expected quantity with occurrence rate `1`. Its guaranteed quantity is recorded separately as the sum of quantities from components whose occurrence rate is exactly `1`; values above `1` remain rates and do not imply a guaranteed minimum. This makes Argent-style rates `1, 0.5, 0.25, 0.125, 0.0625` scan successfully, retain all five source rows, and expose an expected yield of `1.9375`.

## Prospecting classification

Prospecting is a gathering mode, not a special case for Argent. A gathering recipe is classified as prospecting when the source explicitly names prospecting or when it has no positive resource ID and has a positive prospecting cargo ID. The normalized mode is stored with the recipe so every downstream consumer uses the same decision.

An ordinary gathering route may use resource maximum health to calculate full-resource yield and resource equivalents. A prospecting route may only expose expected yield per extraction progress. Its displayed health is not a depletion budget, so full-resource yield, completion yield, and full-resource equivalents are unavailable. The probability status explains that prospecting exhaustion is unknown.

## Workbook and diagnostics

The workbook includes the gathering mode and raw recipe-output components. Prospecting rows leave full-resource columns blank and explain why. The catalogue refresh error includes the current target and recipe context when a database write fails, making future malformed catalogue records identifiable without reconstructing the cursor.

## Compatibility and rollout

Schema changes are additive. Existing rows default to ordinary gathering and are corrected by the forced normalization-version refresh. Existing route identifiers and item/cargo keys remain unchanged. A failed refresh retains the last validated probability snapshot and its resumable detail queue; successfully processed detail rows remain available for the next retry.

## Verification

Regression coverage must prove the original unique-key failure, component preservation, aggregate expected and guaranteed output, general prospecting classification, ordinary-resource calculations, workbook output, additive migration, and contextual refresh errors. The full application build and test suite are required.
