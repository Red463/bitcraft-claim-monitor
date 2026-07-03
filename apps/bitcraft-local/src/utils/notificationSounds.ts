import type { NotificationSoundId, NotificationSoundType, UserToastSettings } from "../types/settings";
import { normalizeNotificationSoundSettings, resolveNotificationSoundSettings, type NotificationSoundSettings } from "../notifications/userToastSettings.ts";

export type { NotificationSoundSettings };
export type NotificationSoundOption = { id: NotificationSoundId; label: string; description: string; src?: string };

export const NOTIFICATION_SOUND_OPTIONS: NotificationSoundOption[] = [
  { id: "soft-chime", label: "Soft chime", description: "Warm two-note chime" },
  { id: "clear-ping", label: "Clear ping", description: "Bright compact ping" },
  { id: "deep-bell", label: "Deep bell", description: "Lower alert bell" },
  { id: "alert-pop", label: "Alert pop", description: "Short crisp pop" },
  { id: "bright-ping", label: "Bright ping", description: "High clean ping" },
  { id: "double-ping", label: "Double ping", description: "Two quick bright pings" },
  { id: "coin-ding", label: "Coin ding", description: "Market-style coin sound" },
  { id: "coin-jingle", label: "Coin jingle", description: "Fuller coin drop and jingle" },
  { id: "success-chime", label: "Success chime", description: "Positive rising chime" },
  { id: "warning-blip", label: "Warning blip", description: "Short attention blip" },
  { id: "soft-bell", label: "Soft bell", description: "Gentle rounded bell" },
  { id: "urgent-pulse", label: "Urgent pulse", description: "Fast repeating alert" },
  { id: "crystal-tap", label: "Crystal tap", description: "Light glassy tap" },
  { id: "low-thud", label: "Low thud", description: "Subtle low notification" },
  { id: "arcade-beep", label: "Arcade beep", description: "Retro square beep" },
  { id: "reverse-chime", label: "Reverse chime", description: "Soft reversed notification swell", src: "/sounds/notifications/reverse-chime.mp3" },
  { id: "ui-pop", label: "UI pop", description: "Clean app pop", src: "/sounds/notifications/ui-pop.mp3" },
  { id: "ui-pack-pop", label: "UI pack pop", description: "Rounded UI pop", src: "/sounds/notifications/ui-pack-pop.mp3" },
  { id: "coin-clink-4", label: "Coin clink 4", description: "Light coin clink", src: "/sounds/notifications/coin-clink-4.mp3" },
  { id: "coin-clink-8", label: "Coin clink 8", description: "Bright coin clink", src: "/sounds/notifications/coin-clink-8.mp3" },
  { id: "coin-clink-9", label: "Coin clink 9", description: "Crisp coin clink", src: "/sounds/notifications/coin-clink-9.wav" },
  { id: "ui-blip", label: "UI blip", description: "Short interface blip", src: "/sounds/notifications/ui-blip.mp3" },
  { id: "new-notification-1", label: "New notification", description: "Polished notification tone", src: "/sounds/notifications/new-notification-1.mp3" },
  { id: "notification-bell", label: "Notification bell", description: "Classic notification bell", src: "/sounds/notifications/notification-bell.mp3" },
  { id: "confirm-tap", label: "Confirm tap", description: "Subtle confirmation tap", src: "/sounds/notifications/confirm-tap.mp3" },
  { id: "happy-pop", label: "Happy pop", description: "Positive pop", src: "/sounds/notifications/happy-pop.mp3" },
  { id: "drop-coin", label: "Drop coin", description: "Single dropped coin", src: "/sounds/notifications/drop-coin.mp3" },
  { id: "simple-ping", label: "Simple ping", description: "Menu beep ping", src: "/sounds/notifications/simple-ping.mp3" },
  { id: "cash-register", label: "Cash register", description: "Till ring for confirmed sales", src: "/sounds/notifications/cash-register.mp3" },
  { id: "plopp", label: "Plopp", description: "Soft plop pop", src: "/sounds/notifications/plopp.mp3" },
  { id: "interface-click", label: "Interface click", description: "App interface click", src: "/sounds/notifications/interface-click.mp3" },
  { id: "bubble-pop-soft", label: "Bubble pop soft", description: "Soft bubble pop", src: "/sounds/notifications/bubble-pop-soft.mp3" },
  { id: "bubble-pop", label: "Bubble pop", description: "Bubble pop", src: "/sounds/notifications/bubble-pop.mp3" },
  { id: "notification-010", label: "Notification 010", description: "Notification tone 010", src: "/sounds/notifications/notification-010.mp3" },
  { id: "notification-035", label: "Notification 035", description: "Notification tone 035", src: "/sounds/notifications/notification-035.mp3" },
  { id: "notification-040", label: "Notification 040", description: "Notification tone 040", src: "/sounds/notifications/notification-040.mp3" },
  { id: "notification-047", label: "Notification 047", description: "Notification tone 047", src: "/sounds/notifications/notification-047.mp3" },
  { id: "notification-062", label: "Notification 062", description: "Notification tone 062", src: "/sounds/notifications/notification-062.mp3" },
  { id: "notification-beep", label: "Notification beep", description: "Compact notification beep", src: "/sounds/notifications/notification-beep.mp3" },
];

type ToneStep = { frequency: number; start: number; duration: number; type?: OscillatorType; gain?: number };

const DEFAULT_GENERATED_SOUND_ID: NotificationSoundId = "alert-pop";

const SOUND_PATTERNS: Partial<Record<NotificationSoundId, ToneStep[]>> = {
  "soft-chime": [
    { frequency: 660, start: 0, duration: 0.16, type: "sine", gain: 0.7 },
    { frequency: 880, start: 0.13, duration: 0.22, type: "sine", gain: 0.55 },
  ],
  "clear-ping": [
    { frequency: 1046.5, start: 0, duration: 0.18, type: "triangle", gain: 0.7 },
  ],
  "deep-bell": [
    { frequency: 392, start: 0, duration: 0.26, type: "sine", gain: 0.75 },
    { frequency: 523.25, start: 0.08, duration: 0.28, type: "sine", gain: 0.45 },
  ],
  "alert-pop": [
    { frequency: 740, start: 0, duration: 0.08, type: "square", gain: 0.35 },
    { frequency: 988, start: 0.08, duration: 0.09, type: "triangle", gain: 0.6 },
  ],
  "bright-ping": [
    { frequency: 1174.66, start: 0, duration: 0.16, type: "triangle", gain: 0.78 },
  ],
  "double-ping": [
    { frequency: 880, start: 0, duration: 0.09, type: "sine", gain: 0.68 },
    { frequency: 1174.66, start: 0.12, duration: 0.11, type: "sine", gain: 0.62 },
  ],
  "coin-ding": [
    { frequency: 1318.51, start: 0, duration: 0.08, type: "triangle", gain: 0.58 },
    { frequency: 1760, start: 0.055, duration: 0.16, type: "sine", gain: 0.42 },
  ],
  "coin-jingle": [
    { frequency: 1567.98, start: 0, duration: 0.07, type: "triangle", gain: 0.46 },
    { frequency: 2093, start: 0.045, duration: 0.08, type: "sine", gain: 0.38 },
    { frequency: 1760, start: 0.105, duration: 0.1, type: "triangle", gain: 0.32 },
    { frequency: 2349.32, start: 0.16, duration: 0.09, type: "sine", gain: 0.24 },
  ],
  "success-chime": [
    { frequency: 523.25, start: 0, duration: 0.13, type: "sine", gain: 0.55 },
    { frequency: 659.25, start: 0.11, duration: 0.15, type: "sine", gain: 0.55 },
    { frequency: 783.99, start: 0.22, duration: 0.18, type: "sine", gain: 0.5 },
  ],
  "warning-blip": [
    { frequency: 554.37, start: 0, duration: 0.1, type: "sawtooth", gain: 0.36 },
    { frequency: 466.16, start: 0.1, duration: 0.12, type: "square", gain: 0.3 },
  ],
  "soft-bell": [
    { frequency: 587.33, start: 0, duration: 0.28, type: "sine", gain: 0.5 },
    { frequency: 880, start: 0.02, duration: 0.22, type: "sine", gain: 0.25 },
  ],
  "urgent-pulse": [
    { frequency: 784, start: 0, duration: 0.07, type: "square", gain: 0.32 },
    { frequency: 784, start: 0.1, duration: 0.07, type: "square", gain: 0.32 },
    { frequency: 988, start: 0.2, duration: 0.08, type: "square", gain: 0.3 },
  ],
  "crystal-tap": [
    { frequency: 1567.98, start: 0, duration: 0.09, type: "triangle", gain: 0.48 },
    { frequency: 2093, start: 0.025, duration: 0.1, type: "sine", gain: 0.22 },
  ],
  "low-thud": [
    { frequency: 164.81, start: 0, duration: 0.12, type: "sine", gain: 0.7 },
    { frequency: 220, start: 0.03, duration: 0.11, type: "triangle", gain: 0.32 },
  ],
  "arcade-beep": [
    { frequency: 659.25, start: 0, duration: 0.09, type: "square", gain: 0.25 },
    { frequency: 987.77, start: 0.095, duration: 0.11, type: "square", gain: 0.22 },
  ],
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

export function playNotificationSound(settings: Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume" | "soundByType">, soundType?: NotificationSoundType) {
  const normalized = resolveNotificationSoundSettings(settings, soundType);
  if (!normalized.soundEnabled) return;
  void playResolvedSound(normalized.soundId, normalized.soundVolume);
}

export function previewNotificationSound(settings: Pick<UserToastSettings, "soundId" | "soundVolume">) {
  const normalized = normalizeNotificationSoundSettings({ soundEnabled: true, ...settings });
  void playResolvedSound(normalized.soundId, normalized.soundVolume);
}

function notificationSoundSource(soundId: NotificationSoundId): string | null {
  return NOTIFICATION_SOUND_OPTIONS.find((sound) => sound.id === soundId)?.src ?? null;
}

async function playResolvedSound(soundId: NotificationSoundId, volume: number) {
  const src = notificationSoundSource(soundId);
  if (src) {
    await playAudioFile(src, volume);
    return;
  }
  await playGeneratedSound(soundId, volume);
}

async function playAudioFile(src: string, volume: number) {
  try {
    if (typeof window === "undefined" || !window.Audio) return;
    const audio = new window.Audio(src);
    audio.volume = volume;
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Browsers can block audio until user interaction; notifications should still work silently.
  }
}
async function playGeneratedSound(soundId: NotificationSoundId, volume: number) {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(volume, now);
    master.connect(context.destination);

    for (const step of SOUND_PATTERNS[soundId] ?? SOUND_PATTERNS[DEFAULT_GENERATED_SOUND_ID] ?? []) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + step.start;
      const end = start + step.duration;
      oscillator.type = step.type ?? "sine";
      oscillator.frequency.setValueAtTime(step.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, step.gain ?? 0.6), start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  } catch {
    // Browsers can block audio until user interaction; notifications should still work silently.
  }
}
