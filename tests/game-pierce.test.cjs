const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWebsite } = require('./helpers/web-host.cjs');

function game() {
  const site = loadWebsite();
  site.api.configure({ soundEnabled: false, effectsEnabled: false });
  site.api.start({ mode: '2p', winCondition: 'timed' });
  site.run(`
    Math.random = () => 0.5;
    player1.cy = player2.cy = 700;
    function fillTerritory(color) {
      for (const column of squares) column.fill(color);
      dayScore = color === DAY_COLOR ? TOTAL_SQUARES : 0;
      nightScore = TOTAL_SQUARES - dayScore;
    }
    function pickup(type, player = player1) { collectPowerup({ type, gridX: 1, gridY: 1 }, player); }
  `);
  return site;
}

function data(site, expression) {
  return JSON.parse(site.run(`JSON.stringify(${expression})`));
}

test('Pierce Ball captures a continuous path at stacked size/speed without a territory rebound', () => {
  const site = game();
  site.run(`
    fillTerritory(NIGHT_COLOR);
    balls = [makeBall(400, 100, 14, 5, 'day')];
    pickup('PIERCE_BALL'); pickup('BIGGER_BALL');
    for (let i = 0; i < POWERUP_LIMITS.FASTER_BALL; i++) pickup('FASTER_BALL');
    for (let i = 0; i < 36; i++) { updateBalls(); game.tickCount++; }
  `);
  const ball = data(site, 'balls[0]');
  assert.ok(Math.abs(ball.x - 652) < 1e-9);
  assert.ok(Math.abs(ball.y - 190) < 1e-9);
  assert.equal(ball.dx, 14);
  assert.equal(ball.dy, 5);
  assert.equal(ball.radius, 25);
  assert.equal(site.run(`Array.from({length: 253}, (_, x) => {
    const y = 100 + x * 5 / 14;
    return squares[Math.floor((400 + x) / SQUARE_SIZE)][Math.floor(y / SQUARE_SIZE)] === DAY_COLOR;
  }).every(Boolean)`), true, 'every cell along the high-speed path must be captured');
  assert.equal(site.run('dayScore'), site.run('squares.flat().filter(color => color === DAY_COLOR).length'));
  assert.equal(site.run('dayScore + nightScore'), site.run('TOTAL_SQUARES'));
});

test('ordinary balls retain territory rebounds', () => {
  const site = game();
  site.run(`fillTerritory(NIGHT_COLOR); balls = [makeBall(400, 137.5, 7, 5, 'day')]; checkSquareCollision(balls[0]);`);
  assert.equal(site.run('balls[0].dx'), -7);
  assert.ok(site.run('dayScore') > 0);
});

test('Pierce Ball keeps wall rebounds on all four sides', () => {
  for (const [x, y, dx, dy, expectedDx, expectedDy] of [
    [786, 200, 7, 5, -7, 5], [14, 200, -7, 5, 7, 5],
    [200, 786, 7, 5, 7, -5], [200, 14, 7, -5, 7, 5],
  ]) {
    const site = game();
    site.run(`fillTerritory(NIGHT_COLOR); balls = [makeBall(${x}, ${y}, ${dx}, ${dy}, 'day')]; pickup('PIERCE_BALL'); updateBalls();`);
    assert.equal(site.run('balls[0].dx'), expectedDx);
    assert.equal(site.run('balls[0].dy'), expectedDy);
    assert.equal(site.run('balls[0].x >= balls[0].radius && balls[0].x <= CANVAS_SIZE - balls[0].radius'), true);
    assert.equal(site.run('balls[0].y >= balls[0].radius && balls[0].y <= CANVAS_SIZE - balls[0].radius'), true);
  }
});

test('Pierce Ball still rebounds from either racket, including a rotated racket', () => {
  for (const player of ['player1', 'player2']) {
    for (const angle of [0, Math.PI / 4]) {
      const site = game();
      site.run(`
        pickup('PIERCE_BALL');
        Object.assign(${player}, { cx: 500, cy: 300, angle: ${angle} });
        balls = [makeBall(500 - 24 * Math.cos(${angle}), 300 - 24 * Math.sin(${angle}),
          7 * Math.cos(${angle}), 7 * Math.sin(${angle}), 'day')];
        checkRacketCollision(balls[0], ${player});
      `);
      assert.ok(site.run(`balls[0].dx * Math.cos(${angle}) + balls[0].dy * Math.sin(${angle})`) < 0);
      assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', 0)"), 1);
    }
  }
});

test('opponent racket continues protecting its covered territory during piercing', () => {
  const site = game();
  site.run(`
    fillTerritory(NIGHT_COLOR); pickup('PIERCE_BALL');
    Object.assign(player2, { cx: 520, cy: 312.5 });
    balls = [makeBall(500, 312.5, 7, 5, 'day')];
    checkSquareCollision(balls[0]);
  `);
  assert.equal(site.run('squares[20][12] === NIGHT_COLOR'), true);
  assert.equal(site.run('squares[19][12] === DAY_COLOR'), true);
  assert.equal(site.run('balls[0].dx'), 7);
});

test('balls pass through one another if either team has Pierce Ball', () => {
  for (const piercingPlayer of ['player1', 'player2', null]) {
    const site = game();
    site.run(`
      balls = [makeBall(300, 300, 7, 5, 'day'), makeBall(330, 300, -7, 5, 'night')];
      for (const ball of balls) ball.skipSquareCheck = 100;
      ${piercingPlayer ? `pickup('PIERCE_BALL', ${piercingPlayer});` : ''}
      updateBalls();
    `);
    assert.deepEqual(data(site, 'balls.map(ball => ball.dx)'), piercingPlayer ? [7, -7] : [-7, 7]);
    if (piercingPlayer) {
      const positions = data(site, 'balls.map(ball => ball.x)');
      const expected = piercingPlayer === 'player1' ? [303.5, 323] : [307, 326.5];
      positions.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-9));
    }
  }
});

test('team-wide piercing covers current and later extra balls but leaves the opponent normal', () => {
  const site = game();
  site.run(`
    pickup('EXTRA_BALL'); pickup('PIERCE_BALL'); pickup('EXTRA_BALL');
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      fillTerritory(ball.team === 'day' ? NIGHT_COLOR : DAY_COLOR);
      Object.assign(ball, { x: 400, y: 137.5, dx: 7, dy: 5 });
      checkSquareCollision(ball);
    }
  `);
  assert.deepEqual(data(site, "balls.filter(ball => ball.team === 'day').map(ball => [ball.dx, ball.dy])"), [[7, 5], [7, 5], [7, 5]]);
  assert.equal(site.run("balls.find(ball => ball.team === 'night').dx"), -7);
});

test('a repeat pickup refreshes one timed effect; exact expiry restores territory and ball rebounds', () => {
  const site = game();
  site.run(`settings.powerupDuration = 120; pickup('PIERCE_BALL'); game.tickCount = 5 * TICK_RATE; pickup('PIERCE_BALL'); updatePowerupHUD();`);
  assert.deepEqual(data(site, 'activeEffects.day.PIERCE_BALL'), [11]);
  const hasPierceBadge = () => site.element('day-powerups').querySelectorAll('.powerup-icon').some(el => el.getAttribute('title') === 'Pierce Ball');
  assert.equal(hasPierceBadge(), true);
  assert.equal(site.run("effectStacks('night', 'PIERCE_BALL', 9)"), 0);
  site.run('game.tickCount = 11 * TICK_RATE - 1;');
  assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', game.tickCount / TICK_RATE)"), 1);
  site.run(`
    game.tickCount++; fillTerritory(NIGHT_COLOR);
    balls = [makeBall(400, 137.5, 7, 5, 'day')]; checkSquareCollision(balls[0]); updatePowerupHUD();
  `);
  assert.equal(site.run('balls[0].dx'), -7);
  assert.equal(hasPierceBadge(), false);
  site.run(`
    balls = [makeBall(300, 300, 7, 5, 'day'), makeBall(330, 300, -7, 5, 'night')];
    for (const ball of balls) ball.skipSquareCheck = 100;
    updateBalls();
  `);
  assert.deepEqual(data(site, 'balls.map(ball => ball.dx)'), [-7, 7]);
});

test('Pierce Ball participates in both mirrored and random pickup pools', () => {
  const site = game();
  site.run(`
    for (let i = 0; i < POWERUP_TYPES.length; i++) { spawnPowerup(DAY_COLOR); spawnPowerup(NIGHT_COLOR); }
  `);
  const sequence = data(site, 'powerups.map(pu => pu.type)');
  assert.equal(sequence.filter(type => type === 'PIERCE_BALL').length, 2);
  for (let i = 0; i < sequence.length; i += 2) assert.equal(sequence[i], sequence[i + 1]);
  site.run(`settings.mirroredPowerups = false; Math.random = () => 0.999; spawnPowerup(DAY_COLOR);`);
  assert.equal(site.run('powerups.at(-1).type'), 'PIERCE_BALL');
});

test('starting another match clears Pierce Ball', () => {
  const site = game();
  site.run("pickup('PIERCE_BALL');");
  site.api.start();
  assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', 0)"), 0);
});

test('piercing moves every allied ball at half unboosted speed regardless of Fast Ball stacks', () => {
  for (const stacks of [0, 1, 4]) {
    for (const team of ['day', 'night']) {
      const site = game();
      site.run(`
        const collector = ${team === 'day' ? 'player1' : 'player2'};
        function measureMotion() {
          balls = [makeBall(200, 200, 9, 6, '${team}'), makeBall(400, 400, 9, 6, '${team}')];
          balls[1].isExtra = true; balls[1].expiresAt = 100;
          for (const ball of balls) ball.skipSquareCheck = 100;
          const origins = balls.map(b => [b.x, b.y]);
          updateBalls();
          return balls.map((b, i) => ({ x: b.x - origins[i][0], y: b.y - origins[i][1], dx: b.dx, dy: b.dy }));
        }
      `);
      const normal = data(site, 'measureMotion()');
      site.run(`for (let i = 0; i < ${stacks}; i++) pickup('FASTER_BALL', collector); pickup('PIERCE_BALL', collector);`);
      const slow = data(site, 'measureMotion()');
      for (let i = 0; i < 2; i++) {
        assert.ok(Math.abs(slow[i].x * 2 - normal[i].x) < 1e-9);
        assert.ok(Math.abs(slow[i].y * 2 - normal[i].y) < 1e-9);
        assert.equal(slow[i].dx, normal[i].dx, 'base velocity is preserved, not repeatedly divided');
        assert.equal(slow[i].dy, normal[i].dy);
      }
    }
  }
});

test('refresh never compounds slowdown; piercing and slowdown expire on the same tick', () => {
  const site = game();
  site.run(`
    settings.powerupDuration = 30; pickup('FASTER_BALL');
    settings.powerupDuration = 10; pickup('PIERCE_BALL');
    function advanceSlowBall() {
      balls = [makeBall(400, 137.5, 9, 6, 'day')];
      balls[0].skipSquareCheck = 100;
      updateBalls();
      return balls[0].x - 400;
    }
  `);
  assert.ok(Math.abs(site.run('advanceSlowBall()') - 4.5) < 1e-9);
  site.run("game.tickCount = 5 * TICK_RATE; pickup('PIERCE_BALL');");
  assert.ok(Math.abs(site.run('advanceSlowBall()') - 4.5) < 1e-9, 'refresh retains half unboosted speed');
  site.run('game.tickCount = 11 * TICK_RATE - 1;');
  assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', game.tickCount / TICK_RATE)"), 1);
  assert.ok(Math.abs(site.run('advanceSlowBall()') - 4.5) < 1e-9);
  site.run('game.tickCount++;');
  assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', game.tickCount / TICK_RATE)"), 0);
  assert.ok(Math.abs(site.run('advanceSlowBall()') - 13.5) < 1e-9, 'remaining Fast Ball boost returns immediately');
  site.run('fillTerritory(NIGHT_COLOR); checkSquareCollision(balls[0]);');
  assert.ok(site.run('balls[0].dx < 0 || balls[0].dy < 0'), 'territory rebound returns on that same tick');
});

test('Pierce Ball has its own fixed six seconds while other effects keep the configured duration', () => {
  for (const duration of [10, 40, 120]) {
    const site = game();
    site.run(`settings.powerupDuration = ${duration}; pickup('PIERCE_BALL'); pickup('FASTER_BALL'); pickup('EXTRA_BALL');`);
    assert.deepEqual(data(site, 'activeEffects.day.PIERCE_BALL'), [6]);
    assert.deepEqual(data(site, 'activeEffects.day.FASTER_BALL'), [duration]);
    assert.equal(site.run('balls.find(b => b.isExtra).expiresAt'), duration);
    site.run('game.tickCount = 6 * TICK_RATE - 1;');
    assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', game.tickCount / TICK_RATE)"), 1);
    site.run('game.tickCount++;');
    assert.equal(site.run("effectStacks('day', 'PIERCE_BALL', game.tickCount / TICK_RATE)"), 0);
  }
});

test('Fast Ball can expire during piercing without changing half speed or returning later', () => {
  const site = game();
  site.run(`
    settings.powerupDuration = 10; pickup('FASTER_BALL');
    game.tickCount = 5 * TICK_RATE; pickup('PIERCE_BALL');
    function measureStepAt(tick) {
      game.tickCount = tick;
      balls = [makeBall(200, 200, 9, 6, 'day')]; balls[0].skipSquareCheck = 100;
      updateBalls(); return balls[0].x - 200;
    }
  `);
  assert.ok(Math.abs(site.run('measureStepAt(9 * TICK_RATE)') - 4.5) < 1e-9);
  assert.ok(Math.abs(site.run('measureStepAt(10 * TICK_RATE)') - 4.5) < 1e-9);
  assert.ok(Math.abs(site.run('measureStepAt(11 * TICK_RATE)') - 9) < 1e-9);
});
