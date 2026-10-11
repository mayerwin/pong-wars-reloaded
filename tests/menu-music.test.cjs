const assert = require('node:assert/strict');
const { test } = require('node:test');
const Music = require('../menu-music.js');

class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, at) { this.events.push({ type: 'set', value, at }); }
  linearRampToValueAtTime(value, at) { this.events.push({ type: 'linear', value, at }); }
  cancelScheduledValues(at) { this.events.push({ type: 'cancel', at }); }
}

function harness(initialState = 'running', options = {}) {
  let now = 0, nextId = 0, creates = 0;
  const timers = new Map(), fetches = [];
  const buffer = { duration: 74.25414966, sampleRate: 44100, length: 3274608 };
  const ctx = {
    state: initialState, currentTime: 0, destination: {},
    sources: [], gains: [], resumes: 0, suspends: 0, closes: 0, decodes: 0,
    resume() { this.resumes++; if (this.resumeImpl) return this.resumeImpl(); this.state = 'running'; return Promise.resolve(); },
    suspend() { this.suspends++; if (this.suspendImpl) return this.suspendImpl(); this.state = 'suspended'; return Promise.resolve(); },
    close() { this.closes++; this.state = 'closed'; return Promise.resolve(); },
    decodeAudioData(data) { this.decodes++; return this.decodeImpl ? this.decodeImpl(data) : Promise.resolve(buffer); },
    createGain() {
      const gain = { gain: new Param(), connect() {}, disconnect() { this.disconnected = true; } };
      this.gains.push(gain); return gain;
    },
    createBufferSource() {
      const source = { starts: [], stops: 0, connect() {}, disconnect() { this.disconnected = true; },
        start(...args) { this.starts.push(args); }, stop() { this.stops++; } };
      this.sources.push(source); return source;
    },
  };
  const h = { ctx, buffer, timers, fetches, get creates() { return creates; },
    response: () => ({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        if (ctx.state === 'running') ctx.currentTime += (next[1].at - now) / 1000;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      if (ctx.state === 'running') ctx.currentTime += (end - now) / 1000;
      now = end;
    },
    target: () => ctx.gains[0].gain.events.filter(e => e.type === 'linear').at(-1)?.value,
  };
  h.music = new Music({
    ...options,
    audioContextFactory() { creates++; return ctx; },
    fetch(url, init) { fetches.push({ url, init }); return h.fetchImpl ? h.fetchImpl() : Promise.resolve(h.response()); },
    now: () => now,
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return h;
}
async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

test('inactive, muted and background music fetches nothing and creates no audio context', async () => {
  const h = harness();
  assert.equal(await h.music.unlock(), false);
  h.music.setEnabled(false); h.music.setActive(true);
  assert.equal(await h.music.unlock(), false);
  h.music.setVolume(0); h.music.setEnabled(true);
  assert.equal(await h.music.unlock(), false);
  await h.music.suspend(); h.music.setVolume(0.7);
  assert.equal(await h.music.unlock(), false);
  assert.equal(h.creates, 0); assert.equal(h.fetches.length, 0);
  assert.equal(await h.music.resume(), true);
  assert.equal(h.creates, 1); assert.equal(h.fetches.length, 1);
});

test('the recording is decoded once and loops natively without a JavaScript scheduler', async () => {
  const h = harness(); h.music.setActive(true); await settle();
  assert.equal(h.fetches[0].url, 'assets/audio/arcade-menu.mp3');
  assert.equal(h.ctx.decodes, 1); assert.equal(h.ctx.sources.length, 1);
  const source = h.ctx.sources[0];
  assert.equal(source.buffer, h.buffer); assert.equal(source.loop, true);
  assert.equal(source.loopStart, 0); assert.equal(source.loopEnd, h.buffer.duration);
  assert.deepEqual(source.starts, [[0, 0]]);
  assert.equal(h.target(), 0.7 * 0.25);
  for (let i = 0; i < 30; i++) { h.music.setActive(true); await h.music.unlock(); }
  h.advance(600000);
  assert.equal(h.timers.size, 0, 'the audio graph owns the loop timing');
  assert.equal(h.ctx.sources.length, 1); assert.equal(h.fetches.length, 1);
});

test('optional loop boundaries are clamped to the decoded recording', async () => {
  const h = harness('running', { assetUrl: 'custom.mp3', loopStart: 2, loopEnd: 100 });
  h.music.setActive(true); await settle();
  assert.equal(h.fetches[0].url, 'custom.mp3');
  assert.equal(h.music._source.loopStart, 2);
  assert.equal(h.music._source.loopEnd, h.buffer.duration);
  assert.deepEqual(h.music._source.starts, [[0, 2]]);
  const invalid = harness('running', { loopStart: 100, loopEnd: -1 });
  invalid.music.setActive(true); await settle();
  assert.equal(invalid.music._source.loopStart, 0);
  assert.equal(invalid.music._source.loopEnd, invalid.buffer.duration);
});

test('leaving the menu fades out, releases its source and suspends; returning reuses decoded data', async () => {
  const h = harness(); h.music.setActive(true); await settle(); h.advance(1000);
  const old = h.music._source;
  h.music.setActive(false);
  assert.equal(h.target(), 0); assert.equal(h.music._playing, false);
  for (let i = 0; i < 5; i++) { await h.music.unlock(); h.advance(40); }
  h.advance(100);
  assert.equal(old.stops, 0, 'music is still fading at 300ms during the launch cue');
  assert.equal(h.ctx.state, 'running');
  h.advance(250); await settle();
  assert.equal(old.stops, 1); assert.equal(old.disconnected, true);
  assert.equal(h.music._source, null); assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.state, 'suspended');
  h.music.setActive(true); await settle();
  assert.equal(h.ctx.sources.length, 2); assert.equal(h.ctx.decodes, 1);
  assert.equal(h.fetches.length, 1); assert.equal(h.creates, 1);
  assert.equal(h.music._playing, true);
});

test('rapid menu toggles cancel fade cleanup without stacking looping sources', async () => {
  const h = harness(); h.music.setActive(true); await settle();
  const source = h.music._source;
  for (let i = 0; i < 20; i++) {
    h.music.setActive(false); h.advance(50); h.music.setActive(true); h.advance(50);
  }
  await settle(); h.advance(1000);
  assert.equal(h.music._source, source); assert.equal(source.stops, 0);
  assert.equal(h.ctx.sources.length, 1); assert.equal(h.timers.size, 0);
});

test('volume and master/music mute remain bounded and preserve cached recording', async () => {
  const h = harness(); h.music.setActive(true); await settle();
  h.music.setVolume(0.2); assert.equal(h.target(), 0.2 * 0.25);
  h.music.setVolume(NaN); assert.equal(h.target(), 0.2 * 0.25);
  h.music.setVolume(5); assert.equal(h.target(), 0.25);
  h.music.setEnabled(false); h.advance(550); await settle();
  assert.equal(h.ctx.state, 'suspended'); assert.equal(h.music._source, null);
  h.music.setEnabled(true); await settle(); assert.equal(h.music._playing, true);
  h.music.setVolume(-1); h.advance(550); await settle();
  assert.equal(h.music.volume, 0); assert.equal(h.music._playing, false);
  h.music.setVolume(0.5); await settle(); assert.equal(h.music._playing, true);
  assert.equal(h.ctx.decodes, 1);
});

test('explicit mute or zero volume stops quickly while leaving the menu keeps its launch fade', async () => {
  for (const leaving of [false, true]) for (const mute of [music => music.setEnabled(false), music => music.setVolume(0)]) {
    const h = harness(); h.music.setActive(true); await settle(); h.advance(1000);
    if (leaving) { h.music.setActive(false); h.advance(100); }
    mute(h.music);
    const fade = h.ctx.gains[0].gain.events.filter(event => event.type === 'linear').at(-1);
    assert.ok(Math.abs(fade.at - h.ctx.currentTime - 0.03) < 1e-9);
    h.advance(80); await settle();
    assert.equal(h.music._source, null); assert.equal(h.ctx.state, 'suspended');
  }
});

test('backgrounding immediately stops audio and a foreground return starts one loop', async () => {
  const h = harness(); h.music.setActive(true); await settle();
  const source = h.music._source;
  await h.music.suspend();
  assert.equal(source.disconnected, true); assert.equal(h.ctx.state, 'suspended');
  assert.equal(h.timers.size, 0); assert.equal(await h.music.unlock(), false);
  assert.equal(await h.music.resume(), true);
  assert.equal(h.ctx.sources.length, 2); assert.equal(h.music._playing, true);
});

test('denied autoplay remains silent until a later gesture unlocks the decoded recording', async () => {
  const h = harness('suspended');
  h.ctx.resumeImpl = () => Promise.reject(new Error('gesture required'));
  h.music.setActive(true); await settle();
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.ctx.decodes, 1);
  delete h.ctx.resumeImpl;
  assert.equal(await h.music.unlock(), true);
  assert.equal(h.ctx.resumes, 2); assert.equal(h.ctx.sources.length, 1);
});

test('gesture resume retries pending autoplay synchronously before download or decode finishes', async () => {
  const h = harness('suspended'); let resolveAutoplay, resolveFetch;
  h.ctx.resumeImpl = () => new Promise(done => { resolveAutoplay = done; });
  h.fetchImpl = () => new Promise(done => { resolveFetch = () => done(h.response()); });
  h.music.setActive(true); await settle();
  assert.equal(h.ctx.resumes, 1); assert.equal(h.fetches.length, 1);
  h.music.setVolume(0.5); assert.equal(h.ctx.resumes, 1);
  delete h.ctx.resumeImpl;
  const unlocked = h.music.unlock();
  assert.equal(h.ctx.resumes, 2, 'resume is called within the gesture, before awaiting loading');
  assert.equal(h.ctx.state, 'running'); assert.equal(h.ctx.sources.length, 0);
  resolveFetch(); assert.equal(await unlocked, true);
  resolveAutoplay(); await settle();
  assert.equal(h.ctx.sources.length, 1); assert.equal(h.fetches.length, 1);
});

test('mute before the first gesture cannot deadlock autoplay; late resume cannot restart a match', async () => {
  const h = harness('suspended'); let resolveAutoplay;
  h.ctx.resumeImpl = () => new Promise(done => { resolveAutoplay = done; });
  h.music.setActive(true); h.music.setEnabled(false); h.music.setEnabled(true);
  delete h.ctx.resumeImpl;
  assert.equal(await h.music.unlock(), true);
  h.music.setActive(false); h.advance(550); await settle();
  h.ctx.state = 'running'; resolveAutoplay(); await settle();
  assert.equal(h.ctx.state, 'suspended'); assert.equal(h.music._source, null);
  assert.equal(h.timers.size, 0);
});

test('a foreground transition racing asynchronous suspension resumes the recording once', async () => {
  const h = harness(); let resolve;
  h.music.setActive(true); await settle();
  h.ctx.suspendImpl = () => new Promise(done => { resolve = () => { h.ctx.state = 'suspended'; done(); }; });
  h.music.suspend();
  const resumed = h.music.resume(); resolve();
  assert.equal(await resumed, true);
  assert.equal(h.ctx.state, 'running'); assert.equal(h.music._playing, true);
  assert.equal(h.ctx.sources.length, 2);
});

test('a download finishing during gameplay caches the track without playing it', async () => {
  const h = harness(); let resolve;
  h.fetchImpl = () => new Promise(done => { resolve = () => done(h.response()); });
  h.music.setActive(true); await settle(); h.music.setActive(false);
  resolve(); await settle();
  assert.equal(h.ctx.sources.length, 0); assert.equal(h.music._buffer, h.buffer);
  h.music.setActive(true); await settle();
  assert.equal(h.music._playing, true); assert.equal(h.fetches.length, 1);
});

test('late decoding never starts audio after mute, backgrounding or disposal', async () => {
  for (const action of ['mute', 'background', 'dispose']) {
    const h = harness(); let resolve;
    h.ctx.decodeImpl = () => new Promise(done => { resolve = () => done(h.buffer); });
    h.music.setActive(true); await settle();
    if (action === 'mute') h.music.setEnabled(false);
    if (action === 'background') await h.music.suspend();
    if (action === 'dispose') await h.music.dispose();
    resolve(); await settle();
    assert.equal(h.ctx.sources.length, 0, action);
    assert.equal(h.music._playing, false, action);
    if (action === 'dispose') assert.equal(h.music._buffer, null);
  }
});

test('failed fetches retry on a later gesture with backoff, without repeated automatic requests', async () => {
  const h = harness(); h.fetchImpl = () => Promise.resolve({ ok: false });
  h.music.setActive(true); await settle();
  assert.equal(h.fetches.length, 1); assert.equal(h.music._playing, false);
  await h.music.unlock(); h.music.setVolume(0.5); h.advance(4000); h.music.setVolume(0.4); await settle();
  assert.equal(h.fetches.length, 1, 'only a new gesture after backoff retries');
  delete h.fetchImpl;
  assert.equal(await h.music.unlock(), true); assert.equal(h.fetches.length, 2);
});

test('network and decoding errors remain silent and recover through a new gesture', async () => {
  for (const failure of ['network', 'decode', 'empty']) {
    const h = harness();
    if (failure === 'network') h.fetchImpl = () => Promise.reject(new Error('offline'));
    else h.ctx.decodeImpl = () => failure === 'empty' ? Promise.resolve({ duration: 0 }) : Promise.reject(new Error('bad audio'));
    h.music.setActive(true); await settle();
    assert.equal(h.music._playing, false); assert.equal(h.ctx.sources.length, 0);
    h.advance(3000); delete h.fetchImpl; delete h.ctx.decodeImpl;
    assert.equal(await h.music.unlock(), true, failure);
  }
});

test('dispose aborts loading, releases sources and gain, and closes audio exactly once', async () => {
  const pending = harness(); let resolve;
  pending.fetchImpl = () => new Promise(done => { resolve = () => done(pending.response()); });
  pending.music.setActive(true); await settle(); await pending.music.dispose();
  assert.equal(pending.fetches[0].init.signal.aborted, true);
  resolve(); await settle(); assert.equal(pending.ctx.decodes, 0);
  const h = harness(); h.music.setActive(true); await settle();
  const source = h.music._source;
  await h.music.dispose(); await h.music.dispose();
  h.music.setActive(true); h.music.setEnabled(true); h.music.setVolume(1);
  assert.equal(await h.music.resume(), false); assert.equal(await h.music.unlock(), false);
  assert.equal(h.ctx.closes, 1); assert.equal(h.timers.size, 0);
  assert.equal(source.stops, 1); assert.equal(source.disconnected, true);
  assert.equal(h.ctx.gains[0].disconnected, true); assert.equal(h.music._buffer, null);
});

test('missing Web Audio or fetch support never breaks either host', async () => {
  const h = harness(); h.music._contextFactory = () => null;
  h.music.setActive(true); assert.equal(await h.music.unlock(), false);
  h.music._contextFactory = () => { throw new Error('audio unavailable'); };
  assert.equal(await h.music.resume(), false); assert.equal(h.fetches.length, 0);
  const noFetch = harness(); noFetch.music._fetch = null;
  noFetch.music.setActive(true); assert.equal(await noFetch.music.unlock(), false);
  await noFetch.music.dispose(); assert.equal(noFetch.ctx.sources.length, 0);
});
