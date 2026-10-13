// Development-only driver for our debuggable APK in an Android emulator.
// Never attach this to a physical device or a user's Chrome/browser session.
// Usage: NODE android/tests/emulator-smoke.cjs [--baseline]
'use strict';
const {spawn,spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const serial = process.env.PONG_QA_SERIAL || 'emulator-5554';
const packageId = 'com.github.pongwarsreloaded.sideload';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(),'AppData','Local','Android','Sdk');
const adbPath = process.env.ADB || path.join(sdk,'platform-tools',process.platform === 'win32' ? 'adb.exe' : 'adb');
const port = Number(process.env.PONG_QA_PORT || 9223);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function adb(...args) {
  if (!/^emulator-\d+$/.test(serial)) throw new Error('This test driver only permits Android emulator targets.');
  const result = spawnSync(adbPath, ['-s', serial, ...args], {encoding:'utf8', timeout:20000, windowsHide:true});
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

async function connect() {
  // The activity can be visible before Chromium's debug socket is listening,
  // especially after a cold restart while software-rendering the TV surface.
  let matches = [], lastError;
  for (const deadline = Date.now() + 8000; Date.now() < deadline;) {
    try {
      const pid = adb('shell', 'pidof', packageId).trim();
      if (!/^\d+$/.test(pid)) throw new Error('Launch the debuggable Pong Wars Reloaded APK first.');
      adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`, {signal:AbortSignal.timeout(1500)})).json();
      matches = targets.filter(t => t.url === 'https://appassets.androidplatform.net/assets/index.html');
      if (matches.length) break;
    } catch (error) { lastError = error; }
    await sleep(150);
  }
  if (matches.length !== 1) throw new Error('Expected exactly one app-owned local WebView target.' + (lastError ? ' ' + lastError.message : ''));
  const socket = new WebSocket(matches[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); });
  let nextId = 0;
  const waiting = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const callback = waiting.get(message.id); waiting.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method,params={}) => new Promise((resolve,reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timed out: ${method}`)); },10000);
    waiting.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const snapshot = () => evaluate(`({title:document.querySelector('#tv-root h2')?.textContent || document.querySelector('#tv-root h1')?.textContent || '',text:document.querySelector('#tv-root')?.innerText || '',buttons:[...document.querySelectorAll('#tv-root button')].map(b=>({action:b.dataset.do,text:b.innerText,focused:b===document.activeElement})),game:window.PongGame.getState(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}})`);
  const waitFor = async (predicate, message, timeout=6000) => {
    const start = Date.now();
    while (Date.now()-start<timeout) { const value=await snapshot(); if (predicate(value)) return value; await sleep(100); }
    throw new Error(`${message}; screen=${JSON.stringify(await snapshot())}`);
  };
  async function nativeKey(code,holdMs=0) {
    if (holdMs) adb('shell','input','keycombination','-t',String(holdMs),'KEYCODE_'+code,'KEYCODE_'+code);
    else adb('shell','input','keyevent','KEYCODE_'+code);
    await sleep(140);
  }
  async function jsKey(device,code,holdMs=30) {
    const payload = {type:'key',device,code,action:'down',repeat:0};
    await evaluate(`window.PongAndroid.onInput(${JSON.stringify(payload)})`);
    await sleep(holdMs);
    payload.action='up';
    await evaluate(`window.PongAndroid.onInput(${JSON.stringify(payload)})`);
    await sleep(100);
  }
  async function click(action) {
    const found = await evaluate(`(()=>{const b=document.querySelector('#tv-root button[data-do="${action}"]');if(!b)return false;b.focus();b.click();return true;})()`);
    if (!found) throw new Error(`Missing action ${action}: ${JSON.stringify(await snapshot())}`);
    await sleep(200);
  }
  async function screenshot(file) {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    adb('shell','screencap','-p','/sdcard/pong-emulator-qa.png');
    adb('pull','/sdcard/pong-emulator-qa.png',file);
  }
  async function createNativePads(ids = [1,2]) {
    // AOSP uinput test tool, not a JS controller stub. Each pad travels through
    // Android InputReader, MainActivity and the bridge with a distinct native id.
    // https://android.googlesource.com/platform/frameworks/base/+/HEAD/cmds/uinput/
    const process = spawn(adbPath,['-s',serial,'shell','uinput','-'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let diagnostic='';
    process.stdout.on('data',chunk=>{diagnostic+=chunk;});
    process.stderr.on('data',chunk=>{diagnostic+=chunk;});
    const write = command => process.stdin.write(JSON.stringify(command)+'\n');
    const linuxKeys = {DPAD_UP:103,DPAD_DOWN:108,DPAD_LEFT:105,DPAD_RIGHT:106,ENTER:28,
      BUTTON_A:304,BUTTON_B:305,BUTTON_X:307,BUTTON_Y:308,BUTTON_L1:310,BUTTON_R1:311,BUTTON_START:315};
    for(const id of ids) write({id,command:'register',name:`Pong QA Pad ${id}`,vid:0x1209,pid:id,bus:'bluetooth',
      configuration:[{type:100,data:[1]},{type:101,data:Object.values(linuxKeys)}]});
    const start = Date.now();
    let devices=[];
    while(Date.now()-start<8000) {
      devices=await evaluate(`JSON.parse(AndroidHost.getDevices()).filter(d=>${JSON.stringify(ids.map(id=>'Pong QA Pad '+id))}.includes(d.name))`);
      if(devices.length===ids.length)break;
      await sleep(150);
    }
    if(devices.length!==ids.length) {process.stdin.end();throw new Error('Native uinput pads did not register: '+diagnostic);}
    return {devices,async key(id,code,holdMs=30,repeat=false) {
      const linuxCode=linuxKeys[code];if(linuxCode==null)throw new Error('Unknown test pad key '+code);
      write({id,command:'inject',events:[1,linuxCode,1,0,0,0]});
      if(repeat) {for(let t=0;t<holdMs;t+=100){await sleep(100);write({id,command:'inject',events:[1,linuxCode,2,0,0,0]});}}
      else await sleep(holdMs);
      write({id,command:'inject',events:[1,linuxCode,0,0,0,0]});await sleep(140);
    },close(){process.stdin.end();},get diagnostic(){return diagnostic;}};
  }
  async function close() {
    socket.close();
    try { adb('forward','--remove',`tcp:${port}`); } catch (_) {}
  }
  const observeMusic = () => evaluate(`(()=>{const p=window.PongMenuMusic.prototype;const original=p.unlock;p.unlock=function(...args){window.__qaMusic=this;return original.apply(this,args);};return true;})()`);
  const musicState = () => evaluate(`(()=>{const m=window.__qaMusic;return m?{enabled:m.enabled,active:m.active,background:m.background,playing:m._playing,wanted:m._wanted(),context:m._ctx?.state,looping:!!m._source?.loop,duration:m._buffer?.duration,pref:localStorage.getItem('pongTVMenuMusic.v1')}:null;})()`);
  return {adb,evaluate,snapshot,waitFor,nativeKey,jsKey,click,screenshot,createNativePads,observeMusic,musicState,close,errors,sleep};
}
module.exports = {connect,sleep,adb};
