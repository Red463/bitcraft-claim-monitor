import React from "react";

const STORAGE_PREFIX = "claim-monitor.";

/**
 * Persists browser-only preferences such as collapsed navigation and selected
 * filters. This intentionally uses localStorage rather than analytics cookies so
 * usability preferences still work when a visitor declines analytics tracking.
 */
export function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return saved == null ? initialValue : JSON.parse(saved) as T;
    } catch {
      return initialValue;
    }
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // Storage can be blocked without affecting the dashboard.
    }
  }, [key, value]);
  return [value, setValue];
}

export function hasPersistedState(key: string): boolean {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) != null;
  } catch {
    return false;
  }
}

export function clearBrowserLocalSettings() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked without affecting the dashboard.
  }
}
