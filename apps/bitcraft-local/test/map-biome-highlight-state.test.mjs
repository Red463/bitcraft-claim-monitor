import assert from "node:assert/strict";
import test from "node:test";

import { createBiomeHighlightController } from "../src/pages/map/biomeHighlightState.mjs";

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    schedule(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    cancel(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers].sort((left, right) => left[1].at - right[1].at)) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    pending() { return timers.size; },
  };
}

test("biome previews wait 100ms while pin, leave, and clear are immediate", () => {
  const clock = fakeClock();
  const changes = [];
  const controller = createBiomeHighlightController({ delayMs: 100, schedule: clock.schedule, cancel: clock.cancel, onChange: (value) => changes.push(value) });

  controller.preview(2);
  assert.deepEqual(changes, []);
  clock.advance(99);
  assert.deepEqual(changes, []);
  clock.advance(1);
  assert.deepEqual(changes, [{ active: 2, pinned: null }]);

  controller.pin(2);
  assert.deepEqual(changes.at(-1), { active: 2, pinned: 2 });
  controller.preview(1);
  controller.leave();
  assert.deepEqual(changes.at(-1), { active: 2, pinned: 2 });
  controller.pin(2);
  assert.deepEqual(changes.at(-1), { active: null, pinned: null });
  controller.pin(1);
  controller.clear();
  assert.deepEqual(changes.at(-1), { active: null, pinned: null });
});

test("a later immediate action fences delayed previews and dispose cancels timers", () => {
  const clock = fakeClock();
  const changes = [];
  const controller = createBiomeHighlightController({ delayMs: 100, schedule: clock.schedule, cancel: clock.cancel, onChange: (value) => changes.push(value) });
  controller.preview(2);
  controller.pin(1);
  clock.advance(100);
  assert.deepEqual(changes, [{ active: 1, pinned: 1 }]);
  controller.preview(2);
  controller.dispose();
  assert.equal(clock.pending(), 0);
  clock.advance(100);
  assert.deepEqual(changes, [{ active: 1, pinned: 1 }]);
});
