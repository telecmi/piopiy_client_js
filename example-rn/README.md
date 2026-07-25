# PIOPIY React Native test app

**Platforms:** 📱 iOS · 🤖 Android

A minimal bare React Native app for testing the local `@telecmi/piopiy-native` SDK on a real
device — built around **inbound (incoming) calls**: login to the SBC, receive a
call, and Answer / Reject, with mute / hold / hang-up / speaker / DTMF controls.

This app lives **inside** the SDK repo and consumes the SDK straight from the
parent folder via [`metro.config.js`](./metro.config.js) — there is no
`npm install @telecmi/piopiy-native`. After you change SDK source in `../src`, rebuild the
SDK (`cd .. && npm run build-node`) and reload the app.

> Setting this up in your **own** app instead of this example? Follow the
> [React Native guide](../README.react-native.md).

---

## Requirements

- **iOS:** macOS with **Xcode 16+** and a physical **iPhone** (the iOS Simulator
  cannot capture microphone audio for WebRTC).
- **Android:** Android Studio / SDK and **JDK 17** (the emulator can use your
  computer's mic; a real device is best).
- Node 18+, Yarn, and — for iOS — CocoaPods (via Bundler, see below).
- A TeleCMI / PIOPIY SBC account (user ID + password).

## 1. Build the SDK (once, from the repo root)

```bash
cd ..
npm install
npm run build-node     # compiles src/ -> lib/ (incl. the .native.js variants)
cd example-rn
```

## 2. Install JS dependencies

```bash
yarn install
```

This pulls in `react-native-webrtc` and `react-native-incall-manager` (the
native WebRTC + audio-session libraries the SDK needs on React Native).

## 3. Install iOS pods

```bash
cd ios
bundle install            # one-time: installs the CocoaPods version pinned by the Gemfile
# The UTF-8 locale avoids a CocoaPods "Unicode Normalization ... ASCII-8BIT" crash.
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
cd ..
```

> The New Architecture is disabled in [`ios/Podfile`](./ios/Podfile)
> (`RCT_NEW_ARCH_ENABLED=0`) so the WebRTC native modules build through their
> well-tested path. Remove that line and re-run `pod install` to try it on.

> On a bleeding-edge toolchain (**Xcode 26 / Clang 21**) the bundled `fmt`
> library can fail to compile; the `Podfile`'s `post_install` already patches it.
> See the [React Native guide](../README.react-native.md) (section *"Known issue
> — Xcode 26 / Apple Clang 21"*) for the details.

## 4. Run on your iPhone

1. Plug in the iPhone and tap **Trust** when prompted.
2. Open the workspace in Xcode:
   ```bash
   xed ios/PiopiyRNExample.xcworkspace
   ```
   In **Signing & Capabilities**, pick your Team. The Bundle Identifier is
   already set to `com.telecmi.piopirn` — change it only if it clashes with
   another app on your account. Selecting a Team is required to run on a real
   device.
3. Select your iPhone as the run target and press **Run** — or from the CLI:
   ```bash
   yarn start                       # Metro, in one terminal
   npx react-native run-ios --device # in another terminal
   ```

## 5. Test inbound calls

1. Enter your **User ID**, **Password**, and **SBC region**
   (e.g. `sbcind.telecmi.com`) and tap **Login** → status shows
   *"Registered — ready for calls"*.
2. From another phone / softphone, **call this extension**.
3. The green **Incoming call** banner appears → tap **Answer**.
4. Talk — remote audio routes to the device automatically. Use Mute / Hold /
   Speaker / DTMF / Hang up as needed. Every SDK event is shown in the
   **Event log**.

You can also place an outbound call from the dialer to verify two-way audio.

---

## Run on Android

The app includes an Android project too. The audio permissions are already set
in `android/app/src/main/AndroidManifest.xml` (`RECORD_AUDIO`,
`MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE`). There is no pods/Bundler step
on Android.

```bash
yarn start        # Metro, in one terminal
yarn android      # build & run on a connected device or emulator (another terminal)
```

Grant the **microphone** permission when prompted (the app requests it at
runtime), then log in and test exactly as on iOS. The Android emulator can use
your computer's mic, but verify on a real device before shipping.

---

## Notes & limitations

- The microphone permission prompt appears on the **first** call (Answer or
  Call). Allow it, or audio will fail (`mediaFailed`).
- Inbound calls work while the app is in the **foreground**. Receiving calls
  while the app is **backgrounded or killed** requires CallKit + VoIP push
  (PushKit) on iOS, or a high-priority FCM push + foreground service on Android —
  not included in this test app.
- SBC regions: `sbcsg.telecmi.com` (Asia), `sbcuk.telecmi.com` (Europe),
  `sbcus.telecmi.com` (America), `sbcind.telecmi.com` (India).

## Troubleshooting

- **`Unable to resolve module @telecmi/piopiy-native`** — rebuild the SDK from the repo root
  (`npm run build-node`) and restart Metro with a clean cache:
  `yarn start --reset-cache`.
- **No audio after answering** — confirm the mic permission was granted (iOS
  Settings → the app → Microphone; Android Settings → Apps → the app →
  Permissions) and that you tested on real hardware (iOS) / allowed the mic
  (Android).
- **Pod install fails on CocoaPods version** — use the Bundler flow above
  (`bundle exec pod install`) rather than a global `pod`.
- **`Unicode Normalization not appropriate for ASCII-8BIT` during pod install** —
  your shell locale isn't UTF-8. Prefix the command with
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` (as shown above), or add those exports to
  your shell profile.
