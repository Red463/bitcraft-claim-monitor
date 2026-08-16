# Public Craft Profession Filter Fix

## Problem

The Public Craft Finder retained its selected skill state during the Relay migration, but the old API request was responsible for applying that selection. The migrated page reads all public crafts from provider data and only filters them by region, so changing the selection updates the summary without changing the results.

The public interface also uses the label "Skill" where the product terminology should be "Profession."

## Design

Apply the selected profession directly to the normalized public craft jobs before region filtering and sorting. A job matches when the selection is `All` or its normalized `requiredSkillId` equals the selected numeric identifier.

Update user-visible copy on this page from "Skill" to "Profession," including the summary card, filter label, all-option label, fallback selection label, and no-match guidance. Keep the existing persisted-state key, query parameter, React variable names, and analytics event names unchanged so saved links, preferences, and reporting remain compatible.

## Verification

Add a focused boundary regression test that confirms the profession predicate and visible terminology remain present. Run the Public Craft Finder test, the application build, the full app test suite, and a browser smoke check of the affected page.

## Scope

No backend, Relay projection, database, navigation, or styling changes are required.
