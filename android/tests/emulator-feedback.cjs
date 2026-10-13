// Native audio regression for the dedicated debuggable TV emulator.
// Uses the restricted app-owned CDP driver, never a physical TV or browser.
// Usage: PONG_QA_SERIAL=emulator-5556 node android/tests/emulator-feedback.cjs
// Enables Sound at 70% and disables menu music in this QA app's preferences.
// Native accepted-play counts and synchronous bridge dispatch are observable;
// these are NOT measurements of speaker, HDMI, soundbar or eARC output latency.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { connect, sleep } = require('./emulator-driver.cjs');
const out = path.resolve(__dirname, '../app/build/qa');
const results = [];
let app;

const snapshot = () => app.evaluate(`(() => {
  const f = uiFeedback;
  return {requests: window.__qaCueRequests || [], native: JSON.parse(AndroidHost.getAudioInfo()),
    effectsContextCreated: !!audio.ctx, feedbackContextCreated: !!f?._ctx,
    webNotes: window.__qaWebNotes || 0, voices: f?._voices.size || 0, pending: f?._pending || null,
    background: f?.background || false, enabled: f?.enabled,
    settings: PongGame.getSettings(), musicOff: localStorage.getItem('pongTVMenuMusic.v1') === 'off',
    game: PongGame.getState().state};
})()`);

async function record(name) {
  const state = await snapshot();
  results.push({ name, ...state });
  console.log(JSON.stringify({ name, ...state }));
  return state;
}
async function clear() { await app.evaluate('window.__qaCueRequests = [];'); }
function assertNativeOnly(state) {
  assert.equal(state.native.backend, 'Android SoundPool');
  assert.equal(state.native.ready, true);
  assert.equal(state.native.loaded, 12);
  assert.equal(state.native.total, 12);
  assert.equal(state.native.failures, 0);
  assert.equal(state.effectsContextCreated, false, 'ready native effects do not allocate Web Audio');
  assert.equal(state.feedbackContextCreated, false);
  assert.equal(state.webNotes, 0);
}
function assertOneCue(state, kind, played = true) {
  assertNativeOnly(state);
  assert.deepEqual(state.requests.map(request => request.kind), [kind]);
  assert.equal(state.requests[0].played, played);
  assert.equal(state.requests[0].nativeDelta, played ? 1 : 0);
  assert.ok(Number.isFinite(state.requests[0].dispatchMs) && state.requests[0].dispatchMs >= 0);
}
async function nativeSelect(action) {
  assert.ok(await app.evaluate(`(() => {
    const button = document.querySelector('[data-do="${action}"]');
    if (!button) return false;
    button.focus(); return true;
  })()`), 'Missing action ' + action);
  await app.nativeKey('DPAD_CENTER');
  await sleep(120);
}

async function main() {
  app = await connect();
  try {
    await app.evaluate(`PongGame.configure({soundEnabled: true, soundVolume: 70});
      localStorage.setItem('pongTVMenuMusic.v1', 'off'); location.reload();`);
    await sleep(500);
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      ready = await app.evaluate(`!!window.PongGame && !!document.querySelector('#tv-root') && AndroidHost.isNativeAudioReady()`);
      if (ready) break;
      await sleep(250);
    }
    assert.equal(ready, true, 'all 12 native effects must finish preloading');
    await app.waitFor(state => state.title.includes('PONG WARS'), 'Expected TV home');
    await app.evaluate(`(() => {
      window.__qaCueRequests = []; window.__qaWebNotes = 0;
      const prototype = PongFeedback.prototype, play = prototype.play, note = prototype._note;
      prototype.play = function(kind) {
        const before = JSON.parse(AndroidHost.getAudioInfo()).plays;
        const entry = {kind, focus: document.activeElement?.dataset.do, played: null, at: performance.now()};
        const started = performance.now();
        const result = play.call(this, kind);
        entry.dispatchMs = performance.now() - started;
        entry.nativeDelta = JSON.parse(AndroidHost.getAudioInfo()).plays - before;
        __qaCueRequests.push(entry);
        return Promise.resolve(result).then(played => { entry.played = played; return played; });
      };
      prototype._note = function(...args) { __qaWebNotes++; return note.apply(this, args); };
    })()`);

    await sleep(250);
    assert.deepEqual((await snapshot()).requests, []);
    await app.nativeKey('DPAD_UP');
    assert.deepEqual((await snapshot()).requests, [], 'an edge without a focus move stays quiet');
    await app.nativeKey('DPAD_DOWN');
    let state = await record('native-navigation-with-music-off');
    assert.equal(state.musicOff, true);
    assertOneCue(state, 'navigate');

    await clear(); await nativeSelect('options');
    assertOneCue(await record('native-confirm'), 'confirm');
    await clear(); await nativeSelect('setting-soundEnabled');
    state = await record('sound-off');
    assert.equal(state.enabled, false);
    assertOneCue(state, 'confirm', false);
    assert.equal(state.native.activeStreams, 0);
    const mutedPlays = state.native.plays;
    await clear(); await app.nativeKey('DPAD_RIGHT');
    state = await record('muted-navigation');
    assertNativeOnly(state);
    assert.equal(state.native.plays, mutedPlays);
    assert.ok(state.requests.every(request => request.played === false && request.nativeDelta === 0));
    await clear(); await nativeSelect('setting-soundEnabled');
    state = await record('sound-on');
    assert.equal(state.enabled, true);
    assertOneCue(state, 'confirm');

    // Cycle the real Volume button from 100% to 0%; the mute action is silent.
    await app.evaluate('PongGame.configure({soundVolume: 100});');
    await clear(); await nativeSelect('setting-soundVolume');
    state = await record('zero-volume');
    assert.equal(state.settings.soundVolume, 0);
    assertOneCue(state, 'confirm', false);
    assert.equal(state.native.activeStreams, 0);
    const zeroPlays = state.native.plays;
    await app.evaluate('audio.playRacketHit(); audio.playPowerup(); audio.playWin();');
    assert.equal((await snapshot()).native.plays, zeroPlays, 'zero volume also silences gameplay effects');
    await app.evaluate('PongGame.configure({soundVolume: 70});');

    await nativeSelect('options-back');
    await clear(); await nativeSelect('watch');
    await sleep(400);
    state = await record('one-start-cue');
    assert.equal(state.game, 'playing');
    assertOneCue(state, 'start');
    const gameplay = await app.evaluate(`(() => {
      const before = JSON.parse(AndroidHost.getAudioInfo()).plays;
      audio.playRacketHit(); audio.playPowerup(); audio.playWin();
      return {accepted: JSON.parse(AndroidHost.getAudioInfo()).plays - before, effectsContextCreated: !!audio.ctx};
    })()`);
    assert.equal(gameplay.accepted, 3, 'racket, powerup and win effects all dispatch through native audio');
    assert.equal(gameplay.effectsContextCreated, false);
    results.push({ name: 'native-gameplay-routing', ...gameplay });

    await clear(); await app.nativeKey('BACK'); await sleep(120);
    state = await record('one-pause-cue');
    assert.equal(state.game, 'paused'); assertOneCue(state, 'pause');
    await clear(); await app.nativeKey('BACK'); await sleep(120);
    state = await record('one-resume-cue');
    assert.equal(state.game, 'playing'); assertOneCue(state, 'resume');

    for (let cycle = 1; cycle <= 3; cycle++) {
      await clear(); await app.nativeKey('HOME'); await sleep(300);
      state = await record('background-cancelled-' + cycle);
      assertNativeOnly(state);
      assert.equal(state.background, true); assert.equal(state.native.active, false);
      assert.equal(state.native.activeStreams, 0); assert.equal(state.pending, null);
      assert.deepEqual(state.requests, []);
      const pausedPlays = state.native.plays;
      app.adb('shell', 'am', 'start', '-n', 'com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');
      for (let attempt = 0; attempt < 40; attempt++) {
        const foreground = await snapshot();
        if (!foreground.background && foreground.native.active) break;
        await sleep(100);
      }
      state = await record('foreground-silent-' + cycle);
      assertNativeOnly(state);
      assert.equal(state.background, false); assert.equal(state.native.active, true);
      assert.equal(state.native.activeStreams, 0); assert.equal(state.native.plays, pausedPlays);
      assert.equal(state.game, 'paused'); assert.deepEqual(state.requests, []);
    }

    await nativeSelect('home'); await clear();
    const pads = await app.createNativePads([11]);
    try { await pads.key(11, 'DPAD_DOWN', 1500, true); }
    finally { pads.close(); }
    await sleep(100);
    state = await record('held-navigation');
    assertNativeOnly(state);
    const navigation = state.requests.filter(request => request.kind === 'navigate');
    assert.ok(navigation.length > 1);
    assert.equal(new Set(navigation.map(request => request.focus)).size, navigation.length, 'one cue per actual focus move');
    assert.ok(navigation.every((request, index) => !index || request.at - navigation[index - 1].at >= 150), 'held repeat rate stays bounded');
    assert.ok(navigation.every(request => request.played && request.nativeDelta === 1));
    assert.equal(app.errors.length, 0, JSON.stringify(app.errors));
  } finally {
    const times = results.flatMap(result => result.requests || []).filter(request => request.played).map(request => request.dispatchMs).sort((a, b) => a - b);
    const dispatch = times.length ? {samples: times.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * .95))], meaning: 'synchronous JS-to-native cue dispatch only; excludes physical audio output latency'} : null;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'feedback-native.json'), JSON.stringify({ results, dispatch, errors: app?.errors }, null, 2));
    console.log(JSON.stringify({ dispatch }));
    await app?.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
