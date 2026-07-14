export function createRequestCoordinator({ concurrency = 8 } = {}) {
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  const inflight = new Map();
  const queue = [];
  let active = 0;
  let started = 0;
  let inflightReuse = 0;
  let queued = 0;
  let maxActive = 0;

  const drain = () => {
    while (active < limit && queue.length) {
      const task = queue.shift();
      active += 1;
      started += 1;
      maxActive = Math.max(maxActive, active);
      Promise.resolve().then(task.load).then(task.resolve, task.reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  };

  const run = (key, load) => {
    const normalizedKey = String(key);
    const existing = inflight.get(normalizedKey);
    if (existing) {
      inflightReuse += 1;
      return existing;
    }
    if (active >= limit) queued += 1;
    const promise = new Promise((resolve, reject) => {
      queue.push({ load, resolve, reject });
      drain();
    }).finally(() => {
      if (inflight.get(normalizedKey) === promise) inflight.delete(normalizedKey);
    });
    inflight.set(normalizedKey, promise);
    return promise;
  };

  return {
    run,
    stats: () => ({ active, queued, pending: queue.length, started, inflightReuse, maxActive, concurrency: limit }),
  };
}
