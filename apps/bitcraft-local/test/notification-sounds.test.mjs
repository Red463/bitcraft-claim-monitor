import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNotificationSoundSettings, normalizeUserToastSettings, resolveNotificationSoundSettings } from "../src/notifications/userToastSettings.ts";
import { NOTIFICATION_SOUND_OPTIONS, playNotificationSound } from "../src/utils/notificationSounds.ts";

class FakeAudioParam {
  constructor() {
    this.calls = [];
  }

  setValueAtTime(value, time) {
    this.calls.push(["set", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.calls.push(["ramp", value, time]);
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
  }

  connect(target) {
    this.connections.push(target);
  }
}

class FakeGainNode extends FakeAudioNode {
  constructor() {
    super("gain");
    this.gain = new FakeAudioParam();
  }
}

class FakeOscillatorNode extends FakeAudioNode {
  constructor() {
    super("oscillator");
    this.frequency = new FakeAudioParam();
    this.startCalls = [];
    this.stopCalls = [];
    this.type = "sine";
  }

  start(time) {
    this.startCalls.push(time);
  }

  stop(time) {
    this.stopCalls.push(time);
  }
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.currentTime = 10;
    this.destination = { kind: "destination" };
    this.gains = [];
    this.oscillators = [];
    this.resumeCalls = 0;
    this.state = "running";
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  async resume() {
    this.resumeCalls += 1;
    this.state = "running";
  }
}

test("playNotificationSound does not create browser audio when sound is disabled", () => {
  FakeAudioContext.instances = [];
  globalThis.window = { AudioContext: FakeAudioContext };

  playNotificationSound({ soundEnabled: false, soundId: "clear-ping", soundVolume: 0.5 });

  assert.equal(FakeAudioContext.instances.length, 0);
});

test("playNotificationSound schedules the selected generated tone at the configured volume", () => {
  FakeAudioContext.instances = [];
  globalThis.window = { AudioContext: FakeAudioContext };

  playNotificationSound({ soundEnabled: true, soundId: "clear-ping", soundVolume: 0.25 });

  assert.equal(FakeAudioContext.instances.length, 1);
  const context = FakeAudioContext.instances[0];
  assert.equal(context.gains.length, 2);
  assert.equal(context.oscillators.length, 1);
  assert.deepEqual(context.gains[0].gain.calls[0], ["set", 0.25, 10]);
  assert.equal(context.oscillators[0].type, "triangle");
  assert.deepEqual(context.oscillators[0].frequency.calls[0], ["set", 1046.5, 10]);
  assert.deepEqual(context.oscillators[0].startCalls, [10]);
  assert.deepEqual(context.oscillators[0].stopCalls, [10.2]);
});

test("playNotificationSound resolves per-type sound choices", () => {
  globalThis.window = { AudioContext: FakeAudioContext };
  const existingContext = FakeAudioContext.instances.at(-1);
  const previousOscillators = existingContext?.oscillators.length ?? 0;
  const previousGains = existingContext?.gains.length ?? 0;

  playNotificationSound({ soundEnabled: true, soundId: "clear-ping", soundVolume: 0.25, soundByType: { marketSales: "coin-jingle" } }, "marketSales");

  const context = FakeAudioContext.instances.at(-1);
  assert.ok(context);
  assert.equal(context.oscillators.length - previousOscillators >= 3, true);
  assert.deepEqual(context.gains[previousGains].gain.calls[0], ["set", 0.25, 10]);
  assert.equal(context.oscillators[previousOscillators].type, "triangle");
});

test("every listed notification sound option is accepted by settings normalization", () => {
  for (const sound of NOTIFICATION_SOUND_OPTIONS) {
    assert.equal(normalizeNotificationSoundSettings({ soundId: sound.id, soundVolume: 0.5 }).soundId, sound.id);
  }
});

test("normalizeNotificationSoundSettings falls back for missing or corrupted saved sound settings", () => {
  assert.deepEqual(normalizeNotificationSoundSettings(null), {
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
    soundByType: {},
  });
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: "no", soundId: "unknown-tone", soundVolume: Number.NaN }), {
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
    soundByType: {},
  });
});

test("normalizeNotificationSoundSettings preserves explicit disabled state and clamps volume", () => {
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: false, soundId: "deep-bell", soundVolume: 1.6 }), {
    soundEnabled: false,
    soundId: "deep-bell",
    soundVolume: 1,
    soundByType: {},
  });
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: true, soundId: "soft-chime", soundVolume: -0.2 }), {
    soundEnabled: true,
    soundId: "soft-chime",
    soundVolume: 0,
    soundByType: {},
  });
});
test("normalizeNotificationSoundSettings preserves per-type sound choices and resolves fallbacks", () => {
  const normalized = normalizeNotificationSoundSettings({
    soundEnabled: true,
    soundId: "clear-ping",
    soundVolume: 0.4,
    soundByType: { marketSales: "coin-jingle", productionStarted: "deep-bell", productionCompleted: "bad-tone" },
  });

  assert.deepEqual(normalized.soundByType, { marketSales: "coin-jingle", productionStarted: "deep-bell" });
  assert.equal(resolveNotificationSoundSettings(normalized, "marketSales").soundId, "coin-jingle");
  assert.equal(resolveNotificationSoundSettings(normalized, "productionStarted").soundId, "deep-bell");
  assert.equal(resolveNotificationSoundSettings(normalized, "productionCompleted").soundId, "clear-ping");
});

test("normalizeUserToastSettings restores malformed browser toast settings safely", () => {
  assert.deepEqual(normalizeUserToastSettings({
    marketListings: false,
    marketSales: "yes",
    production: null,
    soundEnabled: false,
    soundId: "unknown-tone",
    soundVolume: 5,
  }), {
    marketListings: false,
    marketSales: true,
    production: true,
    soundEnabled: false,
    soundId: "alert-pop",
    soundVolume: 1,
    soundByType: {},
  });
  assert.deepEqual(normalizeUserToastSettings("bad saved value"), {
    marketListings: true,
    marketSales: true,
    production: true,
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
    soundByType: {},
  });
});
