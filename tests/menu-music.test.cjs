const assert = require('node:assert/strict');
const {test} = require('node:test');
const Music = require('../menu-music.js');

class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, at) { this.events.push({type:'set', value, at}); }
  linearRampToValueAtTime(value, at) { this.events.push({type:'linear', value, at}); }
  exponentialRampToValueAtTime(value, at) { this.events.push({type:'exponential', value, at}); }
  cancelScheduledValues(at) { this.events.push({type:'cancel', at}); }
}

function harness(initialState = 'running') {
  let now = 0, nextId = 0, creates = 0;
  const timers = new Map();
  const ctx = {
    state: initialState, currentTime: 0, sampleRate: 24000, destination: {},
    nodes: [], sources: [], gains: [], resumes: 0, suspends: 0, closes: 0,
    resume() { this.resumes++; if (this.resumeImpl) return this.resumeImpl(); this.state = 'running'; return Promise.resolve(); },
    suspend() { this.suspends++; if (this.suspendImpl) return this.suspendImpl(); this.state = 'suspended'; return Promise.resolve(); },
    close() { this.closes++; this.state = 'closed'; return Promise.resolve(); },
    node() {
      const node = {connections: [], disconnected: false,
        connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; this.connections = []; }};
      this.nodes.push(node); return node;
    },
    source() {
      const node = Object.assign(this.node(), {frequency: new Param(), stopTimes: [], ended:false,
        start(at) { this.startAt = at; }, stop(at) { this.stopTimes.push(at); this.stopAt = at; }});
      this.sources.push(node); return node;
    },
    createGain() { const gain = Object.assign(this.node(), {gain:new Param()}); this.gains.push(gain); return gain; },
    createBiquadFilter() { return Object.assign(this.node(), {frequency:new Param(), Q:new Param()}); },
    createStereoPanner() { return Object.assign(this.node(), {pan:new Param()}); },
    createOscillator() { return this.source(); },
    createBufferSource() { return this.source(); },
    createBuffer(channels, length) { const data = new Float32Array(length); return {getChannelData:() => data}; },
  };
  const music = new Music({audioContextFactory() { creates++; return ctx; },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, {fn, at:now + delay}); return id; },
    clearTimeout(id) { timers.delete(id); }});
  function elapse(ms) {
    now += ms;
    if (ctx.state === 'running') ctx.currentTime += ms / 1000;
    for (const source of ctx.sources) if (!source.ended && source.stopAt <= ctx.currentTime) {
      source.ended = true; if (source.onended) source.onended();
    }
  }
  return {music, ctx, timers, get creates() { return creates; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        elapse(Math.max(0, next[1].at - now)); timers.delete(next[0]); next[1].fn();
      }
      elapse(end - now);
    },
    stall(ms) { elapse(ms); },
    masterTarget() { return ctx.gains[0].gain.events.filter(e => e.type === 'linear').at(-1).value; },
  };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test('inactive/muted/background music creates no audio context, including on input unlock', async () => {
  const h = harness();
  assert.equal(await h.music.unlock(), false);
  h.music.setEnabled(false); h.music.setActive(true);
  assert.equal(await h.music.unlock(), false);
  h.music.setVolume(0); h.music.setEnabled(true);
  assert.equal(await h.music.unlock(), false);
  await h.music.suspend(); h.music.setVolume(0.7);
  assert.equal(await h.music.unlock(), false);
  assert.equal(h.creates, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(await h.music.resume(), true);
  assert.equal(h.creates, 1);
});

test('menu autoplay schedules softly filtered voices and a single bounded scheduler', () => {
  const h = harness(); h.music.setActive(true);
  assert.equal(h.creates, 1);
  assert.equal(h.ctx.sources.length, 6); // Four chord tones, bass, soft kick.
  assert.ok(h.ctx.sources.every(s => s.startAt >= 0.04 && s.stopAt > s.startAt));
  assert.deepEqual(new Set(h.ctx.sources.map(s => s.type)), new Set(['triangle','sine']));
  assert.equal(h.masterTarget(), 0.7 * 0.55);
  for (let i = 0; i < 30; i++) { h.music.setActive(true); h.music.setEnabled(true); h.music.unlock(); }
  assert.equal(h.timers.size, 1);
  assert.equal(h.ctx.sources.length, 6);
  h.advance(60000);
  assert.ok(h.ctx.sources.length > 100);
  assert.ok(h.music._voices.size < 20, 'finished voices must be disconnected');
  assert.ok(h.ctx.sources.filter(s => s.ended).every(s => s.disconnected && s.onended === null));
  assert.equal(h.timers.size, 1);
});

test('leaving menu fades out then releases every voice and suspends its context', async () => {
  const h = harness(); h.music.setActive(true); h.advance(1300);
  h.music.setActive(false);
  assert.equal(h.masterTarget(), 0);
  assert.equal(h.timers.size, 1, 'only fade cleanup remains');
  const count = h.ctx.sources.length;
  for (let i = 0; i < 5; i++) { await h.music.unlock(); h.advance(40); }
  h.advance(100); await settle();
  assert.equal(h.ctx.sources.length, count, 'no notes may be scheduled after gameplay starts');
  assert.equal(h.music._voices.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.state, 'suspended');
  assert.ok(h.ctx.sources.every(s => s.disconnected));
  h.music.setActive(true); await settle();
  assert.equal(h.creates, 1, 'reuse the context when returning to menus');
  assert.equal(h.ctx.state, 'running');
  assert.equal(h.timers.size, 1);
});

test('master/music mute and zero volume cancel scheduling; volume stays bounded', async () => {
  const h = harness(); h.music.setActive(true); h.advance(800);
  h.music.setVolume(0.2); assert.equal(h.masterTarget(), 0.2 * 0.55);
  h.music.setVolume(NaN); assert.equal(h.masterTarget(), 0.2 * 0.55);
  h.music.setVolume(5); assert.equal(h.masterTarget(), 0.55);
  h.music.setEnabled(false); h.advance(300); await settle();
  assert.equal(h.ctx.state, 'suspended'); assert.equal(h.timers.size, 0);
  h.music.setEnabled(true); await settle(); assert.equal(h.timers.size, 1);
  h.music.setVolume(-1); h.advance(300); await settle();
  assert.equal(h.music.volume, 0); assert.equal(h.timers.size, 0);
  h.music.setVolume(0.5); await settle(); assert.equal(h.timers.size, 1);
});

test('backgrounding immediately disconnects audio, while rapid return preserves one scheduler', async () => {
  const h = harness(); h.music.setActive(true); h.advance(700);
  await h.music.suspend();
  assert.equal(h.music._voices.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.state, 'suspended');
  h.advance(60000); assert.equal(await h.music.unlock(), false);
  await h.music.resume();
  for (let i = 0; i < 5; i++) {
    h.music.setActive(false); h.advance(30); h.music.setActive(true); h.advance(30);
  }
  h.advance(1000); await settle();
  assert.equal(h.ctx.state, 'running'); assert.equal(h.timers.size, 1);
  assert.ok(h.music._voices.size < 20);
});

test('denied autoplay is silent and a later gesture can unlock playback', async () => {
  const h = harness('suspended');
  h.ctx.resumeImpl = () => Promise.reject(new Error('gesture required'));
  h.music.setActive(true); await settle();
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.timers.size, 0);
  delete h.ctx.resumeImpl;
  assert.equal(await h.music.unlock(), true);
  assert.equal(h.ctx.resumes, 2); assert.equal(h.timers.size, 1);
});

test('a late autoplay resolution cannot start music after leaving the menu', async () => {
  const h = harness('suspended'); let resolve;
  h.ctx.resumeImpl = () => new Promise(done => { resolve = () => { h.ctx.state = 'running'; done(); }; });
  h.music.setActive(true); h.music.setActive(false); resolve(); await settle();
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.state, 'suspended');
});

test('a gesture retries a still-pending autoplay resume without duplicate scheduling', async () => {
  const h = harness('suspended'); let resolveAutoplay;
  h.ctx.resumeImpl = () => new Promise(done => { resolveAutoplay = done; });
  h.music.setActive(true);
  assert.equal(h.ctx.resumes, 1);
  h.music.setVolume(0.5);
  assert.equal(h.ctx.resumes, 1, 'ordinary settings changes share the blocked request');
  delete h.ctx.resumeImpl;
  const unlocked = h.music.unlock();
  assert.equal(h.ctx.resumes, 2, 'retry happens synchronously inside the gesture');
  assert.equal(await unlocked, true);
  assert.equal(h.timers.size, 1);
  const voices = h.ctx.sources.length;
  resolveAutoplay(); await settle();
  assert.equal(h.timers.size, 1);
  assert.equal(h.ctx.sources.length, voices, 'old promise does not start a second phrase');
});

test('mute before the first gesture cannot deadlock a pending autoplay request', async () => {
  const h = harness('suspended'); let resolveAutoplay;
  h.ctx.resumeImpl = () => new Promise(done => { resolveAutoplay = done; });
  h.music.setActive(true); h.music.setEnabled(false); h.music.setEnabled(true);
  delete h.ctx.resumeImpl;
  assert.equal(await h.music.unlock(), true);
  assert.equal(h.ctx.state, 'running');
  assert.equal(h.timers.size, 1);
  h.music.setActive(false); h.advance(300); await settle();
  // Model a late browser completion after the match has already started.
  h.ctx.state = 'running'; resolveAutoplay(); await settle();
  assert.equal(h.ctx.state, 'suspended');
  assert.equal(h.timers.size, 0);
  assert.equal(h.music._voices.size, 0);
});

test('a foreground transition racing an asynchronous suspend resumes correctly', async () => {
  const h = harness(); let resolve;
  h.music.setActive(true);
  h.ctx.suspendImpl = () => new Promise(done => { resolve = () => { h.ctx.state = 'suspended'; done(); }; });
  h.music.suspend(); await settle();
  const resumed = h.music.resume(); resolve();
  assert.equal(await resumed, true);
  assert.equal(h.ctx.state, 'running'); assert.equal(h.timers.size, 1);
});

test('a stalled scheduler skips missed beats instead of scheduling a burst', () => {
  const h = harness(); h.music.setActive(true);
  const previous = h.ctx.sources.length;
  h.stall(10000); h.advance(0);
  const resumed = h.ctx.sources.slice(previous);
  assert.ok(resumed.length < 10);
  assert.ok(resumed.every(s => s.startAt >= 10));
  assert.equal(h.timers.size, 1);
});

test('the original phrase loops on audio time and percussion is deterministic', () => {
  const h = harness(); h.music.setActive(true); h.advance(23000);
  const loopAt = 0.04 + 128 * (60 / 88 / 4);
  const first = h.ctx.sources.slice(0, 6).map(s => s.frequency.events[0].value);
  const repeated = h.ctx.sources.filter(s => Math.abs(s.startAt - loopAt) < 0.000001).map(s => s.frequency.events[0].value);
  assert.deepEqual(repeated, first);
  const other = harness(); other.music.setActive(true); other.advance(1000);
  assert.deepEqual(h.music._noise.getChannelData(0), other.music._noise.getChannelData(0));
});

test('dispose closes audio once, releases scheduled nodes and prevents resurrection', async () => {
  const h = harness(); h.music.setActive(true); h.advance(800);
  await h.music.dispose(); await h.music.dispose();
  h.music.setActive(true); h.music.setEnabled(true); h.music.setVolume(1);
  assert.equal(await h.music.resume(), false); assert.equal(await h.music.unlock(), false);
  assert.equal(h.ctx.closes, 1); assert.equal(h.timers.size, 0);
  assert.ok(h.ctx.nodes.every(n => n.disconnected));
});

test('missing Web Audio support does not break the TV host', async () => {
  const h = harness(); h.music._contextFactory = () => null;
  h.music.setActive(true); assert.equal(await h.music.unlock(), false);
  h.music._contextFactory = () => { throw new Error('audio unavailable'); };
  assert.equal(await h.music.resume(), false);
  await h.music.suspend(); await h.music.dispose();
  assert.equal(h.timers.size, 0);
});
