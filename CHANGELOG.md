# Changelog

## 2026-05-26

### Added

- Tier badges across settlement views using the in-game tier colour palette, with translucent presentation in badges and the Skills heatmap.
- Production sorting by tier, XP, remaining effort, completion, and item name, with ascending and descending options.
- Member-based Production eligibility filtering from the Production page.
- Member profile sections for public Toolbelt profession tools and equipped gear.
- Tool power display for public Toolbelt tools and eligible Production jobs.
- Browser persistence for key filter and sort selections across refreshes.

### Changed

- Production eligibility now checks the selected member's public skill level and matching Toolbelt tool type.
- Tool tier is shown for context but does not block a craft; tool power determines effort contributed per action.
- Public Crafts defaults to all skills while retaining the monitored settlement region as the initial region filter.
- The Production member selector now lives on the Production page instead of the sidebar.
- Supply runway on Overview now uses the API run-out timestamp and displays days and hours.
- Overview treasury information now presents the treasury balance and supply upkeep without treating supply upkeep as currency expenditure.

### Fixed

- Profession tools were incorrectly read from equipped hand slots; they are now sourced from the public Toolbelt inventory returned by the BitJita API.
