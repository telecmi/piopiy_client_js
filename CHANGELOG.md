# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/) — while on `0.x`, a **minor** bump
may contain breaking changes, which are always listed under **Upgrading** with
the exact action required.

**Quick compare:** [0.16.0 → 0.17.0](https://github.com/telecmi/piopiy_client_js/compare/v0.16.0...v0.17.0) ·
[all releases](https://github.com/telecmi/piopiy_client_js/releases)

| Version | Date | Headline |
| :--- | :--- | :--- |
| [0.18.1](#0181---2026-07-25) | 2026-07-25 | **Fixes RN bundling** — unresolvable optional requires |
| [0.18.0](#0180---2026-07-25) | 2026-07-25 | Automatic push-token registration, fully typed events |
| [0.17.0](#0170---2026-07-24) | 2026-07-24 | Scoped packages, push-call reliability (cancel, ring timeout, missed calls) |
| [0.16.0](#0160---2026-06-05) | 2026-06-05 | React Native support (iOS & Android) |
| [0.15.0](#0150---2026-04-15) | 2026-04-15 | `call_id` key standardization |
| [0.14.0](#0140---2026-04-10) | 2026-04-10 | Team transfer |
| [0.13.0](#0130---2026-04-08) | 2026-04-08 | Call metadata extraction, tooling upgrade |

## [0.18.1] - 2026-07-25

### Fixed
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
