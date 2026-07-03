import type { AnyRecord } from "../../main-app-data";
import { timestampMs } from "../../utils/format.ts";

const DASHBOARD_HIDDEN_ACTIVITY_TYPES = new Set([
  "treasury",
  "supplies",
  "production_started",
  "production_completed",
]);

export function dashboardRecentActivityItems(events: AnyRecord[], limit = 5): AnyRecord[] {
  return [...events]
    .filter((event) => !DASHBOARD_HIDDEN_ACTIVITY_TYPES.has(String(event.event_type ?? "")))
    .sort((a, b) => timestampMs(b.occurred_at) - timestampMs(a.occurred_at))
    .slice(0, limit);
}

