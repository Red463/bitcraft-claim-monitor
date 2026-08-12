function biomeType(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 255) throw new TypeError("Biome type must be an integer between 0 and 255");
  return normalized;
}

export function createBiomeHighlightController({
  delayMs = 100,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (token) => clearTimeout(token),
  onChange,
}) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError("Biome preview delay must be non-negative");
  if (typeof schedule !== "function" || typeof cancel !== "function" || typeof onChange !== "function") throw new TypeError("Biome highlight controller dependencies are required");
  let active = null;
  let pinned = null;
  let pending = null;
  let disposed = false;

  const cancelPending = () => {
    if (pending == null) return;
    cancel(pending);
    pending = null;
  };
  const emit = () => {
    if (!disposed) onChange({ active, pinned });
  };

  return {
    preview(value) {
      if (disposed) return;
      const next = biomeType(value);
      cancelPending();
      pending = schedule(() => {
        pending = null;
        active = next;
        emit();
      }, delayMs);
    },
    leave() {
      if (disposed) return;
      cancelPending();
      active = pinned;
      emit();
    },
    pin(value) {
      if (disposed) return;
      const next = biomeType(value);
      cancelPending();
      pinned = pinned === next ? null : next;
      active = pinned;
      emit();
    },
    clear() {
      if (disposed) return;
      cancelPending();
      active = null;
      pinned = null;
      emit();
    },
    dispose() {
      cancelPending();
      disposed = true;
    },
  };
}
