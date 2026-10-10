/* Device-aware controls shared by the TV host and its regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongInput = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const ACTIONS = ['up', 'down', 'left', 'right', 'rotateLeft', 'rotateRight', 'teleport'];
  const DEFAULTS = {
    up: ['DPAD_UP', 'W', 'I', 'NUMPAD_8'], down: ['DPAD_DOWN', 'S', 'K', 'NUMPAD_2'],
    left: ['DPAD_LEFT', 'A', 'J', 'NUMPAD_4'], right: ['DPAD_RIGHT', 'D', 'L', 'NUMPAD_6'],
    rotateLeft: ['BUTTON_L1', 'BUTTON_L2', 'Q', 'Z', 'COMMA'],
    rotateRight: ['BUTTON_R1', 'BUTTON_R2', 'E', 'C', 'PERIOD'],
    teleport: ['BUTTON_X', 'BUTTON_Y', 'T', 'SHIFT_LEFT', 'SHIFT_RIGHT'],
    confirm: ['DPAD_CENTER', 'ENTER', 'NUMPAD_ENTER', 'SPACE', 'BUTTON_A', 'BUTTON_C', 'MOUSE_PRIMARY'],
    pause: ['BACK', 'ESCAPE', 'BUTTON_B', 'BUTTON_START', 'BUTTON_SELECT', 'MENU', 'P', 'MOUSE_SECONDARY', 'MOUSE_BACK']
  };
  const clamp = v => Math.max(-1, Math.min(1, Number(v) || 0));
  function profile(device) {
    return {version: 1, name: device.name || 'Controller', bindings: JSON.parse(JSON.stringify(DEFAULTS)), learned: {}, verified: false};
  }
  function validProfile(p) {
    return !!(p && p.version === 1 && p.verified && p.bindings && Object.keys(DEFAULTS).every(a =>
      Array.isArray(p.bindings[a]) && p.bindings[a].length < 64 && p.bindings[a].every(v => typeof v === 'string')));
  }
  // Android's key/axis names are stable storage identifiers, not useful labels
  // for a player. Keep both common console names for shoulder/trigger buttons.
  function tokenLabel(token) {
    const names = {
      DPAD_UP:'D-pad ↑', DPAD_DOWN:'D-pad ↓', DPAD_LEFT:'D-pad ←', DPAD_RIGHT:'D-pad →', DPAD_CENTER:'OK',
      BUTTON_A:'A / Cross', BUTTON_B:'B / Circle', BUTTON_X:'X / Square', BUTTON_Y:'Y / Triangle',
      BUTTON_L1:'LB / L1 (left shoulder)', BUTTON_R1:'RB / R1 (right shoulder)',
      BUTTON_L2:'LT / L2 (left trigger)', BUTTON_R2:'RT / R2 (right trigger)',
      BUTTON_THUMBL:'Left stick click', BUTTON_THUMBR:'Right stick click', BUTTON_START:'Start / Menu', BUTTON_SELECT:'Select / View',
      MOUSE_PRIMARY:'Left click', MOUSE_SECONDARY:'Right click', MOUSE_TERTIARY:'Middle click', MOUSE_BACK:'Mouse Back',
      ENTER:'Enter', NUMPAD_ENTER:'Numpad Enter', SPACE:'Space', ESCAPE:'Escape', BACK:'Back', COMMA:',', PERIOD:'.',
      SHIFT_LEFT:'Left Shift', SHIFT_RIGHT:'Right Shift', CTRL_LEFT:'Left Ctrl', CTRL_RIGHT:'Right Ctrl'
    };
    if (names[token]) return names[token];
    if (token === 'wheel:1' || token === 'wheel:-1') return 'Scroll ' + (token === 'wheel:1' ? 'up' : 'down');
    const pointer = /^pointer:([xy]):(-?1)$/.exec(token);
    if (pointer) return 'Mouse ' + (pointer[1] === 'x' ? (pointer[2] === '-1' ? 'left' : 'right') : (pointer[2] === '-1' ? 'up' : 'down'));
    const axis = /^axis:(\w+):(-?1)$/.exec(token);
    if (axis) {
      const name = axis[1], negative = axis[2] === '-1';
      if (['ltrigger','brake','rtrigger','gas'].includes(name)) return names[['ltrigger','brake'].includes(name) ? 'BUTTON_L2' : 'BUTTON_R2'] + (negative ? ' (−)' : '');
      const vertical = ['hatY','y','rz','ry'].includes(name);
      const direction = vertical ? (negative ? 'up' : 'down') : (negative ? 'left' : 'right');
      if (['hatX','hatY'].includes(name)) return 'D-pad ' + direction;
      if (['x','y','z','rz','rx','ry'].includes(name)) return (['x','y'].includes(name) ? 'Left' : 'Right') + ' stick ' + direction;
      return 'Axis ' + name + ' ' + (negative ? '−' : '+');
    }
    return String(token || '').replace(/^SCAN_/, 'Key scan ').replace(/^NUMPAD_/, 'Numpad ').replace(/^BUTTON_/, 'Button ').replace(/_/g, ' ');
  }
  function controlSummary(p) {
    const learned = p.learned || {}, confirm = learned.confirm ? tokenLabel(learned.confirm) : 'OK / A / Enter / left click';
    const move = action => learned[action] ? tokenLabel(learned[action]) : p.bindings[action].slice(0, 3).map(tokenLabel).join(' / ');
    return [
      ['Action / select', confirm],
      ...['up','down','left','right'].map(action => ['Move ' + action, move(action)]),
      ['Rotate left', learned.rotateLeft ? tokenLabel(learned.rotateLeft) : 'Tap ' + confirm + ', then ' + move('left')],
      ['Rotate right', learned.rotateRight ? tokenLabel(learned.rotateRight) : 'Tap ' + confirm + ', then ' + move('right')],
      ['Rescue', learned.teleport ? 'Hold ' + tokenLabel(learned.teleport) + ' (2 s)' : 'Hold ' + confirm + ' (2½ s)']
    ];
  }
  function bind(p, action, token) {
    if (!ACTIONS.includes(action) || !token) return;
    // One physical key cannot mean two required actions. Preserve all other aliases.
    for (const a of Object.keys(p.bindings)) p.bindings[a] = p.bindings[a].filter(t => t !== token);
    p.bindings[action].push(token);
  }
  function setConfirm(p, token) {
    if (typeof token !== 'string' || !token || token.startsWith('axis:') || token.startsWith('pointer:') || token.startsWith('wheel:') || p.bindings.pause.includes(token)) return false;
    for (const a of Object.keys(p.bindings)) p.bindings[a] = p.bindings[a].filter(t => t !== token);
    p.bindings.confirm.push(token);
    if (!p.learned) p.learned = {};
    p.learned.confirm = token;
    return true;
  }
  function tokenFor(event, action) {
    if (event.type === 'key' && event.action === 'down' && !event.repeat) return event.code;
    if (event.type !== 'motion') return null;
    if (event.pointer) {
      const p = event.pointer;
      if (p.scrollY) return 'wheel:' + Math.sign(p.scrollY);
      const axis = Math.abs(p.dx || 0) >= Math.abs(p.dy || 0) ? 'x' : 'y';
      const value = axis === 'x' ? p.dx : p.dy;
      if (Math.abs(value || 0) > 0.0001) return 'pointer:' + axis + ':' + Math.sign(value);
    }
    const a = event.axes || {};
    const names = ['hatX', 'hatY', 'x', 'y', 'z', 'rz', 'rx', 'ry', 'ltrigger', 'rtrigger', 'brake', 'gas'];
    // Prefer the intended stick component over incidental diagonal drift.
    const wanted = action === 'up' || action === 'down' ? ['hatY', 'y', 'rz', 'ry'] :
      action === 'left' || action === 'right' ? ['hatX', 'x', 'z', 'rx'] : [];
    for (const axis of [...wanted, ...names]) {
      if (Math.abs(a[axis] || 0) > 0.55) return 'axis:' + axis + ':' + Math.sign(a[axis]);
    }
    return null;
  }
  function learn(p, action, event, completedActions = []) {
    if (!ACTIONS.includes(action)) return false;
    const token = tokenFor(event, action);
    if (!token || p.bindings.confirm.includes(token) || p.bindings.pause.includes(token)) return false;
    const learned = p.learned || {};
    if (completedActions.some(a => a !== action && learned[a] === token)) return false;
    if (!['up', 'down', 'left', 'right'].includes(action)) {
      // Remote directions must keep moving; the tap-confirm rotation layer
      // already provides both rotations without stealing their bindings.
      if (['up', 'down', 'left', 'right'].some(a => p.bindings[a].includes(token)) ||
        /^pointer:/.test(token) || /^axis:(hatX|hatY|x|y|z|rz|rx|ry):/.test(token)) return false;
    }
    bind(p, action, token);
    p.learned = {...learned, [action]: token};
    return true;
  }
  class Controller {
    constructor(device, saved) {
      this.device = device; this.profile = validProfile(saved) ? JSON.parse(JSON.stringify(saved)) : profile(device);
      this.clear();
    }
    clear() {
      this.keys = new Set(); this.keyPulses = new Map(); this.axes = {}; this.mouse = {x: 0, y: 0};
      this.mouseUntil = 0; this.wheel = 0; this.wheelUntil = 0;
      this.mouseEventAt = null;
      this.confirmAt = null; this.rotateMode = false; this.gestureUsed = false;
    }
    has(action) { return this.profile.bindings[action].some(k => this.keys.has(k)); }
    ingest(event, now) {
      if (event.type === 'key') {
        const was = this.keys.has(event.code);
        const hadConfirm = this.has('confirm');
        if (event.action === 'down') this.keys.add(event.code); else this.keys.delete(event.code);
        // Some virtual Bluetooth keyboards send down+up in the same native
        // batch. Keep a brief action pulse so a tap survives until a game tick.
        if (event.action === 'down' && !was) this.keyPulses.set(event.code, now + 40);
        if (this.profile.bindings.confirm.includes(event.code)) {
          if (event.action === 'down' && !was && !hadConfirm) { this.confirmAt = now; this.gestureUsed = false; }
          if (event.action === 'up' && !this.has('confirm') && this.confirmAt !== null) {
            if (now - this.confirmAt < 500 && !this.gestureUsed) this.rotateMode = !this.rotateMode;
            this.confirmAt = null;
          }
        }
      } else if (event.type === 'motion') {
        if (event.axes) this.axes = {...event.axes};
        if (event.pointer) {
          const p = event.pointer;
          if (p.dx || p.dy) {
            // Use the device event clock so 125Hz and 1000Hz mice have the same
            // sensitivity, even when the native bridge batches several events.
            const stamp = Number.isFinite(event.time) ? event.time : now;
            const dt = this.mouseEventAt === null ? 1000 / 60 : Math.max(1, Math.min(50, stamp - this.mouseEventAt));
            this.mouseEventAt = stamp;
            this.mouse.x = clamp((p.dx || 0) * 1000 / dt); this.mouse.y = clamp((p.dy || 0) * 1000 / dt);
            this.mouseUntil = now + 75;
          }
          if (p.scrollY) { this.wheel = Math.sign(p.scrollY); this.wheelUntil = now + 120; }
        }
      }
    }
    strength(action, now) {
      let value = this.has(action) ? 1 : 0;
      for (const token of this.profile.bindings[action]) {
        if (now < (this.keyPulses.get(token) || 0)) value = 1;
        const m = /^axis:(\w+):(-?1)$/.exec(token);
        if (m) value = Math.max(value, Math.max(0, (this.axes[m[1]] || 0) * Number(m[2])));
        const pointer = /^pointer:([xy]):(-?1)$/.exec(token);
        if (pointer && now < this.mouseUntil) value = Math.max(value, Math.max(0, this.mouse[pointer[1]] * Number(pointer[2])));
        if (token === 'wheel:' + this.wheel && now < this.wheelUntil) value = 1;
      }
      return value;
    }
    sample(now) {
      const a = this.axes;
      const strongest = values => values.reduce((best, v) => Math.abs(v || 0) > Math.abs(best) ? v : best, 0);
      // Both sticks and hat are usable before calibration; explicit learned axis bindings take precedence.
      const boundAxes = new Set(Object.values(this.profile.bindings).flat().filter(t => t.startsWith('axis:')).map(t => t.split(':')[1]));
      const boundPointer = new Set(Object.values(this.profile.bindings).flat().filter(t => t.startsWith('pointer:')).map(t => t.split(':')[1]));
      const boundWheel = Object.values(this.profile.bindings).some(tokens => tokens.some(t => t.startsWith('wheel:')));
      const axis = name => boundAxes.has(name) ? 0 : (a[name] || 0);
      let x = strongest([this.strength('right', now) - this.strength('left', now), axis('x'), axis('z'), axis('rx'), axis('hatX'), !boundPointer.has('x') && now < this.mouseUntil ? this.mouse.x : 0]);
      let y = strongest([this.strength('down', now) - this.strength('up', now), axis('y'), axis('rz'), axis('ry'), axis('hatY'), !boundPointer.has('y') && now < this.mouseUntil ? this.mouse.y : 0]);
      let rotateLeft = this.strength('rotateLeft', now) > 0.4 || Math.max(axis('ltrigger'), axis('brake')) > 0.5;
      let rotateRight = this.strength('rotateRight', now) > 0.4 || Math.max(axis('rtrigger'), axis('gas')) > 0.5;
      if (!boundWheel && now < this.wheelUntil) { rotateLeft ||= this.wheel > 0; rotateRight ||= this.wheel < 0; }
      if (this.rotateMode) {
        const turn = Math.abs(x) >= Math.abs(y) ? x : y;
        rotateLeft ||= turn < -0.2; rotateRight ||= turn > 0.2;
        x = 0; y = 0;
      }
      const heldConfirm = this.confirmAt !== null && now - this.confirmAt >= 500;
      if (heldConfirm) this.gestureUsed = true;
      const teleport = this.strength('teleport', now) > 0.4 || heldConfirm;
      if (teleport) { x = 0; y = 0; rotateLeft = false; rotateRight = false; }
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      return {x: clamp(x), y: clamp(y), rotateLeft, rotateRight, teleport};
    }
    isIdle(now) {
      return !this.keys.size && !Object.values(this.axes).some(v => Math.abs(v) > .2) && now >= this.mouseUntil && now >= this.wheelUntil;
    }
  }
  return {Controller, ACTIONS, DEFAULTS, profile, bind, learn, setConfirm, validProfile, tokenFor, tokenLabel, controlSummary};
});
