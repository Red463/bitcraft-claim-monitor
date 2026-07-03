import type { NotificationSoundId, NotificationSoundType, UserToastSettings } from "../types/settings";
import { normalizeNotificationSoundSettings, resolveNotificationSoundSettings, type NotificationSoundSettings } from "../notifications/userToastSettings.ts";

export type { NotificationSoundSettings };
export type NotificationSoundOption = { id: NotificationSoundId; label: string; description: string };

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
];

type ToneStep = { frequency: number; start: number; duration: number; type?: OscillatorType; gain?: number };

const SOUND_PATTERNS: Record<NotificationSoundId, ToneStep[]> = {
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
  void playGeneratedSound(normalized.soundId, normalized.soundVolume);
}

export function previewNotificationSound(settings: Pick<UserToastSettings, "soundId" | "soundVolume">) {
  const normalized = normalizeNotificationSoundSettings({ soundEnabled: true, ...settings });
  void playGeneratedSound(normalized.soundId, normalized.soundVolume);
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

    for (const step of SOUND_PATTERNS[soundId]) {
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
