export const RELAY_RECONNECT_BASE_DELAYS_MS = Object.freeze([
  1_000,
  2_000,
  4_000,
  8_000,
  16_000,
  30_000,
]);

export function relayReconnectDelayMs(failureCount, random = Math.random) {
  const attempt = Math.max(1, Math.trunc(Number(failureCount) || 1));
  const base = RELAY_RECONNECT_BASE_DELAYS_MS[
    Math.min(attempt - 1, RELAY_RECONNECT_BASE_DELAYS_MS.length - 1)
  ];
  const unit = Math.min(1, Math.max(0, Number(random()) || 0));
  return Math.round(base * (0.8 + (unit * 0.4)));
}
