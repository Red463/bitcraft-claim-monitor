import type { NotificationSoundId, UserToastSettings } from "../types/settings";

export type NotificationSoundOption = { id: NotificationSoundId; label: string; description: string };

export const NOTIFICATION_SOUND_OPTIONS: NotificationSoundOption[] = [
  { id: "soft-chime", label: "Soft chime", description: "Warm two-note chime" },
  { id: "clear-ping", label: "Clear ping", description: "Bright compact ping" },
  { id: "deep-bell", label: "Deep bell", description: "Lower alert bell" },
  { id: "alert-pop", label: "Alert pop", description: "Short crisp pop" },
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
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

function clampVolume(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0.55;
  return Math.max(0, Math.min(1, number));
}

export function playNotificationSound(settings: Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume">) {
  if (!settings.soundEnabled) return;
  void playGeneratedSound(settings.soundId, settings.soundVolume);
}

export function previewNotificationSound(settings: Pick<UserToastSettings, "soundId" | "soundVolume">) {
  void playGeneratedSound(settings.soundId, settings.soundVolume);
}

async function playGeneratedSound(soundId: NotificationSoundId, volume: number) {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(clampVolume(volume), now);
    master.connect(context.destination);

    for (const step of SOUND_PATTERNS[soundId] ?? SOUND_PATTERNS["soft-chime"]) {
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