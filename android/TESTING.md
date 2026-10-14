# Android TV verification

## Pierce Ball slowdown (1.0.6)

Piercing divides movement speed by three using the same effect state as penetration. Both effects therefore start, refresh and expire together. Base velocity is preserved, including Fast Ball and power-shot bonuses; extra balls inherit the same slowdown.

Verified on 13 October 2026: **150 JavaScript tests** pass, including speed ratios for both teams, regular/extra balls, Fast Ball stacks, refresh without compounding and exact-tick expiry. Isolated Chrome at desktop, high-density and mobile sizes confirms one-third movement through territory. The dedicated Google TV API 36 emulator observes 118 movement samples from its real loop at exactly one-third speed, plus native remote pickup, wall/racket rebounds, expiry, pause and resume without page exceptions. The emulator harness now waits for WebView game initialization before reading state. Evidence is in ignored `app/build/qa/pierce-slow-browser.json` and `v6-emulator-pierce.json`.

Android debug and signed release builds pass. APK/AAB signatures verify, and nine bundled game/TV/audio assets match the tested source. No native code changed in this release. Signed SHA-256 hashes:

- `pong-wars-reloaded-v1.0.6-14-tv.apk`: `EC6A1431812376DEF7224C9F25049B0B5E46DB3756CAD372DBD50477DEB6FDEF`
- `pong-wars-reloaded-v1.0.6-14-play.aab`: `01DD188212F9CD807F91FAE48AD0728AEE0020FFD441B1B67F67BE48138718DD`

## Gentler motion and Pierce Ball (1.0.5)

Territory capture no longer moves the board. Racket hits and powerup pickups produce a single 133 ms nudge, capped at about one CSS pixel with a 500 ms cooldown. The renderer keeps whole physical-pixel offsets and immediately stops shake when the system's reduced-motion preference changes.

Pierce Ball applies to the collecting team's existing and future balls for the configured duration. It captures territory without reflection and passes through other balls; walls, rackets and racket-protected cells retain their normal behavior. Repeated pickups refresh one effect. A static ring and HUD icon identify it even with visual effects disabled.

Verified on 13 October 2026:

- **148 JavaScript tests** pass. New regressions cover continuous capture with stacked speed/size, exact scores, four walls, rotated rackets, protected cells, ball-to-ball passage, extra balls, refresh/expiry, spawn pools, motion limits, cooldown and reduced motion.
- Isolated Chrome at 1440 × 900 (DPR 1), 1920 × 1080 (DPR 2) and 390 × 844 (DPR 3) captures a continuous path through enemy territory and renders the new pickup, ring and HUD. Canvas backing size matches displayed physical pixels. Continuous impact requests leave the board stationary for at least 46 of 60 simulation ticks; live reduced motion produces zero displacement. No page exceptions occurred. Evidence: ignored `app/build/qa/pierce-browser.json` and `pierce-web-*.png`.
- Android debug/release builds, native unit tests and lint pass. Signed APK/AAB checks pass, and nine bundled game/TV/audio assets match the tested source byte for byte (`app/build/qa/v5-release-assets.json`).
- The dedicated 720p Google TV API 36 emulator passes native remote setup, match start, pickup collection, pause and resume. Its real WebView loop verifies both regular and extra balls capture without territory reflection, walls/rackets still rebound, expiry restores reflection and removes the HUD badge, and shake stays below one CSS pixel per axis. Native audio is ready with all twelve samples and no failures; no page exceptions occurred. Reproduce with `node android/tests/emulator-pierce.cjs` after a fresh debug install in the dedicated AVD. Screenshots and observations are in ignored `app/build/qa/pierce/`.

Signed release SHA-256 hashes:

- `pong-wars-reloaded-v1.0.5-13-tv.apk`: `1A1981F722E02CC8F35B204A0D87FCCE66C8D6A6C6BEFE30BF8219F29F20A166`
- `pong-wars-reloaded-v1.0.5-13-play.aab`: `7D0186057EB94DC5696A1B3A936182B74B5CEE34A592BE671961B4730FFBFBF3`

## Native effects, optional remote buttons and pixel rendering (1.0.4)

The reported delay affects menus and gameplay through an HDMI/eARC soundbar or receiver. Short effects now use twelve preloaded native `SoundPool` samples with `USAGE_GAME`, without an event-time decoder or a WebView audio context. The website retains Web Audio; Android also keeps it as a fallback when a sample is unavailable. Both web contexts request interactive latency. Native mute, focus loss, page reload and backgrounding stop effects rather than replaying them later. This removes WebView buffering from the normal effects path; it does not measure or compensate for a physical HDMI/eARC delay.

Remote setup requires only action and four directions. Each extra rotation/rescue step offers skip-one, skip-all or explicit teaching. Orange and the word **Current** identify the active step; completed steps are teal and the action-button assignment stays visible. Saved profiles and cancellation still work. Screen shake now follows a damped oscillation at simulation time, interpolated for rendering, and moves all board content together at integer physical-pixel offsets. Territory cells and the canvas origin/extent align to physical pixels without reducing resolution.

Verified on 13 October 2026:

- **133 JavaScript tests** pass, including native routing/fallback, mute/lifecycle, optional-button setup, held-input release gates, saved-profile cancellation, display diagnostics and renderer regressions.
- Real Chrome at **3840 × 2160** confirms that the final canvas compositor correction reduces blended territory-edge pixels from 30 per sampled checkerboard row to zero. The native backing store also has zero blended edge pixels. This checks territory boundaries; vector ball/racket edges retain their own antialiasing.
- Desktop viewports at 1920 × 1080 (DPR 2), 1280 × 720 (DPR 3) and 640 × 360 (DPR 2), plus portrait/landscape mobile at DPR 3, pass board fit, backing resolution, movement, pause/resume and resize/orientation checks. Controller setup fits the compact TV viewport without footer overlap.
- Android debug/release builds, lint, and all native unit-test variants pass. The ten distinct native tests include sample headers, durations, unclipped/nonzero PCM at 44.1/48/192 kHz, input policy and display policy.
- On the dedicated 720p Google TV API 36 AVD, native remote keys pass skip-one/skip-all, held-confirm release gates, saving to the lobby, action-button rotation in both directions and hold-to-rescue. Two native virtual gamepads pass a mixed setup: P1 teaches separate shoulder/rescue buttons and P2 skips extras. Held Start/Resume, cancelled remapping, replacement/disconnection and saved profiles after restart pass; reconnection cannot resume with a player missing.
- Emulator harnesses wait for music, native focus and the WebView debugging connection within bounded deadlines rather than assuming immediate readiness after foregrounding or process restart.
- The dedicated 4K Google TV API 36 AVD reports **3840 × 2160 output and app surface at 60 Hz**, a 960 × 540 CSS viewport at DPR 4, and a **1957 × 1957** canvas mapped exactly to whole physical pixels. An actual 3840 × 2160 Android framebuffer capture has zero blended territory-edge pixels. The canvas is opaque and uses WebView's supported `pixelated` fallback; shake offsets are integer, deterministic and settle to zero. No JavaScript exceptions occurred. Evidence: `native-render-v4.json`, `native-4k-v4-gameplay.png`, `native-4k-v4-pixels.png`.
- The 720p AVD's native audio regression loads **12/12 cues at 48 kHz** and verifies navigation, confirmation, settings mute, zero volume, gameplay effects, start/pause/resume, three Home/return cycles and real held `uinput` navigation. Effects create no Web Audio context; muted/background cues do not replay. Ten accepted UI calls measured a median 1.6 ms / p95 3.9 ms synchronous bridge dispatch time. These numbers measure a software call, **not audible output latency**. See `feedback-native.json`.

The 4K AVD uses SwiftShader software graphics and sampled approximately 150 ms median / 383 ms p95 frame intervals under concurrent emulation. Its advertised 60 Hz output is not proof of 60 fps rendering or physical TV smoothness. Hardware display processing and HDMI/eARC audio delay remain unmeasured.

The 4K cold boot exposed a transient failed `resume` sample preload. The native loader now retries preparation at most twice (500 ms then 1 second), with named diagnostics, cleanup and cancellation on release. A fault-injection check temporarily removed write permission from the dedicated emulator's audio cache: all twelve first attempts failed, then all twelve recovered automatically after permission restoration, with zero queued/replayed sounds. A clean restart reports twelve loaded, zero failures/retries, and no effects Web Audio context. Home/return stops effects and does not replay them. AudioFlinger confirms a separate static PCM16 mono 48 kHz `USAGE_GAME` track; this software AVD reports no fast mixer. Evidence: `native-audio-retry.json`, `audio-4k-final.json`, `native-audio-flinger.txt`. Run `node android/tests/emulator-native-audio-retry.cjs` only on the dedicated debug emulator; its guarded driver refuses physical devices and the script restores cache permissions in `finally`.

The exact signed **1.0.4/code 12** APK passes a native-key-only smoke: home, optional buttons, control review, saved lobby, gameplay, pause, settings, music Off and Home/foreground return. All nine screenshots under `release/` were inspected; pixel inspection confirms the lobby heading starts at y = 32 with its safe margin intact. Installed metadata confirms code 12 and no debuggable flag. AndroidRuntime/chromium and native audio error logs are empty. APK and AAB signature checks pass, and both contain byte-identical tested game/audio/TV assets (`v4-release-assets.json`). SHA-256 hashes:

- `pong-wars-reloaded-v1.0.4-12-tv.apk`: `8C5F1E35576140A54BBF59C061CC9DB43BEBB06DBAE9F918FCD8226C5AE55ED0`
- `pong-wars-reloaded-v1.0.4-12-play.aab`: `E2051E83701609291C3E533845FDB94918A7171A379AF4F33002FE3D22342750`

All evidence is under ignored `android/app/build/qa/`; browser scripts include `check-shake-v4.cjs` and the setup capture `optional-choices-640.png`.

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
