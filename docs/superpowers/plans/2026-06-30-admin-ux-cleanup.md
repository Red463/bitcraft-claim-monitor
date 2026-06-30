# Admin UX Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the admin console so navigation is grouped, tab purposes are clear, descriptions/tooltips are current, and unused or misleading controls are removed or corrected.

**Architecture:** Keep the existing `AdminPanel.tsx` entry point and server routes. Add small local metadata/helpers for admin tabs and page headers, update CSS in `admin.css`, then audit tab copy and controls in place.

**Tech Stack:** React + TypeScript, plain CSS, Vite build, Node test runner.

---

## File Structure

- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
  - Add grouped admin tab metadata.
  - Render grouped navigation instead of the flat tab strip.
  - Add per-tab page headers.
  - Update stale descriptions and misleading button labels in visible tab sections.
- Modify: `apps/bitcraft-local/src/styles/admin.css`
  - Style grouped admin navigation and page headers.
  - Preserve compact operational dashboard styling.
- Modify: `apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`
  - Add structural tests proving grouped admin navigation metadata exists and the legacy flat tab array is gone or replaced.
- Optional modify after audit: focused bot component files under `apps/bitcraft-local/src/components/bot/` only if a stale tooltip/description is found there.

---

### Task 1: Add Grouped Admin Navigation Metadata

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Test: `apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`

- [ ] **Step 1: Write a structural test for grouped admin tabs**

Append this test to `apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`:

```js
test("AdminPanel groups admin tabs by operational purpose", async () => {
  const source = await readFile(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /const ADMIN_TAB_GROUPS\s*=/);
  assert.match(source, /Operations/);
  assert.match(source, /Insights/);
  assert.match(source, /Access/);
  assert.match(source, /Maintenance/);
  assert.match(source, /admin-tab-group/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`

Expected: FAIL because `ADMIN_TAB_GROUPS` and `admin-tab-group` are not present yet.

- [ ] **Step 3: Add tab metadata above `AdminPanel`**

In `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`, replace the current inline tab tuple approach with:

```ts
type AdminTabMeta = {
  key: AdminTab;
  label: string;
  description: string;
};

type AdminTabGroup = {
  label: string;
  tabs: AdminTabMeta[];
};

const ADMIN_TAB_GROUPS: AdminTabGroup[] = [
  {
    label: "Operations",
    tabs: [
      { key: "status", label: "Status", description: "Health, collection, jobs, and endpoint checks" },
      { key: "configuration", label: "Configuration", description: "Settlement defaults, privacy, collectors, and branding" },
      { key: "diagnostics", label: "Diagnostics", description: "Browser and map troubleshooting data" },
    ],
  },
  {
    label: "Insights",
    tabs: [
      { key: "analytics", label: "Analytics", description: "Usage, security, location, and request logs" },
      { key: "database", label: "Database", description: "SQLite inspection and exports" },
    ],
  },
  {
    label: "Access",
    tabs: [
      { key: "users", label: "Administrators", description: "Admin roles, status, and sessions" },
      { key: "accounts", label: "Linked Accounts", description: "Discord sign-ins and character link approvals" },
      { key: "audit", label: "Audit", description: "Admin action and sign-in history" },
    ],
  },
  {
    label: "Maintenance",
    tabs: [
      { key: "backups", label: "Backups", description: "Database backups and retention maintenance" },
    ],
  },
];

const ADMIN_TABS = ADMIN_TAB_GROUPS.flatMap((group) => group.tabs);
```

- [ ] **Step 4: Render grouped navigation**

Replace the flat `tabs` memo and `<div className="admin-tabs">...` render with grouped rendering:

```tsx
const tabs = React.useMemo<AdminTabMeta[]>(() => botOnly ? [] : ADMIN_TABS, [botOnly]);
```

Render:

```tsx
{tabs.length ? (
  <nav className="admin-tab-groups" aria-label="Admin sections">
    {ADMIN_TAB_GROUPS.map((group) => (
      <section className="admin-tab-group" key={group.label}>
        <span>{group.label}</span>
        <div className="admin-tabs">
          {group.tabs.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? "active" : ""}
              onClick={() => setTab(item.key)}
              title={item.description}
            >
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>
    ))}
  </nav>
) : null}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`

Expected: PASS.

---

### Task 2: Add Consistent Page Headers

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`

- [ ] **Step 1: Add active tab metadata**

Inside `AdminPanel`, after derived values for `tabs`, add:

```ts
const activeTabMeta = ADMIN_TABS.find((item) => item.key === tab);
```

- [ ] **Step 2: Render a shared page header after messages**

After `{message ? ... : null}`, add:

```tsx
{!botOnly && activeTabMeta ? (
  <section className="admin-tab-heading" aria-label={`${activeTabMeta.label} overview`}>
    <div>
      <span>Admin / {ADMIN_TAB_GROUPS.find((group) => group.tabs.some((item) => item.key === activeTabMeta.key))?.label}</span>
      <h3>{activeTabMeta.label}</h3>
      <p>{activeTabMeta.description}</p>
    </div>
  </section>
) : null}
```

- [ ] **Step 3: Add CSS for grouped nav and headers**

Append near the existing `.admin-tabs` rules in `apps/bitcraft-local/src/styles/admin.css`:

```css
.admin-tab-groups {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}
.admin-tab-group {
  min-width: 0;
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid rgba(108,123,145,.22);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(11,16,22,.94), rgba(6,9,14,.96));
}
.admin-tab-group > span {
  color: var(--gold);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.admin-tab-group .admin-tabs {
  padding: 0;
  border: 0;
  background: transparent;
}
.admin-tab-group .admin-tabs button {
  min-height: 54px;
  width: 100%;
  justify-content: start;
  display: grid;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
}
.admin-tab-group .admin-tabs button strong {
  color: inherit;
  font-size: 12px;
}
.admin-tab-group .admin-tabs button small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.25;
  font-weight: 700;
}
.admin-tab-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(108,123,145,.22);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(11,16,22,.92), rgba(6,9,14,.94));
}
.admin-tab-heading span {
  color: var(--gold);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.admin-tab-heading h3 {
  margin: 3px 0 0;
  color: #fff;
  font-size: 22px;
}
.admin-tab-heading p {
  margin: 4px 0 0;
  color: var(--muted);
}
@media (max-width: 1100px) {
  .admin-tab-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .admin-tab-groups { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

---

### Task 3: Copy and Control Audit Pass

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: bot section files only if stale copy is found.

- [ ] **Step 1: Update confusing tab descriptions**

Make these text changes in `AdminPanel.tsx`:

- Change Diagnostics description from `Troubleshooting tools for local browser state, API refresh behaviour and generated external URLs.` to `Troubleshoot browser-side map state and generated BitCraft Map URLs.`
- Change Map URL diagnostics copy from `Use this to diagnose player tracking flicker.` to `Use this to verify which player, resource, region, and focus parameters the app sends to BitCraft Map.`
- Change Database Browser copy from `Inspect current SQLite tables, search records, and export filtered data for debugging.` to `Inspect SQLite tables and export filtered records. Use this for support and diagnostics, not normal settlement operations.`
- Change Backups copy from `Restoration is intentionally performed on the VPS while the service is stopped.` to `Downloadable SQLite copies are stored on the server. Restore them manually on the VPS while services are stopped.`

- [ ] **Step 2: Add missing tooltip titles to destructive or non-obvious admin actions**

Add `title` attributes:

```tsx
title="Delete all opt-in usage analytics records. Security request logs are separate."
```
for Clear Data.

```tsx
title="Delete saved map diagnostic entries from this browser."
```
for Clear Log.

```tsx
title="Remove expired snapshot rows only. Market trades and activity history are retained."
```
for Remove Expired Snapshots.

- [ ] **Step 3: Verify no obvious stale copy remains in admin strings**

Run:

```powershell
Select-String -Path apps/bitcraft-local/src/components/admin/AdminPanel.tsx -Pattern 'flicker|debugging|troubleshooting tools|Restoration is intentionally|Clear Data|Clear Log|Remove Expired Snapshots'
```

Expected: old phrases are gone, remaining action labels have nearby explanatory `title` or legend text.

---

### Task 4: Verification

**Files:**
- No new code files unless Task 1-3 require them.

- [ ] **Step 1: Run focused admin structural test**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 3: Browser smoke if practical**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=admin` if authenticated local admin state allows it. Verify the admin tab groups wrap without overlap at desktop and narrow widths.

- [ ] **Step 4: Final audit note**

Summarize remaining known gaps. Do not mark the overall goal complete unless each admin tab has been visually or structurally audited and stale/unused controls have been resolved.

