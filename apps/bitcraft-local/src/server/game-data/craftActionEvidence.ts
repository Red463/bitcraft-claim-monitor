import type { ContributionTarget } from "./craftContributionAttribution.ts";

export type RetainedCraftAction = {
  playerEntityId: string;
  buildingEntityId: string;
  recipeId: string;
  autoId: string;
  startTimeMs: number;
  expiresAtMs: number;
};

type RecordValue = Record<string, unknown>;

const ACTION_TOLERANCE_MS = 5_000;
const MAX_RETAINED_ACTIONS = 2_048;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" ? value as RecordValue : null;
}

function decimal(value: unknown): string | null {
  if (typeof value === "bigint") return value >= 0n ? value.toString() : null;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value).toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function milliseconds(value: unknown): number | null {
  const canonical = decimal(value);
  if (canonical === null) return null;
  const numberValue = Number(canonical);
  return Number.isSafeInteger(numberValue) ? numberValue : null;
}

function tag(row: RecordValue, field: string): string | null {
  const value = record(row[field])?.tag;
  return typeof value === "string" ? value.toLowerCase().replace(/[_-]/g, "") : null;
}

function canonicalAction(value: unknown): RetainedCraftAction | null {
  const row = record(value);
  if (!row || row.clientCancel !== false || row.wasConsumed !== false
    || tag(row, "actionType") !== "craft" || tag(row, "lastActionResult") !== "success") {
    return null;
  }
  const playerEntityId = decimal(row.entityId);
  const buildingEntityId = decimal(row.target);
  const recipeId = decimal(row.recipeId);
  const autoId = decimal(row.autoId);
  const startTimeMs = milliseconds(row.startTime);
  const durationMs = milliseconds(row.duration);
  if (!playerEntityId || !buildingEntityId || !recipeId || !autoId || startTimeMs === null
    || durationMs === null || startTimeMs > Number.MAX_SAFE_INTEGER - durationMs - ACTION_TOLERANCE_MS) {
    return null;
  }
  return {
    playerEntityId,
    buildingEntityId,
    recipeId,
    autoId,
    startTimeMs,
    expiresAtMs: startTimeMs + durationMs + ACTION_TOLERANCE_MS,
  };
}

function keyFor(action: RetainedCraftAction): string {
  return [action.playerEntityId, action.buildingEntityId, action.recipeId, action.autoId, action.startTimeMs].join(":");
}

export class CraftActionEvidenceCache {
  #actions = new Map<string, RetainedCraftAction>();

  upsert(row: unknown, observedAtMs: number): void {
    this.#store(row, observedAtMs);
  }

  retainDeleted(row: unknown, observedAtMs: number): void {
    this.#store(row, observedAtMs);
  }

  matches(target: ContributionTarget, observedAtMs: number): RetainedCraftAction[] {
    this.prune(observedAtMs);
    return [...this.#actions.values()].filter((action) => (
      action.buildingEntityId === target.buildingEntityId
      && action.recipeId === target.recipeId
      && observedAtMs >= action.startTimeMs
      && observedAtMs <= action.expiresAtMs
    ));
  }

  prune(observedAtMs: number): void {
    if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
      throw new TypeError("Observed time must be a non-negative safe integer");
    }
    for (const [key, action] of this.#actions) {
      if (action.expiresAtMs < observedAtMs) this.#actions.delete(key);
    }
  }

  #store(row: unknown, observedAtMs: number): void {
    this.prune(observedAtMs);
    const action = canonicalAction(row);
    if (!action) return;
    const key = keyFor(action);
    this.#actions.delete(key);
    this.#actions.set(key, action);
    while (this.#actions.size > MAX_RETAINED_ACTIONS) {
      const oldest = this.#actions.keys().next().value;
      if (oldest === undefined) return;
      this.#actions.delete(oldest);
    }
  }
}
