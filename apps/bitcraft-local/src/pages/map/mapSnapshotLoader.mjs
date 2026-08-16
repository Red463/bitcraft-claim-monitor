export function mapEventNeedsSnapshot(event) {
  return event?.initial !== true && Array.isArray(event?.changedDomains) && event.changedDomains.length > 0;
}

export function createMapSnapshotLoader({
  load,
  onValue = () => {},
  onError = () => {},
  onLoading = () => {},
  isHidden = () => false,
  currentRequestKey = () => "",
  minIntervalMs = 2_000,
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timer) => clearTimeout(timer),
}) {
  let active = null;
  let queued = false;
  let stopped = false;
  let scheduled = null;
  let scheduledTimer = null;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let queuedRequestKey = "";

  const request = (requestedKey = currentRequestKey()) => {
    if (stopped || isHidden()) return active ?? scheduled ?? Promise.resolve();
    if (active) {
      queued = true;
      queuedRequestKey = requestedKey;
      return active;
    }
    const waitMs = Math.max(0, minIntervalMs - (now() - lastStartedAt));
    if (waitMs > 0) {
      queued = true;
      queuedRequestKey = requestedKey;
      if (!scheduled) scheduled = new Promise((resolve) => {
        scheduledTimer = schedule(() => {
          scheduled = null;
          scheduledTimer = null;
          queued = false;
          const queuedKey = queuedRequestKey;
          queuedRequestKey = "";
          Promise.resolve(request(queuedKey)).finally(resolve);
        }, waitMs);
      });
      return scheduled;
    }
    lastStartedAt = now();
    onLoading(true);
    const requestKey = requestedKey;
    let loaded;
    try {
      loaded = load(requestKey);
    } catch (error) {
      loaded = Promise.reject(error);
    }
    active = Promise.resolve(loaded)
      .then((value) => {
        if (requestKey === currentRequestKey()) onValue({ requestKey, value });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") onError(error);
      })
      .finally(() => {
        active = null;
        onLoading(false);
        if (queued && !stopped) {
          queued = false;
          const queuedKey = queuedRequestKey;
          queuedRequestKey = "";
          void request(queuedKey);
        }
      });
    return active;
  };

  return {
    request,
    stop() {
      stopped = true;
      queued = false;
      queuedRequestKey = "";
      if (scheduledTimer != null) cancelSchedule(scheduledTimer);
      scheduledTimer = null;
      scheduled = null;
    },
  };
}
