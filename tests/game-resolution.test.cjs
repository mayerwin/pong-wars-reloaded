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
    beginPath() {}, closePath() {}, rect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
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
  const window = {...events(),devicePixelRatio:dpr,matchMedia:()=>({...events(),matches:true})};
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
    assert.deepEqual(game.draws[0].args,[0,0,800,800]);
    assert.deepEqual(game.draws[0].matrix,[Math.ceil(css*dpr)/800,0,0,Math.ceil(css*dpr)/800,0,0]);
    assert.equal(game.run('CANVAS_SIZE'),800);
    assert.equal(game.run('NUM_SQUARES'),32);
  }
});

test('the entire frame is transformed exactly once, including territory, players and effects', () => {
  const game=loadRenderer(900,900,2); // 1800 physical pixels, 2.25 pixels per world unit.
  game.run(`settings.effectsEnabled=true; settings.gridEffect=true; settings.particles=true;
    screenShake.intensity=0; player1.angle=player1.oldAngle=Math.PI/4;
    particles=[{x:300,y:300,life:1,size:5,color:'#fff',rotation:0.5}];
    ballTrails=[{x:320,y:350,radius:10,life:0.7,color:'#fff'}];
    powerups=[{gridX:2,gridY:2,pulsePhase:0,type:'BIGGER_BALL'}];`);
  game.render();
  assert.ok(game.draws.some(d=>d.op==='strokeRect'), 'racket outlines rendered');
  assert.ok(game.draws.filter(d=>d.op==='arc').length>=5, 'balls, powerups and trails rendered');
  for (const draw of game.draws) {
    const [a,b,c,d]=draw.matrix;
    assert.ok(Math.abs(Math.hypot(a,b)-2.25)<1e-10, 'x basis keeps one resolution scale');
    assert.ok(Math.abs(Math.hypot(c,d)-2.25)<1e-10, 'y basis keeps one resolution scale');
  }
  game.render();
  assert.deepEqual(game.draws[0].matrix,[2.25,0,0,2.25,0,0], 'scale never compounds across frames');
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
