// Real Android uinput devices -> MainActivity -> local WebView, never a bridge stub.
// Run after emulator-smoke.cjs against our isolated debuggable APK.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {connect,adb,sleep}=require('./emulator-driver.cjs');
const output=path.resolve(__dirname,'../app/build/qa');
async function main(){
 let app=await connect(),pads;const checkpoints=[];
 const check=async label=>{const s=await app.snapshot();checkpoints.push({label,...s});console.log(label+': '+s.title+' / '+s.game.state);return s;};
 async function teach(id){
  await pads.key(id,'BUTTON_A');await app.waitFor(s=>s.title.includes('Choose your action'),'Expected action choice');
  await pads.key(id,'BUTTON_A');await app.waitFor(s=>s.title==='Move up','Expected first direction');
  for(const [key,next]of [['DPAD_UP','Move down'],['DPAD_DOWN','Move left'],['DPAD_LEFT','Move right'],['DPAD_RIGHT','Rotate left'],['BUTTON_L1','Rotate right'],['BUTTON_R1','Rescue your ball']]){
   await pads.key(id,key,350);await app.waitFor(s=>s.title===next,'Expected '+next);
  }
  await pads.key(id,'BUTTON_X',2300);await app.waitFor(s=>s.title.includes('ready'),'Expected all seven checks');
 }
 const ready=async()=>app.waitFor(s=>s.title==='Your controls. Your match.','Expected two-player review');
 async function reconnect(){
  pads=await app.createNativePads();await pads.key(1,'BUTTON_A');await pads.key(2,'BUTTON_A');
  await app.waitFor(s=>s.title==='Match paused.','Reconnect must preserve paused match');
 }
 try{
  pads=await app.createNativePads();console.log('Native devices: '+JSON.stringify(pads.devices.map(d=>({id:d.id,name:d.name,sources:d.sources,key:d.key}))));
  await app.waitFor(s=>s.title.includes('PONG WARS'),'Expected home');await app.click('duo');
  await teach(1);await pads.key(1,'BUTTON_A',1200,true);
  const p1=await check('P1-saved-waits-for-P2');assert.ok(p1.title.includes('Pick up'));assert.equal(p1.game.state,'menu');assert.ok(p1.text.includes('Pong QA Pad 1'));
  await teach(2);await pads.key(2,'BUTTON_A',1200,true);const p2=await ready();
  assert.equal(p2.game.state,'menu');assert.ok(p2.text.includes('Pong QA Pad 1')&&p2.text.includes('Pong QA Pad 2'));
  assert.ok(p2.text.includes('LB')&&p2.text.includes('RB'),'Review should show learned shoulders');await check('both-saved-review');
  await app.screenshot(path.join(output,'native-two-player-controls.png'));
  for(const id of [0,1]){
   await app.click('rebind-'+id);await app.waitFor(s=>s.title.includes('Choose your action'),'Change controls should reopen setup');
   await pads.key(id+1,'BUTTON_A');await app.waitFor(s=>s.title==='Move up','Remap begins');await app.nativeKey('BACK');
   const cancelled=await ready();assert.ok(cancelled.text.includes('Pong QA Pad 1')&&cancelled.text.includes('Pong QA Pad 2'),'Cancelling keeps both players');
  }
  await check('remap-cancel-preserves-both');
  await pads.key(1,'BUTTON_A',3200,true);await app.waitFor(s=>s.game.state==='playing','Explicit held Start begins match');
  const started=await check('held-start-no-rescue');assert.equal(started.game.mode,'2p');assert.equal(started.game.teleports[0].remaining,3);assert.equal(started.game.teleports[0].charge,0);
  assert.ok((await app.evaluate("document.querySelector('.tv-hints').innerText")).includes('DAY · MOVE'),'Held Start must not toggle rotation');
  await app.screenshot(path.join(output,'native-two-player-playing.png'));
  await app.nativeKey('BACK');await pads.key(1,'BUTTON_A',3200,true);
  const resumed=await check('held-resume-no-rescue');assert.equal(resumed.game.state,'playing');assert.equal(resumed.game.teleports[0].remaining,3);assert.equal(resumed.game.teleports[0].charge,0);
  await app.nativeKey('BACK');await app.click('options');const before=(await app.snapshot()).game.timeRemaining;
  pads.close();pads=null;await app.waitFor(s=>s.title==='Reconnect your controls.','Disconnect in paused settings must remain paused');
  assert.equal((await app.snapshot()).game.timeRemaining,before);await check('disconnect-in-settings-paused');await reconnect();
  await app.click('controls');await app.click('rebind-0');await pads.key(1,'BUTTON_A');await app.waitFor(s=>s.title==='Move up','Paused remap');
  pads.close();pads=null;await app.waitFor(s=>s.title==='Reconnect your controls.','Disconnect during remap must remain paused');
  assert.equal((await app.snapshot()).game.timeRemaining,before);await check('disconnect-in-remap-paused');await reconnect();
  await app.click('home');await app.click('options');await app.click('menu-music');await app.sleep(300);
  assert.equal(await app.evaluate("localStorage.getItem('pongTVMenuMusic.v1')"),'off');
  // Normal Android exit gives WebView localStorage its lifecycle flush. An
  // immediate foreground force-stop can discard Chromium's buffered writes.
  await app.nativeKey('HOME');await sleep(1000);
  await app.close();adb('shell','am','force-stop','com.github.pongwarsreloaded.sideload');adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');await sleep(800);app=await connect();
  await app.observeMusic();await app.click('duo');await pads.key(1,'BUTTON_A');assert.ok((await app.snapshot()).title.includes('Pick up'),'Saved P1 should skip calibration');
  await pads.key(2,'BUTTON_A');const reused=await ready();assert.ok(reused.text.includes('LB')&&reused.text.includes('RB'));assert.equal((await app.musicState()).enabled,false);assert.equal((await app.musicState()).playing,false);
  await check('restart-saved-profiles-and-music');await app.screenshot(path.join(output,'native-reused-controls.png'));
  await pads.key(1,'BUTTON_A');await app.waitFor(s=>s.game.state==='playing','Saved profiles start immediately');await check('reused-profiles-playing');
  assert.equal(app.errors.length,0,JSON.stringify(app.errors));
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'emulator-two-player.json'),JSON.stringify({checkpoints,errors:app.errors},null,2));if(pads)pads.close();await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
