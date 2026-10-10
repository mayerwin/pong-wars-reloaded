const assert = require('node:assert/strict');
const { test } = require('node:test');
const input = require('../tv/input.js');
const device = {id: 1, key: 'test-device', name: 'Test controller'};
const key = (code, action = 'down', repeat = 0) => ({type: 'key', code, action, repeat});
const motion = (axes, time) => ({type: 'motion', axes, time});
const pointer = (values, time) => ({type: 'motion', pointer: values, time});
function tap(c, code, at) { c.ingest(key(code), at); c.ingest(key(code, 'up'), at + 30); }

test('five-button remote moves, rotates both ways and rescues without chords', () => {
  const c = new input.Controller(device);
  for (const [code, axis, sign] of [['DPAD_UP','y',-1], ['DPAD_DOWN','y',1], ['DPAD_LEFT','x',-1], ['DPAD_RIGHT','x',1]]) {
    c.ingest(key(code), 0);
    assert.equal(c.sample(100)[axis], sign);
    c.ingest(key(code, 'up'), 110);
  }
  tap(c, 'DPAD_CENTER', 200);
  assert.equal(c.rotateMode, true);
  c.ingest(key('DPAD_LEFT'), 250);
  assert.equal(c.sample(300).rotateLeft, true);
  assert.equal(c.sample(300).x, 0);
  c.ingest(key('DPAD_LEFT', 'up'), 310);
  c.ingest(key('DPAD_RIGHT'), 350);
  assert.equal(c.sample(400).rotateRight, true);
  c.ingest(key('DPAD_RIGHT', 'up'), 410);
  tap(c, 'DPAD_CENTER', 450);
  assert.equal(c.rotateMode, false);
  c.ingest(key('DPAD_CENTER'), 500);
  assert.equal(c.sample(999).teleport, false);
  assert.equal(c.sample(1000).teleport, true);
  c.ingest(key('DPAD_CENTER', 'up'), 2600);
  assert.equal(c.sample(2601).teleport, false);
  assert.equal(c.rotateMode, false);
});

test('an arbitrary virtual five-button keyboard can calibrate every action', () => {
  const c = new input.Controller(device);
  assert.equal(input.setConfirm(c.profile, 'F9'), true);
  const codes = ['F1', 'F2', 'F3', 'F4'];
  const completed = [];
  for (let i = 0; i < 4; i++) {
    assert.equal(input.learn(c.profile, input.ACTIONS[i], key(codes[i]), completed), true);
    completed.push(input.ACTIONS[i]);
  }
  tap(c, 'F9', 0);
  c.ingest(key('F3'), 100);
  assert.equal(c.sample(101).rotateLeft, true);
  c.ingest(key('F3', 'up'), 110);
  c.ingest(key('F4'), 150);
  assert.equal(c.sample(151).rotateRight, true);
  c.ingest(key('F9'), 200);
  assert.equal(c.sample(700).teleport, true);
});

test('keyboard aliases work without calibration and diagonal speed is bounded', () => {
  const c = new input.Controller(device);
  for (const code of ['DPAD_UP', 'W', 'I', 'NUMPAD_8']) {
    c.clear(); c.ingest(key(code), 0);
    assert.equal(c.sample(100).y, -1);
  }
  c.clear(); c.ingest(key('W'), 0); c.ingest(key('D'), 0);
  assert.ok(Math.abs(Math.hypot(c.sample(100).x, c.sample(100).y) - 1) < 1e-10);
});

test('ESDF remapping moves aliases without losing previously verified keys', () => {
  const p = input.profile(device);
  const completed = [];
  for (const [action, code] of [['up','E'], ['down','D'], ['left','S'], ['right','F']]) {
    assert.equal(input.learn(p, action, key(code), completed), true);
    completed.push(action);
  }
  assert.equal(input.learn(p, 'rotateLeft', key('E'), completed), false);
  assert.equal(input.learn(p, 'right', key('E'), completed), false);
  assert.deepEqual(p.learned, {up:'E', down:'D', left:'S', right:'F'});
  assert.equal(p.bindings.rotateRight.includes('E'), false);
  assert.equal(p.bindings.down.includes('S'), false);
  assert.equal(p.bindings.right.includes('D'), false);
});

test('arbitrary dedicated rotation and rescue keys are learned and retained', () => {
  const c = new input.Controller(device);
  const completed = [];
  for (const [action, code] of [['rotateLeft','F5'], ['rotateRight','F6'], ['teleport','F7']]) {
    assert.equal(input.learn(c.profile, action, key(code), completed), true);
    completed.push(action);
    c.ingest(key(code), 0);
    assert.equal(c.sample(100)[action], true);
    c.clear();
  }
  assert.equal(input.learn(c.profile, 'teleport', key('F5'), completed), false);
});

test('confirm, pause and remote directional controls stay reserved', () => {
  const p = input.profile(device);
  assert.equal(input.setConfirm(p, 'BACK'), false);
  assert.equal(input.setConfirm(p, 'axis:x:1'), false);
  assert.equal(input.learn(p, 'up', key('ENTER')), false);
  assert.equal(input.learn(p, 'up', key('ESCAPE')), false);
  assert.equal(input.learn(p, 'rotateLeft', key('DPAD_LEFT')), false);
  assert.equal(input.learn(p, 'teleport', motion({y: -1})), false);
  assert.equal(input.learn(p, 'rotateRight', pointer({dx: .02})), false);
  assert.equal(input.tokenFor(key('W', 'down', 1)), null);
});

test('two Xbox controllers are independent across sticks, dpad, triggers and buttons', () => {
  const first = new input.Controller({...device, id: 11});
  const second = new input.Controller({...device, id: 12});
  first.ingest(motion({x: .6, y: -.3, ltrigger: .7}), 0);
  second.ingest(motion({hatX: -1, hatY: 0, rtrigger: 1}), 0);
  assert.equal(first.sample(100).x, .6);
  assert.equal(first.sample(100).rotateLeft, true);
  assert.equal(first.sample(100).rotateRight, false);
  assert.equal(second.sample(100).x, -1);
  assert.equal(second.sample(100).rotateRight, true);
  first.ingest(key('BUTTON_X'), 100);
  assert.equal(first.sample(101).teleport, true);
  assert.equal(second.sample(101).teleport, false);
});

test('learned stick signs override only their axis and keep opposite directions', () => {
  const c = new input.Controller(device);
  assert.equal(input.learn(c.profile, 'up', motion({y: 1})), true);
  assert.equal(input.learn(c.profile, 'down', motion({y: -1}), ['up']), true);
  c.ingest(motion({x: .3, y: 1}), 0);
  assert.ok(c.sample(100).y < 0);
  assert.ok(c.sample(100).x > 0);
  c.ingest(motion({y: -1}), 200);
  assert.equal(c.sample(201).y, 1);
  assert.equal(input.tokenFor(motion({x:.8, y:-1}), 'up'), 'axis:y:-1');
});

test('learned trigger rotation can be swapped without triggering both rotations', () => {
  const c = new input.Controller(device);
  assert.equal(input.learn(c.profile, 'rotateRight', motion({ltrigger:1})), true);
  c.ingest(motion({ltrigger:1}), 0);
  assert.equal(c.sample(100).rotateRight, true);
  assert.equal(c.sample(100).rotateLeft, false);
});

test('mouse motion expires and one wheel notch can pass a rotation check', () => {
  const c = new input.Controller(device);
  c.ingest(pointer({dx:.01, dy:-.01}, 0), 0);
  assert.ok(c.sample(1).x > 0);
  assert.ok(c.sample(1).y < 0);
  assert.equal(c.sample(80).x, 0);
  c.ingest(pointer({scrollY:1}, 100), 100);
  assert.equal(c.sample(200).rotateLeft, true);
  assert.equal(c.sample(221).rotateLeft, false);
  tap(c, 'MOUSE_PRIMARY', 300);
  assert.equal(c.rotateMode, true);
  assert.equal(c.profile.bindings.pause.includes('MOUSE_SECONDARY'), true);
});

test('mouse sensitivity uses event time instead of polling rate or bridge batching', () => {
  const slow = new input.Controller(device), fast = new input.Controller(device);
  slow.ingest(pointer({dx:.001}, 0), 0);
  fast.ingest(pointer({dx:.001}, 0), 0);
  slow.ingest(pointer({dx:.004}, 8), 16);
  for (let t = 1; t <= 8; t++) fast.ingest(pointer({dx:.0005}, t), 16);
  assert.equal(slow.sample(17).x, fast.sample(17).x);
  assert.equal(slow.sample(17).x, .5);
});

test('mouse direction and wheel learning supports reverse controls', () => {
  const c = new input.Controller(device);
  assert.equal(input.learn(c.profile, 'up', pointer({dy:.01})), true);
  assert.equal(input.learn(c.profile, 'down', pointer({dy:-.01}), ['up']), true);
  c.ingest(pointer({dy:.01}), 0);
  assert.ok(c.sample(1).y < 0);
  assert.equal(input.learn(c.profile, 'rotateRight', pointer({scrollY:1})), true);
  c.ingest(pointer({scrollY:1}), 100);
  assert.equal(c.sample(101).rotateRight, true);
  assert.equal(c.sample(101).rotateLeft, false);
});

test('same-batch virtual keyboard down/up survives until the simulation tick', () => {
  const c = new input.Controller(device);
  c.ingest(key('W'), 100);
  c.ingest(key('W', 'up'), 100);
  assert.equal(c.sample(117).y, -1);
  assert.equal(c.sample(141).y, 0);
  assert.equal(c.keys.size, 0);
});

test('key repeat and overlapping confirm aliases never toggle rotation twice', () => {
  const c = new input.Controller(device);
  c.ingest(key('ENTER'), 0);
  c.ingest(key('ENTER', 'down', 1), 100);
  c.ingest(key('DPAD_CENTER'), 110);
  c.ingest(key('ENTER', 'up'), 120);
  assert.equal(c.rotateMode, false);
  c.ingest(key('DPAD_CENTER', 'up'), 130);
  assert.equal(c.rotateMode, true);
  c.ingest(key('DPAD_CENTER', 'up'), 140);
  assert.equal(c.rotateMode, true);
});

test('clear releases all held inputs and persisted reconnect uses an isolated profile', () => {
  const c = new input.Controller(device);
  input.learn(c.profile, 'up', key('F1'));
  c.profile.verified = true;
  const saved = JSON.parse(JSON.stringify(c.profile));
  c.ingest(key('F1'), 0);
  c.ingest(key('ENTER'), 0);
  c.ingest(motion({x:1, rtrigger:1}), 0);
  assert.equal(c.isIdle(1), false);
  c.clear();
  assert.equal(c.isIdle(1), true);
  assert.deepEqual(c.sample(1), {x:0,y:0,rotateLeft:false,rotateRight:false,teleport:false});
  const restored = new input.Controller({...device,id:99}, saved);
  restored.ingest(key('F1'), 100);
  assert.equal(restored.sample(101).y, -1);
  restored.profile.bindings.up.push('F2');
  assert.equal(saved.bindings.up.includes('F2'), false);
  assert.equal(input.validProfile({...saved, version:999}), false);
  assert.equal(input.validProfile({...saved, bindings:{}}), false);
});
