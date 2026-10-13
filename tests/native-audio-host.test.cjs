const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWebsite } = require('./helpers/web-host.cjs');

function host({ handled = true, ready = true } = {}) {
  const plays = [], webNotes = [];
  let stops = 0, contexts = 0;
  const site = loadWebsite({ nativeBridge: {
    isNativeAudioReady: () => ready,
    playSound: (cue, volume) => { plays.push({ cue, volume }); return handled; },
    stopSounds: () => { stops++; },
    getDisplayInfo: () => JSON.stringify({ outputWidth: 3840, outputHeight: 2160, windowWidth: 1920, windowHeight: 1080 }),
    getAudioInfo: () => JSON.stringify({ backend: 'Android SoundPool', ready }),
  } });
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  site.window.AudioContext = class {
    constructor(options) { contexts++; this.options = options; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() { return { frequency: param(), connect() {}, start() { webNotes.push(true); }, stop() {} }; }
  };
  return { site, plays, webNotes, get stops() { return stops; }, get contexts() { return contexts; } };
}

test('Android gameplay cues go directly to native audio without opening Web Audio', () => {
  const h = host();
  h.site.run('audio.init(); audio.playRacketHit(); audio.playPowerup(); audio.playWin();');
  h.site.advance(100); h.site.run('audio.playBounce("day")');
  h.site.advance(100); h.site.run('audio.playBounce("night")');
  assert.deepEqual(h.plays.map(p => p.cue), ['racket', 'powerup', 'win', 'bounceDay', 'bounceNight']);
  assert.ok(h.plays.every(p => p.volume === 0.7));
  assert.equal(h.contexts, 0);
  assert.equal(h.webNotes.length, 0);
});

test('an unavailable native cue falls back immediately, even if the pool otherwise reports ready', () => {
  const h = host({ handled: false });
  h.site.run('audio.playRacketHit()');
  assert.equal(h.plays.length, 1);
  assert.equal(h.contexts, 1);
  assert.equal(h.webNotes.length, 1);
  assert.equal(h.site.run('audio.ctx.options.latencyHint'), 'interactive');
});

test('Sound Off, zero volume and backgrounding stop native cues and suppress new gameplay sounds', () => {
  const h = host();
  h.site.api.configure({ soundEnabled: false });
  h.site.run('audio.playRacketHit()');
  assert.equal(h.plays.length, 0); assert.ok(h.stops > 0);
  h.site.api.configure({ soundEnabled: true, soundVolume: 0 });
  h.site.run('audio.playPowerup()'); assert.equal(h.plays.length, 0);
  h.site.api.configure({ soundVolume: 35 });
  h.site.run('audio.playRacketHit()'); assert.equal(h.plays.at(-1).volume, 0.35);
  const before = h.stops;
  h.site.api.setFeedbackActive(false);
  h.site.run('audio.playRacketHit()');
  assert.equal(h.plays.length, 1); assert.ok(h.stops > before);
  h.site.api.setFeedbackActive(true);
  assert.equal(h.plays.length, 1, 'foregrounding must not replay an old effect');
});

test('TV diagnostics keep physical output and actual app surface separate', () => {
  const h = host();
  const report = h.site.api.getDiagnostics();
  assert.equal(report.display.outputWidth, 3840);
  assert.equal(report.display.windowWidth, 1920);
  assert.equal(report.audio.backend, 'Android SoundPool');
  assert.equal(report.audio.ready, true);
});
