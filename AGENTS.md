# AGENTS.md

## Project Overview

BitCraft Claim Monitor is a local-first settlement operations dashboard for BitCraft. It uses the public BitJita API, records local SQLite history, and includes a Discord bot/admin dashboard.

The maintained application is `apps/bitcraft-local`. Historical Replit-exported `artifacts/` code has been removed from the active workspace and should not be recreated unless the user explicitly asks to inspect an old export.

## Tech Stack

- Package manager: `pnpm` via Corepack. Use the pinned workspace version.
- Runtime target: Node.js 24+.
- Active frontend: React + TypeScript + Vite in `apps/bitcraft-local/src/main.tsx`, with extracted feature components under `apps/bitcraft-local/src/components/`.
- Active styling: plain CSS in `apps/bitcraft-local/src/styles.css`, with focused newer modules under `apps/bitcraft-local/src/styles/`.
- Active backend: Node HTTP server in `apps/bitcraft-local/server.mjs`.
- Database: Node built-in SQLite (`node:sqlite`), stored locally under `apps/bitcraft-local/data/` in development and `/var/lib/bitcraft-claim-monitor` in production.

## Useful Commands

Run from the repository root unless stated otherwise.

```sh
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

The local dev command starts:

- frontend: `http://localhost:18428` unless `PORT` is set
- local API: `http://127.0.0.1:18430` unless `LOCAL_API_PORT` is set

When a user is already testing a different local port, inspect the running process or logs before assuming the default port.

## Verification Expectations

For app changes, run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

For documentation-only changes, tests are usually not required, but still inspect the diff before finishing.

After significant UI changes, open the relevant local page and visually verify layout at desktop size where possible. The app has had regressions from spacing, hook-order errors, and blank pages, so browser verification is valuable.

### Local Browser Smoke Server

Use this exact process when the user is testing in the in-app browser at `http://127.0.0.1:18449/`, or when ordinary Vite dev startup is unreliable. Do not improvise with `Start-Process`; this Windows environment can fail with a `Path/PATH` collision and silently waste time.

1. Build the frontend:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

2. Restart the stable production-style local smoke server so it serves the freshly built static assets:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
```

Use `node scripts/start-bitcraft-local-smoke.mjs` without `--restart` only when no frontend build has changed and you intentionally want to reuse the current server.

This starts `apps/bitcraft-local/server.mjs` detached on `http://127.0.0.1:18449/` with:

- `APP_HOST=127.0.0.1`
- `APP_PORT=18449`
- `SERVE_STATIC=true`
- `ENABLE_SERVER_POLLING=false`
- `ENABLE_DISCORD_STARTUP=false`
- `BITCRAFT_LOCAL_DATA_DIR=.dev-data`

The launcher writes:

- `.codex-dev/bitcraft-local-smoke.pid`
- `.codex-dev/bitcraft-local-smoke.out.log`
- `.codex-dev/bitcraft-local-smoke.err.log`

3. Confirm it is alive before browser testing:

```powershell
curl.exe -s http://127.0.0.1:18449/api/local/health
```

4. Open or reload the target page in the in-app browser, for example:

```txt
http://127.0.0.1:18449/?page=overview
http://127.0.0.1:18449/?page=map
http://127.0.0.1:18449/bot
```

If the page is still stale after code changes, rerun the build, rerun `node scripts/start-bitcraft-local-smoke.mjs --restart`, then reload the browser tab.

The smoke launcher must return quickly. If `--restart` does not return within 15 seconds, stop retrying it. Inspect `.codex-dev/bitcraft-local-smoke.err.log`, check the PID in `.codex-dev/bitcraft-local-smoke.pid`, and report the blocker rather than sitting on repeated server commands.

### Testing Discipline

- Add or update focused tests when changing backend notification, polling, database, market-history, Discord delivery, or admin-auth logic.
- For narrow UI-only changes, a build plus browser verification is usually enough unless behaviour is being changed.
- Prefer small, targeted regression tests over broad brittle snapshots.

### Browser Verification

- Use the in-app browser for local UI checks after frontend changes when a local server is available.
- If a page is blank or behaving strangely, inspect console errors before guessing.
- For bot/admin UI work, check the relevant `/bot` or Admin tab at desktop size and verify there are no obvious spacing, overflow, or blank-page errors.
- When the Vite dev process is unreliable, use the Local Browser Smoke Server process above. Do not hand-roll a separate `node apps/bitcraft-local/server.mjs` command for UI verification.
- Then smoke test the target URL, for example `http://127.0.0.1:18449/bot`, in the in-app browser and check console errors.

## Git and Versioning

- The main branch is `main`.
- Keep unrelated local files out of commits. Log files such as `vite-*.log`, `bitcraft-*.log`, and dev server logs should remain untracked.
- Update `apps/bitcraft-local/package.json` and `CHANGELOG.md` when making user-visible fixes or features.
- Use beta semver, for example `0.8.44-beta.1`.
- Do not rewrite published changelog history unless the user specifically asks.

### Changelog Rules

Maintain `CHANGELOG.md` using [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) principles:

- Changelog entries are for humans, not machines. Do not dump commit logs, internal refactor noise, branch names, hashes, or vague entries like "updates".
- Keep the latest version at the top. Every released app version should have an entry.
- Use version headings with ISO dates: `## [0.8.45-beta.1] - 2026-06-03`.
- Keep an `## [Unreleased]` section at the top when accumulating changes that have not been versioned yet. Move those notes into the new version section when bumping `apps/bitcraft-local/package.json`.
- Group changes by type using these headings when relevant:
  - `Added` for new features.
  - `Changed` for changes to existing behavior or UX.
  - `Deprecated` for features planned for removal.
  - `Removed` for removed features.
  - `Fixed` for bug fixes.
  - `Security` for vulnerability or sensitive-data fixes.
- Omit empty type sections. Do not add placeholder headings.
- Write entries from the user's point of view, focused on what changed in the app or bot. Prefer "Added Discord colour-role management" over "Created DiscordColourRolesSection component".
- Mention breaking changes, removals, data migrations, deployment-impacting changes, or admin action required clearly in the relevant entry.
- If a version was published without notes, add a minimal entry such as `### Fixed` / `- General bug fixes.` rather than leaving a missing version.
- Use concise bullets, but include enough context that a user can understand whether the change matters to them.

### Commit and Push Rules

- For user-visible fixes and features during an active local iteration, add concise notes under `CHANGELOG.md` `Unreleased` first and do not bump `apps/bitcraft-local/package.json` for every tiny adjustment.
- When the user asks to push, deploy, or otherwise publish the current batch, move the accumulated `Unreleased` notes into one new version section, bump `apps/bitcraft-local/package.json` once, then commit/push.
- For urgent production hotfixes or standalone releases, it is still fine to bump immediately when the fix is complete.
- Use clear commit messages that describe the user-facing change or bug fixed.
- Push only after the relevant build/tests pass, unless the user explicitly asks for a work-in-progress push.
- In final updates, state what changed, what was tested, whether it was pushed, and any VPS commands the user needs.

## App Architecture Notes

### Frontend

The frontend is still anchored by one large React file:

- `apps/bitcraft-local/src/main.tsx`

The Discord bot dashboard has been refactored into focused components:

- `apps/bitcraft-local/src/components/bot/BotSectionNav.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordChannelsSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordColourRolesSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordCraftWatchRolesSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordDiagnosticsPanel.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordMemberRecordsSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordModerationSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordNotificationsSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordRoleManagerSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordRolePanelsSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordSafetySection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordSetupSection.tsx`
- `apps/bitcraft-local/src/components/bot/DiscordTestsPanel.tsx`

For bot dashboard UI changes, edit or add files in `src/components/bot/` rather than adding more JSX to `main.tsx`. Keep each bot section self-contained and pass state/actions through explicit props until a broader state refactor is intentionally planned.

Be careful with React hooks in `main.tsx` and extracted components. The admin/bot pages use conditional render paths. Do not add hooks inside conditional branches or after early returns. Prefer ordinary derived constants for render-only calculations unless they are placed safely with the rest of the top-level hooks.

Keep UI dense, readable, and operational. This app is a dashboard, not a marketing site. Avoid oversized hero sections, decorative card nesting, or washed-out one-note palettes.

Use existing local patterns:

- `Info` for small label/value stats.
- `toolbar-button`, `field`, `toggle-line`, `form-card`, and existing bot dashboard classes for admin controls.
- Lucide icons are already used throughout the app.

### Code Organization Preference

- Keep small fixes in the existing files when that is the cleanest route.
- For larger or messy features, prefer a sensible split into smaller focused modules before implementing. The bot dashboard split under `src/components/bot/` is the current pattern to follow.
- Avoid re-centralising extracted bot UI back into `main.tsx`.
- Do not introduce a new framework, state library, styling system, or heavy dependency without first explaining the tradeoff.
- For new CSS that belongs to a focused feature or cleanup pass, prefer a small module in `apps/bitcraft-local/src/styles/` imported from TypeScript instead of appending more unrelated rules to the main stylesheet.

### Backend

The production server is:

- `apps/bitcraft-local/server.mjs`

It serves the production frontend, proxies/restricts BitJita API access, manages admin sessions, stores SQLite data, runs server polling, and sends Discord notifications.

Important backend constraints:

- Do not expose bot tokens or admin secrets in API responses.
- Keep admin mutations behind authenticated admin routes and CSRF checks.
- Public BitCraft/BitJita game data can be shown to ordinary users unless it is app configuration, secrets, or admin-only testing data.
- Production polling should continue without any browser open.
- Settlement-specific history should be filtered to the configured claim/settlement where relevant.

### Database

Development data lives in:

```txt
apps/bitcraft-local/data/bitcraft-local.sqlite
```

Production data lives outside the Git checkout:

```txt
/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite
```

Do not commit SQLite databases, uploaded branding, backups, or generated runtime data.

Schema changes are currently handled directly in `server.mjs` with `CREATE TABLE IF NOT EXISTS` and `ensureColumn`. Follow the existing pattern for small migrations.

### Backups Before Risky Operations

- Recommend or create a SQLite backup before migrations, destructive admin/data operations, or production database changes.
- Never run destructive database operations on production data without an explicit user request and a backup plan.

## BitJita and BitCraft Data Notes

- The app relies on BitJita public API data. Check `BITJITA_API_AUDIT.md` and existing endpoint helpers before inventing assumptions.
- Prefer API fields over inferred values when available.
- If an API field is missing or ambiguous, show a conservative label rather than implying certainty.
- Verify BitJita/public API fields before changing calculations, labels, filters, or eligibility logic.
- Clearly distinguish API facts from app inference in code comments, UI labels, or user explanations when ambiguity matters.
- Terminology matters:
  - Use `Structures`, not `Buildings`, in user-facing current UI where players expect stations/containers/structures.
  - Use `Professions` for core crafting/gathering levels; skills are separate gameplay abilities.
  - Supply upkeep/runway should use BitJita's run-out/upkeep data when available.

## Discord Bot Notes

The Discord bot is managed from `/bot`.

- Backend, persistence, Discord delivery, slash commands, and interaction handlers live in `apps/bitcraft-local/server.mjs`.
- The bot dashboard shell and shared state still live in `apps/bitcraft-local/src/main.tsx`.
- Individual dashboard tabs live in `apps/bitcraft-local/src/components/bot/`.

When adding Discord settings, keep the frontend defaults/types, server-side defaults, normalization, persistence, and Discord interaction logic in sync. A setting shown in `/bot` should normally survive refresh, render in diagnostics where useful, and be respected by `server.mjs`.

Keep these behaviours intact:

- App update notifications should use the app version plus git revision release key when possible.
- Do not mark an app update as announced until the Discord send succeeds.
- Low-supply alerts should fire only when supplies are below the configured runway threshold and no more than once per 24 hours after a successful send.
- Craft notifications have configurable enabled state, channels, minimum total XP, start delay, allowed crafters, and role pings.
- Diagnostics should record sent, skipped, and failed notifications with enough routing/filter detail to debug issues.
- Discord role/color features should avoid duplicate selector messages where an update/edit path exists.

When changing Discord interactions, test both:

- admin dashboard actions
- Discord interaction handlers in `server.mjs`

Common failure modes to watch for:

- Discord HTTP 403 from missing channel or role access.
- Roles above the bot's highest manageable role.
- Component custom IDs becoming too long.
- Missing helper functions in interaction code paths.
- React blank pages from hook-order changes in the bot dashboard.

### Discord Bot Safety

- Do not send test messages, register slash commands, create/edit roles, post/update selector panels, or otherwise mutate the live Discord server unless the user explicitly asks for that action.
- Admin UI changes may be tested locally without live Discord mutations where possible.
- If a Discord action is necessary, explain which server/channel/role will be affected before doing it.

## Styling and UI Guidelines

- The new Dashboard page is the visual source of truth for future main-app styling. The restyled Members page is the first accepted example of applying that language to an operational table page. When redesigning or adding main-app pages, aim for the same "settlement command centre" feel: dark, polished, game-adjacent, data-dense, and premium without becoming decorative or marketing-like.
- Do not let older page styles pull new work back toward a flat generic admin panel. If an older page conflicts with the Dashboard style, prefer moving that page toward the Dashboard language.
- Do not invent new near-match colour palettes for Dashboard-aligned pages. Reuse the Dashboard's actual CSS values first, then make deliberate deviations only when the user asks.
- Before styling another main-app page to match Dashboard, inspect the existing `.dashboard-*` CSS rules and copy the underlying surface, border, typography, and accent values. Avoid warmer brown/gold-tinted surfaces unless the Dashboard itself uses them in that context.
- For pages with tables or operational lists, use the Members page as the reference: Dashboard-like topbar, KPI/summary cards, dark elevated table surface, avatar/status rows where useful, and cool muted borders with gold used as a restrained accent.

### Main App Design System

Use these rules for main-app UI unless the user explicitly asks for a different direction:

- Fonts:
  - Use the existing app font stack, currently `Outfit, system-ui, sans-serif`.
  - Keep letter spacing at `0` for normal body text.
  - Use modest uppercase letter spacing only for small labels, section labels, and card headings.
  - Avoid viewport-based font sizing.
- Font sizes:
  - Page titles: `28px-34px`, weight `750-800`.
  - Dashboard-style primary metrics: `26px-40px`, weight `750-800`.
  - Card titles and KPI labels: `11px-13px`, uppercase, weight `700`.
  - Body text: `14px-16px`.
  - Supporting text and metadata: `12px-13px`.
  - Tables may use `12px-14px`, but must remain readable on 1920x1080.
- Font colours:
  - Primary text: near-white, use `#f7f8fb` or `var(--text)`.
  - Secondary text: cool muted grey, use `#aab3c2` or `var(--muted)`.
  - Tertiary/helper text: `#7f8998`.
  - Headings and important labels: gold `#f0c64f`.
  - Positive values: green `#63eba5`.
  - Negative values: red `#ff6b65`.
  - Informational values: blue `#56d5ff`.
- Background colours:
  - Main app background should be very dark with subtle layered depth, not flat black.
  - Preferred Dashboard base: `linear-gradient(180deg, #03060a 0%, #05070b 46%, #030509 100%)` with restrained `rgba(10,18,28,.24)` and `rgba(240,198,79,.075)` radial accents.
  - Use restrained radial gradients, for example dark blue/black and soft gold glows, to create atmosphere without obvious blobs.
  - Sidebar background should stay darker than content, around `#06070a` to `#080b10`.
- Card design:
  - Cards should feel like elevated dark navy surfaces above a darker page.
  - Preferred Dashboard surface: `radial-gradient(circle at 100% 0%, rgba(22,32,43,.1), transparent 38%), linear-gradient(180deg, rgba(11,16,22,.97), rgba(6,9,14,.99))`.
  - Use visible but restrained cool borders: `1px solid rgba(108,123,145,.24)` for ordinary cards. Reserve gold borders for emphasis/active states.
  - Use hover borders around `rgba(240, 198, 79, 0.28-0.34)` when cards are interactive.
  - Use soft depth matching Dashboard: `inset 0 1px 0 rgba(255,255,255,.035), 0 12px 28px rgba(0,0,0,.2)`.
  - Border radius should usually be `7px` for Dashboard-matched cards and `6px-8px` for compact controls.
  - Do not put UI cards inside other cards unless the inner card is a repeated item, row, modal, or preview.
- Card content:
  - KPI cards should have one dominant metric, one clear label, and one short supporting line.
  - Icons should sit in a dark/gold-tinted square or circle with a subtle border when used as KPI anchors.
  - Section headings inside Dashboard-style cards should use the Dashboard treatment: small uppercase muted text with modest letter spacing and an optional retained gold icon. Avoid reverting to the older large gold `h3` style inside cards.
  - Avoid redundant labels, duplicate badges, or metrics that appear clickable but do nothing.
  - If a button-like element is intentionally static, style it as a pill or label, not a button.
- Layout:
  - Use Dashboard-style grid rhythm: consistent gaps around `12px-18px` between cards and `20px-28px` inside larger cards.
  - Keep dense operational pages readable on 1920x1080 without unnecessary vertical scroll.
  - Prefer responsive CSS grid with explicit `minmax()` tracks over hard-coded widths.
  - For page top-right metadata, reuse the Dashboard pattern exactly: `dashboard-top-meta` containing `dashboard-meta-cluster` plus `dashboard-claim-link` or `dashboard-settlement-pill`. Keep the divider on the metadata cluster, use `gap: 11px` between tier badges and labels, and avoid page-specific one-off spacing that jams badges into text.
  - Match card heights in paired sections when users visually compare them, such as focus/coverage and leaders/nearby lists.
  - Avoid large empty rectangles. Empty states should include an icon or short explanation and look intentional.
  - Avoid horizontal overflow at all viewport widths.
- Controls:
  - Main-app buttons should use the Dashboard button language: dark surface, clear border, gold or blue accent only where action priority needs it.
  - Floating utility buttons should share one consistent shape, size, border, and hover style.
  - Selects, inputs, and search fields should use dark backgrounds, readable borders, and high-contrast text.
  - Visible checkboxes should usually be replaced with theme-appropriate toggles.
- Charts and progress:
  - Use gold for treasury/economy lines and accents.
  - Use green-to-cyan gradients for supply/health progress where appropriate.
  - Chart empty states must be deliberate and explanatory, not blank panels.
- Accessibility:
  - Text and controls must meet readable contrast on the dark theme.
  - Interactive controls need visible focus states.
  - Touch/click targets should generally be at least `34px` high, preferably `38px+` for common controls.
  - Icon-only controls need accessible labels or tooltips.

- Keep dashboard pages compact and readable on 1920x1080.
- Avoid nested cards unless the inner card is a real repeated item or modal-like surface.
- Form inputs in the bot/admin area should use the existing dark field style: full width, dark panel background, `var(--border)`, 7px radius.
- Prefer theme-appropriate toggles over raw checkboxes in visible settings UI.
- For Discord previews, clearly label them as previews and make them resemble Discord where practical.
- Keep buttons keyboard-accessible and use real `<button>`/`<a>` elements rather than clickable `div`s where possible.
- Avoid icon-only controls without accessible labels or tooltips.
- Keep contrast readable against the dark theme.
- Preserve tier colour conventions across the app:
  - T1 `#838e9e`
  - T2 `#be6327`
  - T3 `#00f630`
  - T4 `#2d6bff`
  - T5 `#a349af`
  - T6 `#d12234`
  - T7 `#c09015`
  - T8 `#5ae2e2`
  - T9 `#1f1f1f`
  - T10 `#deffff`

### UI Review Checklist

Before finishing UI work, check:

- 1920x1080 desktop layout.
- no overlapping text or controls.
- no unexpected scrollbars in panels that should fit.
- no blank page or console errors.
- bot/admin forms match the existing input and toggle styling.

### Performance

- Avoid unnecessary full-page refreshes and preserve existing data during background polling.
- Avoid expensive per-item browser/API loops; prefer batched data, server-side helpers, or one scoped extraction.
- Be careful with render work on large tables/lists.
- Keep refresh jitter low, especially for pages intended to stay open on a second monitor.

## Security and Privacy

- Never commit real Discord bot tokens, admin passwords, session cookies, setup keys, or production database files.
- Never read, print, commit, or expose Discord bot tokens, admin session cookies, SQLite database contents, uploaded branding, analytics records, or user records unless the task specifically requires inspecting them.
- Keep analytics first-party and consent-aware. If a user declines analytics cookies, do not track behavioural analytics for that browser.
- Admin authentication uses server-side sessions and HttpOnly cookies; preserve that model.
- Admin setup keys are one-time production bootstrap values and should be removed after setup.

## Do Not Touch Unless Asked

- Do not recreate or work from historical Replit artifacts unless the user specifically asks about an old export.
- Do not change deployment domains, Caddy config, systemd config, or VPS update instructions unless the request involves deployment.
- Do not change database schema unless the feature or fix requires it.
- Do not reset admin passwords, clear production settings, or alter Discord live configuration without explicit permission.

## Deployment Notes

Production runs from:

```txt
/opt/bitcraft-claim-monitor
```

Service:

```txt
bitcraft-claim-monitor.service
```

Production update flow:

```bash
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft git pull --ff-only
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
systemctl restart bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor --no-pager -l
curl -s http://127.0.0.1:18430/api/local/health
```

Caddy serves the public domain and reverse-proxies to the local Node server. See `deploy/Caddyfile.example` and `DEPLOYMENT.md`.

Current canonical production domain is:

```txt
https://app.timbersteeltrade.com
```

### Live Production Caution

When the user reports a live-site issue:

- Prioritize a minimal hotfix over broad refactors.
- Reproduce or identify the failure from logs/console/build output where possible.
- Verify locally with build/tests.
- Bump version and changelog for the hotfix.
- Push only after verification.
- Provide VPS update commands or tell the user to run the existing update script if that is what they use.

## Issue Tracker Workflow

If the user asks to review GitHub issues or feature requests:

- Fetch the current open issues from GitHub.
- Summarize the findings and propose an implementation plan first.
- Wait for user approval before implementing issue-driven changes.
- Reference issue numbers in summaries and commits when useful.

## User Communication

- Keep updates concise and practical.
- Explain what changed, what was tested, whether it was pushed, and any deployment steps needed.
- If something could not be tested, say so directly.
- Prefer concrete file/command references over broad descriptions.

## Working Safely

- Read the existing code before changing behaviour; many app features encode BitCraft-specific assumptions from prior testing.
- Keep changes narrowly scoped to the user's request.
- Do not revert unrelated user changes.
- If a production bug caused a blank page or failed deployment, prioritize a small hotfix, build/test it, bump version/changelog, and push only after verification.
- Prefer clear diagnostics and readable failure reasons over silent skips, especially for Discord notifications and polling.
- Follow this file by default. If a user request conflicts with these rules, briefly explain the conflict and ask before overriding risky rules.
