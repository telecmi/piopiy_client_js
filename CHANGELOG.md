# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/) — while on `0.x`, a **minor** bump
may contain breaking changes, which are always listed under **Upgrading** with
the exact action required.

**Quick compare:** [0.16.0 → 0.17.0](https://github.com/telecmi/piopiy_client_js/compare/v0.16.0...v0.17.0) ·
[all releases](https://github.com/telecmi/piopiy_client_js/releases)

| Version | Date | Headline |
| :--- | :--- | :--- |
| [0.24.0](#0240---2026-07-30) | 2026-07-30 | **Firebase is the app's, explicitly** — injected via the `messaging` option, not bundled |
| [0.23.1](#0231---2026-07-30) | 2026-07-30 | First sign-in on a fresh install reliably registers the push token |
| [0.23.0](#0230---2026-07-29) | 2026-07-29 | **Apps write zero push code** — the SDK forwards its own pushes |
| [0.22.0](#0220---2026-07-29) | 2026-07-29 | **iOS-only apps need zero push packages** — Firebase bundled for Metro resolution |
| [0.21.0](#0210---2026-07-29) | 2026-07-29 | **One-line install** — audio routing and iOS VoIP push ship with the SDK too |
| [0.20.0](#0200---2026-07-29) | 2026-07-29 | **CallKeep ships with the SDK** — no more install or patch-package step |
| [0.19.2](#0192---2026-07-29) | 2026-07-29 | **Android: incoming calls display again** — bridge owns the UI on Android |
| [0.19.1](#0191---2026-07-29) | 2026-07-29 | Sign-in after sign-out re-registers the push token |
| [0.19.0](#0190---2026-07-28) | 2026-07-28 | **Inbound push calls work end-to-end** — engine load, answer, mute |
| [0.18.1](#0181---2026-07-25) | 2026-07-25 | Unpublished — folded into 0.19.0 |
| [0.18.0](#0180---2026-07-25) | 2026-07-25 | Automatic push-token registration, fully typed events |
| [0.17.0](#0170---2026-07-24) | 2026-07-24 | Scoped packages, push-call reliability (cancel, ring timeout, missed calls) |
| [0.16.0](#0160---2026-06-05) | 2026-06-05 | React Native support (iOS & Android) |
| [0.15.0](#0150---2026-04-15) | 2026-04-15 | `call_id` key standardization |
| [0.14.0](#0140---2026-04-10) | 2026-04-10 | Team transfer |
| [0.13.0](#0130---2026-04-08) | 2026-04-08 | Call metadata extraction, tooling upgrade |

## [0.24.0] - 2026-07-30

### Fixed
- **A signed-out device could still receive — and even answer — calls** when the sign-out's token removal failed server-side (the invite push carries the room and its join token, so login state didn't gate the join). Two layers now close this: after an explicit `logout()` the SDK **refuses invite pushes** (dismissing the natively-reported ringing screen) until the next sign-in, and the unregister call **retries once and logs loudly** on final failure instead of failing silently. Cold-start pushes (app killed, relaunched by a call) are unaffected.
- **Answer/cancel race left a phantom in-call panel.** When the caller gave up (or their leg timed out) at the same moment the user answered, the in-flight `answer()` — which awaits audio setup and the room connection — resumed *after* the cancel's teardown and resurrected the dead call: `answered` fired after `hangup`, the app showed an in-call panel with no call behind it, and the stale state corrupted the next incoming call's UI. `answer()` now re-checks after every await; a teardown always wins, the abandoned room is left, and no stale events fire.

### Changed
- **Firebase is no longer bundled with the SDK — Android apps install it explicitly; the SDK detects it automatically.** Firebase belongs to the app (its Firebase project, its `google-services.json`, its gradle plugin, its version), so hiding it inside the SDK made an important setup step invisible. For Android push, your app runs:

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

  …and completes the Android checklist in the push guide (`google-services.json`, two gradle lines, manifest, one `index.js` line). **No SDK-side Firebase code exists to write** — no option, no import: when Firebase is installed the SDK uses it; when it isn't (iOS-only apps) the app still bundles and runs, and the SDK logs exactly what to install if Android push is expected. The push guide's **Step 4b** is an explicit checklist with the symptom each missing item produces.

### Upgrading
- **Android apps (0.22.0–0.23.1):** `npm install @react-native-firebase/app @react-native-firebase/messaging` (previously it arrived silently with the SDK). Everything else is unchanged.
- **iOS-only apps:** no action; you may drop the Firebase entries from `react-native.config.js` if you never install it.

## [0.23.1] - 2026-07-30

### Fixed
- **On a fresh install, the very first sign-in could miss the push-token registration** (it then only registered after a sign-out/sign-in). The sign-in re-registration now checks whether the token was actually *sent* rather than merely *seen*, so a lost first registration is always retried on login.
- The SDK now logs a clear line if the OS hasn't issued a device push token 10 seconds after start — previously a missing iOS Push Notifications capability or missing `google-services.json` produced complete silence.

## [0.23.0] - 2026-07-29

### Changed
- **The SDK now forwards incoming call pushes to itself** — apps no longer import any push library or write any forwarding code. Foreground pushes (iOS VoIP `notification` events, Android FCM `onMessage`) are consumed automatically; for Android background/killed wake-ups, one SDK call in `index.js` replaces the whole Firebase handler block: `piopiy.registerBackgroundPushHandler()` (safe no-op on iOS/web, typed). A minimal app now imports exactly `react`, `react-native`, and `@telecmi/piopiy-native`.

### Fixed
- **The bundled Firebase could land nested (`node_modules/@telecmi/piopiy-native/node_modules/…`) where app-level `require`s couldn't reach it**, reintroducing `Requiring unknown module "undefined"` for apps that forwarded pushes themselves. App code no longer needs those requires at all; existing manual forwarding keeps working (double deliveries are deduped, including `cancel_call`).

### Upgrading
- Optional but recommended: delete your push-forwarding code (VoIP `notification` listeners, `messaging().onMessage`, the `setBackgroundMessageHandler` block in index.js) and replace the index.js block with `piopiy.registerBackgroundPushHandler()`. Apps that keep the old wiring continue to work.

## [0.22.0] - 2026-07-29

### Fixed
- **iOS-only apps failed to bundle over an Android-only package.** The SDK's Android FCM support contains a guarded `require('@react-native-firebase/messaging')` — but Metro resolves every `require` statically at bundle time, so any app that hadn't installed Firebase (an Android push concern) failed with `Requiring unknown module "undefined"`, even on iOS. `@react-native-firebase/app` + `/messaging` now ship with the SDK so the require always resolves. The install is now truly one line for every platform: `npm install @telecmi/piopiy-native`.

The iOS build remains completely Firebase-free — the `react-native.config.js` snippet excludes it from iOS. Android push still uses your app's `google-services.json` + gradle plugin (tied to your Firebase project, not the SDK); without them the SDK degrades gracefully instead of crashing.

### Upgrading
- No action needed. Apps that installed Firebase directly keep working — their copy satisfies the same dependency. Make sure your `react-native.config.js` matches the current snippet in the setup guide (it registers the bundled modules and excludes Firebase from iOS).

## [0.21.0] - 2026-07-29

### Changed
- **`react-native-incall-manager` and `react-native-voip-push-notification` now ship with the SDK** as regular dependencies, completing what 0.20.0 started. The React Native install is now a single package — `npm install @telecmi/piopiy-native` — plus, for Android push only, `@react-native-firebase/app` + `/messaging` (which stay app installs: they need your app's `google-services.json` and gradle plugin, and should track your React Native release). Register the bundled modules once in `react-native.config.js` (see the setup guide) — the snippet now lists all five.

### Upgrading
- Existing apps keep working unchanged — the packages you installed directly simply satisfy the same dependency. Optionally clean up: `npm uninstall react-native-incall-manager react-native-voip-push-notification`, add the two entries to `react-native.config.js`, reinstall, and re-run `bundle exec pod install`.

## [0.20.0] - 2026-07-29

### Changed
- **The native call-screen module now ships with the SDK.** `@telecmi/piopiy-native` depends on **`@telecmi/react-native-callkeep`** — upstream react-native-callkeep 4.3.16 plus the fix for the Android startup crash on React Native 0.76+ (duplicate `@ReactMethod` overloads, rejected by the New Architecture). Apps no longer install `react-native-callkeep`, no longer carry a patch file, and no longer need `patch-package` at all — the worst step in the setup is gone.

### Upgrading
Coming from 0.19.x (or any setup that installed and patched callkeep), remove the old pieces — keeping both copies collides at `pod install` (duplicate `RNCallKeep` pod) and in the Android build (duplicate classes):

```bash
npm uninstall react-native-callkeep patch-package
rm -rf patches/react-native-callkeep*.patch
```

Delete the `"postinstall": "patch-package"` script (unless you patch other packages), add `'@telecmi/react-native-callkeep': {}` to the `dependencies` in your `react-native.config.js`, then reinstall and re-run `bundle exec pod install`.

## [0.19.2] - 2026-07-29

### Fixed
- **Android showed no incoming-call UI for push calls** (0.19.0–0.19.1). The bridge assumed the native side was already ringing when a push call arrived — true on iOS, where the AppDelegate reports the call to CallKit before JS even boots, but false on Android, which has no native pre-report. The bridge now creates the native incoming call itself on Android (same uuid as the push, so answer/cancel/end all correlate) and keeps the adopt-the-ringing-call behaviour on iOS.
- **Android displayed "Incoming call" instead of the caller's number.** `from` is an FCM-reserved data key, so Android pushes deliver the caller number renamed to `caller`; the SDK now reads both (iOS payloads are unaffected and keep using `from`).

## [0.19.1] - 2026-07-29

### Added
- **Caller name and team on incoming calls.** The `inComingCall` event now carries `name` (the caller's resolved display name, when the platform provides it) and `team_name` (the team/queue that routed the call) — both optional and fully typed. The SDK also refreshes the native call screen with the richest display available ("Priya Sharma — support3", falling back to the number), from JavaScript, so future payload additions need no native rebuild in apps.

### Fixed
- **Signing in again after `logout()` never re-registered the push token**, leaving the device unreachable for incoming calls until the app was fully relaunched. `logout()` correctly unregisters the token server-side, but the OS emits the device-token event only once per launch and the SDK's duplicate-token check blocked any re-send — so the next sign-in silently registered nothing. The SDK now keeps the device token across sign-out and re-registers it automatically when a new session signs in. No app changes needed.
- **The native call screen's speaker button fought the SDK's audio routing** (iOS). Tapping Speaker on the CallKit screen changed the hardware route, but the SDK still believed its last route — its next configuration re-assert flipped the CallKit button back off while the loudspeaker kept playing, and `onSpeaker()` reported the wrong state. The SDK now listens to the native route-change event and mirrors it, so the CallKit button, the audio route, `onSpeaker()`, and the in-app toggle always agree.

## [0.19.0] - 2026-07-28

React Native inbound calls are delivered as a room held server-side, joined on
answer (jsSIP handles outbound). This release makes that path work end-to-end —
it had three independent, silent failures — and completes the in-call controls.

### Fixed
- **Inbound push calls rang but connected silently.** Three independent causes, each of which produced the same symptom (answer → nothing) with no error:
  1. **The inbound engine never loaded on Hermes.** The bundled call library declares `class … extends DOMException` at module scope, and Hermes has no `DOMException` — the `require()` threw, the engine went inert, and answering connected no call. The SDK now installs a spec-shaped `DOMException` polyfill before anything else loads (`polyfills.native.js`).
  2. **Answering waited for a SIP INVITE that never comes.** The CallKit answer handler gated on `hasIncomingSession` — a SIP-only flag that is always false for room-based inbound — and deferred forever. Answer now joins the held room directly; on React Native there is no SIP inbound path to wait for.
  3. **A second CallKit call was displayed for every push call.** The bridge looked for `transport === 'livekit'` but the engine emits `transport === 'push'`; the mismatch spawned a duplicate CallKit entry with a fresh uuid whose Answer/End actions fought the real one, and mislabelled the call as a SIP session (sending `endCall` down the SIP reject path).
- **`speaker()`/`onSpeaker()` state on inbound calls** — the route override is applied through the engine's own audio session and the reported state now reflects it.

### Added
- **`mute()` / `unMute()` / `onMute()` now work on inbound calls** — previously they only acted on the SIP (outbound) session and silently did nothing on an answered inbound call. Muting disables the published microphone track; the call stays connected.
- **Startup log states *why* the inbound engine is unavailable** (`engine INERT — rn=… client=…`) instead of a generic "not installed" guess — the first thing needed when debugging a silent call.

### Known limitations (inbound calls)
- `sendDtmf()`, `hold()`/`unHold()`, `transfer()`/`teamTransfer()`/`merge()` act on the SIP session only — on an inbound (room) call they are currently no-ops. Supporting them requires platform-side call-control endpoints and is planned; they work normally on outbound calls.
- `reject()` declines locally (dismisses the native call screen, discards the room) but does not signal the platform — the caller keeps ringing until the server's no-answer timeout routes the call onward.

### Upgrading
- No action needed. `0.18.1` was never published; coming from `0.18.0`, both fixes in it (RN bundling, loudspeaker default) are included here.

## [0.18.1] - 2026-07-25

### Added
- **`logout()` now unregisters the device push token** (React Native). Signing out calls `POST /push/unregister` before tearing down the session, so the device stops being woken for incoming calls — previously the token stayed registered and the platform kept pushing to a signed-out device. Pass a callback to observe the result: `piopiy.logout(res => …)`. A no-op when no token is registered.
- **`apiBase` option** — override the TeleCMI API base URL used for login and push-token registration, e.g. `new PIOPIY({ apiBase: 'https://stagerest.telecmi.com/v2' })`. Defaults to production, so testing against staging no longer means editing SDK source (and no longer risks releasing a staging URL).

### Fixed
- **`logout()` before a successful `login()` crashed** with `TypeError: cmi_ua.isRegistered is not a function`. The user-agent handle starts as an empty object — truthy but not a UA — and the teardown path didn't guard against it.
- **Calls answered on the loudspeaker** (React Native). The bundled engine's dependency ranges were open (`>=2.8.0` / `>=125.0.0`), so a fresh install pulled `@livekit/react-native` **2.12** and `@livekit/react-native-webrtc` **144.x**, whose iOS audio-session defaults route every call to the speaker. Our own example app was unaffected only because it had the older pair pinned from an earlier install. Both are now pinned to the tested `~2.8.0` / `~125.0.12` pair, and the SDK re-asserts the output route through the engine's own audio session after the audio unit starts.
- **React Native apps could not bundle** (`Requiring unknown module "undefined"`, then `TypeError: Cannot read property '…' of undefined`). The SDK requested optional peers with a fallback `require()` — `react-native-webrtc` after `@livekit/react-native-webrtc`, and `@livekit/react-native-callkeep` after `react-native-callkeep`. **Metro resolves `require()` statically at bundle time**, so a fallback naming a package the app hasn't installed is unresolvable and breaks the whole bundle at runtime, regardless of the `try/catch`.
  - The SDK now requires only packages that are guaranteed present: `@livekit/react-native-webrtc` (a dependency of this package) and `react-native-callkeep` (the package the setup guide tells you to install).
  - **Using a CallKeep fork?** Alias it to `react-native-callkeep` in `metro.config.js`.
  - This affected every integration that followed the documented install; it was masked in our own example app, which aliases the missing names in its Metro config.

## [0.18.0] - 2026-07-25

### Added
- **Automatic push-token registration** (`autoPushToken`, **on by default**, React Native). The SDK now fetches this device's push token itself — PushKit on iOS, FCM on Android — registers it with TeleCMI after `login()`, and **re-registers automatically when the OS rotates the token**. This removes ~40 lines of identical boilerplate from every integration; the example app's push service shrank by ~75 lines.
  - Uses the same soft-require approach as the CallKeep bridge: **no new dependencies**, and the SDK stays inert if the push libraries aren't installed.
  - `@react-native-firebase/messaging` is required lazily and only on Android, so it can never break an iOS build with `Module 'FirebaseCore' not found`.
  - The same token is never re-sent, so enabling this alongside your own `registerToken()` calls causes no duplicate requests.

- **Fully typed events (Web + React Native).** `on()` / `off()` / `once()` are now generic over a `PiopiyEventMap`, so every event name autocompletes and each handler's payload is typed — `piopiy.on('inComingCall', c => c.from)` knows `from` is a `string`, and a typo like `'incomingCall'` is a compile-time error instead of a listener that silently never fires. Payload interfaces (`PiopiyIncomingCall`, `PiopiyMissedCall`, `PiopiyEventMap`, …) are exported for direct use. Types-only change — no runtime behaviour differs, and JavaScript users get the same editor autocomplete.

### Changed
- `registerToken()` is now optional for most apps — it remains public for anyone setting `autoPushToken: false`. `unregisterToken()` is unchanged.

## [0.17.0] - 2026-07-24

### ⚠️ Upgrading from 0.16.x

Four things changed that can affect existing code. Only **#1** is required.

| # | What changed | Do you need to act? |
| :--- | :--- | :--- |
| 1 | **Package renamed and scoped** | **Yes** — update your dependency and import |
| 2 | `livekitIncoming()` → `handleIncomingPush()` | No — old name still works (deprecated) |
| 3 | `ringTime` default `60` → `40` seconds | Only if you relied on the 60 s default — pass `ringTime: 60` to keep it |
| 4 | Some event `status` **text** changed | Only if you compared status strings — match the event name instead |

**1. Package rename** — the unscoped `piopiyjs` is deprecated:

```diff
- npm install piopiyjs
+ npm install @telecmi/piopiyjs          # Web & Electron
+ npm install @telecmi/piopiy-native     # React Native

- import PIOPIY from 'piopiyjs';
+ import PIOPIY from '@telecmi/piopiyjs';       // Web & Electron
+ import PIOPIY from '@telecmi/piopiy-native';  // React Native
```

**2. Method rename** (optional, but preferred going forward):

```diff
- piopiy.livekitIncoming(pushData);
+ piopiy.handleIncomingPush(pushData);
```

**4. Changed status text** — the event names are unchanged; only the human-readable `status` differs:

| Event | Before | After |
| :--- | :--- | :--- |
| `connected` | `"SBC connected"` | `"connected"` |
| `disconnected` | `"SBC disconneced"` *(typo)* | `"disconnected"` |
| `loginFailed` (405) | `"too many connection"` | `"too many connections"` |
| `error` (1009/1010) | `"livekit url missing"` / `"livekit connect failed"` | `"call connection URL missing"` / `"call connection failed"` |

```diff
- piopiy.on('connected', (d) => { if (d.status === 'SBC connected') { … } });
+ piopiy.on('connected', () => { … });   // match the event, not the text
```

### Added
- **Caller-Cancel Push Handling**: `handleIncomingPush()` (renamed from `livekitIncoming()`, which remains as a deprecated alias) now also accepts a `{type: 'cancel_call', uuid}` payload — sent when the caller hangs up before you answer — and dismisses the ringing CallKit/ConnectionService UI. Apps just forward the raw push payload.
- **Ring Timeout for Push Calls**: a ringing inbound call now stops after `ringTime` seconds even if the device is offline and the cancel push can never arrive (previously it rang until the user acted). The iOS guide documents a native 45 s AppDelegate backstop, since iOS can park the JS thread during a background wake.
- **`missedCall` event**: emitted when a ringing call ends without user action (`reason: 'cancelled' | 'ring_timeout'`, with `uuid`/`from`) so apps can show a local missed-call notification — no server push required. A deliberate reject does not emit it.

### Changed
- **Two scoped packages**: `@telecmi/piopiyjs` (Web/Electron) and `@telecmi/piopiy-native` (React Native), replacing the unscoped `piopiyjs`.
- **`livekitIncoming()` renamed to `handleIncomingPush()`** — the old name still works as a deprecated alias.
- **`ringTime` default lowered from 60 s to 40 s** — the maximum time an incoming call rings, for both live and push-delivered calls.

### Fixed
- **Cleaned up developer-visible event strings.** `connected`/`disconnected` now report `status: "connected"` / `"disconnected"` (previously `"SBC connected"` / `"SBC disconneced"` — note the typo); inbound-call errors report `call connection failed` / `call connection URL missing` instead of naming the internal media stack; `loginFailed` 405 reports `too many connections`. Match on the **event name** rather than the status text.
- **In-app ringing UI now dismisses when an inbound call is cancelled/rejected/times out.** A still-ringing call ended without emitting a termination event, so the native call UI dismissed but an app's own `inComingCall`-driven screen kept ringing. An `ended` event is now emitted in that case.

## [0.16.0] - 2026-06-05
 
### Added
- **React Native Support (iOS & Android)**: Introduced a dedicated React Native entry point (`index.native.js`) using `react-native-webrtc` for media capability and `react-native-incall-manager` for audio session routing.
- **Unified Call Control**: Enabled identical API call methods (`mute()`, `hold()`, `sendDtmf()`, `transfer()`, `terminate()`, etc.) across both Web and React Native environments.
- **React Native Example App**: Added a full example application showcasing inbound/outbound call lifecycle, device mic permission handling, and events logging.
- **Cross-Platform Guides**: Created detailed platform setup guides (`README.react-native.md` and `README.web.md`) and updated the root `README.md` to reference them.

### Changed
- **Package Metadata**: Updated package description and title to reflect unified Web and Mobile (React Native, iOS, Android) platform support.

## [0.15.0] - 2026-04-15
 
### Fixed
- **Call ID Key Standardization**: Standardized the `call_id` key in session object for consistency across API and internal state.
 
## [0.14.0] - 2026-04-10
 
### Added
- **Team Transfer Functionality**: Added `teamTransfer(to, callback)` method to the main `PIOPIY` API, enabling group-based call redirection.
 
### Fixed
- **Call ID Normalization**: `getCallId()` and `getCallID()` now strictly return `false` instead of `undefined` in scenarios where no call is active or the SDK is not initialized.
 
### Changed
- **Improved Error Feedback**: Enhanced `transfer()` and `teamTransfer()` to proactively return a descriptive error `{ error: "No active call found" }` via the provided callback if no active call session is detected.
 


## [0.13.0] - 2026-04-08

### Added
- **Custom SIP Header Extraction**: Added support for extracting `X-Team-Name`, `X-To-Number`, and `X-Call-ID` (TeleCMI UUID) from incoming calls.
- **Transfer Metadata**: Added internal support for tracking `transfer_from` and `transfer_to` information.
- **Improved Call ID**: `getCallId()` now returns the TeleCMI UUID immediately upon call onset, with a fallback to the standard SIP Call-ID.
- **Enhanced Regional SBCs**: Added `sbcindncr.telecmi.com` to the India region.

### Changed
- **Modernized Documentation**: Completely rewritten `README.md` with professional styling, detailed API guides, and regional SBC endpoints.
- **Tooling Upgrade**: Migrated from legacy ESLint config to **ESLint v9 Flat Config** (`eslint.config.mjs`).
- **Strict Linting**: Resolved 28+ code quality issues; the codebase is now 100% lint-free.
- **Integrated Build Process**: `npm run build` now automatically performs a full project-wide linting scan.
- **Project Metadata**: Polished `package.json` with descriptive titles, keywords, and categorized author information.

### Removed
- **Legacy Support**: Removed `bower.json` and ended official support for Bower.

---

[0.17.0]: https://github.com/telecmi/piopiy_client_js/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/telecmi/piopiy_client_js/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/telecmi/piopiy_client_js/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/telecmi/piopiy_client_js/compare/v0.13.0...v0.14.0
