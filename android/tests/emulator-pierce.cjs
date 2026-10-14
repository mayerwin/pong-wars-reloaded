// Debug-only integration smoke in the isolated TV emulator. Native keys start
// the game and collect the pickup; read-only wrappers observe the real game loop.
// Run after installing the current debug APK and clearing this test app's data.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {connect} = require('./emulator-driver.cjs');
const output = path.resolve(__dirname, '../app/build/qa/pierce');

async function main() {
  const app = await connect(), evidence = {};
  const wait = async (expression, description, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await app.evaluate(expression);
      if (value) return value;
      await app.sleep(100);
    }
    throw new Error(description);
  };
  try {
    await app.waitFor(s => s.title.includes('PONG WARS'), 'Home screen');
    await app.evaluate('PongGame.configure({powerupDuration: 10, screenShake: true, effectsEnabled: true})');
    await app.nativeKey('DPAD_CENTER');
    await app.waitFor(s => s.title.includes('Pick up'), 'Solo controller join');
    await app.nativeKey('DPAD_CENTER');
    const join = await app.snapshot();
    if (join.title.includes('Choose your action')) {
      await app.nativeKey('DPAD_CENTER');
      await app.waitFor(s => s.title === 'Move up', 'First required direction');
      for (const [key, next] of [['DPAD_UP','Move down'], ['DPAD_DOWN','Move left'], ['DPAD_LEFT','Move right'], ['DPAD_RIGHT','Rotate left']]) {
        await app.nativeKey(key, 350);
        await app.waitFor(s => s.title === next, next);
      }
      await app.nativeKey('DPAD_DOWN');
      await app.nativeKey('DPAD_CENTER');
      await app.waitFor(s => s.title.includes('ready'), 'Optional buttons skipped');
      await app.nativeKey('DPAD_CENTER');
    }
    await app.waitFor(s => s.title === 'Your controls. Your match.', 'Ready lobby');
    await app.nativeKey('DPAD_CENTER');
    await app.waitFor(s => s.game.state === 'playing', 'Native match start');

    await app.evaluate(`(() => {
      window.__pierceQA = {captures: [], rackets: [], wall: false, renders: 0, maxShakeCss: 0};
      const squareCheck = checkSquareCollision, racketCheck = checkRacketCollision, ballUpdate = updateBalls, draw = render;
      checkSquareCollision = function(ball, ...args) {
        const score = dayScore, dx = ball.dx, dy = ball.dy;
        const piercing = effectStacks(ball.team, 'PIERCE_BALL', game.tickCount / TICK_RATE) > 0;
        const result = squareCheck(ball, ...args);
        if (score !== dayScore && __pierceQA.captures.length < 1000) __pierceQA.captures.push({
          tick: game.tickCount, piercing, x: ball.x, score: dayScore,
          unchanged: dx === ball.dx && dy === ball.dy, extra: !!ball.isExtra,
        });
        return result;
      };
      checkRacketCollision = function(ball, player) {
        const dx = ball.dx;
        const result = racketCheck(ball, player);
        if (dx > 0 && ball.dx < 0) __pierceQA.rackets.push({tick: game.tickCount, team: player.team});
        return result;
      };
      updateBalls = function(...args) {
        const result = ballUpdate(...args);
        if (balls.some(b => b.bounceX === CANVAS_SIZE - b.radius && b.bounceT >= 0 && b.dx < 0)) __pierceQA.wall = true;
        return result;
      };
      render = function(alpha) {
        const offset = screenShakeOffset(alpha);
        __pierceQA.maxShakeCss = Math.max(__pierceQA.maxShakeCss, Math.abs(offset.x) / canvasPixelRatio, Math.abs(offset.y) / canvasPixelRatio);
        __pierceQA.renders++;
        return draw(alpha);
      };
      settings.mode = '2p'; settings.winCondition = 'timed'; settings.freeMovement = true;
      game.timeRemaining = 300;
      for (let x = 0; x < NUM_SQUARES; x++) for (let y = 0; y < NUM_SQUARES; y++) squares[x][y] = x < NUM_SQUARES / 2 ? DAY_COLOR : NIGHT_COLOR;
      dayScore = nightScore = TOTAL_SQUARES / 2;
      Object.assign(player1, {cx:100, cy:650, oldX:100, oldY:650, angle:0, oldAngle:0});
      Object.assign(player2, {cx:700, cy:650, oldX:700, oldY:650, angle:0, oldAngle:0});
      balls = [makeBall(300, 125, 7, 5, 'day'), makeBall(300, 275, 7, 5, 'day')];
      balls[1].isExtra = true; balls[1].expiresAt = game.tickCount / TICK_RATE + 60;
      activeEffects = {day:{},night:{}};
      powerups = [{type:'PIERCE_BALL',gridX:6,gridY:26,pulsePhase:0,spawnTime:game.tickCount/TICK_RATE}];
      lastSpawn = {day:game.tickCount/TICK_RATE,night:game.tickCount/TICK_RATE};
      resetScreenShake();
    })()`);
    await app.nativeKey('DPAD_RIGHT', 200);
    await wait("effectStacks('day','PIERCE_BALL',game.tickCount/TICK_RATE) === 1", 'Native movement must collect Pierce Ball');
    assert.ok((await app.snapshot()).game.players[0].x > 100, 'Native remote moved the racket');
    await wait('__pierceQA.captures.some(c => c.piercing && c.extra) && __pierceQA.captures.some(c => c.piercing && !c.extra)', 'Both balls must capture while piercing');
    assert.equal(await app.evaluate("!!document.querySelector('[title=\"Pierce Ball\"]')"), true, 'Pierce Ball HUD');
    await app.evaluate("powerups.push({type:'PIERCE_BALL',gridX:23,gridY:5,pulsePhase:0,spawnTime:game.tickCount/TICK_RATE})");
    await app.sleep(500); // Let the new pickup reach the native compositor.
    await app.screenshot(path.join(output, '01-pierce-active.png'));
    await wait('__pierceQA.wall', 'Piercing balls still bounce off walls');
    evidence.live = await app.evaluate('JSON.parse(JSON.stringify(__pierceQA))');
    assert.ok(evidence.live.captures.filter(c => c.piercing).every(c => c.unchanged), 'Enemy territory must not reflect piercing balls');
    assert.ok(evidence.live.maxShakeCss <= 1, 'Any live nudge is at most one CSS pixel');

    await app.evaluate(`(() => {
      balls = [makeBall(615, 500, 7, 5, 'day')];
      Object.assign(player2, {cx:700,cy:550,oldX:700,oldY:550});
      __pierceQA.rackets = [];
    })()`);
    await wait('__pierceQA.rackets.length > 0', 'Enemy racket still reflects piercing balls');
    evidence.racket = await app.evaluate('__pierceQA.rackets');

    await app.nativeKey('BACK');
    await app.waitFor(s => s.game.state === 'paused', 'Native pause');
    await app.screenshot(path.join(output, '02-native-pause.png'));
    await app.evaluate(`(() => {
      activeEffects.day.PIERCE_BALL = [game.tickCount / TICK_RATE];
      __pierceQA.captures = [];
      balls = [makeBall(385, 125, 7, 5, 'day')];
      for (let x=16;x<NUM_SQUARES;x++) for(let y=0;y<NUM_SQUARES;y++) squares[x][y]=NIGHT_COLOR;
      dayScore = nightScore = TOTAL_SQUARES / 2;
    })()`);
    await app.nativeKey('BACK');
    await app.waitFor(s => s.game.state === 'playing', 'Native resume');
    await wait('__pierceQA.captures.some(c => !c.piercing && !c.unchanged)', 'Expiry restores territory reflection');
    assert.equal(await app.evaluate("!!document.querySelector('[title=\"Pierce Ball\"]')"), false, 'Expired effect leaves HUD');
    evidence.expired = await app.evaluate('__pierceQA.captures');
    evidence.final = await app.snapshot();
    evidence.diagnostics = await app.evaluate('PongGame.getDiagnostics()');
    assert.equal(app.errors.length, 0, JSON.stringify(app.errors));
    console.log('PASS: native start/pickup/pause/resume, two piercing balls capture, walls/racket rebound, expiry, live HUD/icon and bounded shake.');
  } finally {
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, 'emulator-pierce.json'), JSON.stringify({evidence, errors:app.errors}, null, 2));
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
