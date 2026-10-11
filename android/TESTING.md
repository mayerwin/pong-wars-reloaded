# Android TV verification

## Menu feedback and match transitions (1.0.3)

The shared effects context now plays short navigation, confirmation, back, pause/resume, controller-check and start cues. Menu music fades out over 450 ms as the start cue plays, without delaying gameplay. Explicit mute uses a much faster 30 ms fade. Touch vibration is optional, independently remembered, and limited to supported web touch devices.

Verified on 10 October 2026:

- All **113 JavaScript tests** pass, covering cue throttling, bounded voices, settings, lifecycle, native menu actions, keyboard activation, key-binding return paths and haptic preferences. Android debug build, lint and the existing native unit tests pass.
- Real desktop Chrome with strict autoplay produces nonzero audio output on the very first button press with music Off (measured peak 0.04487). Testing caught and fixed a cold-device startup race: Chrome can report a running context while its audio clock remains at zero. Short cues now clean up on the audio clock instead of disappearing on a wall-clock timeout before playback starts.
- Buttons, settings, reset controls and sliders emit their cues. Enter and Space activate the focused control once; held keys do not click through. Start and Resume each emit one semantic cue without an additional generic confirmation.
- The start transition begins gameplay immediately while music gain falls from 0.175 through 0.0817 to zero under the 515 ms start cue. The music source is released and its context suspended after the fade. Sound Off cancels active cues and prevents subsequent output; backgrounding cancels cues, and foregrounding does not replay them.
- Mobile Chrome emulation verifies short vibration requests, the separate Off preference across reload, and graceful behavior without the vibration API. This checks API calls, not a physical phone's vibration motor.
- Closing key configuration opened from settings restores its parent settings screen, including during a paused match. Escape unwinds the visible screens in order.
- The first Tab cue also survives slow synchronous audio initialization. Keyboard users cannot change locked gameplay settings during a match; those controls re-enable from the menu. Mobile Settings scrolls to its Done button, and rotation taps request only an 8 ms vibration.
- Three fresh Chrome processes each rendered the very first 45 ms Tab navigation cue with music Off (peak 0.02423, maximum RMS 0.01010). Even a 342–435 ms initial audio-clock stall preserved the cue; no artificial playback delay was added. Captures are in `cold-tab-pcm.json`.
- The Google TV API 36 debug app passed native navigation, confirmation, Sound Off/On, Start, Pause and Resume checks with rendered PCM. Real Android `uinput` holds moved focus four times and emitted four navigation cues, with no sound at a blocked boundary. Three Home/return cycles re-enabled feedback silently. Testing found a missing native focus-gain resume event; balancing focus loss and gain fixes an intermittent silent return without automatically resuming the match.
- Capturing the isolated first 45 ms cue on the software-rendered AVD was intermittent. Subsequent native navigation and longer cues had nonzero output, and the three independent cold-browser PCM tests above passed. This remains a limitation of the emulator audio observation, not evidence of physical TV speaker performance.
- The exact signed **1.0.3/code 11** APK passed a native remote smoke. All eight screenshots were visually inspected: home, music Off, Sound Off/On, gameplay, pause, Home-return still paused, and explicit resume. Metadata confirms code 11 and no debuggable flag; AndroidRuntime/chromium error logs are empty. Evidence is in `feedback-release/`.

Browser evidence and reproduction harnesses are under ignored `android/app/build/qa/`: `ui-feedback-browser.json`, `ui-feedback-extra.json`, `check-ui-feedback.cjs` and `check-ui-feedback-extra.cjs`. Headless audio checks measure rendered output; they do not assess physical TV speakers or Bluetooth latency.

After installing the debug APK in the dedicated emulator, run `node android/tests/emulator-feedback.cjs` for the native feedback regression. It sets Sound On at 70% with music Off in the disposable test app, checks cues and repeated Home/return cycles, and uses a virtual Android input device for held-button repeat. It writes `feedback-native.json` alongside the other ignored evidence. The driver rejects physical devices.

Signed **1.0.3/code 11** APK and AAB signature checks pass. Both contain byte-identical copies of the tested game, feedback player, music player, TV adapter, MP3 and audio license (`feedback-release-assets.json`). SHA-256 hashes:

- `pong-wars-reloaded-v1.0.3-11-tv.apk`: `5CE5493B7F97E5E994B09A84B8FD1ED03337C3A3EF3FC43EF29C020F48AB074F`
- `pong-wars-reloaded-v1.0.3-11-play.aab`: `1AE55301E61F9BABF5C4163C9B881A089B54656088F280A81652A5E1BB8809D1`

## Arcade soundtrack (1.0.2)

The shared player now decodes the bundled **Level 1** recording by Juhani Junkala and loops an `AudioBufferSourceNode`. Both web and Android use the same player and MP3. The recording and its CC0 provenance are in `assets/audio/`; Android requires no network access to play it.

Verified on 10 October 2026:

- All **78 JavaScript tests** pass, including asynchronous loading/decoding, failure recovery, first-gesture autoplay, late callbacks, mute, menu transitions and background lifecycle.
- Android debug/release builds and lint pass; seven existing native unit tests remain green.
- Desktop and mobile Chrome with strict autoplay start on the first click/touch. Music toggle, volume, persisted preferences, and silence during gameplay/pause pass. TV preview creates only one player and can resume with networking disabled.
- Chrome decodes the MP3 to exactly **3,274,608 stereo frames at 44,100 Hz (74.25414966 seconds)**, matching the original WAV. LAME encoder delay and padding are removed. At 48,000 Hz it resamples to 3,564,199 frames.
- Rendering across the loop boundary matches the expected repeated PCM samples exactly (maximum sample error 0), with no added silence. Accelerated real playback crosses the loop boundary without replacing or ending its source.
- A gain ceiling of 0.25 keeps the decoded peak below 0.272 even at maximum music volume. Default 70% volume lowers it further.
- Signed code **10** APK and AAB both contain byte-identical copies of the tested player, MP3 and audio license. APK signature verification and bundle JAR verification pass.
- The debug APK ran on the dedicated 720p Google TV API 36 emulator: its bundled local asset decoded to the expected stereo duration, and the same looping source remained active across a full loop at accelerated test speed. Native remote music Off persisted across Home and process restart. Home suspended the context and released its source; foreground return resumed it. Gameplay and pause stayed silent. Settings and music credits fit the screen in inspected screenshots.
- The exact signed **1.0.2/code 10** APK also passed a native remote smoke: launch, settings, music On/Off, credits and foreground return. Installed metadata has the expected version and no debuggable flag. AndroidRuntime/chromium logs have no app errors. Screenshots are in `arcade-release/`; its foreground image is byte-identical to the verified settings image.

Evidence is under ignored `android/app/build/qa/`: `arcade-decode.json`, `arcade-music-browser.json`, `arcade-native.json`, `arcade-release-assets.json`, plus the browser/emulator QA scripts and screenshots. These are technical playback checks; the headless tests do not assess speaker sound quality.

Signed release SHA-256 hashes:

- `pong-wars-reloaded-v1.0.2-10-tv.apk`: `6170BD9D512269C5AE1C4F52CDBB8C3880664E1928EB82AA0B8BE7190AFEEBED`
- `pong-wars-reloaded-v1.0.2-10-play.aab`: `B8F8FB72C4838F7ADCE4568515302EA5463F23D01649738E2C2F066E114D3117`

## Earlier controller and display verification (1.0.1)

The checks below describe the controller/display work and signed code 9 binary, before replacing the initial synthesized soundtrack with the shared recording above.

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
