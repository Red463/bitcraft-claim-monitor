export function parseRetryAfterMs(value, nowMs = Date.now()) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(text);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Number(nowMs)) : 0;
}
