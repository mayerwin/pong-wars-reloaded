// Native UI feedback regression for the dedicated debuggable TV emulator.
// Uses the restricted app-owned CDP driver, never a physical TV or browser.
// Usage: PONG_QA_SERIAL=emulator-5556 node android/tests/emulator-feedback.cjs
// The test enables master Sound at 70%, disables menu music, and leaves those
// QA app preferences in place. It measures real PCM and native uinput events.
// First-cold-navigation PCM is reported, not asserted: this headless AVD's
// 91 ms output latency can make a 45 ms capture intermittent. Warm native PCM,
// cue count, mute, background cancellation and focus recovery are asserted.
'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const {connect,sleep}=require('./emulator-driver.cjs');

const out=path.resolve(__dirname,'../app/build/qa'),results=[];
let app;

const snapshot=()=>app.evaluate(`(()=>{const f=uiFeedback;
return {requests:window.__qaCueRequests,notes:window.__qaCueNotes,peakRms:window.__qaCuePeak,context:f?._ctx?.state,audioTime:f?._ctx?.currentTime,baseLatency:f?._ctx?.baseLatency,voices:f?._voices.size,pending:f?._pending,background:f?.background,enabled:f?.enabled,settings:PongGame.getSettings(),musicOff:localStorage.getItem('pongTVMenuMusic.v1')==='off',game:PongGame.getState().state};
})()`);

async function record(name){const s=await snapshot();
results.push({name,...s});
console.log(JSON.stringify({name,...s}));
return s;
}
async function clear(){await app.evaluate(`window.__qaCueRequests=[];
window.__qaCueNotes=[];
window.__qaCuePeak=0;
`);
}
async function nativeSelect(action){assert.ok(await app.evaluate(`(()=>{const b=document.querySelector('[data-do="${action}"]');
if(!b)return false;
b.focus();
return true;
})()`));
await app.nativeKey('DPAD_CENTER');
await sleep(120);
}
async function main(){
 app=await connect();

 try{
  await app.evaluate(`PongGame.configure({soundEnabled:true,soundVolume:70});
localStorage.setItem('pongTVMenuMusic.v1','off');
location.reload();
`);
await sleep(500);

  for(let attempt=0;
attempt<60;
attempt++){if(await app.evaluate(`!!window.PongGame && !!document.querySelector('#tv-root')`))break;
await sleep(250);
}
  await app.waitFor(s=>s.title.includes('PONG WARS'),'Expected TV home');

  await app.evaluate(`(()=>{window.__qaCueRequests=[];
window.__qaCueNotes=[];
window.__qaCuePeak=0;
const p=PongFeedback.prototype,play=p.play,note=p._note;
p.play=function(kind){const entry={kind,focus:document.activeElement?.dataset.do,played:null,at:performance.now()};
__qaCueRequests.push(entry);
return Promise.resolve(play.call(this,kind)).then(value=>{entry.played=value;
return value;
});
};
p._note=function(kind,...args){__qaCueNotes.push({kind,frequency:args[0]});
if(!this.__qaAnalyser){this.__qaAnalyser=this._ctx.createAnalyser();
this.__qaAnalyser.fftSize=256;
this._master.connect(this.__qaAnalyser);
}const analyser=this.__qaAnalyser,result=note.call(this,kind,...args),until=performance.now()+650;
function sample(){const d=new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(d);
__qaCuePeak=Math.max(__qaCuePeak,Math.sqrt(d.reduce((s,v)=>s+v*v,0)/d.length));
if(performance.now()<until)setTimeout(sample,4);
}sample();
return result;
};
return true;
})()`);

  await sleep(250);
assert.deepEqual((await snapshot()).requests,[]);

  await app.nativeKey('DPAD_UP');
assert.deepEqual((await snapshot()).requests,[]);

  await app.evaluate(`(()=>{const ctx=uiFeedback._ctx,meter=ctx.createScriptProcessor(1024,1,1);
meter.onaudioprocess=event=>{const data=event.inputBuffer.getChannelData(0);
window.__qaCuePeak=Math.max(window.__qaCuePeak,Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length));
};
uiFeedback._master.connect(meter);
meter.connect(ctx.destination);
window.__qaMeter=meter;
})()`);

  await app.nativeKey('DPAD_DOWN');

  for(let attempt=0;
attempt<30;
attempt++){if((await snapshot()).peakRms>0.00001)break;
await sleep(100);
}
  let s=await record('native-navigation-with-music-off');
assert.equal(s.musicOff,true);
assert.deepEqual(s.requests.map(x=>x.kind),['navigate']);
assert.equal(s.requests[0].played,true);
assert.equal(s.notes.length,1);

  await clear();
await nativeSelect('options');
s=await record('native-confirm');
assert.deepEqual(s.requests.map(x=>x.kind),['confirm']);
assert.equal(s.requests[0].played,true);
assert.equal(s.notes.length,2);

  await clear();
await nativeSelect('setting-soundEnabled');
s=await record('sound-off');
assert.equal(s.enabled,false);
assert.equal(s.requests[0].played,false);
assert.equal(s.notes.length,0);

  await clear();
await app.nativeKey('DPAD_RIGHT');
s=await record('muted-navigation');
assert.equal(s.notes.length,0);
assert.ok(s.requests.every(x=>x.played===false));

  await clear();
await nativeSelect('setting-soundEnabled');
s=await record('sound-on');
assert.equal(s.enabled,true);
assert.deepEqual(s.requests.map(x=>x.kind),['confirm']);
assert.equal(s.requests[0].played,true);
assert.ok(s.notes.length>0);

  await nativeSelect('options-back');
await clear();
await nativeSelect('watch');
await sleep(400);
s=await record('one-start-cue');
assert.deepEqual(s.requests.map(x=>x.kind),['start']);
assert.equal(s.notes.length,4);
assert.equal(s.requests[0].played,true);
assert.ok(s.peakRms>0.00001);

  await clear();
await app.nativeKey('BACK');
await sleep(120);
s=await record('one-pause-cue');
assert.equal(s.game,'paused');
assert.deepEqual(s.requests.map(x=>x.kind),['pause']);
assert.equal(s.notes.length,2);

  await clear();
await app.nativeKey('BACK');
await sleep(120);
s=await record('one-resume-cue');
assert.equal(s.game,'playing');
assert.deepEqual(s.requests.map(x=>x.kind),['resume']);
assert.equal(s.notes.length,2);

  await clear();
await app.nativeKey('HOME');
await sleep(200);
s=await record('background-cancelled');
assert.equal(s.background,true);
assert.equal(s.voices,0);
assert.equal(s.pending,null);
assert.deepEqual(s.requests,[]);

  app.adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');

  for(let attempt=0;
attempt<25;
attempt++){if(!(await snapshot()).background)break;
await sleep(100);
}
  s=await record('foreground-silent');
assert.equal(s.background,false);
assert.deepEqual(s.requests,[]);
assert.equal(s.voices,0);

  for(let cycle=2;
cycle<=3;
cycle++){
    await clear();
await app.nativeKey('HOME');
await sleep(300);
assert.equal((await snapshot()).background,true);

    app.adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');

    for(let attempt=0;
attempt<25;
attempt++){if(!(await snapshot()).background)break;
await sleep(100);
}
    s=await record('foreground-silent-'+cycle);
assert.equal(s.background,false);
assert.deepEqual(s.requests,[]);
assert.equal(s.voices,0);

  }
  await nativeSelect('home');
await clear();
const pads=await app.createNativePads([11]);

  try { await pads.key(11,'DPAD_DOWN',1500,true);
 } finally { pads.close();
 }
  await sleep(100);
s=await record('held-navigation');
const nav=s.requests.filter(x=>x.kind==='navigate');
assert.ok(nav.length>1);
assert.equal(new Set(nav.map(x=>x.focus)).size,nav.length,'One cue per actual focus move');
assert.ok(nav.every((x,i)=>!i||x.at-nav[i-1].at>=150),'Held repeat rate stays bounded');
assert.ok(s.peakRms>0.00001);

  assert.equal(app.errors.length,0,JSON.stringify(app.errors));

 }finally{fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'feedback-native.json'),JSON.stringify({results,errors:app?.errors},null,2));
await app?.close();
}
}
main().catch(e=>{console.error(e);
process.exitCode=1;
});
