---
name: BitCraft Claim Monitor
description: Dense local-first BitCraft settlement operations dashboard.
colors:
  background: "#0c0d10"
  sidebar: "#06070a"
  surface: "#181b21"
  surface-muted: "#11141a"
  surface-top: "#111923"
  surface-bottom: "#080d14"
  border: "#353b46"
  text: "#f6f3ea"
  text-muted: "#a8adba"
  accent-gold: "#f0c64f"
  accent-gold-bg: "#3a3118"
  accent-gold-border: "#7a6428"
  success: "#4ee28a"
  danger: "#ef6461"
  info: "#74b6ff"
typography:
  display:
    fontFamily: "Rajdhani, Outfit, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  title:
    fontFamily: "Rajdhani, Outfit, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  body:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent-gold-bg}"
    textColor: "{colors.accent-gold}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  button-ghost:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: BitCraft Claim Monitor

## 1. Overview

**Creative North Star: "Settlement Control Room"**

The interface is an operational control room for a BitCraft settlement. It should feel compact, steady, and ready for repeated use during live play. Information density is a feature when it helps users compare production, market, inventory, map, empire, and planning data quickly.

The app uses dark layered surfaces, sharp game-adjacent typography, restrained gold accents, and clear status colours. UI chrome should support scanning and decision-making rather than pulling attention away from live settlement data.

Key characteristics:

- Dense but readable dashboards.
- Clear hierarchy through spacing, surface contrast, and small accent lines.
- Gold for active navigation and important primary actions.
- Green, red, and blue only for meaningful state.
- Viewport-fixed dialogs and drawers with internal scrolling.

## 2. Colors

The palette is a dark operational shell with a restrained gold command accent and practical state colours.

### Primary

- **Command Gold** (`#f0c64f`): Active navigation, primary admin actions, selected filters, and key headings that need attention without shouting.
- **Command Gold Field** (`#3a3118`): Active or selected backgrounds. Use sparingly so selected state remains obvious.

### Secondary

- **Operational Green** (`#4ee28a`): Success, active, online, verified, and positive status.
- **Signal Blue** (`#74b6ff`): Informational badges and secondary data emphasis.
- **Alert Red** (`#ef6461`): Destructive actions, errors, warnings that need correction.

### Neutral

- **App Black** (`#0c0d10`): Main page background.
- **Sidebar Black** (`#06070a`): Persistent navigation and app identity.
- **Panel Steel** (`#181b21`): Cards, drawers, modal surfaces, and dense control panels.
- **Muted Panel** (`#11141a`): Inputs, toolbar rows, secondary cards, and nested utility surfaces.
- **Border Steel** (`#353b46`): Structural borders, table grids, dividers, and modal outlines.
- **Warm Text** (`#f6f3ea`): Primary text.
- **Muted Text** (`#a8adba`): Supporting text, meta labels, and timestamps.

### Named Rules

**The Operational Accent Rule.** Gold means active, selected, or primary. Do not use it as broad decoration.

**The Data Honesty Rule.** If a value depends on provider availability or local generation freshness, the UI must label uncertainty plainly instead of over-styling it as exact truth.

**The Theme Safety Rule.** Browser themes may customize operational surfaces, text, focus, and status roles only when their representative pairs meet WCAG contrast. The current dashboard supports dark command surfaces: some dense tables, domain-fidelity panels, and operational labels intentionally retain fixed dark or light colours for rapid scanning. Imported or saved light-surface themes are therefore rejected before activation when those real UI pairs fail contrast. Invalid imports and saves must leave the last valid theme active and name every failing role with its measured and required contrast.

**The Domain Fidelity Rule.** Rarity, tier, chart-series, and Discord identity colours are game or platform data. Keep them as dedicated domain tokens; do not derive them from, or overwrite them with, browser theme colours.

## 3. Typography

**Display Font:** Rajdhani with Outfit and system fallbacks
**Body Font:** Outfit with system fallbacks
**Label/Mono Font:** JetBrains Mono for version IDs and compact technical labels when needed

The pairing should feel game-native and technical without becoming fantasy-themed. Rajdhani carries page titles, strong card labels, and numeric emphasis. Outfit carries readable operational copy.

### Hierarchy

- **Display** (700, tight line-height): Page titles and large metrics only.
- **Headline** (700, compact): Card and modal headings.
- **Title** (700, compact): Table row names, list item titles, section titles.
- **Body** (500, readable): Descriptions, helper text, modal content, and table supporting copy.
- **Label** (700, uppercase, spaced): Table headers, group labels, compact section metadata.

### Named Rules

Do not scale font sizes directly with viewport width. Keep letter spacing at zero except for compact uppercase labels.

## 4. Elevation

The app relies on tonal layering and borders more than drop shadows. Surfaces should feel stacked through background changes, border contrast, and fixed overlay dimming.

Use shadows only for floating controls, toasts, and modal focus where they help separate a temporary layer from busy data behind it.

The shared layer order is dropdown, help, toast, sticky chrome, overlay/modal, tooltip, then cookie consent. Use the semantic z-index token for the layer instead of a new large numeric value.

State transitions should normally run for 150–250ms and animate transform, opacity, colour, or border. Avoid layout-property transitions; preserve the global reduced-motion override.

## 5. Components

### App Shell

The sidebar is compact and persistent. Active navigation uses a left accent line, subtle gold treatment, and readable text. Keep row heights tight but avoid cramped hit targets.

### Page Header

Use the shared `PageHeader` structure for a route title, operational description, metadata, and actions. The title must match the navigation label; settlement or workflow detail belongs in description and metadata. Dashboard, Members, Professions, Production, Inventory, Research, and Construction are the first migrated routes.

### Cards and Panels

Cards use 8px radius or less unless an existing component requires otherwise. Do not nest decorative cards inside cards. Use repeated cards for item rows, modal content blocks, and dashboard metrics only when each card represents a distinct object or state.

### Buttons and Inputs

Use icon buttons for icon-only actions, text buttons for clear commands, and icon plus text for important actions such as save, refresh, edit, remove, or manage. Inputs should be stable in size and should not resize when values, badges, or hover states change.

### Tables and Boards

Operational tables should prioritize scannability. Headers must stay on one line when the table supports horizontal scroll. Planning boards should group by API-backed tag/tier where available and avoid name-parsing fallbacks.

### Dialogs and Popups

All dialogs, popups, wizards, and detail panels must render as viewport-fixed overlays. Use `position: fixed`, `inset: 0`, viewport-bounded modal sizing, and internal scrolling. Users should never need to scroll the page behind the overlay to find the popup.

### Notifications

Toasts and the notification drawer should share wording, icon treatment, metadata hierarchy, and muted timestamp styling. Repeated or multi-tab notifications should be suppressed rather than visually explained.

## 6. Do's and Don'ts

Do:

- Keep operational workflows dense, explicit, and fast to scan.
- Prefer existing classes and CSS variables before adding new styling.
- Preserve visible focus states and keyboard paths through modals.
- Use normalized Relay catalog metadata as the source of truth for item names, tags, tiers, and item/cargo type.
- Label admin controls clearly and keep ordinary user views read-only when the feature is admin-managed.

Don't:

- Add decorative hero sections, gradient orbs, or marketing-page composition.
- Put popups in normal page flow.
- Hide important controls below modal cutoffs.
- Use broad, low-contrast gray states for disabled-by-admin or blocked access without explanatory text.
- Infer game data from item names when API metadata exists or can be cached.
