import React from "react";
import type { AnyRecord } from "../main-app-data";
import { persistedStorageKey, usePersistedState } from "../hooks/usePersistedState";
import type { NotificationSoundType, UserToastSettings } from "../types/settings";
import { playNotificationSound } from "../utils/notificationSounds";
import {
  appendNotificationLog,
  appendToastStack,
  claimNotificationSourceKey,
  createToastNotice,
  markNotificationsRead,
  type ToastKind,
  type ToastNotice,
} from "./toastNotices";

const notificationLogStorageKey = persistedStorageKey("notifications.log");

function notificationSourceKeys(notices: ToastNotice[]): Set<string> {
  return new Set(notices.map((notice) => notice.sourceKey).filter(Boolean) as string[]);
}

function parseStoredNotificationLog(value: string | null): ToastNotice[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as ToastNotice[] : null;
  } catch {
    return null;
  }
}

export type PushToastOptions = { occurredAt?: string; sourceKey?: string; metaLabel?: string; soundType?: NotificationSoundType };

export type PushToast = (
  title: string,
  body: string,
  kind: ToastKind,
  item?: AnyRecord | null,
  options?: PushToastOptions,
) => void;

export function useToastNotifications({ soundSettings }: { soundSettings: Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume" | "soundByType"> }) {
  const [toasts, setToasts] = React.useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = usePersistedState<ToastNotice[]>("notifications.log", []);
  const toastTimersRef = React.useRef<Map<string, number>>(new Map());
  const notificationSourceKeysRef = React.useRef<Set<string>>(notificationSourceKeys(notificationLog));

  const dismissToast = React.useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const markNotificationLogRead = React.useCallback(() => {
    setNotificationLog(markNotificationsRead);
  }, [setNotificationLog]);

  React.useEffect(() => {
    notificationSourceKeysRef.current = notificationSourceKeys(notificationLog);
  }, [notificationLog]);

  React.useEffect(() => {
    function syncNotificationLog(event: StorageEvent) {
      if (event.key !== notificationLogStorageKey) return;
      const nextLog = parseStoredNotificationLog(event.newValue);
      if (!nextLog) return;
      notificationSourceKeysRef.current = notificationSourceKeys(nextLog);
      setNotificationLog(nextLog);
    }
    window.addEventListener("storage", syncNotificationLog);
    return () => window.removeEventListener("storage", syncNotificationLog);
  }, [setNotificationLog]);

  const pushToast = React.useCallback<PushToast>((title, body, kind, item = null, options = {}) => {
    if (options.sourceKey && document.visibilityState === "hidden") return;
    if (options.sourceKey && notificationSourceKeysRef.current.has(options.sourceKey)) return;
    if (options.sourceKey && !claimNotificationSourceKey(options.sourceKey)) return;
    if (options.sourceKey) notificationSourceKeysRef.current.add(options.sourceKey);
    const id = `${Date.now()}-${Math.random()}`;
    const notice = createToastNotice({
      id,
      title,
      body,
      kind,
      occurredAt: options.occurredAt ?? new Date().toISOString(),
      item,
      sourceKey: options.sourceKey,
      metaLabel: options.metaLabel,
      soundType: options.soundType,
    });
    playNotificationSound(soundSettings, options.soundType);
    setToasts((current) => appendToastStack(current, notice));
    setNotificationLog((current) => appendNotificationLog(current, notice));
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((current) => current.filter((notice) => notice.id !== id));
    }, 7000);
    toastTimersRef.current.set(id, timer);
  }, [setNotificationLog, soundSettings]);

  React.useEffect(() => () => {
    for (const timer of toastTimersRef.current.values()) window.clearTimeout(timer);
    toastTimersRef.current.clear();
  }, []);

  return {
    dismissToast,
    markNotificationLogRead,
    notificationLog,
    pushToast,
    toasts,
  };
}
