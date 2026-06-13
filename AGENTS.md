# AGENTS.md

## Project Overview

BitCraft Claim Monitor is a local-first settlement operations dashboard for BitCraft. It uses the public BitJita API, records local SQLite history, and includes a Discord bot/admin dashboard.

The maintained application is:

```txt
apps/bitcraft-local
```

Historical Replit-exported or legacy code should not be recreated or edited unless the user explicitly asks to inspect or restore old export code.

## Primary Goal for Agents

Maximise useful output while minimising unnecessary exploration, broad refactors, unrelated edits, and over-testing.

Prefer the smallest safe change that solves the user's request.

## Working Style

* Make focused, task-specific changes.
* Avoid broad refactors unless the user explicitly asks for a refactor.
* Do not "clean up" unrelated code while completing a feature or fix.
* Do not reformat unrelated files.
* Do not introduce new frameworks, state libraries, styling systems, build tools, or heavy dependencies unless the user explicitly asks or the tradeoff is explained first.
* If nearby code is messy, improve only the section directly touched by the task.
* Prefer editing existing files for small fixes.
* Split code into focused modules only when the current task genuinely benefits from it.
* Do not move large blocks of code just to make the structure nicer unless requested.
* Preserve existing behaviour unless the requested change requires behaviour to change.
* When unsure between a small patch and a large redesign, choose the small patch.

## Repository Focus

Work from the repository root unless stated otherwise.

Primary app:

```txt
apps/bitcraft-local
```

Important active files and folders:

```txt
apps/bitcraft-local/src/main.tsx
apps/bitcraft-local/src/components/
apps/bitcraft-local/src/components/bot/
apps/bitcraft-local/src/styles.css
apps/bitcraft-local/src/styles/
apps/bitcraft-local/server.mjs
apps/bitcraft-local/data/
scripts/
```

Avoid spending time in unrelated workspace areas unless the task clearly requires it.

## Tech Stack

* Package manager: `pnpm` via Corepack.
* Use the pinned workspace package manager version.
* Runtime target: Node.js 24+.
* Frontend: React + TypeScript + Vite.
* Styling: plain CSS.
* Backend: Node HTTP server.
* Database: Node built-in SQLite via `node:sqlite`.
* Development database path:

```txt
apps/bitcraft-local/data/bitcraft-local.sqlite
```

* Production database path:

```txt
/var/lib/bitcraft-claim-monitor
```

## Useful Commands

Use these from the repository root unless stated otherwise.

Install dependencies:

```sh
corepack pnpm install
```

Run development app:

```sh
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Build the app:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Run tests:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

The local dev command normally starts:

```txt
frontend:  http://localhost:18428
local API: http://127.0.0.1:18430
```

Only inspect running processes, logs, or alternative ports when the user mentions a non-default port, says the server is already running, or reports a local loading issue.

## Efficient Investigation Rules

Before editing:

1. Identify the smallest set of likely files.
2. Inspect only those files first.
3. Use search when the target is unclear.
4. Avoid repo-wide exploration unless necessary.
5. Do not read large files end-to-end if a targeted search or small range is enough.
6. Do not open generated files, logs, build output, or database files unless they are directly relevant.

Good investigation pattern:

```txt
search relevant symbol/text
open the specific file
edit the smallest affected area
run the lightest relevant verification
summarise only what changed
```

Avoid this pattern unless explicitly requested:

```txt
scan the whole repo
refactor nearby code
update changelog
run every test
start browser server
produce a long report
```

## Verification Expectations

Use the lightest verification that matches the change.

### Documentation-only changes

Examples:

* README edits
* AGENTS.md edits
* comments only
* docs under `docs/`

Verification:

```txt
Inspect the diff only.
```

Do not run build or tests for documentation-only changes unless the user asks.

### CSS-only or presentational UI-only changes

Examples:

* colours
* spacing
* font sizes
* card styling
* layout polish that does not change React logic

Verification:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Browser verification is optional and should only be used if the visual risk is meaningful or the user asks.

### Frontend logic changes

Examples:

* React hooks
* state changes
* routing/page selection
* rendering conditions
* data mapping
* forms
* tables
* filters
* charts
* admin dashboard behaviour
* bot dashboard behaviour

Verification:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Also browser-check the affected page when practical and when the change could cause a blank page, broken layout, or console error.

### Backend, database, auth, polling, Discord, notification, or API changes

Examples:

* `server.mjs`
* SQLite logic
* market history
* activity history
* server polling
* Discord bot delivery
* admin auth
* CSRF checks
* API proxy behaviour
* production data handling

Verification:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Add or update focused tests when changing backend notification, polling, database, market-history, Discord delivery, or admin-auth logic.

### Test changes

When editing tests, run the relevant test command:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Also run build if production TypeScript or app code changed.

### When checks cannot be run

If a check cannot be run because of missing dependencies, environment issues, time, or a known local blocker:

* Do not keep retrying blindly.
* Report the blocker clearly.
* State what was checked instead.
* Suggest the exact command the user should run locally.

## Browser Verification

Browser verification is useful but should not be the default for every change.

Use browser verification when:

* the user asks for visual verification,
* the change affects page structure or navigation,
* the change affects React hooks or conditional rendering,
* the page previously showed a blank screen,
* the change affects forms, tables, dashboards, or responsive layout,
* or the change is risky enough that build output alone is not enough.

Do not start a browser/server for:

* documentation-only edits,
* changelog edits,
* minor copy changes,
* small colour tweaks,
* small spacing tweaks,
* isolated class name changes where build is enough.

If a local page is blank or behaving strangely, inspect console errors before guessing.

## Local Browser Smoke Server

Use this only when browser verification is genuinely needed and ordinary Vite dev startup is unreliable, or when the user is testing the in-app browser at:

```txt
http://127.0.0.1:18449/
```

Do not improvise with `Start-Process`; this Windows environment can fail with a `Path/PATH` collision and silently waste time.

Build the frontend:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Restart the stable local smoke server:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
```

This serves the app at:

```txt
http://127.0.0.1:18449/
```

Confirm health:

```powershell
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Useful target URLs:

```txt
http://127.0.0.1:18449/?page=overview
http://127.0.0.1:18449/?page=map
http://127.0.0.1:18449/bot
```

If the page is stale after code changes:

1. rerun the build,
2. restart the smoke server,
3. reload the browser tab.

The smoke launcher must return quickly. If `--restart` does not return within 15 seconds, stop retrying. Inspect:

```txt
.codex-dev/bitcraft-local-smoke.err.log
.codex-dev/bitcraft-local-smoke.out.log
.codex-dev/bitcraft-local-smoke.pid
```

Then report the blocker instead of sitting on repeated server commands.

## Git and Versioning

Main branch:

```txt
main
```

Keep unrelated local files out of commits.

Do not commit or track log files such as:

```txt
vite-*.log
bitcraft-*.log
*.log
.codex-dev/
```

Do not update `CHANGELOG.md` or bump package versions during ordinary local iteration unless the user asks for it.

Only update `CHANGELOG.md` and `apps/bitcraft-local/package.json` when:

* the user asks to push,
* the user asks to deploy,
* the user asks to publish,
* the user asks to prepare a release,
* the task is clearly an urgent standalone production hotfix,
* or the user explicitly asks for a changelog/version update.

For normal feature/fix work, mention a suggested changelog entry in the final response instead of editing the changelog.

When preparing a release:

* Use beta semver, for example `1.0.11-beta.1`.
* Move accumulated unreleased notes into a dated version section.
* Keep the latest version at the top of `CHANGELOG.md`.
* Write changelog entries from the user's point of view.
* Do not dump commit logs, hashes, branch names, or internal refactor details.
* Omit empty changelog sections.

Push only after relevant checks pass unless the user explicitly asks for a work-in-progress push.

## Changelog Style

When changelog edits are requested, follow Keep a Changelog-style headings where relevant:

```txt
Added
Changed
Deprecated
Removed
Fixed
Security
```

Good entries:

```txt
- Added Discord colour-role management.
- Fixed market history filtering for the selected settlement.
- Improved mobile spacing on the bot dashboard.
```

Avoid entries like:

```txt
- Updates.
- Refactored files.
- Changed main.tsx.
- Fixed stuff.
```

Mention breaking changes, removals, migrations, deployment-impacting changes, or required admin action clearly.

## Frontend Notes

The frontend is still partly anchored by:

```txt
apps/bitcraft-local/src/main.tsx
```

Do not add more large, unrelated sections to `main.tsx` if a focused component is a better fit.

The Discord bot dashboard lives in:

```txt
apps/bitcraft-local/src/components/bot/
```

For bot dashboard UI changes, edit or add focused files in `src/components/bot/` rather than re-centralising bot UI back into `main.tsx`.

Pass state and actions through explicit props until a broader state refactor is intentionally requested.

## React Safety Rules

Be careful with React hooks in `main.tsx` and extracted components.

* Do not add hooks inside conditional branches.
* Do not add hooks after early returns.
* Keep hooks at the top level of components.
* Prefer ordinary derived constants for render-only calculations when state/memoisation is unnecessary.
* When changing conditional render paths, consider whether the change could alter hook order.

The app has previously had regressions from hook-order errors, spacing issues, and blank pages. Keep changes focused and verify appropriately.

## UI and CSS Direction

This app is an operational dashboard, not a marketing site.

Prefer UI that is:

* dense,
* readable,
* practical,
* fast to scan,
* suitable for live settlement operations.

Avoid:

* oversized hero sections,
* decorative card nesting,
* excessive empty space,
* washed-out low-contrast palettes,
* marketing-site layouts,
* unnecessary animations,
* styling that makes dashboards harder to use.

Use existing local patterns where possible:

```txt
Info
toolbar-button
field
toggle-line
form-card
existing bot dashboard classes
Lucide icons
```

For new CSS:

* Prefer existing classes first.
* For small feature-specific CSS, use the nearest existing stylesheet.
* For focused new feature CSS, prefer a small module in `apps/bitcraft-local/src/styles/`.
* Avoid appending large unrelated sections to `styles.css`.

## Code Organisation Preference

Use this order of preference:

1. Small targeted edit in the existing file.
2. Small helper function in the existing file.
3. Focused extracted component/module when it clearly reduces complexity.
4. Larger refactor only when explicitly requested.

Do not extract code just because a file is large. Extract code when it directly helps the requested change.

Avoid moving code between files unless the current task requires it.

## Backend Notes

The production server is:

```txt
apps/bitcraft-local/server.mjs
```

It serves the production frontend, proxies/restricts BitJita API access, manages admin sessions, stores SQLite data, runs server polling, and sends Discord notifications.

Important backend constraints:

* Do not expose bot tokens.
* Do not expose admin secrets.
* Do not return sensitive configuration in public API responses.
* Keep admin mutations behind authenticated admin routes and CSRF checks.
* Public BitCraft/BitJita game data can be shown to ordinary users unless it is app configuration, secrets, or admin-only testing data.
* Production polling should continue without any browser open.
* Normal main-app page refreshes should read `/api/local/pages/:page` from SQLite-backed domain current tables. Do not reintroduce automatic browser-tab BitJita polling for page rendering; keep BitJita proxy calls for explicit user-triggered tools and diagnostics.
* Settlement-specific history should be filtered to the configured claim/settlement where relevant.

When changing backend code, prefer small focused tests over broad brittle snapshots.

## Database Notes

Development data lives in:

```txt
apps/bitcraft-local/data/bitcraft-local.sqlite
```

Production data lives outside the Git checkout:

```txt
/var/lib/bitcraft-claim-monitor
```

Do not commit database files.

Be careful with migrations or schema changes:

* Preserve existing user data.
* Avoid destructive changes unless explicitly requested.
* Include safe defaults where possible.
* Mention any required admin or VPS action in the final response.

## Discord Bot Notes

Discord bot functionality can affect real users and real servers.

For Discord changes:

* Avoid sending real notifications during tests unless explicitly requested.
* Keep tokens and secrets hidden.
* Prefer dry-run, diagnostics, or mocked paths when possible.
* Test delivery logic with focused tests where practical.
* Do not change permissions or moderation behaviour broadly unless requested.

## BitJita and Public Game Data

The app uses public BitJita API data.

When changing BitJita-related logic:

* Preserve existing API response handling unless the task requires a change.
* Handle missing, null, or partial data safely.
* Avoid assuming every field is present.
* Keep settlement-specific filtering accurate.
* Do not expose admin-only app configuration just because the underlying game data is public.

## Final Response Expectations

Keep final responses concise and useful.

Always include:

* what changed,
* the main files touched,
* what verification was run,
* any checks skipped and why,
* any follow-up commands the user needs.

Do not paste huge diffs or entire files in the final response unless the user asks.

Good final format:

```txt
Done.

Changed:
- Updated the market filter logic in `...`
- Adjusted the empty-state copy in `...`

Verified:
- `corepack pnpm --filter @workspace/bitcraft-local run build`

Skipped:
- Full test suite not run because this was a presentational UI-only change.

Next:
- No VPS action needed.
```

For push/deploy/release tasks, also state:

* whether it was committed,
* whether it was pushed,
* version number if bumped,
* changelog status,
* any VPS commands required.

## When to Ask the User

Avoid asking questions if a reasonable, safe assumption can be made.

Ask only when:

* the request is ambiguous enough that the wrong change is likely,
* the change could delete data,
* the change could expose secrets,
* the change could affect production users,
* or the user is asking for a design/product decision with multiple valid directions.

If the task can be completed safely with a narrow assumption, make the assumption and mention it in the final response.

## Efficiency Summary

Default behaviour:

```txt
small diff
targeted files
minimal exploration
lightest relevant verification
no changelog unless requested
no version bump unless requested
no broad refactor unless requested
clear final summary
```
