// Native remote-only setup against our debug APK in a fresh isolated emulator.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {connect}=require('./emulator-driver.cjs');
const output=path.resolve(__dirname,'../app/build/qa');
async function main(){
 const app=await connect(),checkpoints=[];
 const check=async label=>{const s=await app.snapshot();checkpoints.push({label,...s,music:await app.musicState()});console.log(label+': '+s.title+' / '+s.game.state);return s;};
 try{
  await app.waitFor(s=>s.title.includes('PONG WARS'),'Expected home');await app.observeMusic();
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.title.includes('Pick up'),'Expected solo join');
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.title.includes('Choose your action'),'Expected action choice');
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.title==='Move up','Expected first direction');
  for(const [key,next]of [['DPAD_UP','Move down'],['DPAD_DOWN','Move left'],['DPAD_LEFT','Move right'],['DPAD_RIGHT','Rotate left']]){
   await app.nativeKey(key,350);await app.waitFor(s=>s.title===next,'Expected '+next);
  }
  await app.nativeKey('DPAD_CENTER');await app.nativeKey('DPAD_LEFT',350);await app.waitFor(s=>s.title==='Rotate right','Remote left rotation');
  await app.nativeKey('DPAD_RIGHT',350);await app.waitFor(s=>s.title==='Rescue your ball','Remote right rotation');
  await app.nativeKey('DPAD_CENTER',2900);await app.waitFor(s=>s.title.includes('ready'),'All seven checks');await check('solo-before-save');
  await app.nativeKey('DPAD_CENTER',1200);
  const reviewed=await app.waitFor(s=>s.title==='Your controls. Your match.','Expected explicit lobby');
  assert.equal(reviewed.game.state,'menu','Held Save must not spill into Start');
  assert.ok(reviewed.text.includes('Move up')&&reviewed.text.includes('Hold OK'),'Expected learned remote labels');
  await check('solo-ready-lobby');assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.game.state==='playing','Explicit Start');await app.sleep(400);
  await check('solo-playing');const m=await app.musicState();assert.equal(m.active,false);assert.equal(m.playing,false);assert.equal(m.context,'suspended');
  await app.screenshot(path.join(output,'native-solo-playing.png'));
  await app.nativeKey('BACK');assert.equal((await app.snapshot()).game.state,'paused');assert.equal((await app.musicState()).playing,false);
  await app.click('home');await app.click('options');await app.click('menu-music');await app.sleep(350);
  assert.equal((await app.musicState()).pref,'off');assert.equal((await app.musicState()).playing,false);await check('music-disabled');
  await app.click('menu-music');await app.sleep(350);assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('HOME');await app.sleep(400);
  assert.equal((await app.musicState()).background,true);assert.equal((await app.musicState()).context,'suspended');await check('background-music-suspended');
  app.adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');await app.sleep(500);
  assert.equal((await app.musicState()).background,false);assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('BACK');await check('returned-home');assert.equal(app.errors.length,0,JSON.stringify(app.errors));
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'emulator-smoke.json'),JSON.stringify({checkpoints,errors:app.errors},null,2));await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
