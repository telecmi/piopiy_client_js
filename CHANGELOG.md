# Changelog

All notable changes to this project will be documented in this file.

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
