# PIOPIY SDK — React Native (iOS & Android)

**Platforms:** 📱 iOS · 🤖 Android

> 📱 **This is the React Native guide.** Building for the **Web** instead?
> → **[Web guide](README.web.md)**

Use the `piopiyjs` WebRTC voice SDK in a **bare React Native** app — register with
the SBC, receive **inbound** calls, place outbound calls, with mute / hold / DTMF
/ hang-up controls. Works on **iOS** and **Android**.

> The **call API** (methods & events) is identical on every platform and is
> documented once in the **[API reference](README.md#api-reference)**. This guide
> covers React Native **setup** (native peers + per-platform config).

> [!TIP]
> A complete, runnable example app lives in [`example-rn/`](example-rn) — its
> [README](example-rn/README.md) covers building and running it on a device.

---

## What you need to do

`import PIOPIY from 'piopiyjs'` and use it — there's **no WebRTC wiring to set
up**, and remote audio is **routed to the device automatically**. The rest of
this guide is: install the packages, do the per-platform setup, then call the
API.

---

## Requirements

- **Node 18+**.
- A **physical device** is recommended. The **iOS Simulator cannot** capture
  microphone audio for WebRTC; the **Android emulator can** use your computer's
  mic, but always verify on real hardware before shipping.
- **iOS:** macOS with **Xcode 16+** and **CocoaPods**.
- **Android:** **Android Studio / SDK** and **JDK 17**.
- A TeleCMI / PIOPIY SBC account (**username**, **password**, **domain**).

---

## 1. Install the SDK and its native peers

```bash
npm install piopiyjs react-native-webrtc react-native-incall-manager
```

| Package | Why it's needed |
| :--- | :--- |
| `piopiyjs` | The PIOPIY SDK (SIP + WebRTC call control). |
| `react-native-webrtc` | The native WebRTC APIs the SDK runs on. **Required.** |
| `react-native-incall-manager` | Audio session / routing (speaker, ringback, proximity). Recommended. |

> [!IMPORTANT]
> Install all three in **your own app** (not nested inside another package) —
> `react-native-webrtc` and `react-native-incall-manager` are native modules your
> app must own.

---

## 2. iOS setup

### Install pods

```bash
cd ios
pod install
cd ..
```

> If `pod install` can't resolve `SocketRocket` / WebRTC, raise the deployment
> target to **15.1+** in `ios/Podfile` (`platform :ios, '15.1'`) and re-run.

### `ios/<App>/Info.plist`

The microphone usage string is **required** (without it iOS kills the app the
moment audio starts). The background modes let audio continue when the screen
locks during a call.

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for voice calls.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

### `ios/Podfile` — disable the New Architecture

The WebRTC native modules build most reliably with the **New Architecture
disabled**. Near the top of the `Podfile` (before the `target` block), then
re-run `pod install`:

```ruby
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

### Signing

Open the **`.xcworkspace`** (not the `.xcodeproj`) in Xcode. Under **Signing &
Capabilities**, select your **Team** and a unique **Bundle Identifier** — both
are required to run on a physical device.

### Known issue — Xcode 26 / Apple Clang 21 (`fmt` build error)

On a very new toolchain (**Xcode 26 / Clang 21**) the build can fail with:

```
call to consteval function 'fmt::…' is not a constant expression
```

React Native 0.76 vendors **fmt 11**, whose `base.h` enables C++20 `consteval`;
Clang 21 rejects fmt's own format-string helpers. Disable fmt's consteval from
your `Podfile` `post_install` (idempotent — re-applied on every `pod install`):

```ruby
post_install do |installer|
  # … keep the existing react_native_post_install(...) call …

  fmt_base = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'base.h')
  if File.exist?(fmt_base)
    original = File.read(fmt_base)
    patched  = original.gsub(/^#\s*define FMT_USE_CONSTEVAL 1\b/, '#  define FMT_USE_CONSTEVAL 0')
    if patched != original
      File.chmod(0644, fmt_base)         # fmt headers ship read-only (0444)
      File.write(fmt_base, patched)
      File.chmod(0444, fmt_base)
    end
  end
end
```

If Xcode keeps showing the error after patching (it can reuse a previously failed
module), clear the caches and rebuild:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/<YourApp>-*
rm -rf ~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex
```

> Most teams on stable **Xcode 16.x** will **not** hit this — it only affects
> bleeding-edge toolchains.

---

## 3. Android setup

### Permissions — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Request the microphone at runtime

The manifest entry isn't enough — Android needs a **runtime** prompt for
`RECORD_AUDIO`. Request it before login / the first call:

```js
import { PermissionsAndroid } from 'react-native';

await PermissionsAndroid.request(
  PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  { title: 'Microphone', message: 'Voice calls need the microphone.', buttonPositive: 'OK' },
);
```

### Gradle

- `react-native-webrtc` requires **`minSdkVersion` 24+** (Android 7.0). RN 0.76's
  default already meets this — confirm in `android/build.gradle`.
- Build with **JDK 17** (the RN 0.76 default).

### ProGuard / R8 (release builds only)

If you enable minification for release builds, keep the WebRTC classes in
`android/app/proguard-rules.pro`:

```
-keep class org.webrtc.** { *; }
```

### Testing

The Android **emulator can use your computer's microphone**, so basic two-way
audio works there — but verify on a **real device** before shipping.

---

## 4. Usage

```js
import PIOPIY from 'piopiyjs';

const piopiy = new PIOPIY({ name: 'Agent', debug: true, ringTime: 60 });
piopiy.login('1001', 'secret', 'sbcind.telecmi.com');

// Inbound
piopiy.on('inComingCall', (d) => console.log('incoming from', d.from));
piopiy.answer();   // on Answer
piopiy.reject();   // on Reject

// Outbound
piopiy.call('13158050050');
piopiy.on('answered', () => console.log('connected'));
```

For the full method & event list (`mute`, `hold`, `sendDtmf`, `transfer`,
`terminate`, …) see the **[API reference](README.md#api-reference)**.

### Speaker / audio routing

Call `speaker()` on your PIOPIY instance to switch between the loudspeaker and the
earpiece — you don't touch `react-native-incall-manager` yourself:

```js
piopiy.speaker(true);    // loudspeaker
piopiy.speaker(false);   // earpiece
piopiy.onSpeaker();      // current state (boolean)
```

---

## Inbound calls while backgrounded (important)

Inbound calls ring and connect while the app is in the **foreground**. Receiving
a call while the app is **backgrounded or killed** requires platform push + a
native call UI:

- **iOS:** VoIP Push (**PushKit**) + **CallKit** (`reportNewIncomingCall`).
- **Android:** a high-priority **FCM** data message + a foreground service /
  **ConnectionService**.

That integration is **not** part of this SDK — add it on top for an always-on
softphone.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No audio after answering** | iOS Simulator (no mic) or the mic permission was denied. Run on a real device and allow the prompt. |
| **`mediaFailed` event** | Microphone could not be acquired (denied permission / no input device). |
| **`pod install` fails on `SocketRocket` / deployment target** | Set `platform :ios, '15.1'` in the `Podfile`, then `pod install --repo-update`. |
| **`Unicode Normalization … ASCII-8BIT` during `pod install`** | Locale isn't UTF-8: prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`. |
| **`fmt` / `consteval` build error (Xcode 26 / Clang 21)** | Apply the fmt `post_install` patch above, then clear DerivedData + ModuleCache. |
| **Android: crash or no audio on call** | Add the manifest permissions **and** request `RECORD_AUDIO` at runtime. |
| **Native build errors after upgrading** | Re-run `pod install`; ensure `RCT_NEW_ARCH_ENABLED=0` in the `Podfile`. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
