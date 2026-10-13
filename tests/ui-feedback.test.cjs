const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Feedback = require('../ui-feedback.js');

class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, at) { this.events.push({ type: 'set', value, at }); }
  linearRampToValueAtTime(value, at) { this.events.push({ type: 'linear', value, at }); }
  cancelScheduledValues(at) { this.events.push({ type: 'cancel', at }); }
}

function harness(state = 'running', ownContext = false) {
  let now = 0, id = 0, creates = 0;
  const timers = new Map();
  const ctx = { state, currentTime: 0, destination: {}, sources: [], gains: [], resumes: 0, suspends: 0, closes: 0,
    resume() { this.resumes++; if (this.resumeImpl) return this.resumeImpl(); this.state = 'running'; return Promise.resolve(); },
    suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); },
    close() { this.closes++; this.state = 'closed'; return Promise.resolve(); },
    createGain() { const gain = { gain: new Param(), connect() {}, disconnect() { this.disconnected = true; } }; this.gains.push(gain); return gain; },
    createOscillator() {
      const source = { frequency: new Param(), starts: [], stops: [], connect() {}, disconnect() { this.disconnected = true; },
        start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
      this.sources.push(source); return source;
    },
  };
  const options = {
    audioContextFactory() { creates++; return ctx; }, now: () => now,
    setTimeout(fn, delay) { const next = ++id; timers.set(next, { fn, at: now + delay }); return next; },
    clearTimeout(next) { timers.delete(next); },
  };
  let Type = Feedback;
  if (ownContext) {
    delete options.audioContextFactory;
    const context = vm.createContext({ AudioContext: function () { creates++; return ctx; },
      setTimeout: options.setTimeout, clearTimeout: options.clearTimeout, Date, performance: { now: () => now },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui-feedback.js'), 'utf8'), context);
    Type = context.PongFeedback;
  }
  const feedback = new Type(options);
  return { feedback, ctx, timers, get creates() { return creates; },
    advance(ms, { audioClock = true } = {}) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        if (audioClock && ctx.state === 'running') ctx.currentTime += (next[1].at - now) / 1000;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      if (audioClock && ctx.state === 'running') ctx.currentTime += (end - now) / 1000;
      now = end;
      for (const source of ctx.sources) {
        if (source.onended && source.stops.length && (source.stops.at(-1) ?? ctx.currentTime) <= ctx.currentTime) source.onended();
      }
    },
  };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('ready native output skips Web Audio while retaining cue throttling and start suppression', async () => {
  const h = harness(), calls = [];
  h.feedback._nativeReady = () => true;
  h.feedback._nativePlay = (kind, volume) => { calls.push({ kind, volume }); return true; };
  assert.equal(await h.feedback.unlock(), true);
  assert.equal(await h.feedback.play('navigate'), true);
  assert.equal(await h.feedback.play('navigate'), false);
  assert.equal(await h.feedback.play('start'), true);
  h.advance(200);
  assert.equal(await h.feedback.play('navigate'), false);
  assert.equal(await h.feedback.play('confirm'), false);
  h.advance(400);
  assert.equal(await h.feedback.play('confirm'), true);
  assert.deepEqual(calls.map(call => call.kind), ['navigate', 'start', 'confirm']);
  assert.ok(calls.every(call => call.volume === .7));
  assert.equal(h.creates, 0); assert.equal(h.ctx.sources.length, 0);
  h.feedback.setEnabled(false);
  assert.equal(await h.feedback.unlock(), false);
  assert.equal(await h.feedback.play('back'), false);
  h.feedback.setEnabled(true); await h.feedback.suspend();
  assert.equal(await h.feedback.play('resume'), false);
  assert.equal(calls.length, 3);
});

test('unavailable native output falls back immediately and a later native cue clears blocked web work', async () => {
  const h = harness();
  h.feedback._nativePlay = () => false;
  assert.equal(await h.feedback.play('back'), true);
  assert.equal(h.ctx.sources.length, 2);
  h.feedback._nativePlay = () => { throw new Error('bridge unavailable'); };
  assert.equal(await h.feedback.play('confirm'), true);
  assert.equal(h.ctx.sources.length, 4);

  const cold = harness('suspended'); let resume;
  cold.ctx.resumeImpl = () => new Promise(resolve => { resume = resolve; });
  const pending = cold.feedback.play('navigate');
  cold.feedback._nativePlay = () => true;
  assert.equal(await cold.feedback.play('start'), true);
  cold.ctx.state = 'running'; resume(); await pending;
  assert.equal(cold.ctx.sources.length, 0, 'no stale web cue after native playback becomes ready');
});

test('disabled, silent or background feedback allocates nothing and ignores unknown cues', async () => {
  const h = harness();
  assert.equal(await h.feedback.play('unknown'), false);
  h.feedback.setEnabled(false); assert.equal(await h.feedback.play('confirm'), false);
  assert.equal(await h.feedback.unlock(), false);
  h.feedback.setEnabled(true); h.feedback.setVolume(0);
  assert.equal(await h.feedback.play('navigate'), false);
  h.feedback.setVolume(0.7); await h.feedback.suspend();
  assert.equal(await h.feedback.play('start'), false);
  assert.equal(h.creates, 0); assert.equal(h.ctx.sources.length, 0);
});

test('all cue patterns are finite, gently enveloped and cleaned up without an audio loop', async () => {
  const counts = { navigate: 1, confirm: 2, back: 2, pause: 2, resume: 2, start: 4, success: 3 };
  for (const [kind, count] of Object.entries(counts)) {
    const h = harness(); assert.equal(await h.feedback.play(kind), true);
    assert.equal(h.ctx.sources.length, count, kind);
    for (const voice of h.feedback._voices) {
      assert.equal(voice.oscillator.starts.length, 1);
      assert.equal(voice.oscillator.stops.length, 1);
      assert.ok(voice.oscillator.stops[0] > voice.oscillator.starts[0]);
      assert.ok(voice.oscillator.stops[0] < 0.53);
      assert.equal(voice.envelope[0][1], 0); assert.equal(voice.envelope.at(-1)[1], 0);
      assert.ok(voice.envelope[1][0] > voice.envelope[0][0], 'nonzero attack');
      assert.ok(voice.envelope.every(point => point[1] <= 0.075), 'quiet peak gain');
    }
    h.advance(700);
    assert.equal(h.feedback._voices.size, 0); assert.equal(h.timers.size, 0);
    assert.ok(h.ctx.sources.every(source => source.disconnected));
    assert.ok(h.ctx.gains.slice(1).every(gain => gain.disconnected));
  }
});

test('navigation and confirmation repeats are throttled before allocating more nodes', async () => {
  const h = harness(); await h.feedback.play('navigate');
  for (let i = 0; i < 30; i++) assert.equal(await h.feedback.play('navigate'), false);
  assert.equal(h.ctx.sources.length, 1);
  h.advance(90); assert.equal(await h.feedback.play('navigate'), true);
  await h.feedback.play('confirm');
  const count = h.ctx.sources.length;
  h.advance(100); assert.equal(await h.feedback.play('confirm'), false);
  assert.equal(h.ctx.sources.length, count);
  h.advance(70); assert.equal(await h.feedback.play('confirm'), true);
});

test('cold audio hardware cannot let wall-clock cleanup silence the first accepted cue', async () => {
  const h = harness(); assert.equal(await h.feedback.play('confirm'), true);
  h.advance(700, { audioClock: false });
  assert.equal(h.ctx.state, 'running'); assert.equal(h.ctx.currentTime, 0);
  assert.equal(h.feedback._voices.size, 2);
  assert.ok(h.ctx.sources.every(source => !source.disconnected), 'first cue waits for audio rendering to begin');
  h.advance(350);
  assert.equal(h.feedback._voices.size, 0, 'onended releases nodes after the audio clock reaches their end');
  assert.ok(h.ctx.sources.every(source => source.disconnected));
});

test('start replaces generic cues and suppresses duplicate confirmation during its short fanfare', async () => {
  const h = harness(); await h.feedback.play('confirm'); h.advance(20);
  assert.equal(await h.feedback.play('start'), true);
  assert.ok([...h.feedback._voices].every(voice => voice.kind === 'start' || voice.cancelled));
  assert.equal(await h.feedback.play('navigate'), false);
  assert.equal(await h.feedback.play('confirm'), false);
  assert.equal(await h.feedback.play('start'), false);
  h.advance(540); assert.equal(await h.feedback.play('navigate'), true);
});

test('mute and background transitions cancel both running and not-yet-started notes', async () => {
  for (const action of ['mute', 'zeroVolume', 'background']) {
    const h = harness(); await h.feedback.play('start'); h.advance(20);
    if (action === 'mute') h.feedback.setEnabled(false);
    if (action === 'zeroVolume') h.feedback.setVolume(0);
    if (action === 'background') await h.feedback.suspend();
    h.advance(50);
    assert.equal(h.feedback._voices.size, 0, action);
    assert.ok(h.ctx.sources.every(source => source.disconnected), action);
    assert.equal(h.ctx.suspends, 0, 'injected game context remains running');
    assert.equal(h.ctx.closes, 0);
  }
});

test('effects volume has its own gain without changing the shared context or other game gains', async () => {
  const h = harness(); const gameGain = h.ctx.createGain(); gameGain.gain.value = 0.42;
  await h.feedback.play('confirm');
  assert.equal(h.feedback._master.gain.value, 0.7);
  h.feedback.setVolume(0.3);
  assert.equal(h.feedback._master.gain.events.at(-1).value, 0.3);
  h.feedback.setVolume(NaN); assert.equal(h.feedback.volume, 0.3);
  h.feedback.setVolume(2); assert.equal(h.feedback.volume, 1);
  assert.equal(gameGain.gain.value, 0.42);
  assert.equal(h.ctx.suspends, 0); assert.equal(h.ctx.closes, 0);
});

test('a first gesture synchronously retries blocked autoplay and emits only the latest pending cue', async () => {
  const h = harness('suspended'); const blocked = [];
  h.ctx.resumeImpl = () => new Promise(done => blocked.push(done));
  h.feedback.play('navigate'); h.advance(90); h.feedback.play('confirm');
  assert.equal(h.ctx.sources.length, 0);
  const before = h.ctx.resumes; delete h.ctx.resumeImpl;
  const unlocked = h.feedback.unlock();
  assert.equal(h.ctx.resumes, before + 1, 'resume must happen before returning from the gesture');
  await unlocked;
  assert.equal(h.ctx.sources.length, 2);
  assert.ok([...h.feedback._voices].every(voice => voice.kind === 'confirm'));
  blocked.forEach(done => done()); await settle();
  assert.equal(h.ctx.sources.length, 2, 'old promises never replay older cues');
});

test('a late autoplay resolution drops stale feedback instead of replaying delayed actions', async () => {
  const h = harness('suspended'); let resolve;
  h.ctx.resumeImpl = () => new Promise(done => { resolve = () => { h.ctx.state = 'running'; done(); }; });
  const played = h.feedback.play('start'); h.advance(500);
  resolve(); assert.equal(await played, false);
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.feedback._pending, null);
});

test('queued feedback cannot resurrect after mute, background or disposal', async () => {
  for (const action of ['mute', 'background', 'dispose']) {
    const h = harness('suspended'); let resolve;
    h.ctx.resumeImpl = () => new Promise(done => { resolve = () => { h.ctx.state = 'running'; done(); }; });
    const played = h.feedback.play('confirm');
    if (action === 'mute') h.feedback.setEnabled(false);
    if (action === 'background') await h.feedback.suspend();
    if (action === 'dispose') await h.feedback.dispose();
    resolve(); assert.equal(await played, false);
    assert.equal(h.ctx.sources.length, 0, action);
    assert.equal(h.ctx.closes, 0, 'shared context remains owned by game');
  }
});

test('failed resume is handled silently and the next gesture can recover', async () => {
  const h = harness('suspended'); h.ctx.resumeImpl = () => Promise.reject(new Error('gesture needed'));
  assert.equal(await h.feedback.play('confirm'), false);
  delete h.ctx.resumeImpl; assert.equal(await h.feedback.unlock(), true);
  assert.equal(h.ctx.sources.length, 2);
});

test('rapid mixed actions keep the audio graph bounded and release every node', async () => {
  const h = harness();
  for (let i = 0; i < 50; i++) {
    for (const kind of ['navigate', 'confirm', 'back', 'pause', 'resume', 'success']) await h.feedback.play(kind);
    assert.ok(h.feedback._voices.size <= 12);
    h.advance(90);
  }
  h.advance(1000);
  assert.equal(h.feedback._voices.size, 0); assert.equal(h.timers.size, 0);
  assert.ok(h.ctx.sources.every(source => source.disconnected));
});

test('dispose is idempotent, removes cue resources and never closes an injected context', async () => {
  const h = harness(); await h.feedback.play('start');
  await h.feedback.dispose(); await h.feedback.dispose();
  assert.equal(h.ctx.closes, 0); assert.equal(h.ctx.suspends, 0);
  assert.equal(h.feedback._voices.size, 0); assert.equal(h.timers.size, 0);
  assert.ok(h.ctx.sources.every(source => source.disconnected));
  assert.ok(h.ctx.gains.every(gain => gain.disconnected));
  assert.equal(await h.feedback.play('confirm'), false);
  assert.equal(await h.feedback.unlock(), false); assert.equal(await h.feedback.resume(), false);
});

test('a context created by the feedback class itself is suspended and closed by its owner', async () => {
  const h = harness('running', true);
  await h.feedback.play('navigate'); await h.feedback.suspend(); h.advance(50); await settle();
  assert.equal(h.ctx.suspends, 1); assert.equal(h.ctx.state, 'suspended');
  await h.feedback.resume(); assert.equal(h.ctx.state, 'running');
  await h.feedback.dispose(); assert.equal(h.ctx.closes, 1);
});

test('missing or unsupported audio fails without disrupting navigation', async () => {
  const h = harness(); h.feedback._contextFactory = () => null;
  assert.equal(await h.feedback.play('confirm'), false);
  h.feedback._contextFactory = () => { throw new Error('unsupported'); };
  assert.equal(await h.feedback.unlock(), false);
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.timers.size, 0);
});
