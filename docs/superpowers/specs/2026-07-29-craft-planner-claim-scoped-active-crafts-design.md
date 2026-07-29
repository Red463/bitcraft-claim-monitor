# Craft Planner Claim-Scoped Active Crafts Design

## Goal

Ensure Craft Planner counts ordinary active and ready-to-collect station crafts only when BitJita identifies the craft as belonging to the monitored claim.

## Confirmed Problem

Craft Planner combines the monitored claim's public craft feed with craft feeds for selected players. The player feeds can contain crafts from other claims. The ordinary craft normalizer currently merges those records without validating their `claimEntityId`, allowing foreign station output to reduce the monitored claim's material shortages.

The observed example is Oddfawn's `Ancient Forestry Station` craft. Oddfawn belongs to the monitored claim, but that craft belongs to a different claim and must not count toward the monitored plan.

## Behaviour

- Ordinary station crafts must have a claim identifier that exactly matches the monitored claim ID.
- Matching public and private crafts remain eligible.
- Crafts with a different claim identifier are excluded.
- Crafts without a usable claim identifier are excluded because they cannot prove monitored-claim ownership.
- Existing ordinary-craft deduplication and output calculations remain unchanged after eligibility filtering.
- Passive crafts remain eligible under the existing selected-player rules because BitJita does not report their settlement location.
- Passive crafts retain their existing location-unknown metadata and warning.

## Data Flow

`trackedCraftPlanOutputs` will accept the monitored claim ID at the ordinary-craft normalization boundary. It will normalize supported BitJita claim-ID aliases and filter public and selected-player craft records before merging and calculating outputs.

The Craft Planner server response will pass its current `claimId` into that normalizer. Passive crafts will continue through `trackedPassiveCraftPlanOutputs` without the ordinary station claim filter.

Keeping the check at the normalizer boundary makes the eligibility rule explicit and prevents future ordinary-craft callers from accidentally calculating output before claim validation.

## Failure Handling

- A blank monitored claim ID produces no eligible ordinary station crafts.
- Missing, blank, or malformed craft claim identifiers are treated as unverified and excluded.
- Source request failures continue to use the existing Planner source diagnostics.
- Excluding a foreign or unverified craft is not reported as a source failure because the source request itself succeeded.

## Testing

Focused tests will prove that:

- a matching monitored-claim station craft is counted;
- a foreign-claim station craft is excluded;
- a station craft without a claim identifier is excluded;
- matching public and private craft records still use existing deduplication;
- passive crafts remain counted without claim-location metadata; and
- the Craft Planner server passes the monitored claim ID into ordinary craft normalization.

The application test suite and production build will be run after the focused tests pass.

## Compatibility

No API route, database, configuration, source-selection control, UI layout, or passive-craft behaviour changes. This is a server-side eligibility correction for ordinary Craft Planner station output.
