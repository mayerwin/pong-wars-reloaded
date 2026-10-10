# Pong Wars Reloaded for Google TV

The Android app packages this repository's existing HTML/CSS/JavaScript game in a hardware-accelerated WebView. The TV interface and device input adapter live in `android/tv/`; Gradle copies the shared game into generated build assets and adds the TV adapter there. There is no second copy of the game source to maintain. The normal website does not load the TV adapter.

The original menu soundtrack is also shared: `menu-music.js` is loaded by the root HTML and packaged unchanged in Android. Each host owns its own menu lifecycle and remembered preference, and the web host relinquishes audio when TV controls take over.

## Current Google Play status

As of October 10, 2026, the app exists in the **ErwinMayerLabs** developer account with package **`com.github.pongwarsreloaded`** and Play Console app ID **`4974770876550903522`**. Version **1.0.1, code 9** was uploaded through the existing release workflow and is under **Changes in review** for **Alpha closed testing**, named **1.0.1 (9) - Google TV closed beta**. Console is running automatic checks and will send the update for review when those finish. Version **1.0.0, code 6** remains the published closed-beta release until approval. Managed publishing is off. The dashboard reports **1 tester currently opted in**. The earlier internal release remains available to its tester list.

The live Alpha tester configuration selects **[Erwin Mayer Labs Beta](https://groups.google.com/g/erwin-mayer-labs-beta/about)** (`erwin-mayer-labs-beta@googlegroups.com`), replacing the earlier email lists. On October 10, 2026, Console showed no unpublished changes, and the owner's closed-test invitation confirmed **You are a tester** even while the dashboard count remained zero. Anyone can join the group and opt into Pong without an issue or manual invitation. Use the public **About** link: the conversations page is members-only and shows an access error when signed out. Distribution includes **all 177 countries/regions plus the rest of the world**. The intended audience is **ages 13 and up**; the completed rating questionnaire returned **Everyone / PEGI 3**. The public support email is **googleplaysupport@erwinmayer.com**.

The saved setup includes the store listing, **Android TV opt-in**, app-content declarations, and public privacy-policy URL. The advertising-ID declaration is **No**, and managed publishing is off. The Play store link now opens, and its install chooser offers the **Google TV Streamer**. Separate Android TV form-factor approval and installation on the physical TV have not been independently verified.

The existing Chained-Timers service-account credential is referenced by the ignored local config, without copying its key. Pong access has been approved and saved. Authentication and the read-only API request for Pong's version 6 generated APK metadata both returned **HTTP 200**. This verifies read access; an automated publishing upload has not been tested.

On this machine, the ignored config sets **`$LocalPlayTracks = @('alpha')`**, so double-clicking **`4-publish-to-play.bat`** targets **Alpha closed testing only**.

## Install the Play beta (intended tester route)

The shared group supports self-service signup:

1. Open the [public group page](https://groups.google.com/g/erwin-mayer-labs-beta/about), sign in with the Google account you use on your TV, and click **Join group**; **No email** is available for the subscription. If already enrolled in Pong's internal test, leave it through the [internal-test page](https://play.google.com/apps/internaltest/4700243097272444495) before joining closed testing.
2. Open the [closed-beta invitation](https://play.google.com/apps/testing/com.github.pongwarsreloaded) with that same account and choose **Become a tester**.
3. Install through Google Play using **that same Google account on the TV**, selecting your Google TV Streamer where offered.

This is a normal Play installation; no developer options, TV debugging, ADB, or APK installer is needed. No issue or manual invitation is required. The group is shared with other Erwin Mayer Labs apps registered with it: join once, but opt into **each app separately**. Keep your group membership while testing. Allow time for Play to recognize a new membership, and check the signed-in account if access is unavailable. Group members are not automatically enrolled in any app. [Google testing guidance](https://support.google.com/googleplay/android-developer/answer/9845334).

## Optional developer installation by sideloading

You can play a sideloaded build immediately, with no Play account setup or tester quota. The scripts use your installed Android Studio JDK/SDK (including the existing Chained-Timers setup) and remember your TV after the first successful installation.

1. On the TV, open **Settings > System > About** and select **Android TV OS build** repeatedly until developer options are enabled. Open **Developer options** and enable debugging. The exact labels depend on the installed Google TV version.
2. Connect the PC and TV to the same local network. If the TV offers **Wireless debugging**, open **Pair device with pairing code** and note the pairing address and code. The normal Wireless debugging screen also shows the connection address; its port is usually different from the pairing port.
3. In PowerShell, from this repository, run the command below using the addresses shown by your TV. `adb` will ask for the pairing code. If the TV instead exposes network debugging directly, omit `-PairAddress` and use `-TvAddress 192.168.1.50:5555`. Approve this computer on the TV when prompted.

```powershell
.\android\publishing\LAUNCH.ps1 -PairAddress 192.168.1.50:37123 -TvAddress 192.168.1.50:39817
```

The command builds a signed APK, installs it, and opens **Pong Wars Reloaded**. The app also appears in the Google TV app launcher. You can also double-click `android/publishing/LAUNCH.bat`: if no device is connected, it asks for the pairing and connection addresses. Next time, double-click it to build and install an update on the remembered TV. If a wireless port/IP changes, pass the new `-TvAddress`. For an already built APK, use `LAUNCH.ps1 -SkipBuild`. USB or a running TV emulator also works: specify `-Serial` if more than one device is attached. [Android TV device setup](https://developer.android.com/training/tv/get-started/create) and [official wireless debugging instructions](https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi).

If you only want the installable file, double-click **`0-build-sideload-apk.bat`**. The latest APK is copied to:

```text
android/publishing/releases/pong-wars-reloaded-tv.apk
```

Versioned copies and SHA-256 checksum files are kept beside it. You may transfer that APK to the TV and open it with an installer/file manager permitted to install unknown apps. An `.aab` is a Play upload file and cannot be installed directly.

The sideload package is `com.github.pongwarsreloaded.sideload`; the Play package is `com.github.pongwarsreloaded`. They can coexist, and each keeps its own settings. This avoids the signing conflict between developer-signed APKs and Google Play App Signing. The installer uses `adb install -r`, preserves your controller settings, and never automatically uninstalls or downgrades the app.

## Controllers

Connect Bluetooth accessories in the TV's system settings first. Select one or two players and press any button on each player's intended device (moving a stick also joins). For a new device, first choose its **OK/action button**: even an unusual virtual keyboard can use any spare key. Then demonstrate **up, down, left, right, rotate left, rotate right, and rescue**, releasing between steps. **Save controls & continue** returns to the player lobby, showing the buttons you chose. In two-player mode the other player can then join. When everyone is ready, select **Start match**. A saved device skips the checks and shows its mappings immediately; **Change controls** is available before starting and from the pause menu. Cancelling a remap restores its previous settings.

| Device | Movement | Racket rotation | Rescue | Pause |
| --- | --- | --- | --- | --- |
| Google TV remote / five-button directional controller | Direction buttons | Tap OK to enter rotation mode; left/up turns left, right/down turns right. Tap OK again to move. | Hold OK for 2.5 seconds | Back on the TV remote |
| Xbox-style gamepad | Either stick or direction pad | Left/right shoulder or trigger | Hold X or Y for 2 seconds; holding A for 2.5 seconds also works | Start, Back, or B |
| Bluetooth / virtual keyboard | Arrows, WASD, IJKL, or the four keys learned during setup | Q/E or learned keys; tap the chosen action key to use directional rotation | Hold T for 2 seconds, or the chosen action key for 2.5 seconds | Escape or the TV remote's Back |
| Bluetooth mouse | Move the mouse | Scroll the wheel | Hold left click for 2.5 seconds | Right click |

The action-button tap/hold scheme makes all gameplay actions reachable with only four directions and one action button; the TV remote's Back remains available for pause. Rescue has three uses per match. During a match, a device disconnect pauses play; reconnect it or join with a replacement and check its controls. The pause menu also lets either player recheck/change mappings.

The TV **Settings** menu controls sound, menu music, volume, color theme, visual effects, match rules, free movement, and powerup options. The original offline soundtrack plays only in menus and stops during play, pause and backgrounding. **Menu music: Off** is remembered independently of the master sound switch. Sound/display options remain available while paused; match rules are locked during a match. **Privacy & credits** explains local storage and how to remove saved information.

Movement, racket rotation, emergency ball rescue, and pause must all remain reachable, including on a remote with a small number of buttons. Device profiles are stored only on that TV. Home, power, volume, Assistant, and other keys reserved by Android may be intercepted by the system before an app can see them. Apps also cannot distinguish two physical accessories that the operating system presents as one virtual keyboard; pair them as separate Android input devices for independent players.

## Build and release

The numbered `.bat` launchers and `.ps1` scripts follow the existing **Chained-Timers** workflow: discover the toolchain, build once, upload one AAB, and promote that same artifact to the other selected tracks. Chained-Timers is not modified; its existing service-account credential can be referenced in place without copying its key.

| Script in `android/publishing/` | Result |
| --- | --- |
| `0-build-sideload-apk.bat` | Signed APK for immediate TV installation; creates the app's private sideload key on first use |
| `1-generate-upload-keystore.bat` | Creates private app-specific upload and sideload keys once; never overwrites existing keys |
| `2-show-fingerprints.bat` | Shows the public certificate fingerprints without printing passwords |
| `3-build-play-aab.bat` | Builds the signed Play AAB and sideload APK, with versioned filenames and checksums |
| `4-publish-to-play.bat` | Builds and publishes to configured tracks with completed status; this machine targets Alpha closed testing only. Generic fallback is internal, then closed testing (`alpha`) |
| `5-publish-to-play-production.bat` | Explicitly builds and releases to internal, closed, and production tracks |
| `6-install-on-tv.bat` / `LAUNCH.bat` | Builds, installs, and launches on a connected/remembered TV |

Build requirements: JDK 17 or later, Android SDK platform 36, build tools, and platform-tools. Android Studio's bundled JDK is discovered automatically, including `D:\Program Files\Android\Android Studio\jbr`. The SDK is found through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the normal user profile location. To override either path, copy `publishing/local-config.ps1.example` to `publishing/local-config.ps1` and edit it. First builds need access to Google's and Gradle's dependency repositories; subsequent builds reuse caches. No Node/npm/Capacitor dependency is required.

For the first Play build, run scripts **1**, then **3**. **Back up the entire ignored `publishing/secrets/` directory in a secure vault.** It contains the private signing keys, their generated random passwords, release counter, and remembered TV address. Never commit or share it. Losing the sideload signing key prevents in-place updates for installed sideload builds. Google Play upload keys have a separate reset process.

For subsequent releases, update the human-readable `versionName` in `android/version.properties` and release notes in `android/app/src/main/play/release-notes/en-US/default.txt`, then run script **4**. Track selection uses this precedence: explicit **`-Tracks`**, environment **`PLAY_TRACKS`** / **`PLAY_TRACK`**, **`$LocalPlayTracks`** in the ignored local config, then the generic **internal + alpha** fallback. This machine is configured for **alpha only**. Scripts automatically reserve an increasing integer version code before each build, including failed builds, so they do not accidentally reuse an uploaded code. The base `versionCode` in `version.properties` is a floor. Restore `secrets/release-state.json` when changing machines, or pass `-VersionCode` greater than every code already uploaded to Play. Builds from a fresh checkout cannot infer another machine's private release history. Play rejects conflicts rather than silently changing the artifact.

```powershell
# Build, upload, and release to Alpha closed testing:
.\android\publishing\4-publish-to-play.ps1 -Tracks alpha -Status completed

# Optional: prepare drafts for manual review, including an app still in draft:
.\android\publishing\4-publish-to-play.ps1 -Status draft

# Optional: target both tracks, overriding the local alpha-only setting:
$env:PLAY_TRACKS = 'internal,alpha'
.\android\publishing\4-publish-to-play.ps1 -Status completed

# Explicitly choose the next code after moving to another machine:
.\android\publishing\3-build-play-aab.ps1 -VersionName 1.0.1 -VersionCode 20
```

Direct developer commands from `android/` are `gradlew.bat assembleSideloadDebug`, `gradlew.bat assembleSideloadRelease`, `gradlew.bat bundlePlayRelease`, and `gradlew.bat lint test`. Release variants require the matching private signing files. Debug variants use Android's normal development key and are intended for development; use the signed sideload release for stable beta updates.

## Google Play setup and remaining steps

1. **Completed:** the app and initial AAB are registered in [Play Console](https://play.google.com/console), and code 6 is available in internal testing. The initial AAB upload through Console is the prerequisite for later API uploads. [Gradle Play Publisher setup](https://github.com/Triple-T/gradle-play-publisher/tree/3.10.1#initial-play-store-upload).
2. **Saved and submitted:** public developer contact, content rating, target audience (13+), ads and advertising-ID declarations (both No), privacy-policy URL, Data safety, and the store listing. The current app is offline, has no analytics or ads, and stores controller preferences locally. Revisit declarations when shipped behavior changes.
3. **TV opt-in saved:** **Android TV** is selected under **Setup > Advanced settings > Form factors**. The Play install chooser offers Google TV Streamer; separate form-factor approval has not been independently verified. TV distribution has its own quality review. Since August 1, 2026 TV apps must support 64-bit devices and 16 KB memory pages. This app uses Java/WebView without bundled native libraries. [Official TV distribution requirements](https://developer.android.com/training/tv/publishing/distribute).
4. **Closed release and group access published:** Alpha uses **[Erwin Mayer Labs Beta](https://groups.google.com/g/erwin-mayer-labs-beta/about)**. Console showed no unpublished changes on October 10, 2026; the owner's [closed-beta invitation](https://play.google.com/apps/testing/com.github.pongwarsreloaded) confirmed enrollment. The dashboard subsequently updated to 1 tester opted in. Join the group, then opt into the app separately. Leave internal testing first if enrolled there. Internal/closed tests are not discoverable by ordinary Play search. [Google testing-track instructions](https://support.google.com/googleplay/android-developer/answer/9845334).
5. **Automated upload verified:** the existing Gradle Play Publisher workflow uploaded the exact verified version 1.0.1/code 9 AAB and committed it to Alpha closed testing on October 10, 2026. Console review/publication status is recorded above. The existing credential path is configured in the ignored `publishing/local-config.ps1`; no additional credential copy is needed. For another machine, set **`$LocalPlayServiceAccountPath`** to the existing credential's absolute path; alternatively **`PLAY_SERVICE_ACCOUNT_FILE`** takes precedence, or an app-specific credential may be stored at `android/publishing/secrets/play-service-account.json`. Setting a path does not grant Play permissions. [Official API access setup](https://developers.google.com/android-publisher/getting_started).

For personal developer accounts created after November 13, 2023, production access requires a closed test with at least **12 testers continuously opted in for 14 days for each app**, followed by an application for that app's production access. Group membership alone does not count, and testing Chained Timers does not satisfy Pong's requirement. Closed beta testing can start before reaching 12. Internal testing does not satisfy the closed-test requirement. [Google's current testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

The saved listing copy and its current publication status are recorded in `publishing/store-listing.md`. The static privacy-policy source is `publishing/privacy.html`, and declaration evidence is in `publishing/data-safety.md`. The [public privacy policy](https://mayerwin.github.io/pong-wars-reloaded/android/publishing/privacy.html) is live, verified, and saved in Play Console.

## Structure and verification

The **1.0.1** update adds optional original menu music, a player lobby with saved button summaries and remapping, and a larger square board with its HUD in the side margins. The shared renderer draws at the display's actual pixel density, including 4K, without changing game physics. Android requests UHD when supported at the current smooth refresh rate; the operating system still controls the final app surface resolution. Setup save/cancel, held menu buttons, native Back navigation, controller replacement/disconnection, and high-density rendering have regression coverage. See [TESTING.md](TESTING.md) for Google TV emulator checks and reproducible commands.

```text
android/
  app/src/main/          Native TV host, resources, manifest, release notes
  tv/                    TV-only interface and controller logic
  version.properties     Public version name and version-code floor
  publishing/            Numbered Windows build/release/install scripts
    secrets/             Ignored per-app keys, credentials, local state
    releases/            Ignored signed APK/AAB outputs and checksums
  app/build/             Generated web assets and Android build outputs
```

Before each public release, test a real TV remote, Xbox-style gamepad, two independent gamepads, Bluetooth keyboard, and mouse on the TV. Verify fresh mapping, remembered reconnect, device disconnect/reconnect during a match, pause/resume, rotation, emergency rescue, and all menu paths from the couch. Automated builds and browser checks cannot measure Bluetooth latency or guarantee how a particular TV firmware exposes accessories.

Initial build validation (October 10, 2026): version **1.0.0, code 6** produced a signed APK and AAB; signature verification, TV launcher/manifest checks, and exact packaged-source comparisons passed. The packages include the shared game, current TV controls/interface, and LICENSE, with no native `.so` libraries. The project passed **41 JavaScript tests**, **4 native JVM tests**, Android lint, and emulator/browser smoke checks. TV scoreboard/board layout was also checked at 640 × 360, 854 × 480, and 1280 × 720 browser viewports. Native smoke captures came from a landscape Android phone emulator; physical Google TV Streamer/Bluetooth testing remains to be completed on the actual TV.

The three images in `publishing/screenshots/` are uncomposited `adb screencap` captures of the signed **code 6 APK** on an Android 14 (API 34) emulator, temporarily configured at **1280 × 720, density 240**, with the emulator's display-cutout simulation disabled. They show the home screen, active gameplay with scores/timer/rescue counters, and controller setup. Emulator settings were restored afterward. These images validate the actual Android app interface; they are not presented as physical Google TV Streamer or Bluetooth compatibility tests.
