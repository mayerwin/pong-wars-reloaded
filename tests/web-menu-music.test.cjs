// Real game lifecycle integration; shared DOM models capture/target/bubble order.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWebsite } = require('./helpers/web-host.cjs');

test('website starts default menu music after load and retries within keyboard or pointer gestures', () => {
  const site = loadWebsite();
  assert.equal(site.musicInstances.length, 0, 'host scripts run before the web player is created');
  site.window.emit('load');
  assert.equal(site.music.playing, true);
  assert.equal(site.music.volume, 0.7);
  site.document.emit('keydown', { key: 'q' });
  site.document.emit('pointerdown');
  assert.equal(site.music.unlocks, 2);
  assert.equal(site.musicInstances.length, 1);
});

test('menu music stops for play, pause and in-match settings, then returns after quitting or winning', () => {
  const site = loadWebsite(); site.window.emit('load');
  site.api.start({ mode: 'ai' });
  assert.equal(site.music.playing, false);
  site.api.pause();
  assert.equal(site.music.playing, false);
  site.element('pause-settings-btn').emit('click');
  assert.equal(site.music.playing, false);
  site.api.resume();
  assert.equal(site.music.playing, false);
  site.api.showMenu();
  assert.equal(site.music.playing, true);
  site.api.start(); site.run("triggerWin('day', false)");
  assert.equal(site.music.playing, true);
});

test('music toggle persists separately from sound effects, including reload and reset', () => {
  const site = loadWebsite(); site.window.emit('load');
  site.element('music-toggle-off').emit('click');
  assert.equal(site.music.playing, false);
  assert.equal(site.api.getSettings().soundEnabled, true);
  assert.equal(JSON.parse(site.storage.get('pongWarsSettings')).menuMusicEnabled, false);
  const reopened = loadWebsite({ storage: site.storage }); reopened.window.emit('load');
  assert.equal(reopened.music.playing, false);
  reopened.element('gear-btn').emit('click');
  assert.equal(reopened.element('music-toggle-off').classList.contains('active'), true);
  reopened.element('reset-music').emit('click');
  assert.equal(reopened.music.playing, true);
  assert.equal(JSON.parse(site.storage.get('pongWarsSettings')).menuMusicEnabled, true);
});

test('master sound and volume changes apply immediately without erasing the music preference', () => {
  const site = loadWebsite(); site.window.emit('load');
  site.element('snd-toggle-off').emit('click');
  assert.equal(site.music.playing, false);
  assert.equal(site.api.getSettings().menuMusicEnabled, true);
  site.element('snd-toggle-on').emit('click');
  assert.equal(site.music.playing, true);
  site.element('volume-slider').value = '25'; site.element('volume-slider').emit('input');
  assert.equal(site.music.volume, 0.25);
  site.api.configure({ soundVolume: 0 });
  assert.equal(site.music.playing, false);
  site.api.configure({ soundVolume: 80 });
  assert.equal(site.music.playing, true);
  assert.equal(site.music.volume, 0.8);
});

test('background pages stay silent and foreground transitions respect mute and match state', () => {
  const site = loadWebsite(); site.window.emit('load');
  site.window.emit('blur'); assert.equal(site.music.playing, false);
  site.document.hidden = true; site.document.emit('visibilitychange');
  site.window.emit('focus'); assert.equal(site.music.playing, false);
  site.document.hidden = false; site.document.emit('visibilitychange'); assert.equal(site.music.playing, true);
  site.window.emit('pagehide'); assert.equal(site.music.playing, false);
  site.window.emit('pageshow'); assert.equal(site.music.playing, true);
  site.api.configure({ menuMusicEnabled: false });
  site.window.emit('blur'); site.window.emit('focus'); assert.equal(site.music.playing, false);
  site.api.configure({ menuMusicEnabled: true }); site.api.start();
  site.window.emit('blur'); site.window.emit('focus');
  assert.equal(site.api.getState().state, 'paused');
  assert.equal(site.music.playing, false);
});

test('native and preview TV hosts never create a second music player', () => {
  for (const native of [false, true]) {
    const site = loadWebsite({ native });
    if (!native) site.api.activateExternalControls(true);
    site.window.emit('load'); site.document.emit('pointerdown'); site.window.emit('focus');
    assert.equal(site.musicInstances.length, 0);
  }
  const site = loadWebsite(); site.window.emit('load');
  const previous = site.music;
  site.api.activateExternalControls(true);
  assert.equal(previous.disposed, true, 'a host taking over later releases the web AudioContext');
  site.api.showMenu(); site.document.emit('pointerdown');
  assert.equal(site.musicInstances.length, 1);
  site.api.activateExternalControls(false);
  assert.equal(site.musicInstances.length, 2);
  assert.equal(site.music.playing, true);
});
