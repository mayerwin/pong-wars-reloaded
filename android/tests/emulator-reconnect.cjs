// Run after the setup suites: their saved native pad profiles are reused here.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {connect,adb,sleep}=require('./emulator-driver.cjs');
const output=path.resolve(__dirname,'../app/build/qa');
async function main(){
 let app=await connect(),pads,replacement;const checkpoints=[];
 const check=async label=>{const s=await app.snapshot();checkpoints.push({label,...s});console.log(label+': '+s.title+' / '+s.game.state);return s;};
 async function reconnect(){
  pads=await app.createNativePads();await pads.key(1,'BUTTON_A');
  assert.equal((await app.snapshot()).title,'Reconnect your controls.','P2 is still required');
  await pads.key(2,'BUTTON_A');await app.waitFor(s=>s.title==='Match paused.','Both saved pads reconnect');
 }
 try{
  await app.evaluate(`(()=>{window.__qaEvents=[];window.__qaOriginalInput ||= PongAndroid.onInput;PongAndroid.onInput=e=>{__qaOriginalInput(e);__qaEvents.push({type:e.type,action:e.action,code:e.code,repeat:e.repeat,device:e.device?.id,name:e.device?.name,title:document.querySelector('#tv-root h2')?.textContent});};})()`);
  if(!(await app.snapshot()).title.includes('PONG WARS'))await app.click('home');
  await app.observeMusic();pads=await app.createNativePads();await app.click('duo');
  await pads.key(1,'BUTTON_A');assert.ok((await app.snapshot()).title.includes('Pick up'),'P1 profile should skip learning');
  await pads.key(2,'BUTTON_A');const review=await app.waitFor(s=>s.title==='Your controls. Your match.','P2 profile should skip learning');
  assert.ok(review.text.includes('LB')&&review.text.includes('RB'));assert.equal((await app.musicState()).enabled,false);assert.equal((await app.musicState()).playing,false);
  await check('restart-saved-profiles-and-music');await app.screenshot(path.join(output,'native-reused-controls.png'));
  await pads.key(1,'BUTTON_A',3200,true);await app.waitFor(s=>s.game.state==='playing','Saved players start');
  const playing=await check('held-start-no-rescue');assert.equal(playing.game.teleports[0].remaining,3);assert.equal(playing.game.teleports[0].charge,0);
  assert.ok((await app.evaluate("document.querySelector('.tv-hints').innerText")).includes('DAY · MOVE'));
  await app.nativeKey('BACK');await app.click('options');const time=(await app.snapshot()).game.timeRemaining;
  pads.close();pads=null;await app.waitFor(s=>s.title==='Reconnect your controls.','Settings disconnect must preserve paused game');
  assert.equal((await app.snapshot()).game.timeRemaining,time);await check('settings-disconnect-paused');
  replacement=await app.createNativePads([3]);await replacement.key(3,'BUTTON_A');await app.waitFor(s=>s.title.includes('Choose your action'),'Unknown replacement needs verification');
  await app.nativeKey('BACK');const cancelled=await app.waitFor(s=>s.title==='Reconnect your controls.','Cancel should restore missing slot');
  assert.equal(cancelled.game.state,'paused');assert.ok(!cancelled.buttons.some(b=>b.action==='resume'),'Cannot resume short one player');
  await check('cancel-replacement-keeps-two-slots');replacement.close();replacement=null;await reconnect();
  await app.click('controls');await app.click('rebind-0');await pads.key(1,'BUTTON_A');await app.waitFor(s=>s.title==='Move up','Remap opened');
  pads.close();pads=null;await app.waitFor(s=>s.title==='Reconnect your controls.','Remap disconnect must preserve paused game');
  assert.equal((await app.snapshot()).game.timeRemaining,time);await check('remap-disconnect-paused');await reconnect();
  await pads.key(1,'BUTTON_A',3200,true);await app.waitFor(s=>s.game.state==='playing','Resume after both reconnect');
  const resumed=await check('held-resume-no-rescue');assert.equal(resumed.game.teleports[0].remaining,3);assert.equal(resumed.game.teleports[0].charge,0);
  await app.screenshot(path.join(output,'native-final-gameplay.png'));
  const rects=await app.evaluate(`(()=>{const ids=['pongCanvas','hud','timer-display','progression-bar'];const output={width:innerWidth,height:innerHeight};for(const id of ids){const e=document.getElementById(id);if(e){const r=e.getBoundingClientRect();output[id]={x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,display:getComputedStyle(e).display};}}return output;})()`);
  checkpoints.push({label:'layout',...rects});
  assert.ok(rects.pongCanvas.height>rects.height*.85,'Board should use the TV height');assert.ok(rects.pongCanvas.bottom<rects.height,'Board fits');
  assert.equal(app.errors.length,0,JSON.stringify(app.errors));
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'emulator-reconnect.json'),JSON.stringify({checkpoints,errors:app.errors,events:await app.evaluate('window.__qaEvents')},null,2));if(pads)pads.close();if(replacement)replacement.close();await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
