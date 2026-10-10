// Verify the actual app framebuffer and canvas backing store on the 4K AVD.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {connect}=require('./emulator-driver.cjs');
const output=path.resolve(__dirname,'../app/build/qa');
async function main(){
 const app=await connect();let result;
 try{
  await app.waitFor(s=>s.title.includes('PONG WARS'),'Expected home');await app.click('watch');
  await app.waitFor(s=>s.game.state==='playing','Expected match');await app.sleep(1200);
  result=await app.evaluate(`(()=>{const c=document.getElementById('pongCanvas'),r=c.getBoundingClientRect(),t=c.getContext('2d').getTransform();return {native:JSON.parse(AndroidHost.getDisplayInfo()),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},canvas:{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,scaleX:t.a,scaleY:t.d,top:r.top,bottom:r.bottom},game:PongGame.getState()};})()`);
  assert.equal(result.native.outputWidth,3840);assert.equal(result.native.outputHeight,2160);
  assert.equal(result.native.windowWidth,3840);assert.equal(result.native.windowHeight,2160);
  assert.ok(result.native.refreshRate>=50,'4K must not request a 30Hz mode');
  const expectedWidth=Math.round(result.canvas.cssWidth*result.viewport.dpr),expectedHeight=Math.round(result.canvas.cssHeight*result.viewport.dpr);
  assert.ok(Math.abs(result.canvas.width-expectedWidth)<=1,`Canvas width ${result.canvas.width} must match ${expectedWidth} surface pixels`);
  assert.ok(Math.abs(result.canvas.height-expectedHeight)<=1,`Canvas height ${result.canvas.height} must match ${expectedHeight} surface pixels`);
  assert.ok(result.canvas.cssHeight>result.viewport.height*.85);assert.ok(result.canvas.bottom<result.viewport.height);
  // Report emulator cadence without pretending it predicts hardware GPU speed.
  result.cadence=await app.evaluate(`new Promise(resolve=>{const samples=[];let last=performance.now(),start=last;function frame(now){samples.push(now-last);last=now;if(samples.length<90&&now-start<5000)requestAnimationFrame(frame);else{samples.shift();samples.sort((a,b)=>a-b);resolve({frames:samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)]});}}requestAnimationFrame(frame);})`);
  await app.screenshot(path.join(output,'native-4k-gameplay.png'));
  console.log(JSON.stringify(result,null,2));assert.equal(app.errors.length,0,JSON.stringify(app.errors));
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'emulator-display.json'),JSON.stringify({result,errors:app.errors},null,2));await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
