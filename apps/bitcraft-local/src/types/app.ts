import type { AnyRecord } from "../main-app-data";

export type ActivePanel =
  | "dashboard"
  | "leaderboard"
  | "members"
  | "skills"
  | "production"
  | "publiccrafts"
  | "craftcalc"
  | "inventory"
  | "construction"
  | "research"
  | "market"
  | "empire"
  | "empires"
  | "map"
  | "sync"
  | "activity"
  | "admin";

export type LoadState<T> = { data: T | null; error: string | null; loading: boolean; updatedAt?: string | null; cacheState?: string | null; stale?: boolean };

export type LocalHistoryState = {
  market: AnyRecord | null;
  activity: AnyRecord[];
  activityTotal: number;
  snapshots: AnyRecord[];
  dashboard: AnyRecord | null;
  error: string | null;
  refreshToken: number;
};

export type NotificationActivityState = {
  events: AnyRecord[];
  total: number;
  error: string | null;
  refreshToken: number;
};
