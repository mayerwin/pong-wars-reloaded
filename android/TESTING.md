# Android TV verification

The subsequent shared-music integration moves the synthesizer to root `menu-music.js` for both web and Android and handles Chrome's pending autoplay requests on the first gesture. The web host has its own remembered menu toggle and yields to the TV host, so Android plays one soundtrack. This source update passes 75 JavaScript tests, Android lint, seven native unit tests, and a debug APK build; the APK contains exactly one music script and no obsolete `tv/music.js` copy. The signed code 9 measurements below describe the previously uploaded binary, before this source-layout refactor.

Verified on 10 October 2026 using the official Google TV API 36 x86_64 system image, a dedicated `tv_720p` AVD, and a 1280 × 720 display. The AVD exposes `android.hardware.type.television`, `android.software.leanback`, and `android.software.leanback_only`. It ran headlessly with `-read-only -no-snapshot-save -no-audio`; no physical TV was used.

## Findings and fixes

The original normal one-player and two-player calibration flows both completed in native tests. The broad report that setup always returned to the main menu was not reproduced in that path. Testing did uncover specific transition bugs:

- A held/repeating confirm button could become rotation or rescue after starting/resuming. It now stays neutral until released.
- Disconnecting during paused settings or remapping could leave the paused-match flow. It now preserves the match and timer.
- Cancelling an unverified replacement controller must restore the missing player slot. A two-player match cannot resume with one player.
- On Google TV API 36, a physical Back press reached both `dispatchKeyEvent` and the predictive Back callback. The measured sequence was hardware Down, synthetic Down/Up, hardware Up. On API 33+, the callback is now the sole Back producer; older versions retain key dispatch. A separate JS freshness check prevents duplicate key events from joining a replacement controller.

The app now shows an explicit controller review and Start match button after setup. It shows learned bindings and permits changing them before starting.

## Verified behavior

- One player: remote-only directions, tap-to-rotate, hold-to-rescue, all seven checks, save/review, then explicit Start.
- Two players: independent Android `uinput` gamepad devices pass through Android InputReader, the Java activity, and the JS bridge. P1 waits for P2; both saved mappings appear in the review.
- Both players retain their profiles when a remap is cancelled. Saved profiles skip calibration after an app restart.
- 3.2-second confirm holds with native repeat bursts do not trigger rotation/rescue on Start or Resume.
- Settings/remap disconnects preserve the paused timer; cancelling an unknown replacement preserves both slots. Reconnecting P1 alone cannot resume until P2 reconnects.
- Menu music is active in menus, disabled in a match or pause, and its AudioContext is suspended in the background. Its separate Off preference survives normal Home/background exit and process restart.
- The TV board occupies over 85% of the viewport height, stays inside the screen, and has visible side scores, timer, rescue counters, and progress bar. Actual emulator screenshots show no unused bottom section.

Audio state was verified through the running debug app's AudioContext and scheduler; sound quality was not heard in this headless emulator. Physical Bluetooth pairing, radio latency, Xbox hardware, mouse firmware, TV overscan, and speaker output still need a real-device pass.

Chromium buffers localStorage writes. An immediate foreground `am force-stop` 300 ms after changing a preference discarded that most recent change in one test. Home/background exit followed by restart persisted it. This forced-process-kill edge is distinct from normal app exit.

## Reproduce the debug tests

Requirements: Android SDK/platform tools/emulator, Google TV image, JDK 17+, and Node.js 22+ (native WebSocket). Set `JAVA_HOME`, `ANDROID_HOME` (or `ANDROID_SDK_ROOT`), and optionally `ADB` to their installed locations. No publishing credentials are needed.

Create a dedicated test AVD; do not use a physical device or clear an existing personal emulator:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --install 'system-images;android-36;google-tv;x86_64'
'no' | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" create avd --name pongwars_tv_qa --package 'system-images;android-36;google-tv;x86_64' --device tv_720p
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList '-avd','pongwars_tv_qa','-port','5556','-no-window','-read-only','-no-snapshot-save','-no-audio','-no-boot-anim' -WindowStyle Hidden
```

Once booted, from the repository root:

```powershell
$env:PONG_QA_SERIAL = 'emulator-5556'
Push-Location android
.\gradlew.bat :app:assembleSideloadDebug --console=plain
Pop-Location
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5556 install -r android/app/build/outputs/apk/sideload/debug/app-sideload-debug.apk
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5556 shell am start -n com.github.pongwarsreloaded.sideload/com.github.pongwarsreloaded.MainActivity
node android/tests/emulator-smoke.cjs
node android/tests/emulator-two-player.cjs
node android/tests/emulator-reconnect.cjs
```

Run the suites in order with fresh test app data: the first teaches the virtual remote, the second teaches two gamepads, and the third reuses those profiles. They intentionally fail if their expected initial state is absent. The driver rejects non-emulator serials and only attaches to the running sideload app's local asset WebView, never a browser profile. It temporarily forwards a localhost debugging port and removes it when finished. Virtual gamepads disconnect when their test process closes.

JSON checkpoints, app exceptions, input traces, and raw screenshots are written under ignored `android/app/build/qa/`. Primary evidence files are `emulator-smoke.json`, `emulator-two-player.json`, `emulator-reconnect.json`, `native-solo-playing.png`, `native-two-player-controls.png`, `native-reused-controls.png`, and `native-final-gameplay.png`.

Stop the isolated emulator after testing:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5556 emu kill
```

## Signed release

The signed release smoke uses `tests/emulator-release-smoke.cjs`, which injects native keys and captures screenshots without WebView debugging. Install the exact signed APK with fresh app data in the dedicated AVD first. Debug and signed sideload APKs have different signing certificates, so switching requires uninstalling only the test app in that dedicated AVD. Inspect every screenshot under `app/build/qa/release/`; capture success alone does not assert correct UI.

Signed version **1.0.1, code 9** was installed with fresh app data on the dedicated 4K Google TV API 36 AVD and exercised using native remote keys only. All eight release screenshots were visually inspected: home, completed control checks, saved-controller lobby, gameplay, pause, settings, music Off, and foreground return. Installed package metadata confirmed version 1.0.1/code 9 and no debuggable flag. AndroidRuntime/chromium logs contained no app exceptions during the final smoke.

The UHD software compositor initially returned the preceding lobby frame for the gameplay screenshot despite the match having started (the next pause image showed the correct match). Gameplay was recaptured after resuming with native keys and waiting five seconds, and visually verified. The smoke now waits five seconds per screenshot. Capture success alone is still not a UI assertion.

Verified artifact SHA-256 hashes:

- `pong-wars-reloaded-v1.0.1-9-tv.apk`: `C2BB45BD8B0088CFEA372DA9D2DFFE98CDB3BB8C9B72DA21DECCCAB863A1F5A3`
- `pong-wars-reloaded-v1.0.1-9-play.aab`: `1B602467C937803585C6375EA920C03EE77FED7459A23D72E0A32CA19AA0906C`

## 4K display behavior

Android 12 and later support [4K UI on compatible TV devices](https://developer.android.com/tv/release/12). A TV's HDMI/video resolution and app UI resolution can differ; Google's [TV memory guidance](https://developer.android.com/training/tv/playback/memory) explicitly distinguishes them. The app requests a supported 3840 × 2160 mode only if it matches the current refresh cadence within 0.5 Hz and runs at least 50 Hz. It will not trade 60 Hz motion for a 30 Hz UHD mode or lower an existing 120 Hz mode. The window also requests low-latency display processing where supported.

Android treats [`preferredDisplayModeId`](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#preferredDisplayModeId) as a preference and may ignore it. `AndroidHost.getDisplayInfo()` reports actual output mode, actual WebView window pixel dimensions, density, and the requested mode separately. An app cannot promise that an OEM's 1080p UI compositor becomes native 4K merely because its HDMI output is 4K.

For true emulated UHD testing, create a second AVD using `--name pongwars_tv_4k_qa --device tv_4k` with the same Google TV image, then launch it on port 5558 and set `PONG_QA_SERIAL=emulator-5558`. This provides a real 3840 × 2160 virtual framebuffer rather than just changing CSS viewport dimensions. It remains an emulator test, not proof of physical HDMI negotiation or TV panel image processing.

This UHD AVD was cold-booted with 4 GB RAM, read-only data, no snapshot, no window, and no audio. After installing the final debug APK and allowing its initial page load to complete, `node android/tests/emulator-display.cjs` passed with these measured values:

| Measurement | Result |
| --- | --- |
| Android output mode | 3840 × 2160 at 60.000004 Hz |
| Actual WebView window | 3840 × 2160 pixels |
| CSS viewport | 960 × 540, device pixel ratio 4 |
| Visible square board | 489.02 × 489.02 CSS pixels; 90.56% of viewport height |
| Canvas backing store | 1957 × 1957 pixels, matching its displayed pixel size |
| Logical game coordinate transform | 2.44625 on both axes; world remains 800 × 800 |

`emulator-display.json`, `native-4k-debug-home.png`, and `native-4k-gameplay.png` contain the measurements and raw 3840 × 2160 screenshots. The sharp board is square within the 4K screen; it is not stretched to 3840 pixels wide. The shared renderer also adapts to browser device pixel ratio and resize without changing game physics.

The headless AVD used SwiftShader/Lavapipe software graphics. Its sampled frame intervals were a 150 ms median and 283.4 ms 95th percentile; this verifies pixel resolution and behavior, not 60 fps hardware performance. Physical Google TV Streamer performance, HDMI mode negotiation, Bluetooth latency, and audio output remain unmeasured. The isolated emulator was stopped after testing.
