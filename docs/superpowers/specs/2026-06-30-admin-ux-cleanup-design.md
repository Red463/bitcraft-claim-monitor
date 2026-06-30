# Admin UX Cleanup Design

Date: 2026-06-30

## Goal

Make the admin section cleaner and easier to navigate without removing working operational capabilities. The finished admin console should have no unused controls, relevant descriptions/tooltips, and clear layouts for every admin tab.

## Current State

The admin console is mostly implemented in `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`. It has a flat top-level tab strip with Status, Analytics, Configuration, Diagnostics, Database, Administrators, Linked Accounts, Audit, and Backups. The Discord bot area is already partly organized with its own grouped section navigation.

The main UX issue is that admin tasks with different purposes are mixed together: operations, setup, analytics, database inspection, account access, audit history, and maintenance all appear as peers. Most visible controls map to active server endpoints, so the first cleanup should improve grouping, context, and labels rather than deleting functionality blindly.

## Approved Approach

Use an in-place admin UX cleanup. Keep current routes and server endpoints, but reorganize the admin shell and clarify each tab.

## Navigation Design

Replace the flat admin tab strip with grouped navigation:

- Operations: Status, Configuration, Diagnostics
- Insights: Analytics, Database
- Access: Administrators, Linked Accounts, Audit
- Maintenance: Backups

Discord remains a dedicated bot console link and sub-console because it already has focused grouped navigation.

## Page Structure

Each admin tab should have a consistent page header with:

- a clear tab title,
- a one-line purpose statement,
- key actions grouped in predictable places,
- no vague or stale descriptions.

## Cleanup Rules

During implementation, audit visible controls against current behavior and server routes. Remove or hide controls only when they are unused, unsupported, or misleading. Otherwise, keep the control and improve its label, description, tooltip, placement, or disabled state.

## Verification

- Build must pass for frontend/admin changes.
- Browser verification should be used for admin navigation/layout changes when practical.
- The final audit must check every admin tab for stale copy, confusing controls, and layout clarity before the goal can be marked complete.
