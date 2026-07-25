import type { ActivePanel } from "../types/app";
import { urlPanel } from "../navigation";

export type AnalyticsConsent = "accepted" | "declined" | null;

const ANALYTICS_CONSENT_COOKIE = "claim_monitor_analytics_consent_v2";
const ANALYTICS_VISITOR_COOKIE = "claim_monitor_analytics_visitor";
const ANALYTICS_SESSION_KEY = "claim-monitor.analytics.session";
const LOCAL_API = "/api/local";

let analyticsConsent: AnalyticsConsent = null;

function getCookie(name: string): string {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

export function readAnalyticsConsent(): AnalyticsConsent {
  const consent = getCookie(ANALYTICS_CONSENT_COOKIE);
  return consent === "accepted" || consent === "declined" ? consent : null;
}

function cookieSuffix(maxAge: number): string {
  return `; Path=/; SameSite=Lax; Max-Age=${maxAge}${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

export function syncAnalyticsConsent(consent: AnalyticsConsent) {
  analyticsConsent = consent;
}

export function setAnalyticsPreference(consent: Exclude<AnalyticsConsent, null>) {
  analyticsConsent = consent;
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${consent}${cookieSuffix(180 * 24 * 60 * 60)}`;
  if (consent === "declined") {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${cookieSuffix(0)}`;
    window.sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
  } else if (!getCookie(ANALYTICS_VISITOR_COOKIE)) {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${crypto.randomUUID()}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
}

export function currentAnalyticsSessionId(): string {
  return window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) ?? "";
}

export function withdrawAnalyticsConsent() {
  analyticsConsent = null;
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${cookieSuffix(0)}`;
  document.cookie = `claim_monitor_analytics_consent=${cookieSuffix(0)}`;
  document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${cookieSuffix(0)}`;
  window.sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
}

function analyticsSessionId(): string | null {
  if (analyticsConsent !== "accepted") return null;
  let visitorId = getCookie(ANALYTICS_VISITOR_COOKIE);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${visitorId}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
  let sessionId = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) ?? "";
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function trackAnalyticsEvent(eventName: string, properties?: Record<string, string | number | boolean>, durationSeconds?: number, pageOverride?: ActivePanel) {
  const sessionId = analyticsSessionId();
  if (!sessionId) return;
  const page = pageOverride ?? urlPanel() ?? "dashboard";
  if (page === "admin") return;
  void fetch(`${LOCAL_API}/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ sessionId, eventName, page, properties, durationSeconds }),
  }).catch(() => undefined);
}
