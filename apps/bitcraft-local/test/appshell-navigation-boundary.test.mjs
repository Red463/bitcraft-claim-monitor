import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/navigation.ts", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("sidebar destinations preserve routing, access filtering, and active-route semantics", () => {
  assert.match(appShell, /group\.items\.filter\(\(\[id\]\) => isPageAllowed\(id\)\)/);
  assert.match(appShell, /href=\{panelHref\(id\)\}/);
  assert.match(appShell, /aria-current=\{active === id \? "page" : undefined\}/);
});

test("navigation retains existing groups and non-admin route IDs", () => {
  for (const groupId of ["command", "settlement", "economy", "tools"]) {
    assert.match(navigation, new RegExp(`id:\\s*"${groupId}"`));
  }

  for (const routeId of [
    "dashboard", "leaderboard", "members", "skills", "production", "planning",
    "inventory", "construction", "research", "market", "empire", "empires",
    "map", "activity", "publiccrafts", "craftcalc", "sync",
  ]) {
    assert.match(navigation, new RegExp(`\\["${routeId}",`));
  }
});

test("narrow navigation exposes an accessible grouped drawer", () => {
  assert.match(appShell, /const \[mobileNavigationOpen, setMobileNavigationOpen\] = React\.useState\(false\)/);
  assert.match(appShell, /aria-controls="mobile-navigation"/);
  assert.match(appShell, /aria-expanded=\{mobileNavigationOpen\}/);
  assert.match(appShell, /id="mobile-navigation"/);
  assert.match(appShell, /aria-label="Mobile navigation"/);
  assert.match(appShell, /className="mobile-navigation-backdrop"/);
  const openClass = appShell.match(/className=\{`app-sidebar \$\{mobileNavigationOpen \? "([^"]+)"/)?.[1] ?? "";
  assert.equal(openClass, "mobile-open");
  assert.match(shellCss, new RegExp(`\\.app-sidebar\\.${openClass}\\s*\\{[^}]*transform:\\s*translateX\\(0\\)`, "s"));
  assert.match(appShell, /NAV_GROUPS\.map\(\(group\) =>/);
  assert.match(appShell, /group\.items\.filter\(\(\[id\]\) => isPageAllowed\(id\)\)/);
});

test("closed narrow drawer is hidden from accessibility and keyboard navigation without disabling desktop sidebar", () => {
  assert.match(appShell, /window\.matchMedia\("\(max-width: 920px\)"\)/);
  assert.match(appShell, /const mobileNavigationUnavailable = isNarrowViewport && !mobileNavigationOpen/);
  assert.match(appShell, /inert=\{mobileNavigationUnavailable \? true : undefined\}/);
  assert.match(appShell, /aria-hidden=\{mobileNavigationUnavailable \? true : undefined\}/);
});

test("mobile drawer closes with Escape and restores focus to its trigger", () => {
  assert.match(appShell, /event\.key === "Escape"/);
  assert.match(appShell, /document\.body\.style\.overflow = mobileNavigationOpen \? "hidden" : previousOverflow/);
  assert.match(appShell, /mobileNavigationTriggerRef\.current\?\.focus\(\)/);
});

test("ordinary route activation navigates before closing the mobile drawer", () => {
  assert.match(appShell, /navigate\(id\);\s*setMobileNavigationOpen\(false\);/);
  assert.match(appShell, /if \(event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;/);
});

test("route links expose collapsed labels while route changes retain scroll orientation", () => {
  assert.match(appShell, /<span className="nav-label">\{label\}<\/span>\s*<span className="collapsed-nav-label" aria-hidden="true">\{label\}<\/span>/);
  assert.match(appShell, /if \(mainRef\.current\) mainRef\.current\.scrollTop = 0;/);
  assert.match(appShell, /<main ref=\{mainRef\} tabIndex=\{-1\}>/);
});

test("collapsed route tooltip is rendered outside the scrolling sidebar", () => {
  assert.match(appShell, /const \[collapsedNavTooltip, setCollapsedNavTooltip\] = React\.useState/);
  assert.match(appShell, /onMouseEnter=\{\(event\) => showCollapsedNavTooltip\(event\.currentTarget, label\)\}/);
  assert.match(appShell, /onFocus=\{\(event\) => showCollapsedNavTooltip\(event\.currentTarget, label\)\}/);
  assert.match(appShell, /<\/aside>\s*\{collapsedNavTooltip \? <span className="collapsed-nav-tooltip"/);
  assert.match(appShell, /aria-hidden="true"/);
});

test("collapsed route tooltip clears on resize and nav scroll with listener cleanup", () => {
  assert.match(appShell, /const navigationRef = React\.useRef<HTMLElement \| null>\(null\)/);
  assert.match(appShell, /window\.addEventListener\("resize", clearCollapsedNavTooltip\)/);
  assert.match(appShell, /const navigation = navigationRef\.current;/);
  assert.match(appShell, /navigation\?\.addEventListener\("scroll", clearCollapsedNavTooltip\)/);
  assert.match(appShell, /window\.removeEventListener\("resize", clearCollapsedNavTooltip\)/);
  assert.match(appShell, /navigation\?\.removeEventListener\("scroll", clearCollapsedNavTooltip\)/);
  assert.match(appShell, /<nav ref=\{navigationRef\}/);
});
