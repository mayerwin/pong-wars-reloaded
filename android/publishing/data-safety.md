# Data safety and app-content declarations

Status as of October 10, 2026: closed Alpha version code 6 is **published**. Play Console reports **App update published**, **Closed testing: Active, 1 track**, and marks **Publish closed testing release** complete, with **0 testers opted in** at the latest check. The store listing, Android TV opt-in, and app-content declarations are saved. The Play store link opens and its install chooser offers Google TV Streamer; separate Android TV form-factor approval and physical-TV installation have not been independently verified. The IARC questionnaire was submitted after the developer explicitly approved its Terms.

The saved Alpha tester-access configuration now uses **[Erwin Mayer Labs Beta](https://groups.google.com/g/erwin-mayer-labs-beta)** (`erwin-mayer-labs-beta@googlegroups.com`) instead of the earlier email lists. This access change is **in review as of October 10, 2026**. Testers can join the group now, without an issue or manual invitation, then [opt into Pong's closed test](https://play.google.com/apps/testing/com.github.pongwarsreloaded) once Google activates the change. The group also covers Chained Timers and future Erwin Mayer Labs apps registered with it; **each app still requires a separate Play opt-in**. Where Google's new-personal-account requirement applies, each app needs at least **12 testers continuously opted in for 14 days** before applying for production access; group membership alone does not count. [Google testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334) and [production-access requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

## Current build evidence

| Area | Implementation |
| --- | --- |
| Network | No `INTERNET` permission; the WebView loads bundled assets and blocks other requests/navigation |
| Accounts | No login, account creation, user profiles hosted by the developer, or account service |
| Ads / payments | No ads, advertising SDK, billing SDK, purchases, or subscriptions |
| Analytics / crash reporting | No analytics SDK or app-operated remote crash-reporting service |
| Input | Android input device name/descriptor, vendor/product information, key events, axes, and mouse movement used locally to identify/control each player |
| Persistence | Controller mappings and game preferences in local WebView storage |
| Backups | `allowBackup=false`, `fullBackupContent=false`, and cloud/device-transfer exclusions in `data_extraction_rules.xml` |
| Permissions | No location, camera, microphone, contacts, or Bluetooth scan/connect permissions; accessory pairing is done in Android settings |
| Deletion | Clearing app data or uninstalling removes local preferences/profiles; Play/sideload editions have separate stores |
| In-app explanation | Settings > Privacy & credits explains local storage, collection/sharing, deletion, and developer support |

Sources in this repository: `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/github/pongwarsreloaded/MainActivity.java`, `android/app/src/main/res/xml/data_extraction_rules.xml`, `android/tv/input.js`, `android/tv/tv.js`, and the shared `game.js`.

## Saved Data safety declaration

- **Does your app collect or share any required user data types? No.** Controller identifiers and settings remain on the device; they are not transmitted to the developer or another party. Google's collection definition concerns transmission off the device; purely local access/processing does not need to be declared as collection. [Official Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).
- **Account creation: not supported.** There is no account to delete or server-side account-deletion mechanism.
- **Encryption in transit:** there is no app data transmission. No tested encryption protocol is claimed for nonexistent traffic.
- **Independent security review / verification badges:** none performed or claimed.
- **Privacy policy:** the [public policy](https://mayerwin.github.io/pong-wars-reloaded/android/publishing/privacy.html) is live (HTTP 200, exact match to `privacy.html`, verified October 10, 2026), and its URL is saved in Play Console. In-app privacy information is available under Settings > Privacy & credits. [Google user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311).

These answers must reflect all versions distributed under the Play package. Review them again if future versions add analytics, multiplayer networking, accounts, billing, or other SDKs.

## Other declarations

| Declaration | Saved answer / status |
| --- | --- |
| Ads | No ads in the current app |
| Advertising ID | No; the app does not use Advertising ID, request `AD_ID`, or include an advertising SDK |
| App access | All functionality is unrestricted: no login, subscription, credentials, location restrictions, or required gamepad; a TV remote is sufficient |
| Government app | No |
| Financial features | None |
| Health features | None |
| App category | Game / Arcade |
| Content rating | IARC questionnaire submitted after explicit developer approval of its Terms; assigned ESRB Everyone and PEGI 3. Gameplay uses abstract balls/rackets/tiles; no user chat, user-generated content, gambling, or simulated purchases |
| Target audience | Developer-confirmed age groups 13–15, 16–17, and 18+ are saved. The intended audience remains 13+, regardless of the assigned content ratings |
| Pricing | Free app; no in-app payments |
| Countries | All countries, including the rest-of-world option, selected for closed testing on Alpha |
| Developer contact | `googleplaysupport@erwinmayer.com`, reused from Chained Timers with the developer's authorization |
| Android TV | TV form-factor opt-in saved; Play install chooser offers Google TV Streamer. Separate form-factor approval has not been independently verified |

The store listing, privacy-policy URL, app-content declarations, and the distribution settings recorded above are saved. Closed Alpha version code 6 is published and its testing track is active; the subsequent switch to shared-group tester access is in review. This record does not claim separately verified Android TV form-factor approval, installation on the physical TV, production rollout, or independent security certification.
