export function claimPendingAction(pending: Set<string>, key: string): boolean {
  if (pending.has(key)) return false;
  pending.add(key);
  return true;
}

export function releasePendingAction(pending: Set<string>, key: string): void {
  pending.delete(key);
}
