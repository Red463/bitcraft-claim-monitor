import type { AnyRecord } from "../main-app-data";
import type { AppSettings } from "../types/settings";
import { normalizeAppSettings } from "../utils/appSettings";

const LOCAL_API = "/api/local";

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new Error(body?.error ?? `${fallback} (HTTP ${response.status})`);
}

export async function loadAdminConsoleSession(fetchImpl: typeof fetch = fetch): Promise<{
  auth: AnyRecord;
  settings: AppSettings | null;
}> {
  const authResponse = await fetchImpl(`${LOCAL_API}/admin/me`, { cache: "no-store" });
  if (!authResponse.ok) throw await responseError(authResponse, "Unable to verify the administrator session");
  const auth = await authResponse.json() as AnyRecord;
  if (!auth?.authenticated) return { auth, settings: null };

  const settingsResponse = await fetchImpl(`${LOCAL_API}/admin/settings`, { cache: "no-store" });
  if (!settingsResponse.ok) throw await responseError(settingsResponse, "Unable to load protected administrator settings");
  return {
    auth,
    settings: normalizeAppSettings(await settingsResponse.json()),
  };
}
