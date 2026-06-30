import type { NotificationSoundId, UserToastSettings } from "../types/settings";

export type NotificationSoundSettings = Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume">;

export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
  soundEnabled: true,
  soundId: "alert-pop",
  soundVolume: 0.55,
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
  "success-chime",
  "warning-blip",
  "soft-bell",
  "urgent-pulse",
  "crystal-tap",
  "low-thud",
  "arcade-beep",
]);

function clampVolume(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_NOTIFICATION_SOUND_SETTINGS.soundVolume;
  return Math.max(0, Math.min(1, number));
}

function isNotificationSoundId(value: unknown): value is NotificationSoundId {
  return typeof value === "string" && NOTIFICATION_SOUND_IDS.has(value as NotificationSoundId);
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