// Verify the real renderer at different physical resolutions, without scaling
// the game's 800-unit world or replacing render() with a stub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of listeners.get(type) || []) fn({preventDefault() {}}); },
  };
}

function loadRenderer(width = 800, height = width, dpr = 1, observeResize = true) {
  let rect = {width, height}, reads = 0, writes = 0;
  let matrix = [1,0,0,1,0,0];
  const stack = [], draws = [], observers = [], elements = new Map();
  const ctx = {
    setTransform(...values) { matrix = values; },
    save() { stack.push([...matrix]); },
    restore() { assert.ok(stack.length, 'renderer restore must have a matching save'); matrix = stack.pop(); },
    translate(x,y) { matrix[4] += matrix[0] * x + matrix[2] * y; matrix[5] += matrix[1] * x + matrix[3] * y; },
    rotate(angle) {
      const [a,b,c,d,e,f] = matrix, co = Math.cos(angle), si = Math.sin(angle);
      matrix = [a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f];
    },
    scale(x,y) { matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y; },
    fillRect(...args) { draws.push({op:'fillRect',args,matrix:[...matrix]}); },
    strokeRect(...args) { draws.push({op:'strokeRect',args,matrix:[...matrix]}); },
    arc(...args) { draws.push({op:'arc',args,matrix:[...matrix]}); },
    rect(...args) { draws.push({op:'rect',args,matrix:[...matrix]}); },
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
  };
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(id === 'menu' ? [] : ['hidden']);
    const el = {...events(), id, style:{}, dataset:{}, className:'', textContent:'',
      classList: {add(...values) { values.forEach(v=>classes.add(v)); }, remove(...values) { values.forEach(v=>classes.delete(v)); },
        contains:value=>classes.has(value), toggle(value,on=!classes.has(value)) { if (on) classes.add(value); else classes.delete(value); }},
      querySelector:selector=>element(id+selector), querySelectorAll:()=>[],
      getContext:()=>ctx,
      getBoundingClientRect() {
        if (id === 'pongCanvas') { reads++; return {left:0,top:0,right:rect.width,bottom:rect.height,...rect}; }
        return {left:0,top:0,width:100,height:100,right:100,bottom:100};
      },
    };
    elements.set(id,el); return el;
  }
  const canvas = element('pongCanvas');
  for (const dimension of ['width','height']) {
    let backing = 800;
    Object.defineProperty(canvas,dimension,{get:()=>backing,set(value) {
      writes++; backing = value; matrix = [1,0,0,1,0,0]; stack.length = 0;
    }});
  }
  class ResizeObserver {
    constructor(fn) { this.fn = fn; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  const motionPreference = {...events(),matches:false};
  const window = {...events(),devicePixelRatio:dpr,matchMedia:query=>query === '(prefers-reduced-motion: reduce)' ? motionPreference : {...events(),matches:true}};
  if (observeResize) window.ResizeObserver = ResizeObserver;
  const document = {...events(),body:element('body'),hidden:false,getElementById:element,querySelectorAll:()=>[]};
  const timeouts = new Map(); let nextTimeout = 0;
  const context = vm.createContext({window,document,ResizeObserver,navigator:{maxTouchPoints:0},screen:{},
    localStorage:{getItem:()=>null,setItem() {}}, getComputedStyle:()=>({getPropertyValue:()=>''}),
    performance:{now:()=>0}, requestAnimationFrame() {},
    setTimeout(fn) { const id=++nextTimeout; timeouts.set(id,fn); return id; }, clearTimeout(id) { timeouts.delete(id); },
  });
  vm.runInContext(source,context,{filename:'game.js'});
  const run = expression=>vm.runInContext(expression,context);
  run('Math.random = () => 0.5;');
  window.PongGame.activateExternalControls(true);
  window.PongGame.start({mode:'2p',duration:180,winCondition:'timed'});
  run('settings.effectsEnabled = false;');
  return {window,document,canvas,draws,run,api:window.PongGame,
    get reads() { return reads; }, get writes() { return writes; },
    render() { draws.length=0; run('render(1)'); assert.equal(stack.length,0); },
    reduceMotion(value) { motionPreference.matches=value;motionPreference.emit('change'); },
    position(left,top) { rect={...rect,left,top};window.emit('resize'); },
    resize(w,h=w,event='observer') {
      rect = {width:w,height:h};
      if (event === 'observer') {
        for (const o of observers) if (o.targets.has(canvas)) o.fn([{target:canvas,contentRect:rect}]);
      }
      else if (event === 'fullscreenchange') document.emit(event);
      else window.emit(event);
    },
    snapshot:()=>run('JSON.stringify({game,players:[player1,player2],balls,squares,powerups,activeEffects,teleportState,particles,ballTrails})'),
  };
}

test('backing pixels follow CSS size times DPR through 4K density without a fixed cap', () => {
  for (const [css,dpr] of [[320,1],[600,1.5],[800,2],[960,4],[1700,1],[1280,3]]) {
    const game=loadRenderer(css,css,dpr); game.render();
    assert.equal(game.canvas.width,Math.ceil(css*dpr));
    assert.equal(game.canvas.height,Math.ceil(css*dpr));
    assert.deepEqual(game.draws[0].args,[0,0,Math.ceil(css*dpr),Math.ceil(css*dpr)]);
    assert.deepEqual(game.draws[0].matrix,[1,0,0,1,0,0]);
    assert.equal(game.run('CANVAS_SIZE'),800);
    assert.equal(game.run('NUM_SQUARES'),32);
  }
});

test('territory uses physical pixels and vector players/effects receive exactly one world transform', () => {
  const game=loadRenderer(900,900,2); // 1800 physical pixels, 2.25 pixels per world unit.
  game.run(`settings.effectsEnabled=true; settings.gridEffect=true; settings.particles=true;
    screenShake.intensity=0; player1.angle=player1.oldAngle=Math.PI/4;
    particles=[{x:300,y:300,life:1,size:5,color:'#fff',rotation:0.5}];
    ballTrails=[{x:320,y:350,radius:10,life:0.7,color:'#fff'}];
    powerups=[{gridX:2,gridY:2,pulsePhase:0,type:'BIGGER_BALL'}];`);
  game.render();
  assert.ok(game.draws.some(d=>d.op==='strokeRect'), 'racket outlines rendered');
  assert.ok(game.draws.filter(d=>d.op==='arc').length>=5, 'balls, powerups and trails rendered');
  for (const draw of game.draws.slice(1).filter(d=>d.op!=='rect')) {
    const [a,b,c,d]=draw.matrix;
    assert.ok(Math.abs(Math.hypot(a,b)-2.25)<1e-10, 'x basis keeps one resolution scale');
    assert.ok(Math.abs(Math.hypot(c,d)-2.25)<1e-10, 'y basis keeps one resolution scale');
  }
  game.render();
  assert.deepEqual(game.draws.find(d=>d.op==='arc').matrix,[2.25,0,0,2.25,0,0], 'scale never compounds across frames');
});

test('unchanged frames allocate no backing buffers and perform no repeated layout measurement', () => {
  const game=loadRenderer(960,960,4); game.render();
  const {writes,reads}=game;
  for (let i=0;i<120;i++) game.render();
  assert.equal(game.writes,writes);
  assert.equal(game.reads,reads);
  game.resize(960); game.render();
  assert.equal(game.writes,writes, 'a redundant resize notification must not clear/reallocate pixels');
});

test('CSS resize, fullscreen and DPR-only changes resize pixels without resetting the match', () => {
  const game=loadRenderer(600); game.render();
  game.api.setInput(0,{y:0.5}); game.run('gameLoop(0); gameLoop(100);');
  const state=game.snapshot();
  game.resize(950.25,950.25); game.render();
  assert.equal(game.canvas.width,951);
  assert.equal(game.snapshot(),state);
  game.window.devicePixelRatio=2.5; game.render();
  assert.equal(game.canvas.width,2376);
  assert.equal(game.snapshot(),state);
  game.resize(800,800,'resize'); game.render(); assert.equal(game.canvas.width,2000);
  game.resize(810,810,'fullscreenchange'); game.render(); assert.equal(game.canvas.width,2025);
  assert.equal(game.snapshot(),state);
});

test('hidden or invalid geometry preserves backing pixels and retries when visible', () => {
  const game=loadRenderer(600,600,2); game.render();
  const writes=game.writes;
  for (const size of [0,NaN,Infinity]) { game.resize(size); game.render(); assert.equal(game.canvas.width,1200); }
  assert.equal(game.writes,writes);
  game.resize(800,800,null); game.render(); assert.equal(game.canvas.width,1600, 'invalid geometry stays dirty and retries without another resize notification');
  for (const dpr of [0,-1,NaN,Infinity]) {
    game.window.devicePixelRatio=dpr; game.resize(801); game.render();
    assert.equal(game.canvas.width,801, 'invalid density falls back to one physical pixel per CSS pixel');
  }
});

test('load and window resize keep resolution correct when ResizeObserver is unavailable', () => {
  const game=loadRenderer(600,600,2,false); game.render();
  game.resize(700,700,'load'); game.render(); assert.equal(game.canvas.width,1400);
  game.resize(850,850,'resize'); game.render(); assert.equal(game.canvas.width,1700);
});

test('render resolution does not change player movement, balls, territory or game timing', () => {
  const small=loadRenderer(400,400,1), large=loadRenderer(960,960,4);
  for (const game of [small,large]) {
    game.api.setInput(0,{y:0.4}); game.api.setInput(1,{y:-0.3});
    game.run('for(let i=0;i<=120;i++) gameLoop(i*1000/60);');
  }
  assert.equal(large.snapshot(),small.snapshot());
  assert.equal(large.canvas.width,3840);
  assert.equal(small.canvas.width,400);
});

test('territory edges land on physical pixels at fractional display scales', () => {
  const game=loadRenderer(653.078125,653.078125,3);
  game.run(`for(let x=0;x<NUM_SQUARES;x++) for(let y=0;y<NUM_SQUARES;y++) squares[x][y]=((x+y)%2 ? NIGHT_COLOR : DAY_COLOR);`);
  game.render();
  const cells=game.draws.filter(d=>d.op==='rect');
  assert.equal(cells.length,512);
  for (const {args:[x,y,w,h],matrix:[sx,,,,tx,ty]} of cells) {
    for (const edge of [x*sx+tx,(x+w)*sx+tx,y*sx+ty,(y+h)*sx+ty])
      assert.ok(Math.abs(edge-Math.round(edge))<1e-8, `territory edge ${edge} must not create a soft seam`);
  }
});

test('shake is smooth, deterministic and shared by territory, balls and rackets', () => {
  const game=loadRenderer(960,960,2);
  game.run(`settings.effectsEnabled=true; triggerScreenShake(4); updateParticles();`);
  game.render();
  const offset=JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))'));
  assert.ok(offset.x || offset.y, 'a newly triggered kick must move the scene');
  assert.ok(Number.isInteger(offset.x) && Number.isInteger(offset.y));
  const territory=game.draws.filter(d=>d.op==='rect')[1], ball=game.draws.find(d=>d.op==='arc');
  assert.equal(territory.args[0],Math.round(game.canvas.width/2)+offset.x);
  assert.equal(territory.args[1],Math.round(game.canvas.height/32)+offset.y);
  assert.equal(ball.matrix[4],offset.x); assert.equal(ball.matrix[5],offset.y);
  const before=JSON.stringify(game.draws);
  game.run('Math.random = () => { throw new Error("render must never introduce random shake jitter"); };');
  game.render(); assert.equal(JSON.stringify(game.draws),before);
  const positions=[];
  for(let i=0;i<=20;i++) positions.push(JSON.parse(game.run(`JSON.stringify(screenShakeOffset(${i/20}))`)));
  for(let i=1;i<positions.length;i++) {
    assert.ok(Math.abs(positions[i].x-positions[i-1].x)<=1);
    assert.ok(Math.abs(positions[i].y-positions[i-1].y)<=1);
  }
});

test('shake cadence does not depend on display refresh and settles completely', () => {
  const slow=loadRenderer(960,960,4),fast=loadRenderer(960,960,4);
  for(const game of [slow,fast]) game.run('settings.effectsEnabled=true; triggerScreenShake(4);');
  for(let tick=0;tick<40;tick++) {
    for(const game of [slow,fast]) game.run('updateParticles();');
    slow.render();
    fast.run('render(0); render(.5);'); fast.render();
    assert.equal(slow.run('JSON.stringify(screenShakeOffset(1))'),fast.run('JSON.stringify(screenShakeOffset(1))'));
  }
  assert.deepEqual(JSON.parse(slow.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0});
});

test('ordinary territory captures never move the board', () => {
  const game=loadRenderer(960,960,4);
  game.run(`settings.effectsEnabled=true; audio.playBounce=()=>{};
    for(let tick=0;tick<120;tick++) {
      squares[20][10]=NIGHT_COLOR;
      checkSquareCollision(makeBall(512.5,262.5,7,7,'day'));
      updateParticles();
    }`);
  assert.equal(game.run('squares[20][10] === DAY_COLOR'),true,'the collision really captured enemy territory');
  assert.equal(game.run('screenShake.cooldown'),0,'territory contacts do not request a nudge');
  game.render();
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0});
});

test('rare impact nudges stay within one CSS pixel per axis on laptop and 4K layouts', () => {
  for(const [css,dpr] of [[400,1],[1600,1],[960,1.25],[1600,2],[960,4]]) {
    const game=loadRenderer(css,css,dpr);game.render();
    game.run('settings.effectsEnabled=true; triggerScreenShake(100);');
    const positions=[];
    for(let tick=0;tick<12;tick++) {
      game.run('updateParticles();');
      for(const alpha of [0,0.25,0.5,0.75,1]) {
        const p=JSON.parse(game.run(`JSON.stringify(screenShakeOffset(${alpha}))`));
        positions.push(p);
        assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y),'nudges preserve whole display pixels');
        assert.ok(p.x >= 0 && p.y >= 0,'one out-and-back nudge never oscillates around the origin');
        assert.ok(p.x/dpr <= 1 && p.y/dpr <= 1,'canvas size cannot amplify motion');
        if(tick>=8) assert.deepEqual(p,{x:0,y:0},'motion ends within 150 ms, including interpolation');
      }
    }
    assert.ok(positions.some(p=>p.x),'a full-strength rare impact still gives subtle visual feedback');
  }
});

test('rapid impacts cannot extend a nudge or restart it during the cooldown', () => {
  const game=loadRenderer(960,960,4);game.render();
  game.run('settings.effectsEnabled=true; triggerScreenShake(1);');
  for(let tick=0;tick<30;tick++) {
    game.run('triggerScreenShake(100);updateParticles();');
    assert.equal(game.run('screenShake.cooldown'),29-tick);
    if(tick>=7) assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0});
  }
  game.run('triggerScreenShake(1);updateParticles();');
  assert.ok(game.run('screenShakeOffset(1).x > 0'),'a later distinct impact may nudge again');
});

test('system reduced motion does not override the game screen shake switch', () => {
  const game=loadRenderer(960,960,4);game.render();
  game.run('settings.effectsEnabled=true;triggerScreenShake(1);updateParticles();');
  assert.ok(game.run('screenShakeOffset(1).x > 0'));
  const before=game.run('JSON.stringify(screenShakeOffset(1))');
  game.reduceMotion(true);
  assert.equal(game.run('JSON.stringify(screenShakeOffset(1))'),before,'OS preference cannot cancel an active nudge');
  game.run('resetScreenShake();triggerScreenShake(1);updateParticles();');
  assert.ok(game.run('screenShakeOffset(1).x > 0'),'fresh impacts still work with reduced motion enabled');
  game.run('settings.screenShake=false;');
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0});
  game.reduceMotion(false);
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0},'the game Off switch remains authoritative');
});

test('powerup pickup shake works independently of particles', () => {
  const game=loadRenderer(960,960,2);game.render();
  game.run(`settings.effectsEnabled=true;settings.particles=false;
    collectPowerup({type:'PIERCE_BALL',gridX:2,gridY:2},player1);updateParticles();`);
  assert.ok(game.run('screenShakeOffset(1).x > 0'));
  assert.equal(game.run('particles.length'),0);
  game.run(`resetScreenShake();settings.screenShake=false;
    collectPowerup({type:'PIERCE_BALL',gridX:2,gridY:2},player1);updateParticles();`);
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(1))')),{x:0,y:0});
});

test('starting a new match clears the prior nudge and its cooldown', () => {
  const game=loadRenderer(960,960,4);game.render();
  game.run('settings.effectsEnabled=true;triggerScreenShake(1);updateParticles();');
  game.api.start({mode:'2p',duration:180,winCondition:'timed'});
  assert.equal(game.run('screenShake.cooldown'),0);
  assert.deepEqual(JSON.parse(game.run('JSON.stringify(screenShakeOffset(.5))')),{x:0,y:0});
  game.run('triggerScreenShake(1);updateParticles();');
  assert.ok(game.run('screenShakeOffset(1).x > 0'));
});

test('shake never uncovers transparent or wrong-color edges of a solid territory', () => {
  const game=loadRenderer(653.078125,653.078125,3);
  game.run(`settings.effectsEnabled=true; for(let x=0;x<NUM_SQUARES;x++) squares[x].fill(NIGHT_COLOR); triggerScreenShake(4);`);
  for(let tick=0;tick<20;tick++) {
    game.run('updateParticles();'); game.render();
    const background=game.draws[0], cells=game.draws.filter(d=>d.op==='rect');
    const [sx,,,sy,tx,ty]=background.matrix, [x,y,w,h]=background.args;
    assert.ok(Math.abs(x*sx+tx)<1e-8 && Math.abs(y*sy+ty)<1e-8);
    assert.ok(Math.abs(w*sx-game.canvas.width)<1e-8 && Math.abs(h*sy-game.canvas.height)<1e-8);
    const first=cells[0],last=cells.at(-1);
    assert.ok(first.args[0]*sx+tx<=1e-8 && first.args[1]*sy+ty<=1e-8);
    assert.ok((last.args[0]+last.args[2])*sx+tx>=game.canvas.width-1e-8);
    assert.ok((last.args[1]+last.args[3])*sy+ty>=game.canvas.height-1e-8);
  }
});

test('turning effects or shake off immediately restores a stationary board', () => {
  const game=loadRenderer(960,960,4);
  game.run('settings.effectsEnabled=true; triggerScreenShake(4); updateParticles();');
  for(const expression of ['settings.screenShake=false','settings.screenShake=true;settings.effectsEnabled=false']) {
    game.run(expression);game.render();
    assert.deepEqual(game.draws.find(d=>d.op==='arc').matrix,[4.8,0,0,4.8,0,0]);
  }
});

test('fractional CSS canvas dimensions and centering align to exact physical pixel bounds', () => {
  const game=loadRenderer(652.3125,652.3125,3);
  game.position(313.84375,33.84375);game.render();
  const matrix=game.canvas.style.transform.match(/matrix\((.*)\)/)[1].split(',').map(Number);
  assert.ok(Math.abs(652.3125*3*matrix[0]-game.canvas.width)<1e-8);
  assert.ok(Math.abs((313.84375+matrix[4])*3-942)<1e-8);
  assert.ok(Math.abs((33.84375+matrix[5])*3-102)<1e-8);
  assert.equal(game.canvas.style.transformOrigin,'0 0');
  const first=game.canvas.style.transform;game.render();assert.equal(game.canvas.style.transform,first);
});
