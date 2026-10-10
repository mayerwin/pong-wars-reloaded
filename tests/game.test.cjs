// Run with: node --test tests/game.test.cjs
// Exercise the actual game script with a minimal DOM, without a build tool or
// dependencies. Native Android input has separate tests in android/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    emit(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn({ preventDefault() {}, ...event });
    },
  };
}

function loadGame(savedStorage = new Map()) {
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(id !== 'menu' ? ['hidden'] : []);
    const result = {
      ...eventTarget(), id, style: {}, dataset: {}, className: '', textContent: '',
      classList: {
        add(...values) { values.forEach(v => classes.add(v)); },
        remove(...values) { values.forEach(v => classes.delete(v)); },
        contains(value) { return classes.has(value); },
        toggle(value, enabled = !classes.has(value)) {
          if (enabled) classes.add(value); else classes.delete(value);
        },
      },
      querySelector(selector) { return element(id + selector); },
      querySelectorAll() { return []; },
      getContext() { return {}; },
    };
    elements.set(id, result);
    return result;
  }
  const timeouts = new Map();
  let nextTimeout = 1;
  const window = { ...eventTarget(), matchMedia: () => ({ matches: true }) };
  const document = {
    ...eventTarget(), body: element('body'), hidden: false,
    getElementById: element, querySelectorAll: () => [],
  };
  const context = vm.createContext({
    window, document, navigator: { maxTouchPoints: 0 }, screen: {},
    localStorage: { getItem: key => savedStorage.get(key) || null, setItem: (key, value) => savedStorage.set(key, value) },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => 0 }, requestAnimationFrame() {},
    setTimeout(fn) { const id = nextTimeout++; timeouts.set(id, fn); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  });
  vm.runInContext(source, context, { filename: 'game.js' });
  vm.runInContext('render = () => {}; Math.random = () => 0.5;', context);
  return {
    api: window.PongGame, window, document, element, storage: savedStorage,
    run: expression => vm.runInContext(expression, context),
    flushTimeouts() { for (const [id, fn] of [...timeouts]) { timeouts.delete(id); fn(); } },
  };
}

function startExternal(game) {
  game.api.activateExternalControls(true);
  game.api.start({ mode: '2p', difficulty: 'medium', duration: 180 });
  game.run('settings.freeMovement = true; settings.effectsEnabled = false; balls = [];');
}

test('the host API is opt-in and disabling it restores keyboard control', () => {
  const game = loadGame();
  assert.equal(game.api.setInput(0, { y: 1 }), false);
  game.api.start({ mode: '2p' });
  game.run('settings.freeMovement = true; balls = [];');
  game.document.emit('keydown', { key: 'd' });
  game.run('updatePlayers()');
  assert.equal(game.api.getState().players[0].y, 412);
  game.api.activateExternalControls(true);
  game.document.emit('keydown', { key: 'd' });
  game.run('updatePlayers()');
  assert.equal(game.api.getState().players[0].y, 412);
  game.api.activateExternalControls(false);
  game.document.emit('keydown', { key: 'd' });
  game.run('updatePlayers()');
  assert.equal(game.api.getState().players[0].y, 425); // Existing keyboard grid snap.
});

test('two controllers remain independent and analog movement keeps subpixels', () => {
  const game = loadGame();
  startExternal(game);
  game.run('player1.cx = 37.5; player2.cx = 762.5;');
  game.api.setInput(0, { x: 0.02 });
  game.api.setInput(1, { y: -0.5 });
  game.run('for (let i = 0; i < 10; i++) updatePlayers();');
  assert.ok(Math.abs(game.api.getState().players[0].x - 39.9) < 1e-8);
  assert.equal(game.api.getState().players[1].y, 340);
  const before = game.api.getState().players[0];
  game.api.setInput(0, { x: 1, y: 1 });
  game.run('updatePlayers()');
  const after = game.api.getState().players[0];
  assert.ok(Math.abs(Math.hypot(after.x - before.x, after.y - before.y) - 12) < 1e-8);
});

test('input validation prevents invalid axes, indices and game settings', () => {
  const game = loadGame();
  startExternal(game);
  assert.equal(game.api.setInput(2, { x: 1 }), false);
  game.api.setInput(0, { x: Infinity, y: NaN });
  game.run('updatePlayers()');
  assert.ok(Number.isFinite(game.api.getState().players[0].x));
  assert.throws(() => game.api.start({ duration: 0 }), /Duration/);
  assert.throws(() => game.api.start({ mode: 'bogus' }), /mode/);
  assert.throws(() => game.api.start({ difficulty: 'bogus' }), /difficulty/);
  const snapshot = game.api.getState();
  snapshot.players[0].x = -100;
  snapshot.teleports[0].remaining = -1;
  assert.notEqual(game.api.getState().players[0].x, -100);
  assert.equal(game.api.getState().teleports[0].remaining, 3);
});

test('rotation and the dedicated teleport action work without a key chord', () => {
  const game = loadGame();
  startExternal(game);
  game.run('player1.cx = 250;');
  game.api.setInput(0, { rotateRight: true });
  game.run('updatePlayers()');
  assert.equal(game.api.getState().players[0].angle, Math.PI / 4);
  game.api.setInput(0, { teleport: true });
  game.run('for (let i = 0; i < 119; i++) updatePlayers();');
  assert.equal(game.api.getState().teleports[0].remaining, 3);
  assert.ok(game.api.getState().teleports[0].charge > 0.99);
  game.run('updatePlayers()');
  assert.equal(game.api.getState().teleports[0].remaining, 2);
  assert.equal(game.api.getState().teleports[0].charge, 0);
});

test('pause, blur and resume clear movement and charge without a catch-up jump', () => {
  const game = loadGame();
  startExternal(game);
  game.api.setInput(0, { y: 1, teleport: true });
  game.run('gameLoop(0); gameLoop(20);');
  game.window.emit('blur');
  assert.equal(game.api.getState().state, 'paused');
  assert.equal(game.api.getState().teleports[0].charge, 0);
  const position = game.api.getState().players[0].y;
  const ticks = game.run('game.tickCount');
  game.api.resume();
  game.run('gameLoop(5000); gameLoop(5017);');
  assert.equal(game.api.getState().players[0].y, position);
  assert.equal(game.run('game.tickCount'), ticks + 1);
  game.document.hidden = true;
  game.document.emit('visibilitychange');
  assert.equal(game.api.getState().state, 'paused');
});

test('holding Escape only pauses once', () => {
  const game = loadGame();
  game.api.start();
  game.document.emit('keydown', { key: 'Escape' });
  game.document.emit('keydown', { key: 'Escape', repeat: true });
  assert.equal(game.api.getState().state, 'paused');
});

test('simulation and effects agree across 30, 60, 120 and 144 Hz displays', () => {
  const results = [30, 60, 120, 144].map(rate => {
    const game = loadGame();
    startExternal(game);
    game.api.setInput(0, { y: 0.1 });
    game.run('particles = [{x:0,y:0,vx:1,vy:2,life:10,decay:0.01}];');
    for (let frame = 0; frame <= rate * 2; frame++) game.run(`gameLoop(${frame * 1000 / rate});`);
    return game.run('JSON.stringify({ticks:game.tickCount,y:player1.cy,time:game.timeRemaining,particles})');
  });
  assert.equal(JSON.parse(results[0]).ticks, 120);
  assert.equal(new Set(results).size, 1);
});

test('a close victory is not reported as a draw after rounding percentages', () => {
  const game = loadGame();
  game.api.start();
  game.run("dayScore = 513; nightScore = 511; triggerWin('day', false);");
  game.flushTimeouts();
  assert.equal(game.element('winner-text').textContent, 'DAY WINS!');
  assert.match(game.element('final-score').textContent, /513.*511/);
});

test('ball physics and territory match at different display refresh rates', () => {
  const results = [30, 60, 120].map(rate => {
    const game = loadGame();
    game.api.start({ mode: 'aivsai', winCondition: 'timed' });
    game.run('settings.effectsEnabled = false;');
    for (let frame = 0; frame <= rate * 5; frame++) game.run(`gameLoop(${frame * 1000 / rate});`);
    return game.run('JSON.stringify({ticks:game.tickCount,dayScore,nightScore,balls,squares})');
  });
  assert.equal(JSON.parse(results[0]).ticks, 300);
  assert.equal(new Set(results).size, 1);
});

test('a delayed results overlay cannot cover a new match or the menu', () => {
  for (const transition of ['start', 'showMenu']) {
    const game = loadGame();
    game.api.start();
    game.run("triggerWin('day', true);");
    game.api[transition]();
    game.flushTimeouts();
    assert.equal(game.element('gameover').classList.contains('hidden'), true);
  }
});

test('host settings persist through the existing web settings format and refresh its controls', () => {
  const game = loadGame();
  game.run("keyBindings.p1.up = 'w';");
  const configured = game.api.configure({
    soundEnabled:false, soundVolume:35, effectsEnabled:false, theme:'coral',
    freeMovement:true, mirroredPowerups:false, powerupFrequency:25, powerupDuration:80,
  });
  assert.equal(configured.soundVolume, 35);
  assert.equal(game.element('volume-slider').value, 35);
  assert.equal(game.element('volume-label').textContent, '35%');
  assert.equal(game.element('pu-freq-slider').value, 25);
  assert.equal(game.element('pu-dur-slider').value, 80);
  assert.equal(game.document.body.classList.contains('theme-coral'), true);
  assert.equal(JSON.parse(game.storage.get('pongWarsSettings')).keyBindings.p1.up, 'w');
  const restored = loadGame(game.storage);
  assert.equal(restored.api.getSettings().freeMovement, true);
  assert.equal(restored.api.getSettings().powerupDuration, 80);
  assert.equal(restored.api.getSettings().soundEnabled, false);
  assert.equal(restored.run('keyBindings.p1.up'), 'w');
  configured.soundVolume = 1;
  const snapshot = restored.api.getSettings(); snapshot.freeMovement = false;
  assert.equal(game.api.getSettings().soundVolume, 35);
  assert.equal(restored.api.getSettings().freeMovement, true);
});

test('invalid host settings are rejected atomically and leave persistence unchanged', () => {
  const game = loadGame();
  game.api.configure({soundVolume:30});
  const stored = game.storage.get('pongWarsSettings');
  const before = JSON.stringify(game.api.getSettings());
  for (const bad of [
    {soundEnabled:'false'}, {effectsEnabled:0}, {freeMovement:1}, {mirroredPowerups:null},
    {soundVolume:-1}, {soundVolume:101}, {soundVolume:NaN}, {powerupFrequency:4},
    {powerupFrequency:61}, {powerupDuration:9}, {powerupDuration:121}, {theme:'unknown'},
    {duration:60}, {soundVolume:45, theme:'bad'},
  ]) {
    assert.throws(() => game.api.configure(bad));
    assert.equal(JSON.stringify(game.api.getSettings()), before);
    assert.equal(game.storage.get('pongWarsSettings'), stored);
  }
  assert.throws(() => game.api.configure(null));
  assert.throws(() => game.api.configure([]));
});

test('gameplay settings are locked during a match while sound and appearance remain editable', () => {
  const game = loadGame();
  game.api.start();
  for (const state of ['playing', 'paused']) {
    if (state === 'paused') game.api.pause();
    for (const options of [{freeMovement:true}, {mirroredPowerups:false}, {powerupFrequency:10}, {powerupDuration:60}]) {
      assert.throws(() => game.api.configure(options), /during a match/);
    }
    game.api.configure({soundEnabled:false, soundVolume:0, effectsEnabled:false, theme:'sunset'});
    assert.equal(game.api.getState().state, state);
    assert.equal(game.api.getSettings().theme, 'sunset');
  }
  game.api.showMenu();
  game.api.configure({freeMovement:true, powerupFrequency:5, powerupDuration:120});
  assert.equal(game.api.getSettings().freeMovement, true);
});

test('host visual detail toggles use strict booleans and remain editable when paused', () => {
  const game = loadGame();
  const values = {screenShake:false, racketOutline:false, particles:false, gridEffect:true, progressionBar:false};
  game.api.start(); game.api.pause();
  game.api.configure(values);
  for (const [key, value] of Object.entries(values)) {
    assert.equal(game.api.getSettings()[key], value);
    assert.throws(() => game.api.configure({[key]:'false'}), /true or false/);
  }
  assert.equal(game.api.getState().state, 'paused');
});
