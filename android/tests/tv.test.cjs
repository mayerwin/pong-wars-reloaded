// Real TV host event/state regression tests with a minimal DOM. Rendering is
// checked separately in the browser; this harness drives native event payloads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const input = require('../tv/input.js');
const source = fs.readFileSync(path.join(__dirname, '../tv/tv.js'), 'utf8');
const remote = {id: 1, key: 'remote-one', name: 'Google TV remote'};
const keyboard = {id: 2, key: 'keyboard-two', name: 'Bluetooth keyboard'};
const mouse = {id: 3, key: 'mouse-three', name: 'Bluetooth mouse'};

function loadHost(saved = {}, preferences = {}) {
  let now = 0, frame;
  const nodes = new Map(), stored = new Map([['pongTVDevices.v1', JSON.stringify(saved)], ...Object.entries(preferences)]);
  const documentListeners = {}, windowListeners = {};
  const document = {activeElement: null, pointTarget: null, addEventListener(type, fn) { documentListeners[type] = fn; }};
  function element(tag = 'div') {
    const listeners = {};
    const el = {
      tag, style: {}, dataset: {}, children: [], buttons: [], classList: {add() {}, remove() {}},
      addEventListener(type, fn) { listeners[type] = fn; },
      append(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
      focus() { document.activeElement = this; },
      click() { this.parent.emit('click', {target: this}); },
      emit(type, event) { if (listeners[type]) listeners[type](event); },
      closest() { return this.dataset.do ? this : null; },
      contains(child) { return this.buttons.includes(child); },
      getBoundingClientRect() { const top = (this.index || 0) * 65; return {left: 0, right: 200, top, bottom: top + 50}; },
      querySelectorAll() { return this.buttons; },
      querySelector(selector) {
        const action = /data-do="([^"]+)"/.exec(selector);
        return action ? this.buttons.find(b => b.dataset.do === action[1]) : this.buttons[0] || null;
      },
    };
    let html = '';
    Object.defineProperty(el, 'innerHTML', {
      get: () => html,
      set(value) {
        html = value;
        el.buttons = [...value.matchAll(/<button\b[^>]*data-do="([^"]+)"[^>]*>/g)].map((m, index) => {
          const b = element('button'); b.dataset.do = m[1]; b.index = index; b.parent = el; return b;
        });
        for (const m of value.matchAll(/id="([^"]+)"/g)) nodes.set(m[1], element());
      },
    });
    return el;
  }
  document.body = element('body');
  document.createElement = element;
  document.getElementById = id => nodes.get(id) || null;
  document.elementFromPoint = () => nodes.get('tv-root').buttons.find(b => b.dataset.do === document.pointTarget) || null;
  const game = {
    state: {state:'menu', winner:null, scores:{day:512, night:512}}, inputs: [], starts: 0,
    feedbackCalls: [], cues: [], feedbackActive: true, unlocks: 0,
    settings: {soundEnabled:true, soundVolume:70, theme:'cyber', effectsEnabled:true,
      screenShake:true, racketOutline:true, particles:true, gridEffect:false, progressionBar:true,
      freeMovement:false, mirroredPowerups:true, powerupFrequency:15, powerupDuration:40},
    activateExternalControls() {}, clearInput() { this.inputs = []; },
    feedback(kind) { this.feedbackCalls.push({kind, enabled:this.settings.soundEnabled, active:this.feedbackActive}); if (this.feedbackActive && this.settings.soundEnabled && this.settings.soundVolume > 0) this.cues.push(kind); },
    unlockAudio() { this.unlocks++; },
    setFeedbackActive(active) { this.feedbackActive = active; },
    getSettings() { return {...this.settings}; },
    configure(options) {
      if (['playing','paused'].includes(this.state.state) && Object.keys(options).some(k => ['freeMovement','mirroredPowerups','powerupFrequency','powerupDuration'].includes(k))) throw new Error('Gameplay settings locked');
      Object.assign(this.settings, options);
    },
    showMenu() { this.state.state = 'menu'; },
    start(options) { this.options = options; this.starts++; this.state.state = 'playing'; this.feedback('start'); },
    pause() { if (this.state.state === 'playing') this.state.state = 'paused'; },
    resume() { if (this.state.state === 'paused') { this.state.state = 'playing'; this.feedback('resume'); } },
    getState() { return this.state; },
    setInput(index, value) { this.inputs[index] = value; },
  };
  const AndroidHost = {ready() {}, exit() {}, setPointerCapture() {}};
  let music;
  class FakeMusic {
    constructor(options) { music = this; Object.assign(this, options); }
    setEnabled(value) { this.enabled = value; } setVolume(value) { this.volume = value; }
    setActive(value) { this.active = value; } unlock() {} suspend() { this.suspended = true; } resume() { this.suspended = false; }
  }
  const window = {PongGame:game, PongInput:input, PongMenuMusic:FakeMusic, AndroidHost, addEventListener(type, fn) { windowListeners[type] = fn; }};
  vm.runInNewContext(source, {
    window, document, AndroidHost, innerWidth:1000, innerHeight:600,
    performance:{now:() => now}, requestAnimationFrame(fn) { frame = fn; },
    localStorage:{getItem:k => stored.get(k), setItem:(k,v) => stored.set(k,v)},
  }, {filename:'tv.js'});
  const host = {
    game, document, stored, music,
    event(type) { windowListeners[type]?.(); },
    visibility(hidden) { document.hidden = hidden; documentListeners.visibilitychange?.(); },
    get html() { return nodes.get('tv-root').innerHTML; },
    get title() { return /<h2>(.*?)<\/h2>/.exec(this.html)?.[1] || ''; },
    send(device, event) { window.PongAndroid.onInput({...event, device}); },
    key(device, code, action = 'down', repeat = 0) { this.send(device, {type:'key', code, action, repeat}); },
    advance(ms) { for (const end = now + ms; now < end;) { now = Math.min(end, now + 16); frame(now); } },
    click(action) { const button = nodes.get('tv-root').querySelector(`[data-do="${action}"]`); assert.ok(button, `Missing ${action} on ${this.title}`); button.click(); },
    hold(device, code, ms = 400) { this.key(device, code); this.advance(ms); this.key(device, code, 'up'); this.advance(60); },
    tap(device, code) { this.hold(device, code, 30); },
  };
  return host;
}

function chooseController(host, device, confirm = 'DPAD_CENTER') {
  host.key(device, confirm);
  assert.equal(host.title, 'Choose your action button.');
  host.advance(600);
  host.key(device, confirm, 'down', 1);
  assert.equal(host.title, 'Choose your action button.');
  host.key(device, confirm, 'up');
  host.advance(60);
  host.tap(device, confirm);
  assert.equal(host.title, 'Move up');
  host.advance(200);
}

function calibrateRemote(host, device, confirm = 'DPAD_CENTER', codes = ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) {
  chooseController(host, device, confirm);
  for (const code of codes) host.hold(device, code);
  assert.equal(host.title, 'Rotate left');
  host.tap(device, confirm);
  assert.equal(host.title, 'Rotate right');
  host.tap(device, confirm);
  assert.equal(host.title, 'Rescue your ball');
  host.tap(device, confirm);
  assert.match(host.title, /You’re ready/);
  host.tap(device, confirm);
  assert.match(host.title, /Your controls|Pick up/);
}

function savedProfile(device) { const p = input.profile(device); p.verified = true; return p; }

test('remote joins, skips optional buttons, saves, then skips setup on the next match', () => {
  const host = loadHost();
  host.click('solo');
  calibrateRemote(host, remote);
  host.click('start-match');
  assert.equal(host.game.state.state, 'playing');
  const saved = JSON.parse(host.stored.get('pongTVDevices.v1'));
  assert.equal(saved[remote.key].verified, true);
  host.key(remote, 'BACK');
  assert.equal(host.game.state.state, 'paused');
  host.key(remote, 'BACK', 'up');
  host.click('home'); host.click('solo');
  host.tap(remote, 'DPAD_CENTER');
  assert.match(host.html, /D-pad ↑/);
  host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.game.state.state, 'playing');
  assert.equal(host.game.starts, 2);
});

test('custom five-button keyboard passes setup using an arbitrary confirm key', () => {
  const host = loadHost();
  host.click('solo');
  calibrateRemote(host, keyboard, 'F9', ['F1','F2','F3','F4']);
  host.click('start-match');
  assert.equal(host.game.state.state, 'playing');
  host.key(keyboard, 'F1'); host.advance(20);
  assert.equal(host.game.inputs[0].y, -1);
});

test('two distinct known Xbox devices join, move independently, reconnect and resume', () => {
  const a = {...remote, name:'Xbox', key:'xbox-a'}, b = {...keyboard, name:'Xbox', key:'xbox-b'};
  const host = loadHost({[a.key]:savedProfile(a), [b.key]:savedProfile(b)});
  host.click('duo');
  host.tap(a, 'BUTTON_A');
  assert.match(host.title, /Pick up/);
  host.tap(b, 'BUTTON_A');
  host.click('start-match');
  assert.equal(host.game.state.state, 'playing');
  host.send(a, {type:'motion', axes:{x:.6}});
  host.send(b, {type:'motion', axes:{y:-.8}});
  host.advance(20);
  assert.equal(host.game.inputs[0].x, .6);
  assert.equal(host.game.inputs[1].y, -.8);
  host.send(a, {type:'device', action:'disconnected'});
  assert.equal(host.game.state.state, 'paused');
  assert.match(host.title, /Reconnect/);
  const reconnected = {...a, id:101};
  host.send(reconnected, {type:'device', action:'connected'});
  host.tap(reconnected, 'BUTTON_A');
  host.click('resume');
  host.send(reconnected, {type:'motion', axes:{x:-.7}});
  host.advance(20);
  assert.equal(host.game.inputs[0].x, -.7);
  assert.equal(host.game.inputs[1].y, 0);
});

test('Android reusing a disconnected runtime device id replaces the old controller', () => {
  const host = loadHost({[remote.key]:savedProfile(remote)});
  host.click('solo'); host.tap(remote, 'DPAD_CENTER'); host.click('start-match');
  host.send(remote, {type:'device', action:'disconnected'});
  host.send(remote, {type:'device', action:'connected'});
  host.tap(remote, 'DPAD_CENTER');
  host.click('resume');
  host.key(remote, 'DPAD_UP'); host.advance(20);
  assert.equal(host.game.inputs[0].y, -1);
});

test('known mouse uses native pointer focus, clicks to join and right-clicks to pause', () => {
  const host = loadHost({[mouse.key]:savedProfile(mouse)});
  host.document.pointTarget = 'solo';
  host.send(mouse, {type:'motion', pointer:{x:.1,y:.1}});
  host.tap(mouse, 'MOUSE_PRIMARY');
  assert.match(host.title, /Pick up/);
  host.tap(mouse, 'MOUSE_PRIMARY');
  host.document.pointTarget = 'start-match';
  host.send(mouse, {type:'motion', pointer:{x:.1,y:.1}});
  host.tap(mouse, 'MOUSE_PRIMARY');
  assert.equal(host.game.state.state, 'playing');
  host.send(mouse, {type:'motion', pointer:{dx:.01,dy:0}, time:0}); host.advance(20);
  assert.ok(host.game.inputs[0].x > 0);
  host.key(mouse, 'MOUSE_SECONDARY');
  assert.equal(host.game.state.state, 'paused');
});

test('a new mouse teaches directions and wheel rotations and uses the held-click rescue shortcut', () => {
  const host = loadHost();
  host.click('solo');
  chooseController(host, mouse, 'MOUSE_PRIMARY');
  for (const delta of [{dy:-.01}, {dy:.01}, {dx:-.01}, {dx:.01}]) {
    for (let i = 0; i < 25; i++) {
      host.send(mouse, {type:'motion', pointer:delta});
      host.advance(16);
    }
    host.advance(100);
  }
  assert.equal(host.title, 'Rotate left');
  host.click('teach-optional'); host.advance(60);
  host.send(mouse, {type:'motion', pointer:{scrollY:1}}); host.advance(220);
  assert.equal(host.title, 'Rotate right');
  host.click('teach-optional'); host.advance(60);
  host.send(mouse, {type:'motion', pointer:{scrollY:-1}}); host.advance(220);
  assert.equal(host.title, 'Rescue your ball');
  host.hold(mouse, 'MOUSE_PRIMARY', 3000);
  assert.match(host.title, /You’re ready/);
  host.tap(mouse, 'MOUSE_PRIMARY');
  host.click('start-match');
  assert.equal(host.game.state.state, 'playing');
});

test('instant virtual keyboard taps can demonstrate directions during calibration', () => {
  const host = loadHost();
  host.click('solo'); chooseController(host, keyboard, 'F9');
  for (const [index, code] of ['F1','F2','F3','F4'].entries()) {
    host.key(keyboard, code); host.key(keyboard, code, 'up');
    host.advance(80);
    assert.equal(host.title, ['Move down','Move left','Move right','Rotate left'][index]);
  }
});

test('cancelled control reconfiguration restores the saved controls', () => {
  const profile = savedProfile(keyboard);
  input.learn(profile, 'up', {type:'key', action:'down', code:'F1'});
  const host = loadHost({[keyboard.key]:profile});
  host.click('solo'); host.tap(keyboard, 'ENTER'); host.click('start-match');
  host.key(keyboard, 'ESCAPE'); host.key(keyboard, 'ESCAPE', 'up');
  host.click('controls'); host.click('rebind-0');
  assert.equal(host.title, 'Choose your action button.');
  host.key(keyboard, 'ESCAPE'); host.key(keyboard, 'ESCAPE', 'up');
  host.click('resume');
  host.key(keyboard, 'F1'); host.advance(20);
  assert.equal(host.game.inputs[0].y, -1);
});

test('lifecycle pause and gameover show the correct TV screens', () => {
  const host = loadHost({[remote.key]:savedProfile(remote)});
  host.click('solo'); host.tap(remote, 'DPAD_CENTER'); host.click('start-match');
  host.send(remote, {type:'lifecycle', action:'pause'});
  assert.equal(host.game.state.state, 'paused');
  host.click('resume');
  Object.assign(host.game.state, {state:'gameover', winner:'day', scores:{day:513,night:511}});
  host.advance(20);
  assert.equal(host.title, 'Day takes the world.');
  assert.match(host.html, /513.*511/);
});

test('disconnect during setup cannot start a match with an unverified remaining device', () => {
  const host = loadHost({[remote.key]:savedProfile(remote)});
  host.click('duo'); host.tap(remote, 'DPAD_CENTER');
  host.key(keyboard, 'ENTER');
  assert.equal(host.title, 'Choose your action button.');
  host.send(remote, {type:'device', action:'disconnected'});
  assert.match(host.title, /Pick up/);
  host.send(remote, {type:'device', action:'connected'});
  host.tap(remote, 'DPAD_CENTER');
  assert.match(host.title, /Pick up/);
  assert.equal(host.game.starts, 0);
  host.key(keyboard, 'ENTER', 'up');
  host.key(keyboard, 'ENTER');
  assert.equal(host.title, 'Choose your action button.');
});

test('TV settings expose sound, appearance and between-match rules', () => {
  const host = loadHost();
  host.click('options');
  assert.equal(host.title, 'Sound & display');
  host.click('setting-soundEnabled'); host.click('setting-soundVolume'); host.click('setting-theme');
  assert.equal(host.game.settings.soundEnabled, false);
  assert.equal(host.game.settings.soundVolume, 80);
  assert.equal(host.game.settings.theme, 'coral');
  host.click('options-visuals');
  for (const key of ['screenShake','racketOutline','particles','gridEffect','progressionBar']) host.click('setting-' + key);
  assert.equal(host.game.settings.gridEffect, true);
  assert.equal(host.game.settings.screenShake, false);
  host.click('options-general'); host.click('options-rules');
  host.click('setting-freeMovement'); host.click('setting-powerupDuration');
  assert.equal(host.game.settings.freeMovement, true);
  assert.equal(host.game.settings.powerupDuration, 60);
  host.click('options-back');
  assert.equal(host.game.state.state, 'menu');
});

test('TV settings keep an active match paused and disable its gameplay rules', () => {
  const host = loadHost({[remote.key]:savedProfile(remote)});
  host.click('solo'); host.tap(remote, 'DPAD_CENTER'); host.click('start-match');
  host.key(remote, 'BACK'); host.key(remote, 'BACK', 'up');
  host.click('options'); host.click('setting-soundEnabled');
  assert.equal(host.game.state.state, 'paused');
  host.click('options-rules');
  assert.match(host.html, /<button disabled>Free movement/);
  assert.doesNotMatch(host.html, /data-do="setting-freeMovement"/);
  host.key(remote, 'BACK'); host.key(remote, 'BACK', 'up');
  assert.equal(host.title, 'Match paused.');
  host.click('resume');
  assert.equal(host.game.state.state, 'playing');
});

test('both new players return to the joining lobby after saving, then explicitly start', () => {
  const host = loadHost();
  host.click('duo');
  calibrateRemote(host, remote);
  assert.equal(host.title, 'Pick up your controls.');
  assert.match(host.html, /Google TV remote · Ready/);
  assert.match(host.html, /Press any button to join/);
  assert.equal(host.game.starts, 0);
  calibrateRemote(host, keyboard, 'F9', ['F1','F2','F3','F4']);
  assert.equal(host.title, 'Your controls. Your match.');
  assert.match(host.html, /F9/);
  assert.match(host.html, /F1/);
  assert.equal(host.game.starts, 0);
  host.tap(keyboard, 'F9');
  assert.equal(host.game.state.state, 'playing');
  assert.equal(host.game.options.mode, '2p');
});

test('a held finish button cannot click through review, lobby or into gameplay', () => {
  const host = loadHost();
  host.click('solo'); chooseController(host, remote);
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  host.tap(remote, 'DPAD_CENTER'); host.tap(remote, 'DPAD_CENTER');
  host.click('teach-optional'); host.advance(60);
  host.key(remote, 'BUTTON_X'); host.advance(3500);
  assert.match(host.title, /You’re ready/);
  // Some Bluetooth senders repeat down events without Android's repeat flag.
  for (let i = 0; i < 4; i++) { host.key(remote, 'BUTTON_X'); host.advance(40); }
  assert.match(host.title, /You’re ready/);
  host.key(remote, 'BUTTON_X', 'up'); host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.title, 'Your controls. Your match.');
  assert.equal(host.game.starts, 0);
  host.key(remote, 'DPAD_CENTER');
  assert.equal(host.game.starts, 1);
  host.key(remote, 'DPAD_CENTER', 'down', 1);
  host.advance(900);
  assert.equal(host.game.inputs[0].teleport, false);
  host.key(remote, 'DPAD_CENTER', 'up');
  host.key(remote, 'DPAD_LEFT');
  host.advance(20);
  assert.equal(host.game.inputs[0].x, -1);
});

test('Back cancels setup to the lobby and a held Back never also exits it', () => {
  const host = loadHost();
  host.click('duo'); chooseController(host, remote);
  host.key(remote, 'BACK');
  assert.equal(host.title, 'Pick up your controls.');
  host.key(remote, 'BACK'); host.key(remote, 'BACK', 'down', 1);
  assert.equal(host.title, 'Pick up your controls.');
  assert.equal(host.game.starts, 0);
  host.key(remote, 'BACK', 'up');
  calibrateRemote(host, remote);
  assert.match(host.html, /Google TV remote · Ready/);
});

test('saved trigger labels are visible and cancelled lobby remapping preserves both players', () => {
  const a = savedProfile(remote), b = savedProfile(keyboard);
  a.learned = {confirm:'BUTTON_A', up:'axis:y:-1', rotateLeft:'axis:ltrigger:1', rotateRight:'BUTTON_R2'};
  const host = loadHost({[remote.key]:a, [keyboard.key]:b});
  host.click('duo'); host.tap(remote, 'BUTTON_A'); host.tap(keyboard, 'ENTER');
  assert.match(host.html, /Left stick up/);
  assert.match(host.html, /LT \/ L2 \(left trigger\)/);
  assert.match(host.html, /RT \/ R2 \(right trigger\)/);
  host.click('rebind-0');
  host.tap(remote, 'BACK');
  assert.equal(host.title, 'Your controls. Your match.');
  assert.match(host.html, /Bluetooth keyboard · Ready/);
  assert.match(host.html, /LT \/ L2/);
  host.tap(remote, 'BUTTON_A');
  assert.equal(host.game.starts, 1);
});

test('menu music respects its persistent toggle, master sound, match and app lifecycle', () => {
  const host = loadHost();
  assert.equal(host.music.active, true);
  assert.equal(host.music.enabled, true);
  host.click('options'); host.click('menu-music');
  assert.equal(host.music.enabled, false);
  assert.equal(host.stored.get('pongTVMenuMusic.v1'), 'off');
  const reopened = loadHost({}, {'pongTVMenuMusic.v1':'off'});
  assert.equal(reopened.music.enabled, false);
  host.click('menu-music'); host.click('setting-soundEnabled');
  assert.equal(host.music.enabled, false);
  host.click('setting-soundEnabled'); host.click('setting-soundVolume');
  assert.equal(host.music.volume, .8);
  host.click('options-back'); host.click('watch');
  assert.equal(host.music.active, false);
  host.send(remote, {type:'lifecycle', action:'pause'});
  assert.equal(host.music.active, false);
  assert.equal(host.music.suspended, true);
  host.send(remote, {type:'lifecycle', action:'resume'});
  assert.equal(host.music.active, false);
  host.click('home');
  assert.equal(host.music.active, true);
  host.visibility(true); assert.equal(host.music.suspended, true);
  host.visibility(false); assert.equal(host.music.suspended, false);
  host.event('blur'); assert.equal(host.music.suspended, true);
  host.event('focus'); assert.equal(host.music.suspended, false);
});

test('disconnect while paused in settings or remapping preserves the match and both player slots', () => {
  const host = loadHost({[remote.key]:savedProfile(remote), [keyboard.key]:savedProfile(keyboard)});
  host.click('duo'); host.tap(remote, 'DPAD_CENTER'); host.tap(keyboard, 'ENTER'); host.click('start-match');
  host.tap(remote, 'BACK'); host.click('options');
  host.send(keyboard, {type:'device', action:'disconnected'});
  assert.equal(host.title, 'Reconnect your controls.');
  host.send(keyboard, {type:'device', action:'connected'}); host.tap(keyboard, 'ENTER');
  host.click('controls'); host.click('rebind-0');
  host.send(keyboard, {type:'device', action:'disconnected'});
  assert.equal(host.title, 'Reconnect your controls.');
  host.send(keyboard, {type:'device', action:'connected'}); host.tap(keyboard, 'ENTER');
  host.click('resume');
  assert.equal(host.game.starts, 1);
  assert.equal(host.game.state.state, 'playing');
  host.key(remote, 'DPAD_LEFT'); host.key(keyboard, 'DPAD_UP'); host.advance(20);
  assert.equal(host.game.inputs[0].x, -1);
  assert.equal(host.game.inputs[1].y, -1);
});

test('cancelling a replacement controller keeps its disconnected player slot and cannot resume short-handed', () => {
  const host = loadHost({[remote.key]:savedProfile(remote), [keyboard.key]:savedProfile(keyboard)});
  host.click('duo'); host.tap(remote, 'DPAD_CENTER'); host.tap(keyboard, 'ENTER'); host.click('start-match');
  host.send(keyboard, {type:'device', action:'disconnected'});
  host.tap(mouse, 'MOUSE_PRIMARY');
  assert.equal(host.title, 'Choose your action button.');
  const systemBack = {id:-1, key:'system-back', name:'Virtual remote'};
  // Android can deliver duplicate physical edges while navigating Back. The
  // second down must not enroll that virtual input as the missing player.
  host.key(systemBack, 'BACK'); host.key(systemBack, 'BACK');
  host.key(systemBack, 'BACK', 'up'); host.key(systemBack, 'BACK', 'up');
  assert.equal(host.title, 'Reconnect your controls.');
  assert.doesNotMatch(host.html, /data-do="resume"/);
  host.tap(remote, 'BACK');
  assert.equal(host.game.state.state, 'paused');
  const reconnected = {...keyboard, id:201};
  host.send(reconnected, {type:'device', action:'connected'}); host.tap(reconnected, 'ENTER');
  host.click('resume');
  assert.equal(host.game.starts, 1);
  host.key(reconnected, 'DPAD_UP'); host.advance(20);
  assert.equal(host.game.inputs[1].y, -1);
});

test('navigation cues require a real focus change and obey the held-input throttle', () => {
  const host = loadHost();
  host.advance(200);
  assert.deepEqual(host.game.cues, [], 'initial rendering/focus must be silent');
  host.tap(remote, 'DPAD_UP');
  assert.deepEqual(host.game.cues, [], 'top edge must not sound');
  host.key(remote, 'DPAD_DOWN');
  assert.deepEqual(host.game.cues, ['navigate']);
  host.key(remote, 'DPAD_DOWN', 'down', 1); host.advance(40);
  host.key(remote, 'DPAD_DOWN', 'down', 2);
  assert.deepEqual(host.game.cues, ['navigate'], 'blocked repeats must be silent');
  host.advance(200); host.key(remote, 'DPAD_DOWN', 'down', 3);
  assert.deepEqual(host.game.cues, ['navigate', 'navigate']);
  host.key(remote, 'DPAD_DOWN', 'up');
  host.document.pointTarget = 'options';
  host.send(mouse, {type:'motion', pointer:{x:.1,y:.1}});
  const count = host.game.cues.length;
  host.send(mouse, {type:'motion', pointer:{x:.11,y:.1}});
  assert.equal(host.game.cues.length, count, 'pointer movement inside one button must not chatter');
  assert.ok(host.game.unlocks > 0, 'meaningful native input unlocks shared audio');
});

test('menu feedback remains available with music Off and respects applied master sound/volume', () => {
  const host = loadHost();
  host.click('options'); host.click('menu-music');
  assert.equal(host.music.enabled, false);
  assert.deepEqual(host.game.cues, ['confirm','confirm']);
  host.game.cues.length = 0;
  host.click('setting-soundEnabled'); host.click('setting-theme');
  assert.deepEqual(host.game.cues, [], 'switching master Sound Off and muted actions stay silent');
  assert.equal(host.game.feedbackCalls.at(-1).enabled, false);
  host.click('setting-soundEnabled');
  assert.deepEqual(host.game.cues, ['confirm'], 'Sound On confirms after the setting changes');
  assert.equal(host.game.feedbackCalls.at(-1).enabled, true);
  host.game.settings.soundVolume = 100;
  host.click('setting-soundVolume');
  assert.equal(host.game.settings.soundVolume, 0);
  assert.deepEqual(host.game.cues, ['confirm'], 'zero volume applies before its cue');
  host.click('setting-soundVolume');
  assert.deepEqual(host.game.cues, ['confirm','confirm']);
});

test('Start, pause and Resume each produce one cue; automatic lifecycle transitions stay silent', () => {
  const host = loadHost();
  host.click('watch');
  assert.deepEqual(host.game.cues, ['start'], 'engine Start must not also get a TV confirm');
  host.key(remote, 'BACK');
  assert.deepEqual(host.game.cues, ['start','pause']);
  host.key(remote, 'BACK'); host.key(remote, 'BACK', 'down', 1);
  assert.deepEqual(host.game.cues, ['start','pause'], 'held Back must not repeat cues or Resume');
  host.key(remote, 'BACK', 'up'); host.tap(remote, 'BACK');
  assert.deepEqual(host.game.cues, ['start','pause','resume']);
  host.send(remote, {type:'lifecycle', action:'pause'});
  assert.equal(host.game.feedbackActive, false);
  assert.deepEqual(host.game.cues, ['start','pause','resume']);
  host.click('options');
  assert.deepEqual(host.game.cues, ['start','pause','resume'], 'background input must not sound');
  host.send(remote, {type:'lifecycle', action:'resume'});
  assert.equal(host.game.feedbackActive, true);
  assert.deepEqual(host.game.cues, ['start','pause','resume']);
  host.tap(remote, 'BACK');
  assert.equal(host.game.cues.at(-1), 'back');
  host.click('resume');
  assert.equal(host.game.cues.at(-1), 'resume');
  const before = host.game.cues.length;
  host.event('blur');
  assert.equal(host.game.cues.length, before, 'focus-loss pause must be silent');
});

test('setup cues confirm accepted steps once and reserve success for completing required and optional choices', () => {
  const host = loadHost(); host.click('solo');
  chooseController(host, remote);
  host.game.cues.length = 0;
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  host.tap(remote, 'DPAD_CENTER'); host.tap(remote, 'DPAD_CENTER');
  assert.deepEqual(host.game.cues, Array(6).fill('confirm'));
  host.key(remote, 'DPAD_CENTER'); host.advance(3500);
  assert.deepEqual(host.game.cues, [...Array(6).fill('confirm'),'success']);
  host.key(remote, 'DPAD_CENTER'); host.key(remote, 'DPAD_CENTER', 'down', 1); host.advance(300);
  assert.equal(host.game.cues.length, 7, 'held final rescue must not click or sound through review');
  host.key(remote, 'DPAD_CENTER', 'up'); host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.game.cues.at(-1), 'confirm');
  host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.game.cues.at(-1), 'start');
  assert.equal(host.game.cues.filter(cue => cue === 'start').length, 1);
});

test('known joins and explicit reconnects confirm once while device notifications remain silent', () => {
  const host = loadHost({[remote.key]:savedProfile(remote)});
  host.click('solo'); host.game.cues.length = 0;
  host.key(remote, 'DPAD_CENTER'); host.key(remote, 'DPAD_CENTER', 'down', 1);
  assert.deepEqual(host.game.cues, ['success']);
  host.key(remote, 'DPAD_CENTER', 'up'); host.click('start-match');
  host.game.cues.length = 0;
  host.send(remote, {type:'device', action:'disconnected'});
  const reconnected = {...remote, id:101};
  host.send(reconnected, {type:'device', action:'connected'});
  assert.deepEqual(host.game.cues, []);
  host.tap(reconnected, 'DPAD_CENTER');
  assert.deepEqual(host.game.cues, ['success']);
  host.click('resume');
  assert.deepEqual(host.game.cues, ['success','resume']);
});

test('setup marks the chosen action button, active step and optional extras explicitly', () => {
  const host = loadHost(); host.click('solo'); chooseController(host, remote);
  assert.match(host.html, /Action button set: <strong>OK<\/strong>/);
  assert.match(host.html, /class="current" aria-current="step"><b>1<\/b><small>Current/);
  assert.match(host.html, /<b>5<\/b><small>Optional/);
  assert.doesNotMatch(host.html, /data-do="skip-optional"/);
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  assert.match(host.html, /class="current" aria-current="step"><b>5<\/b><small>Current/);
  assert.equal((host.html.match(/class="done"/g) || []).length, 4);
  assert.match(host.html, /A separate button is optional/);
  assert.match(host.html, /data-do="skip-all-optional"/);
});

test('five-button remote skips all extras by navigation and keeps every fallback after saving', () => {
  const host = loadHost(); host.click('solo'); chooseController(host, remote);
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  host.tap(remote, 'DPAD_DOWN');
  assert.equal(host.document.activeElement.dataset.do, 'skip-all-optional');
  host.key(remote, 'DPAD_CENTER'); host.advance(3500);
  assert.match(host.title, /You’re ready/);
  host.key(remote, 'DPAD_CENTER'); host.key(remote, 'DPAD_CENTER', 'down', 1);
  assert.match(host.title, /You’re ready/, 'held Skip must not also Save');
  host.key(remote, 'DPAD_CENTER', 'up'); host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.title, 'Your controls. Your match.');
  const saved = JSON.parse(host.stored.get('pongTVDevices.v1'))[remote.key];
  assert.equal(saved.learned.rotateLeft, undefined);
  assert.equal(saved.learned.rotateRight, undefined);
  assert.equal(saved.learned.teleport, undefined);
  assert.equal(saved.learned.down, 'DPAD_DOWN', 'menu navigation must not steal a movement mapping');
  assert.match(host.html, /Tap OK, then D-pad ←/);
  assert.match(host.html, /Hold OK \(2½ s\)/);
  host.tap(remote, 'DPAD_CENTER'); host.tap(remote, 'DPAD_CENTER');
  host.key(remote, 'DPAD_LEFT'); host.advance(20);
  assert.equal(host.game.inputs[0].rotateLeft, true);
  assert.equal(host.game.inputs[0].x, 0);
  host.key(remote, 'DPAD_LEFT', 'up'); host.advance(60);
  host.key(remote, 'DPAD_RIGHT'); host.advance(20);
  assert.equal(host.game.inputs[0].rotateRight, true);
  host.key(remote, 'DPAD_RIGHT', 'up'); host.advance(60);
  host.key(remote, 'DPAD_CENTER'); host.advance(600);
  assert.equal(host.game.inputs[0].teleport, true);
  assert.equal(host.game.inputs[0].rotateRight, false);
});

test('optional teaching retains separate trigger/buttons and mixes them with skipped extras', () => {
  const host = loadHost(); host.click('solo'); chooseController(host, remote, 'BUTTON_A');
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  host.tap(remote, 'DPAD_DOWN'); host.tap(remote, 'DPAD_DOWN');
  assert.equal(host.document.activeElement.dataset.do, 'teach-optional');
  host.tap(remote, 'BUTTON_A');
  host.send(remote, {type:'motion', axes:{ltrigger:1}}); host.advance(20);
  host.send(remote, {type:'motion', axes:{ltrigger:0}}); host.advance(60);
  assert.equal(host.title, 'Rotate right');
  host.tap(remote, 'BUTTON_A');
  assert.equal(host.title, 'Rescue your ball');
  host.click('teach-optional'); host.advance(60);
  host.hold(remote, 'BUTTON_X', 2200);
  assert.match(host.title, /You’re ready/);
  host.tap(remote, 'BUTTON_A');
  const saved = JSON.parse(host.stored.get('pongTVDevices.v1'))[remote.key];
  assert.equal(saved.learned.rotateLeft, 'axis:ltrigger:1');
  assert.equal(saved.learned.rotateRight, undefined);
  assert.equal(saved.learned.teleport, 'BUTTON_X');
  assert.match(host.html, /LT \/ L2/);
  assert.match(host.html, /Tap A \/ Cross, then D-pad →/);
});

test('optional menu consumes held input from the previous step and ignores another player', () => {
  const host = loadHost(); host.click('duo'); chooseController(host, remote);
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT']) host.hold(remote, code);
  host.key(remote, 'DPAD_RIGHT'); host.advance(600);
  assert.equal(host.title, 'Rotate left');
  host.key(remote, 'DPAD_RIGHT'); host.key(remote, 'DPAD_DOWN', 'down', 1);
  assert.equal(host.document.activeElement.dataset.do, 'skip-optional');
  host.tap(keyboard, 'ENTER'); host.tap(keyboard, 'DPAD_DOWN');
  assert.equal(host.title, 'Rotate left');
  assert.equal(host.document.activeElement.dataset.do, 'skip-optional');
  host.key(remote, 'DPAD_DOWN', 'up'); host.key(remote, 'DPAD_RIGHT', 'up'); host.advance(60);
  host.tap(remote, 'DPAD_CENTER');
  assert.equal(host.title, 'Rotate right');
  assert.match(host.html, /<small>Shortcut<\/small>/);
});

test('returning from unfinished optional teaching discards its partial mapping before Skip', () => {
  const host = loadHost(); host.click('solo'); chooseController(host, keyboard, 'F9');
  for (const code of ['F1','F2','F3','F4']) host.hold(keyboard, code);
  host.tap(keyboard, 'F9'); host.tap(keyboard, 'F9');
  host.click('teach-optional'); host.advance(60);
  host.hold(keyboard, 'F7', 100);
  assert.equal(host.title, 'Rescue your ball');
  host.tap(keyboard, 'F9');
  assert.match(host.html, /data-do="skip-optional"/);
  host.tap(keyboard, 'F9'); host.tap(keyboard, 'F9');
  const saved = JSON.parse(host.stored.get('pongTVDevices.v1'))[keyboard.key];
  assert.equal(saved.learned.teleport, undefined);
  assert.equal(saved.bindings.teleport.includes('F7'), false);
  assert.equal(host.game.starts, 0);

  // Teaching a default rotation key for an unfinished rescue temporarily
  // removes its old alias. Going back must restore that alias too.
  host.click('rebind-0'); host.advance(60); host.tap(keyboard, 'F9');
  for (const code of ['F1','F2','F3','F4']) host.hold(keyboard, code);
  host.tap(keyboard, 'F9'); host.tap(keyboard, 'F9');
  host.click('teach-optional'); host.advance(60); host.hold(keyboard, 'BUTTON_R1', 100);
  host.tap(keyboard, 'F9'); host.tap(keyboard, 'F9'); host.tap(keyboard, 'F9');
  const restored = JSON.parse(host.stored.get('pongTVDevices.v1'))[keyboard.key];
  assert.equal(restored.bindings.rotateRight.includes('BUTTON_R1'), true);
  assert.equal(restored.bindings.teleport.includes('BUTTON_R1'), false);
});

test('Back from optional choices restores saved controls and the paused match', () => {
  const saved = savedProfile(remote); saved.learned = {confirm:'DPAD_CENTER', rotateLeft:'BUTTON_L2'};
  const host = loadHost({[remote.key]:saved});
  host.click('solo'); host.tap(remote, 'DPAD_CENTER'); host.click('start-match');
  host.tap(remote, 'BACK'); host.click('controls'); host.click('rebind-0');
  host.advance(60); host.tap(remote, 'DPAD_CENTER');
  for (const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT']) host.hold(remote, code);
  const systemBack = {id:-1, key:'system-back', name:'Virtual remote'};
  host.tap(systemBack, 'BACK');
  assert.equal(host.title, 'Match paused.');
  host.click('controls');
  assert.match(host.html, /LT \/ L2/);
  host.click('back-pause'); host.click('resume');
  assert.equal(host.game.state.state, 'playing');
  assert.equal(host.game.starts, 1);
});

test('TV diagnostics distinguishes output and app surface, and returns to paused visual settings', () => {
  const host = loadHost();
  host.game.getDiagnostics = () => ({display:{outputWidth:3840,outputHeight:2160,windowWidth:1920,windowHeight:1080,refreshRate:59.94},renderer:{width:980,height:980,dpr:2},audio:{backend:'Android native',ready:true}});
  host.click('watch'); host.tap(remote, 'BACK'); host.click('options'); host.click('options-visuals'); host.click('diagnostics');
  assert.equal(host.title, 'TV diagnostics');
  assert.match(host.html, /TV output<\/dt><dd>3840 × 2160/);
  assert.match(host.html, /App surface<\/dt><dd>1920 × 1080/);
  assert.match(host.html, /Android native/);
  assert.equal(host.game.state.state, 'paused');
  host.tap(remote, 'BACK');
  assert.equal(host.title, 'Visual details');
  host.click('options-back'); host.click('resume');
  assert.equal(host.game.state.state, 'playing');
});
