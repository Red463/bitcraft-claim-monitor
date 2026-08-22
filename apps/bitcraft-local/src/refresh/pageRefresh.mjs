export const PAGE_REFRESH_POLL_MS = 1_000;
export const PAGE_REFRESH_COALESCE_MS = 2_000;
export const PAGE_REFRESH_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000];

const INTERVAL_PAGES = new Set([
  "dashboard",
  "members",
  "skills",
  "leaderboard",
  "planning",
  "inventory",
  "construction",
  "research",
  "market",
  "settlement-market",
  "region",
  "empires",
  "map",
  "activity",
  "publiccrafts",
]);

export function pageRefreshPolicy(page) {
  if (page === "craft-monitor") {
    return { mode: "near-live", coalesceMs: PAGE_REFRESH_COALESCE_MS };
  }
  if (page === "craftcalc" || page === "sync") return { mode: "manual" };
  return { mode: INTERVAL_PAGES.has(page) ? "interval" : "manual" };
}

export function pageRefreshShowsRetainedDataProgress(cycle) {
  return cycle?.reason === "manual";
}

export function createDelayedRefreshTask(start, delayMs, options = {}) {
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  let timer = null;
  let started = false;
  let rejectTask = () => {};
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    timer = setTimer(() => {
      started = true;
      Promise.resolve().then(start).then(resolve, reject);
    }, delayMs);
  });
  return {
    promise,
    cancel() {
      if (started || timer === null) return;
      clearTimer(timer);
      timer = null;
      const error = new Error("Delayed refresh task cancelled");
      error.name = "AbortError";
      rejectTask(error);
    },
  };
}

export function createPageRefreshCycle(page, sequence, reason, options = {}) {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  return {
    id: String(createId()),
    page: String(page ?? ""),
    sequence: Number(sequence ?? 0),
    reason,
    requestedAt: Number(now()),
  };
}

export function pageRefreshHeaders(cycle, page) {
  return cycle?.reason === "manual" && cycle.id && cycle.page === page
    ? { "x-manual-refresh-id": cycle.id }
    : {};
}

function refreshErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Refresh failed");
}

export function createPageRefreshTaskCoordinator(options = {}) {
  const now = options.now ?? Date.now;
  const onStateChange = options.onStateChange ?? (() => {});
  const onComplete = options.onComplete ?? (() => {});
  let cycle = null;
  let status = "idle";
  let sealed = false;
  let pendingTasks = new Map();
  let errors = [];
  let lastSuccessfulAt = null;

  function snapshot() {
    return {
      cycleId: cycle?.id ?? "",
      status,
      pendingTasks: [...pendingTasks.keys()],
      errors: [...errors],
      lastSuccessfulAt,
      visibleProgress: status === "refreshing" && (cycle?.reason === "initial" || cycle?.reason === "manual"),
    };
  }

  function emit() {
    onStateChange(snapshot());
  }

  function completeIfReady() {
    if (status !== "refreshing" || !sealed || pendingTasks.size > 0 || !cycle) return;
    status = "complete";
    const succeeded = errors.length === 0;
    if (succeeded) lastSuccessfulAt = now();
    const completedCycle = cycle;
    emit();
    onComplete(completedCycle, succeeded);
  }

  function beginCycle(nextCycle) {
    cycle = nextCycle;
    status = "refreshing";
    sealed = false;
    pendingTasks = new Map();
    errors = [];
    emit();
  }

  function beginTask(cycleId, taskKey) {
    const expectedCycleId = String(cycleId ?? "");
    const key = String(taskKey ?? "task");
    if (!cycle || expectedCycleId !== cycle.id || status !== "refreshing" || sealed) return () => {};
    pendingTasks.set(key, (pendingTasks.get(key) ?? 0) + 1);
    emit();
    let finished = false;
    return (error) => {
      if (finished || !cycle || expectedCycleId !== cycle.id) return;
      finished = true;
      const remaining = (pendingTasks.get(key) ?? 1) - 1;
      if (remaining > 0) pendingTasks.set(key, remaining);
      else pendingTasks.delete(key);
      if (error && error?.name !== "AbortError") errors.push(refreshErrorMessage(error));
      completeIfReady();
      emit();
    };
  }

  function seal(cycleId) {
    if (!cycle || String(cycleId ?? "") !== cycle.id || status !== "refreshing") return;
    sealed = true;
    completeIfReady();
    emit();
  }

  function trackPromise(cycleId, taskKey, promise) {
    const finish = beginTask(cycleId, taskKey);
    return promise.then((result) => {
      const isFailedResponse = result != null && typeof result === "object" && "ok" in result && result.ok === false;
      finish(isFailedResponse ? new Error(`${String(taskKey ?? "task")} HTTP ${String(result.status ?? "error")}`) : undefined);
      return result;
    }).catch((error) => {
      finish(error);
      throw error;
    });
  }

  return { beginCycle, beginTask, seal, snapshot, trackPromise };
}

export function createPageRefreshController(options) {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  const createId = options.createId;
  const onCycle = options.onCycle ?? (() => {});
  let page = String(options.page ?? "");
  let sequence = 0;
  let activeCycle = null;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let dirty = false;
  let timer = null;
  let generationScheduled = false;
  let stopped = false;
  let failureCount = 0;
  let failureRetryAt = Number.NEGATIVE_INFINITY;
  let visible = options.visible !== false;
  let overdue = false;
  let queuedReason = null;
  let intervalMs = Number(options.intervalMs ?? 30_000);

  function clearScheduled() {
    if (timer != null) clearTimer(timer);
    timer = null;
    generationScheduled = false;
  }

  function startCycle(reason) {
    if (stopped) return null;
    if (!visible) {
      overdue = true;
      return null;
    }
    if (activeCycle) {
      if (reason === "near-live") dirty = true;
      else if (reason !== "generation" || queuedReason !== "manual") queuedReason = reason;
      return null;
    }
    clearScheduled();
    sequence += 1;
    activeCycle = createPageRefreshCycle(page, sequence, reason, { now, createId });
    lastStartedAt = now();
    onCycle(activeCycle);
    return activeCycle;
  }

  function scheduleNearLive(reason = "near-live") {
    if (stopped || timer != null) return;
    if (!visible) {
      overdue = true;
      return;
    }
    const wait = Math.max(0, Math.max(lastStartedAt + PAGE_REFRESH_COALESCE_MS, failureRetryAt) - now());
    if (wait === 0 && !activeCycle) {
      dirty = false;
      startCycle(reason);
      return;
    }
    timer = setTimer(() => {
      timer = null;
      if (!visible) {
        overdue = true;
        return;
      }
      if (activeCycle) {
        dirty = true;
        return;
      }
      dirty = false;
      startCycle(reason);
    }, wait);
  }

  function scheduleGeneration(reason = "generation") {
    if (stopped || generationScheduled || pageRefreshPolicy(page).mode === "manual") return;
    if (!visible) {
      overdue = true;
      return;
    }
    clearScheduled();
    generationScheduled = true;
    const wait = Math.max(0, Math.max(lastStartedAt + PAGE_REFRESH_COALESCE_MS, failureRetryAt) - now());
    timer = setTimer(() => {
      timer = null;
      generationScheduled = false;
      if (!visible) {
        overdue = true;
        return;
      }
      if (activeCycle) {
        if (queuedReason !== "manual") queuedReason = "generation";
        return;
      }
      startCycle(reason);
    }, wait);
  }

  function scheduleFailureRetry(reason = "near-live") {
    clearScheduled();
    const delay = PAGE_REFRESH_BACKOFF_MS[Math.min(failureCount - 1, PAGE_REFRESH_BACKOFF_MS.length - 1)];
    failureRetryAt = now() + delay;
    timer = setTimer(() => {
      timer = null;
      if (!visible) {
        overdue = true;
        return;
      }
      dirty = false;
      startCycle(reason);
    }, delay);
  }

  function scheduleInterval() {
    if (stopped || timer != null || pageRefreshPolicy(page).mode !== "interval") return;
    const wait = Math.max(0, lastStartedAt + intervalMs - now());
    timer = setTimer(() => {
      timer = null;
      if (!visible) {
        overdue = true;
        return;
      }
      if (activeCycle) {
        queuedReason = "interval";
        return;
      }
      startCycle("interval");
    }, wait);
  }

  return {
    start() {
      stopped = false;
      return startCycle("initial");
    },
    stop() {
      stopped = true;
      dirty = false;
      clearScheduled();
    },
    setPage(nextPage) {
      const normalizedPage = String(nextPage ?? "");
      if (normalizedPage === page) return null;
      clearScheduled();
      page = normalizedPage;
      activeCycle = null;
      dirty = false;
      overdue = false;
      queuedReason = null;
      failureCount = 0;
      failureRetryAt = Number.NEGATIVE_INFINITY;
      return startCycle("initial");
    },
    restart() {
      clearScheduled();
      activeCycle = null;
      dirty = false;
      overdue = false;
      queuedReason = null;
      failureCount = 0;
      failureRetryAt = Number.NEGATIVE_INFINITY;
      return startCycle("initial");
    },
    setIntervalMs(nextIntervalMs) {
      intervalMs = Number(nextIntervalMs);
      if (!activeCycle) {
        clearScheduled();
        scheduleInterval();
      }
    },
    setVisible(nextVisible) {
      const becameVisible = !visible && Boolean(nextVisible);
      visible = Boolean(nextVisible);
      const intervalExpired = pageRefreshPolicy(page).mode === "interval"
        && !activeCycle
        && now() >= lastStartedAt + intervalMs;
      if (becameVisible && (overdue || intervalExpired)) {
        clearScheduled();
        overdue = false;
        dirty = false;
        if (pageRefreshPolicy(page).mode === "near-live") scheduleNearLive("visibility-catch-up");
        else if (failureRetryAt > now()) scheduleGeneration("visibility-catch-up");
        else startCycle("visibility-catch-up");
      }
    },
    requestManual() {
      return startCycle("manual");
    },
    invalidateNearLive() {
      if (pageRefreshPolicy(page).mode !== "near-live" || stopped) return;
      dirty = true;
      if (!visible) {
        overdue = true;
        return;
      }
      if (!activeCycle) scheduleNearLive();
    },
    invalidateGeneration() {
      if (pageRefreshPolicy(page).mode === "manual" || stopped) return;
      if (!visible) {
        overdue = true;
        return;
      }
      if (activeCycle) {
        if (queuedReason !== "manual") queuedReason = "generation";
        return;
      }
      scheduleGeneration();
    },
    complete(cycleId, succeeded = true) {
      if (!activeCycle || activeCycle.id !== String(cycleId ?? "")) return;
      const completedReason = activeCycle.reason;
      activeCycle = null;
      const retryReason = completedReason === "generation"
        || (completedReason === "visibility-catch-up" && pageRefreshPolicy(page).mode === "interval" && failureCount > 0)
        ? "generation"
        : pageRefreshPolicy(page).mode === "near-live" ? "near-live" : null;
      if (!succeeded && retryReason) {
        failureCount += 1;
        if (queuedReason !== "manual") queuedReason = null;
        scheduleFailureRetry(retryReason);
        return;
      }
      if (succeeded) {
        failureCount = 0;
        failureRetryAt = Number.NEGATIVE_INFINITY;
      }
      if (queuedReason) {
        const reason = queuedReason;
        queuedReason = null;
        startCycle(reason);
      } else if (dirty) scheduleNearLive();
      else scheduleInterval();
    },
  };
}
