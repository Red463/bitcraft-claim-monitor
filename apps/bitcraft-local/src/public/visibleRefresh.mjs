export function createVisibleRefreshController({
  intervalMs = 60_000,
  isVisible,
  refresh,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
}) {
  let timer = null;
  let running = false;
  let hidden = false;

  function clearTimer() {
    if (timer != null) cancel(timer);
    timer = null;
  }

  function scheduleTimer() {
    if (!running || !isVisible() || timer != null) return;
    timer = schedule(() => {
      if (isVisible()) void refresh();
    }, intervalMs);
  }

  return {
    start() {
      running = true;
      hidden = !isVisible();
      scheduleTimer();
    },
    stop() {
      running = false;
      hidden = false;
      clearTimer();
    },
    visibilityChanged() {
      if (!running) return;
      if (!isVisible()) {
        hidden = true;
        clearTimer();
        return;
      }
      const catchUp = hidden;
      hidden = false;
      scheduleTimer();
      if (catchUp) void refresh();
    },
  };
}
