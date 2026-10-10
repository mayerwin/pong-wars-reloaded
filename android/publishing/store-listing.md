# Pong Wars Reloaded — Google Play listing preparation

Status as of October 10, 2026: **version 1.0.1, code 9** was uploaded and committed to **Alpha closed testing** through Gradle Play Publisher. Console shows **Changes in review**, with automatic checks running, for **1.0.1 (9) - Google TV closed beta**. **Version 1.0.0, code 6** remains published until the update is approved. The dashboard reports **1 tester currently opted in**. The complete store listing, app-content declarations, and **Android TV opt-in** are saved; the advertising-ID answer is **No** and managed publishing is off. The Play store link opens and its install chooser offers Google TV Streamer. Separate TV form-factor approval and physical-TV installation have not been independently verified.

The live Alpha tester configuration selects **[Erwin Mayer Labs Beta](https://groups.google.com/g/erwin-mayer-labs-beta/about)** (`erwin-mayer-labs-beta@googlegroups.com`), replacing the earlier email lists. Console showed no unpublished changes on October 10, 2026, and the owner's closed-test invitation confirmed enrollment. The public `/about` page is the signup link; group conversations are restricted to members. Each tester must join the group and opt into this app separately. Distribution includes **all 177 countries/regions plus the rest of the world**.

Testers can [join the shared group](https://groups.google.com/g/erwin-mayer-labs-beta/about) now, without opening an issue or requesting a manual invitation. Then use the [closed-beta invitation](https://play.google.com/apps/testing/com.github.pongwarsreloaded) to **Become a tester**, and install normally through Google Play using the same Google account on the TV. No TV debugging is needed. Keep group membership while testing. The same group covers Chained Timers and future Erwin Mayer Labs apps registered with it, but **each app requires its own Play opt-in**. Anyone enrolled in Pong's internal test must first leave it through the [internal-test page](https://play.google.com/apps/internaltest/4700243097272444495). [Google testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334).

## App identity

| Field | Value |
| --- | --- |
| App name | Pong Wars Reloaded |
| Developer account | ErwinMayerLabs |
| Play Console app ID | `4974770876550903522` |
| Default language | English (United States), en-US |
| Type | Game |
| Suggested category | Arcade |
| Primary form factor | Android TV / Google TV |
| Play package | `com.github.pongwarsreloaded` |
| Sideload package | `com.github.pongwarsreloaded.sideload` |
| Ads / purchases | None in the current build |
| Intended audience | Ages 13 and up |
| Content rating | Everyone / PEGI 3, assigned by the completed questionnaire |
| Public support email | googleplaysupport@erwinmayer.com |

Audience and contact details reflect the developer's confirmed choices. The assigned content rating is separate from the intended age groups. If Google's new-personal-account production requirement applies, at least **12 testers must remain continuously opted in to each app's closed test for 14 days** before applying for that app's production access. Group membership alone does not count; participation in another app's test does not satisfy Pong's requirement. [Official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

## Short description

Conquer the board on Google TV with a remote, gamepad, keyboard or mouse.

## Full description

Day versus night. One board. Every square counts.

Pong Wars Reloaded brings a lively battle for territory to Android TV and Google TV. Deflect bouncing balls with your racket, paint the board in your team's color, and collect powerups that can turn the match around. Claim 80% of the board or hold the lead when time runs out.

PLAY YOUR WAY

Challenge the AI, play a local two-player match on the same TV, or watch two AIs battle it out. Choose from four AI difficulty levels and adjust the match duration.

USE THE CONTROLS YOU ALREADY HAVE

Play with an Xbox-style gamepad, a TV remote, a Bluetooth keyboard, or a Bluetooth mouse. Each player joins by pressing a button on their device. A guided check confirms movement, rotation, and emergency ball rescue before saving the controls for next time.

A remote with four directions and an OK button is enough for gameplay: tap OK to switch between movement and rotation, or hold it to rescue a ball. The TV remote's Back button opens the pause menu. Two-player matches use two distinct Android input devices.

TURN DEFENSE INTO ATTACK

Rotate your racket to redirect a shot. Move into a ball to give it extra momentum. Pick up stars and suns for larger balls, extra balls, faster shots, bigger rackets, or a smaller opponent racket. Three emergency rescues per match help you recover when a ball gets away.

MADE FOR THE COUCH

Large menus and a landscape game board are designed for the TV. Adjust sound, color themes, visual effects, match rules, and powerup settings. Play offline, without accounts, ads, or in-app purchases. Saved controls and game preferences stay on your device.

Android may reserve Home, power, volume, and Assistant buttons for the system. Independent two-player control requires accessories that Android identifies as separate input devices.

## Initial release notes

Pong Wars Reloaded comes to Google TV and Android TV. Play solo or with two local players using gamepads, a TV remote, Bluetooth keyboards, or a mouse. Check and save each device's controls once, then press a button to join next time. Includes rotation, ball rescue, powerups, and offline play.

## Graphics and publication status

- The descriptions, store graphics, and screenshots below have been saved in Play Console. The Alpha closed release is published; separate Android TV form-factor approval has not been independently verified. There is no public production release.
- App launcher banner exists at `android/app/src/main/res/drawable-xhdpi/tv_banner.png` (320 × 180).
- Store icon exists at `android/publishing/store-assets/icon-512.png` (512 × 512), rendered directly from the native launcher vector. It is visually checked and matches the app's icon.
- Store TV banner: `android/publishing/store-assets/tv-banner-1280x720.png` (1280 × 720).
- Feature graphic: `android/publishing/store-assets/feature-graphic-1024x500.png` (1024 × 500).
- Both promotional graphics are visually checked, opaque RGB PNGs based on the repository's original icon. Matching standalone SVG sources are beside them. Regenerate them with `node android/tools/generate-store-graphics.cjs` (requires Sharp, with bundled Codex runtime fallback). They are brand illustrations, not screenshots.
- The three saved screenshots in `android/publishing/screenshots/` are raw 1280 × 720 Android emulator captures of the signed code 6 APK. They are separate from promotional graphics and are not claimed as captures from a physical Google TV Streamer.
- Privacy policy source: `android/publishing/privacy.html`. Its [public URL](https://mayerwin.github.io/pong-wars-reloaded/android/publishing/privacy.html) is live, verified, and saved in Play Console.
- Declaration evidence and remaining developer decisions: `android/publishing/data-safety.md`.
- Automated publishing references the existing service-account credential without copying it. Pong access is approved and saved; authentication and the read-only API check for Pong version 6 both returned HTTP 200. Automated upload has not been tested.
- This machine's ignored local config selects **Alpha closed testing only** for script 4: `$LocalPlayTracks = @('alpha')`. Explicit `-Tracks` or `PLAY_TRACKS` / `PLAY_TRACK` overrides it; the generic fallback remains internal + alpha.

Check the [official Play asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151) and [Android TV distribution steps](https://developer.android.com/training/tv/publishing/distribute) when completing the listing.
