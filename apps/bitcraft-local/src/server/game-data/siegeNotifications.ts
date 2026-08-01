type WireRecord = Record<string, unknown>;

export type SiegeNotificationKind =
  | "marked"
  | "started_attack"
  | "started_defense"
  | "attack_won"
  | "defense_won"
  | "attack_failed"
  | "defense_failed";

export type NormalizedSiegeNotification = {
  entityId: string;
  empireEntityId: string;
  kind: SiegeNotificationKind;
  occurredAt: string;
  replacements: [string, string];
};

export type SiegeOutcome = {
  eventKey: string;
  occurredAt: string;
  watchtowerLabel: string;
  encodedLocation: string;
  attackerEmpireEntityId: string;
  defenderEmpireEntityId: string;
  outcome: "attacker_won" | "defender_won";
};

const SIEGE_KINDS: Readonly<Record<string, SiegeNotificationKind>> = {
  MarkedForSiege: "marked",
  StartedSiege: "started_attack",
  StartedDefense: "started_defense",
  SuccessfulSiege: "attack_won",
  SuccessfulDefense: "defense_won",
  FailedSiege: "attack_failed",
  FailedDefense: "defense_failed",
};

function record(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as WireRecord;
}

function enumTag(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  const row = record(value, label);
  const tag = typeof row.tag === "string" ? row.tag.trim() : "";
  if (!tag) throw new TypeError(`${label} must have a tag.`);
  return tag;
}

function decimalId(value: unknown, label: string): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) return value;
  throw new TypeError(`${label} must be a non-negative decimal integer.`);
}

function occurredAt(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("Siege notification timestamp must be an integer number of seconds.");
  }
  const milliseconds = value * 1000;
  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < 946684800000
    || milliseconds > 4102444800000
  ) {
    throw new RangeError("Siege notification timestamp is outside the supported range.");
  }
  return new Date(milliseconds).toISOString();
}

function normalizeNotification(
  value: unknown,
  index: number,
  availableDescriptionTags: ReadonlySet<string>,
): NormalizedSiegeNotification {
  const row = record(value, `Siege notification row ${index}`);
  const tag = enumTag(
    row.notificationType ?? row.notification_type,
    `Siege notification row ${index} type`,
  );
  const kind = SIEGE_KINDS[tag];
  if (!kind) throw new TypeError(`Siege notification row ${index} has unsupported type ${tag}.`);
  if (!availableDescriptionTags.has(tag)) {
    throw new TypeError(`Siege notification description for ${tag} is unavailable.`);
  }
  const rawReplacements = row.textReplacement ?? row.text_replacement;
  if (
    !Array.isArray(rawReplacements)
    || rawReplacements.length !== 2
    || rawReplacements.some((entry) => typeof entry !== "string")
  ) {
    throw new TypeError(`Siege notification row ${index} must have exactly two string replacements.`);
  }
  return {
    entityId: decimalId(
      row.entityId ?? row.entity_id,
      `Siege notification row ${index} entity id`,
    ),
    empireEntityId: decimalId(
      row.empireEntityId ?? row.empire_entity_id,
      `Siege notification row ${index} empire id`,
    ),
    kind,
    occurredAt: occurredAt(row.timestamp),
    replacements: [rawReplacements[0], rawReplacements[1]],
  };
}

export function normalizeAndPairSiegeNotifications(
  descriptions: unknown[],
  values: unknown[],
): {
  notifications: NormalizedSiegeNotification[];
  outcomes: SiegeOutcome[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const descriptionCounts = new Map<string, number>();
  for (const [index, value] of descriptions.entries()) {
    try {
      const row = record(value, `Empire notification description row ${index}`);
      const tag = enumTag(
        row.notificationType ?? row.notification_type,
        `Empire notification description row ${index} type`,
      );
      if (SIEGE_KINDS[tag]) {
        descriptionCounts.set(tag, (descriptionCounts.get(tag) ?? 0) + 1);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  const availableDescriptionTags = new Set<string>();
  for (const [tag, count] of descriptionCounts) {
    if (count === 1) {
      availableDescriptionTags.add(tag);
    } else {
      warnings.push(`Duplicate Empire notification descriptions for ${tag}; that type was rejected.`);
    }
  }

  const idCounts = new Map<string, number>();
  for (const [index, value] of values.entries()) {
    try {
      const row = record(value, `Siege notification row ${index}`);
      const entityId = decimalId(
        row.entityId ?? row.entity_id,
        `Siege notification row ${index} entity id`,
      );
      idCounts.set(entityId, (idCounts.get(entityId) ?? 0) + 1);
    } catch {
      // Full row normalization below owns the actionable validation warning.
    }
  }
  const parsedNotifications: NormalizedSiegeNotification[] = [];
  for (const [index, value] of values.entries()) {
    try {
      parsedNotifications.push(normalizeNotification(value, index, availableDescriptionTags));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  const duplicateIds = [...idCounts]
    .filter(([, count]) => count > 1)
    .map(([entityId]) => entityId)
    .sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1));
  for (const entityId of duplicateIds) {
    warnings.push(`Duplicate siege notification entity ID ${entityId}; all duplicate rows were rejected.`);
  }
  const notifications = parsedNotifications.filter(
    (notification) => idCounts.get(notification.entityId) === 1,
  );

  const outcomes: SiegeOutcome[] = [];
  const byPair = new Map<string, NormalizedSiegeNotification[]>();
  for (const notification of notifications) {
    const pairKey = `${notification.occurredAt}\u0000${notification.replacements[0]}\u0000${notification.replacements[1]}`;
    const group = byPair.get(pairKey) ?? [];
    group.push(notification);
    byPair.set(pairKey, group);
  }
  for (const [pairKey, group] of byPair) {
    const terminal = group.filter((row) => (
      row.kind === "attack_won"
      || row.kind === "defense_failed"
      || row.kind === "attack_failed"
      || row.kind === "defense_won"
    ));
    if (terminal.length === 0) continue;
    const attack = terminal.find((row) => row.kind === "attack_won");
    const failedDefense = terminal.find((row) => row.kind === "defense_failed");
    const failedAttack = terminal.find((row) => row.kind === "attack_failed");
    const defense = terminal.find((row) => row.kind === "defense_won");
    if (terminal.length === 2 && attack && failedDefense) {
      outcomes.push({
        eventKey: pairKey,
        occurredAt: attack.occurredAt,
        watchtowerLabel: attack.replacements[0],
        encodedLocation: attack.replacements[1],
        attackerEmpireEntityId: attack.empireEntityId,
        defenderEmpireEntityId: failedDefense.empireEntityId,
        outcome: "attacker_won",
      });
    } else if (terminal.length === 2 && failedAttack && defense) {
      outcomes.push({
        eventKey: pairKey,
        occurredAt: failedAttack.occurredAt,
        watchtowerLabel: failedAttack.replacements[0],
        encodedLocation: failedAttack.replacements[1],
        attackerEmpireEntityId: failedAttack.empireEntityId,
        defenderEmpireEntityId: defense.empireEntityId,
        outcome: "defender_won",
      });
    } else {
      warnings.push(
        `${terminal.length === 1 ? "Unmatched" : "Ambiguous"} siege outcome notifications at ${terminal[0].occurredAt}.`,
      );
    }
  }
  return { notifications, outcomes, warnings };
}
