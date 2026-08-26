export function createRelayClaimScopeFence(runtimes) {
  const scopedRuntimes = Array.isArray(runtimes) ? [...runtimes] : [];
  let activeClaimId = null;
  let tail = Promise.resolve();

  const reconcile = (nextClaimIdValue) => {
    const nextClaimId = String(nextClaimIdValue ?? "").trim();
    if (!/^\d+$/.test(nextClaimId)) {
      return Promise.reject(new TypeError("Relay claim scope must be a decimal claim id"));
    }
    const task = tail.then(async () => {
      if (activeClaimId == null) {
        activeClaimId = nextClaimId;
        return false;
      }
      if (activeClaimId === nextClaimId) return false;
      const previousClaimId = activeClaimId;
      const results = await Promise.allSettled(
        scopedRuntimes.map((runtime) => runtime.stop()),
      );
      const failures = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason);
      if (failures.length) {
        throw new AggregateError(
          failures,
          `Failed to fence Relay claim ${previousClaimId} before switching to ${nextClaimId}`,
        );
      }
      activeClaimId = nextClaimId;
      return true;
    });
    tail = task.catch(() => {});
    return task;
  };

  const run = (claimIdValue, operation) => {
    const claimId = String(claimIdValue ?? "").trim();
    if (!/^\d+$/.test(claimId)) {
      return Promise.reject(new TypeError("Relay claim scope must be a decimal claim id"));
    }
    if (typeof operation !== "function") {
      return Promise.reject(new TypeError("Relay claim scope operation must be a function"));
    }
    const task = tail.then(async () => {
      if (activeClaimId !== claimId) return false;
      await operation();
      return true;
    });
    tail = task.catch(() => {});
    return task;
  };

  return {
    reconcile,
    run,
    activeClaimId: () => activeClaimId,
  };
}
