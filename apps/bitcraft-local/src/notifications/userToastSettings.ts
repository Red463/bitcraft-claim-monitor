import type { NotificationSoundId, NotificationSoundType, UserToastSettings } from "../types/settings";

export type NotificationSoundSettings = Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume" | "soundByType">;

export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
  soundEnabled: true,
  soundId: "alert-pop",
  soundVolume: 0.55,
  soundByType: {},
};

export const DEFAULT_USER_TOAST_SETTINGS: UserToastSettings = {
  marketListings: true,
  marketSales: true,
  production: true,
  ...DEFAULT_NOTIFICATION_SOUND_SETTINGS,
};

const NOTIFICATION_SOUND_IDS: ReadonlySet<NotificationSoundId> = new Set([
  "soft-chime",
  "clear-ping",
  "deep-bell",
  "alert-pop",
  "bright-ping",
  "double-ping",
  "coin-ding",
  "coin-jingle",
  "success-chime",
  "warning-blip",
  "soft-bell",
  "urgent-pulse",
  "crystal-tap",
  "low-thud",
  "arcade-beep",
  "reverse-chime",
  "ui-pop",
  "ui-pack-pop",
  "coin-clink-4",
  "coin-clink-8",
  "coin-clink-9",
  "ui-blip",
  "new-notification-1",
  "notification-bell",
  "confirm-tap",
  "happy-pop",
  "drop-coin",
  "simple-ping",
  "cash-register",
  "plopp",
  "interface-click",
  "bubble-pop-soft",
  "bubble-pop",
  "notification-010",
  "notification-035",
  "notification-040",
  "notification-047",
  "notification-062",
  "notification-beep",
]);

const NOTIFICATION_SOUND_TYPES: ReadonlySet<NotificationSoundType> = new Set([
  "marketListings",
  "marketSales",
  "dealAlerts",
  "productionStarted",
  "productionCompleted",
]);

function clampVolume(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_NOTIFICATION_SOUND_SETTINGS.soundVolume;
  return Math.max(0, Math.min(1, number));
}

function isNotificationSoundId(value: unknown): value is NotificationSoundId {
  return typeof value === "string" && NOTIFICATION_SOUND_IDS.has(value as NotificationSoundId);
}

function isNotificationSoundType(value: unknown): value is NotificationSoundType {
  return typeof value === "string" && NOTIFICATION_SOUND_TYPES.has(value as NotificationSoundType);
}

function normalizeSoundByType(value: unknown): Partial<Record<NotificationSoundType, NotificationSoundId>> {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const output: Partial<Record<NotificationSoundType, NotificationSoundId>> = {};
  for (const [key, soundId] of Object.entries(input)) {
    if (isNotificationSoundType(key) && isNotificationSoundId(soundId)) output[key] = soundId;
  }
  return output;
}

function booleanSetting(input: Record<string, unknown>, key: keyof Pick<UserToastSettings, "marketListings" | "marketSales" | "production">): boolean {
  return typeof input[key] === "boolean" ? input[key] : DEFAULT_USER_TOAST_SETTINGS[key];
}

export function normalizeNotificationSoundSettings(settings: unknown): NotificationSoundSettings {
  const input = settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
  return {
    soundEnabled: typeof input.soundEnabled === "boolean" ? input.soundEnabled : DEFAULT_NOTIFICATION_SOUND_SETTINGS.soundEnabled,
    soundId: isNotificationSoundId(input.soundId) ? input.soundId : DEFAULT_NOTIFICATION_SOUND_SETTINGS.soundId,
    soundVolume: clampVolume(input.soundVolume),
    soundByType: normalizeSoundByType(input.soundByType),
  };
}

export function normalizeUserToastSettings(settings: unknown): UserToastSettings {
  const input = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  return {
    marketListings: booleanSetting(input, "marketListings"),
    marketSales: booleanSetting(input, "marketSales"),
    production: booleanSetting(input, "production"),
    ...normalizeNotificationSoundSettings(input),
  };
}

export function resolveNotificationSoundSettings(settings: unknown, soundType?: NotificationSoundType): NotificationSoundSettings {
  const normalized = normalizeNotificationSoundSettings(settings);
  const soundId = soundType ? normalized.soundByType[soundType] : undefined;
  return soundId ? { ...normalized, soundId } : normalized;
}
