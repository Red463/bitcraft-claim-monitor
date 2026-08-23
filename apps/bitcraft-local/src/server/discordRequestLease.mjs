export function requireDiscordDeliveryLease(deliveryLease) {
  if (deliveryLease && !deliveryLease.beforeRequest()) {
    throw new Error("Discord outbox lease ownership was lost before network delivery");
  }
}

export async function fetchDiscordWithLease(input, init = {}, {
  deliveryLease = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireDiscordDeliveryLease(deliveryLease);
  return fetchImpl(input, init);
}
