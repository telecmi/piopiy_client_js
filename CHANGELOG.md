# Changelog

All notable changes to this project will be documented in this file.

## [0.17.0] - 2026-07-24

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
