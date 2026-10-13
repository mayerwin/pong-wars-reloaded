// Fault recovery for our dedicated debuggable emulator app only.
// Briefly deny writes to its private audio cache, restore on the first preload
// failure, and verify bounded preparation retries recover without replaying cues.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {connect, sleep, adb} = require('./emulator-driver.cjs');
const serial = process.env.PONG_QA_SERIAL || 'emulator-5554';
const packageId = 'com.github.pongwarsreloaded.sideload';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const adbPath = process.env.ADB || path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const output = path.resolve(__dirname, '../app/build/qa/native-audio-retry.json');
let app, logger, launcher, cacheLocked = false, observed = [], report;
function restoreCache() {
  if (!cacheLocked) return;
  adb('shell', 'run-as', packageId, 'chmod', '700', 'cache/game-audio-v1');
  cacheLocked = false;
}
async function main() {
  // run-as additionally refuses non-debuggable release apps.
  assert.match(serial, /^emulator-\d+$/);
  adb('shell', 'run-as', packageId, 'mkdir', '-p', 'cache/game-audio-v1');
  adb('shell', 'am', 'force-stop', packageId);
  try {
    adb('shell', 'run-as', packageId, 'chmod', '500', 'cache/game-audio-v1');
    cacheLocked = true;
    const earliest = Number(adb('shell', 'date', '+%s'));
    let buffer = '', resolveFailure, rejectFailure;
    const failure = new Promise((resolve, reject) => {resolveFailure = resolve; rejectFailure = reject;});
    const timeout = setTimeout(() => rejectFailure(new Error('No preload failure observed within 15 seconds')), 15000);
    logger = spawn(adbPath, ['-s', serial, 'logcat', '-v', 'epoch', '-T', '1', 'PongNativeAudio:W', '*:S'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    logger.on('error', rejectFailure);
    logger.stdout.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (Number(line.trim().split(/\s+/)[0]) < earliest || !line.includes('Preload')) continue;
        observed.push(line.trim());
        if (cacheLocked) {
          try {restoreCache(); resolveFailure();}
          catch (error) {rejectFailure(error);}
        }
      }
    });
    launcher = spawn(adbPath, ['-s', serial, 'shell', 'am', 'start', '-n', packageId + '/com.github.pongwarsreloaded.MainActivity'], {windowsHide: true, stdio: 'ignore'});
    launcher.on('error', rejectFailure);
    try {await failure;} finally {clearTimeout(timeout);}
    for (let attempt = 0; attempt < 30 && !app; attempt++) {
      try {app = await connect();} catch (error) {if (attempt === 29) throw error; await sleep(200);}
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      report = await app.evaluate('JSON.parse(AndroidHost.getAudioInfo())');
      if (report.ready) break;
      await sleep(200);
    }
    assert.equal(cacheLocked, false);
    assert.equal(report.ready, true);
    assert.equal(report.loaded, 12);
    assert.deepEqual(report.missingCues, []);
    assert.ok(report.failures > 0, 'the simulated storage failure must actually occur');
    assert.ok(report.loadRetries > 0 && report.loadRetries <= 24, 'at most two retries per sample');
    assert.equal(report.plays, 0, 'recovering a preload must never replay a past input event');
    console.log(JSON.stringify({report, observed}));
  } finally {
    let restoreError;
    try {restoreCache();} catch (error) {restoreError = error;}
    logger?.kill(); launcher?.kill();
    await app?.close();
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, JSON.stringify({report, observed, cacheRestored: !cacheLocked}, null, 2));
    if (restoreError) throw restoreError;
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
