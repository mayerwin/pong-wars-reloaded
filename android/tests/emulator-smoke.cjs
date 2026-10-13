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
  const optional=await check('optional-buttons');
  assert.ok(optional.text.includes('Action button set: OK')&&optional.text.includes('Optional extra button'));
  assert.equal(await app.evaluate("document.querySelector('[aria-current=step]').innerText"),'5\nCurrent');
  await app.screenshot(path.join(output,'native-optional-buttons.png'));
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.title==='Rotate right','Skip one optional button');
  await app.nativeKey('DPAD_DOWN');assert.equal((await app.snapshot()).buttons.find(b=>b.focused).action,'skip-all-optional');
  await app.nativeKey('DPAD_CENTER',1200);await app.waitFor(s=>s.title.includes('ready'),'Skip remaining extras with action shortcuts');await check('solo-before-save');
  await app.nativeKey('DPAD_CENTER',1200);
  const reviewed=await app.waitFor(s=>s.title==='Your controls. Your match.','Expected explicit lobby');
  assert.equal(reviewed.game.state,'menu','Held Save must not spill into Start');
  assert.ok(reviewed.text.includes('Move up')&&reviewed.text.includes('Hold OK'),'Expected learned remote labels');
  await check('solo-ready-lobby');assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('DPAD_CENTER');await app.waitFor(s=>s.game.state==='playing','Explicit Start');await app.sleep(400);
  await check('solo-playing');const m=await app.musicState();assert.equal(m.active,false);assert.equal(m.playing,false);assert.equal(m.context,'suspended');
  // Rotation is intentionally constrained at the board edge; move the newly
  // spawned racket into open territory before checking both rotation inputs.
  const edgeX=(await app.snapshot()).game.players[0].x;
  await app.nativeKey('DPAD_RIGHT',180);
  assert.ok((await app.snapshot()).game.players[0].x>edgeX,'Remote direction must move inward');
  const beforeRotation=(await app.snapshot()).game.players[0].angle;
  await app.nativeKey('DPAD_CENTER');
  assert.ok((await app.evaluate("document.querySelector('.tv-hints').innerText")).includes('DAY · ROTATE'));
  await app.nativeKey('DPAD_LEFT',300);const left=(await app.snapshot()).game.players[0].angle;
  assert.notEqual(left,beforeRotation,'Action + left must rotate after skipping extras');
  await app.nativeKey('DPAD_RIGHT',300);const right=(await app.snapshot()).game.players[0].angle;
  assert.notEqual(right,left,'Action + right must rotate after skipping extras');
  await app.nativeKey('DPAD_CENTER');
  assert.ok((await app.evaluate("document.querySelector('.tv-hints').innerText")).includes('DAY · MOVE'));
  const rescues=(await app.snapshot()).game.teleports[0].remaining;
  await app.nativeKey('DPAD_CENTER',2900);
  assert.equal((await app.snapshot()).game.teleports[0].remaining,rescues-1,'Held action must rescue after skipping extras');
  await check('remote-shortcuts-playable');
  await app.screenshot(path.join(output,'native-solo-playing.png'));
  await app.nativeKey('BACK');assert.equal((await app.snapshot()).game.state,'paused');assert.equal((await app.musicState()).playing,false);
  await app.click('home');await app.click('solo');await app.nativeKey('DPAD_CENTER');
  await app.waitFor(s=>s.title==='Your controls. Your match.','Saved skipped profile must rejoin without learning');await check('remote-saved-shortcuts');
  await app.nativeKey('BACK');await app.click('options');await app.click('options-visuals');await app.click('diagnostics');
  assert.ok((await app.snapshot()).text.includes('TV output')&&(await app.snapshot()).text.includes('App surface'));
  await app.screenshot(path.join(output,'native-tv-diagnostics.png'));await check('tv-diagnostics');
  await app.nativeKey('BACK');await app.click('options-general');await app.click('menu-music');await app.sleep(350);
  assert.equal((await app.musicState()).pref,'off');assert.equal((await app.musicState()).playing,false);await check('music-disabled');
  await app.click('menu-music');await app.sleep(350);assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('HOME');await app.sleep(400);
  assert.equal((await app.musicState()).background,true);assert.equal((await app.musicState()).context,'suspended');await check('background-music-suspended');
  app.adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');
  for(const deadline=Date.now()+3000;Date.now()<deadline&&!(await app.musicState()).playing;)await app.sleep(100);
  assert.equal((await app.musicState()).background,false);assert.equal((await app.musicState()).playing,true);
  await app.nativeKey('BACK');await check('returned-home');assert.equal(app.errors.length,0,JSON.stringify(app.errors));
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'emulator-smoke.json'),JSON.stringify({checkpoints,errors:app.errors},null,2));await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
