export const CLIENT_MANUAL_REFRESH_COOLDOWN_MS = 15_000;
export const CLIENT_MANUAL_REFRESH_HEADER = "x-manual-refresh-id";

export function createManualRefreshRequest(page, sequence, options = {}) {
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  const now = options.now ?? Date.now;
  return {
    id: String(options.id ?? createId()),
    page: String(page ?? ""),
    sequence: Number(sequence ?? 0),
    requestedAt: now(),
  };
}

export function manualRefreshApplies(request, page) {
  return Boolean(request?.id && request.page === page);
}

export function manualRefreshHeaders(request, page) {
  return manualRefreshApplies(request, page) && (request.reason == null || request.reason === "manual")
    ? { [CLIENT_MANUAL_REFRESH_HEADER]: request.id }
    : {};
}

export function cooldownRemainingMs(startedAt, now = Date.now()) {
  if (!Number.isFinite(Number(startedAt))) return 0;
  return Math.max(0, Number(startedAt) + CLIENT_MANUAL_REFRESH_COOLDOWN_MS - Number(now));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Refresh failed");
}

export function createManualRefreshTaskCoordinator(options = {}) {
  const onStateChange = options.onStateChange ?? (() => {});
  let requestId = "";
  let status = "idle";
  let sealed = false;
  let pendingTasks = new Set();
  let errors = [];

  function snapshot() {
    return {
      requestId,
      status,
      pendingTasks: [...pendingTasks],
      errors: [...errors],
    };
  }

  function emit() {
    onStateChange(snapshot());
  }

  function completeIfReady() {
    if (status === "refreshing" && sealed && pendingTasks.size === 0) status = "complete";
  }

  function beginRequest(nextRequestId) {
    requestId = String(nextRequestId ?? "");
    status = "refreshing";
    sealed = false;
    pendingTasks = new Set();
    errors = [];
    emit();
  }

  function beginTask(activeRequestId, taskKey) {
    const expectedRequestId = String(activeRequestId ?? "");
    const key = String(taskKey ?? "task");
    if (!expectedRequestId || expectedRequestId !== requestId || status !== "refreshing" || sealed) return () => {};
    pendingTasks.add(key);
    emit();
    let finished = false;
    return (error) => {
      if (finished || expectedRequestId !== requestId) return;
      finished = true;
      pendingTasks.delete(key);
      if (error) errors.push(errorMessage(error));
      completeIfReady();
      emit();
    };
  }

  function seal(activeRequestId) {
    if (String(activeRequestId ?? "") !== requestId || status !== "refreshing") return;
    sealed = true;
    completeIfReady();
    emit();
  }

  return { beginRequest, beginTask, seal, snapshot };
}
