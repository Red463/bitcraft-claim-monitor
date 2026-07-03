import React from "react";
import type { AnyRecord } from "../main-app-data";
import { usePersistedState } from "../hooks/usePersistedState";
import type { UserToastSettings } from "../types/settings";
import { playNotificationSound } from "../utils/notificationSounds";
import {
  appendNotificationLog,
  appendToastStack,
  createToastNotice,
  markNotificationsRead,
  type ToastKind,
  type ToastNotice,
} from "./toastNotices";

export type PushToastOptions = { occurredAt?: string; sourceKey?: string; metaLabel?: string };

export type PushToast = (
  title: string,
  body: string,
  kind: ToastKind,
  item?: AnyRecord | null,
  options?: PushToastOptions,
) => void;

export function useToastNotifications({ soundSettings }: { soundSettings: Pick<UserToastSettings, "soundEnabled" | "soundId" | "soundVolume"> }) {
  const [toasts, setToasts] = React.useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = usePersistedState<ToastNotice[]>("notifications.log", []);
  const toastTimersRef = React.useRef<Map<string, number>>(new Map());
  const notificationSourceKeysRef = React.useRef<Set<string>>(new Set(notificationLog.map((notice) => notice.sourceKey).filter(Boolean) as string[]));

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
    notificationSourceKeysRef.current = new Set(notificationLog.map((notice) => notice.sourceKey).filter(Boolean) as string[]);
  }, [notificationLog]);

  const pushToast = React.useCallback<PushToast>((title, body, kind, item = null, options = {}) => {
    if (options.sourceKey && notificationSourceKeysRef.current.has(options.sourceKey)) return;
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
    });
    playNotificationSound(soundSettings);
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
