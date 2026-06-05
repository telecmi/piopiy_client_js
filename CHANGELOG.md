# Changelog

All notable changes to this project will be documented in this file.

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
