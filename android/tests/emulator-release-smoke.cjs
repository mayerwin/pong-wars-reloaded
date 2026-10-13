// Native-only signed-release smoke. No CDP/debugging connection is opened.
// Install the signed APK onto the dedicated emulator with fresh app data first.
// Inspect every generated screenshot: capture success alone is not a UI assertion.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {adb,sleep}=require('./emulator-driver.cjs');
const output=path.resolve(__dirname,'../app/build/qa/release');
async function key(code,ms=0){
 if(ms)adb('shell','input','keycombination','-t',String(ms),'KEYCODE_'+code,'KEYCODE_'+code);
 else adb('shell','input','keyevent','KEYCODE_'+code);
 await sleep(180);
}
async function shot(name){
 await sleep(5000); // UHD software composition can keep an old frame beyond 1.2 s.
 fs.mkdirSync(output,{recursive:true});adb('shell','screencap','-p','/sdcard/pong-release-qa.png');adb('pull','/sdcard/pong-release-qa.png',path.join(output,name+'.png'));console.log('Captured '+name);
}
async function main(){
 await shot('01-home');
 await key('DPAD_CENTER');await key('DPAD_CENTER');await key('DPAD_CENTER');
 for(const code of ['DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT'])await key(code,350);
 await shot('01b-optional-buttons');
 await key('DPAD_DOWN');await key('DPAD_CENTER',1200);
 await shot('02-controls-checked');await key('DPAD_CENTER');await shot('03-ready-lobby');
 await key('DPAD_CENTER');await shot('04-playing');
 await key('BACK');await shot('05-paused');
 // Pause menu: Resume -> Change controls -> Sound/display.
 await key('DPAD_DOWN');await key('DPAD_DOWN');await key('DPAD_CENTER');await shot('06-settings');
 // General settings: Sound -> Menu music, switch it off then revisit after Home.
 await key('DPAD_RIGHT');await key('DPAD_CENTER');await shot('07-music-off');
 await key('HOME');await sleep(1200);
 adb('shell','am','start','-n','com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity');await sleep(400);await shot('08-foreground');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
