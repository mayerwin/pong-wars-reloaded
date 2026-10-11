// Real web host handlers and actual HTML controls; audio/hardware output is
// separately checked in unit tests and the real-browser QA harness.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWebsite } = require('./helpers/web-host.cjs');

function clearFeedback(site) { site.cues.length = 0; site.feedbackCalls.length = 0; }

test('music can be off while web controls retain navigation and confirmation cues', () => {
  const site = loadWebsite(); site.window.emit('load');
  site.pointerClick('gear-btn'); site.pointerClick('music-toggle-off');
  assert.equal(site.music.playing, false); assert.equal(site.api.getSettings().soundEnabled, true);
  clearFeedback(site); site.pointerClick('close-settings-btn');
  assert.deepEqual(site.cues, ['back']);
  site.advance(200); site.key('Tab'); site.element('start-btn').focus();
  assert.deepEqual(site.cues, ['back', 'navigate']);
  site.pointerClick('gear-btn'); assert.equal(site.cues.at(-1), 'confirm');
  assert.equal(site.music.playing, false);
});

test('Sound Off silences its own click and Sound On confirms after settings are changed', () => {
  const site = loadWebsite(); site.pointerClick('gear-btn'); clearFeedback(site);
  site.pointerClick('snd-toggle-off');
  assert.equal(site.api.getSettings().soundEnabled, false);
  assert.deepEqual(site.cues, []);
  assert.deepEqual(site.feedbackCalls, ['confirm'], 'the cue reaches the newly-muted player after the control handler');
  clearFeedback(site); site.pointerClick('snd-toggle-on');
  assert.equal(site.api.getSettings().soundEnabled, true);
  assert.deepEqual(site.cues, ['confirm']);
  assert.equal(site.feedback.enabled, true);
});

test('start and resume emit one semantic cue across capture, target and bubble listeners', () => {
  const site = loadWebsite(); const phases = [], events = [];
  site.document.addEventListener('click', event => { phases.push('capture'); events.push(event); }, true);
  site.element('start-btn').addEventListener('click', event => { phases.push('target'); events.push(event); });
  site.document.addEventListener('click', event => { phases.push('bubble'); events.push(event); });
  const event = site.pointerClick('start-btn');
  assert.deepEqual(phases, ['capture', 'target', 'bubble']);
  assert.ok(events.every(item => item === event), 'deduplication sees the same click event throughout propagation');
  assert.equal(event.pongFeedbackBefore, 0);
  assert.deepEqual(site.feedbackCalls, ['start'], 'generic bubbling click must not add a confirm cue');
  assert.equal(site.api.getState().state, 'playing');
  site.api.pause(); clearFeedback(site); site.pointerClick('resume-btn');
  assert.equal(site.api.getState().state, 'playing');
  assert.deepEqual(site.feedbackCalls, ['resume']);
});

test('Enter and Space activate the focused option rather than starting a match', () => {
  const site = loadWebsite();
  const ai = site.element('mode-select').querySelector('[data-value="ai"]'); ai.focus();
  const enter = site.key('Enter');
  assert.equal(enter.defaultPrevented, true, 'native keyboard activation must not also generate a second click');
  assert.equal(site.api.getSettings().mode, 'ai'); assert.equal(site.api.getState().state, 'menu');
  assert.deepEqual(site.cues, ['confirm']);
  const watch = site.element('mode-select').querySelector('[data-value="aivsai"]'); watch.focus();
  const space = site.key(' ');
  assert.equal(space.defaultPrevented, true);
  assert.equal(site.api.getSettings().mode, 'aivsai'); assert.equal(site.api.getState().state, 'menu');
  const count = site.feedbackCalls.length;
  assert.equal(site.key(' ', { repeat: true }).defaultPrevented, true);
  assert.equal(site.feedbackCalls.length, count, 'held activation never clicks through');
});

test('Space in settings does not start gameplay and a focused slider retains native keys', () => {
  const site = loadWebsite(); site.pointerClick('gear-btn');
  site.document.body.focus(); site.key(' ');
  assert.equal(site.api.getState().state, 'menu');
  assert.equal(site.element('settings-overlay').classList.contains('hidden'), false);
  site.element('volume-slider').focus();
  assert.equal(site.key('ArrowRight').defaultPrevented, false);
  assert.equal(site.key(' ').defaultPrevented, false);
  assert.equal(site.api.getState().state, 'menu');
});

test('in-match gameplay settings are natively disabled and become editable again from the menu', () => {
  const site = loadWebsite(); site.api.start(); site.api.pause(); site.pointerClick('pause-settings-btn');
  const controls = site.document.querySelectorAll('.game-logic-setting button, .game-logic-setting input, .game-logic-setting select');
  assert.ok(controls.length >= 6);
  assert.ok(controls.every(control => control.disabled), 'CSS dimming alone cannot prevent native keyboard editing');
  assert.equal(site.element('volume-slider').disabled, false, 'sound remains adjustable during the match');
  const priorFocus = site.document.activeElement;
  site.element('pu-freq-slider').focus();
  assert.equal(site.document.activeElement, priorFocus, 'disabled native controls cannot acquire keyboard focus');
  site.api.showMenu(); site.pointerClick('gear-btn');
  assert.ok(controls.every(control => !control.disabled));
  site.element('pu-freq-slider').focus();
  assert.equal(site.key('ArrowRight').defaultPrevented, false);
  site.element('pu-freq-slider').value = '20'; site.element('pu-freq-slider').emit('input');
  assert.equal(site.api.getSettings().powerupFrequency, 20);
});

test('Escape returns through key bindings and pause settings without leaving a blank paused screen', () => {
  const site = loadWebsite(); site.api.start(); site.document.body.focus(); site.key('Escape');
  assert.equal(site.api.getState().state, 'paused');
  site.pointerClick('pause-settings-btn'); site.pointerClick('settings-keys-btn');
  assert.equal(site.element('keybind-overlay').classList.contains('hidden'), false);
  assert.equal(site.element('settings-overlay').classList.contains('hidden'), true);
  clearFeedback(site); site.key('Escape');
  assert.equal(site.api.getState().state, 'paused');
  assert.equal(site.element('keybind-overlay').classList.contains('hidden'), true);
  assert.equal(site.element('settings-overlay').classList.contains('hidden'), false);
  assert.equal(site.document.activeElement, site.element('settings-keys-btn'));
  assert.deepEqual(site.cues, ['back']);
  clearFeedback(site); site.key('Escape');
  assert.equal(site.api.getState().state, 'paused');
  assert.equal(site.element('settings-overlay').classList.contains('hidden'), true);
  assert.equal(site.element('pause-overlay').classList.contains('hidden'), false);
  assert.deepEqual(site.cues, ['back']);
  clearFeedback(site); site.key('Escape');
  assert.equal(site.api.getState().state, 'playing');
  assert.deepEqual(site.cues, ['resume']);
});

test('key-binding capture confirms success and Escape cancels capture before closing its overlay', () => {
  const site = loadWebsite(); site.pointerClick('config-keys-link');
  let bind = site.element('keybind-grid').querySelector('.keybind-btn'); site.pointerClick(bind);
  clearFeedback(site); site.key('z');
  assert.equal(JSON.parse(site.storage.get('pongWarsSettings')).keyBindings.p1.up, 'z');
  assert.deepEqual(site.cues, ['success']);
  site.pointerClick(bind); clearFeedback(site); site.key('Escape');
  assert.equal(site.element('keybind-overlay').classList.contains('hidden'), false);
  assert.equal(bind.classList.contains('listening'), false);
  assert.deepEqual(site.cues, ['back']);
  site.key('Escape'); assert.equal(site.element('keybind-overlay').classList.contains('hidden'), true);
  assert.equal(site.document.activeElement, site.element('config-keys-link'));
});

test('only genuine touch interactions request tiny haptics, independently of music or sound', () => {
  const site = loadWebsite({ touch: true }); site.api.configure({ menuMusicEnabled: false, soundEnabled: false });
  site.pointerClick('gear-btn', 'touch');
  assert.deepEqual(site.vibrations, [8]); assert.deepEqual(site.cues, []);
  site.advance(100); site.pointerClick('close-settings-btn', 'mouse');
  assert.deepEqual(site.vibrations, [8], 'mouse clicks on a touch-capable machine must not vibrate');
  site.advance(100); site.element('start-btn').focus(); site.key('Enter');
  assert.deepEqual(site.vibrations, [8], 'keyboard input clears touch provenance');
  site.api.showMenu(); site.advance(100); site.pointerClick('start-btn', 'touch');
  assert.deepEqual(site.vibrations.at(-1), [12, 30, 18]);
  assert.ok(site.vibrations.at(-1).filter((_, i) => i % 2 === 0).every(pulse => pulse <= 18));
});

test('touch feedback preference persists separately and turning it off cancels vibration immediately', () => {
  const site = loadWebsite({ touch: true }); site.pointerClick('gear-btn', 'touch'); site.advance(100);
  assert.equal(site.element('haptics-row').classList.contains('hidden'), false);
  site.pointerClick('haptics-toggle-off', 'touch');
  assert.equal(site.vibrations.at(-1), 0);
  assert.equal(JSON.parse(site.storage.get('pongWarsSettings')).hapticsEnabled, false);
  assert.equal(site.api.getSettings().soundEnabled, true);
  const reopened = loadWebsite({ touch: true, storage: site.storage }); reopened.pointerClick('gear-btn', 'touch');
  assert.deepEqual(reopened.vibrations, []);
  assert.equal(reopened.element('haptics-toggle-off').classList.contains('active'), true);
  reopened.pointerClick('haptics-toggle-on', 'touch');
  assert.deepEqual(reopened.vibrations, [8]);
});

test('backgrounding cancels touch vibration and foregrounding never replays it', () => {
  const site = loadWebsite({ touch: true }); site.pointerClick('gear-btn', 'touch');
  site.window.emit('blur'); assert.equal(site.vibrations.at(-1), 0);
  const count = site.vibrations.length, cues = site.cues.length;
  site.window.emit('focus');
  assert.equal(site.vibrations.length, count); assert.equal(site.cues.length, cues);
  site.advance(100); site.pointerClick('close-settings-btn', 'touch');
  site.document.hidden = true; site.document.emit('visibilitychange');
  assert.equal(site.vibrations.at(-1), 0);
  site.api.feedback('success'); assert.equal(site.vibrations.at(-1), 0);
});

test('TV controls never vibrate the browser and unsupported devices hide the preference', () => {
  const tv = loadWebsite({ touch: true, native: true }); tv.api.activateExternalControls(true);
  tv.element('start-btn').emit('pointerdown', { pointerType: 'touch' });
  tv.api.feedback('success'); tv.api.start();
  assert.deepEqual(tv.vibrations, []);
  for (const options of [{ touch: false }, { touch: true, vibration: false }]) {
    const site = loadWebsite(options); site.pointerClick('gear-btn');
    assert.equal(site.element('haptics-row').classList.contains('hidden'), true);
  }
});

test('focus navigation cues require a recent Tab, so pointer and programmatic focus stay quiet', () => {
  const site = loadWebsite(); site.element('start-btn').focus();
  assert.deepEqual(site.cues, []);
  site.key('Tab'); site.element('gear-btn').focus(); assert.deepEqual(site.cues, ['navigate']);
  site.element('start-btn').focus(); assert.deepEqual(site.cues, ['navigate']);
  site.advance(200); site.key('Tab'); site.element('gear-btn').emit('pointerdown', { pointerType: 'mouse' });
  site.element('gear-btn').focus(); assert.deepEqual(site.cues, ['navigate']);
});

test('the first Tab still produces navigation feedback when synchronous audio initialization is slow', () => {
  const site = loadWebsite({ feedbackUnlockDelayMs: 250 });
  site.key('Tab');
  site.element('start-btn').focus();
  assert.deepEqual(site.cues, ['navigate'], 'the focus-intent timestamp must be taken after the cold unlock call');
});
