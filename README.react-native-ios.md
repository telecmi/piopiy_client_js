# PIOPIY SDK — React Native iOS Setup

**Platform:** 📱 iOS

> 📱 **This is the iOS guide.** Building for **Android** or **Web / Electron**?
> → **[Android guide](README.react-native-android.md)** · **[Web & Electron guide](README.web.md)**

Use the `@telecmi/piopiy-native` React Native voice SDK in a **bare React Native** iOS app to place and receive calls. It connects your app to TeleCMI so you can make and receive high-quality voice calls — to **real phone numbers**, to other agent extensions, or app-to-app.

---

## Requirements

- **Node 18+**.
- A **physical iOS device** is highly recommended. The **iOS Simulator cannot** capture microphone audio for WebRTC calls; always verify on real hardware.
- macOS with **Xcode 16+** and **CocoaPods**.
- A TeleCMI account (**username**, **password**, **region**).

---

## 1. Install the SDK

Follow **Step 1 of the [React Native guide](README.react-native.md)** — one install
command plus a small `react-native.config.js`, then come back here for the iOS
native setup.

---

## 2. CocoaPods Setup

Run CocoaPods inside your project's `ios` directory:

```bash
cd ios
pod install
cd ..
```

> [!WARNING]
> If `pod install` cannot resolve `SocketRocket` or `WebRTC`, raise the deployment target in your `ios/Podfile` to **15.1+** (e.g., `platform :ios, '15.1'`) and re-run.

---

## 3. Configure `Info.plist`

Open `ios/<YourApp>/Info.plist` and add the microphone permission string (required by iOS, which otherwise terminates the app when audio starts) and background audio modes:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for making and receiving voice calls.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

---

## 4. Podfile configuration — Disable New Architecture (required)

The SDK's native pods do **not** build on iOS with the New Architecture enabled —
which RN 0.76+ turns on by default. Near the top of your `ios/Podfile` (before the
`target` block), add:

```ruby
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

> [!WARNING]
> Skip this and the build fails at link time with
> `module map file '…/livekit_react_native.modulemap' not found`
> (or the same error naming another Swift pod). After adding it, re-run
> `pod install` **and delete DerivedData** — a stale build directory keeps the
> old architecture's artifacts and the error persists.
>
> This applies to **iOS only**. Android runs fine on the New Architecture — see
> the CallKeep patch in the [Push guide](README.push-notifications.md).

---

## 5. Signing and Xcode Settings

1. Open the **`.xcworkspace`** file (not the `.xcodeproj`) in Xcode.
2. Select your project root in the sidebar, and choose the main app target.
3. Under the **Signing & Capabilities** tab, choose a valid **Team** and configure a unique **Bundle Identifier** (both are required to deploy to a physical iOS device).
4. Still under **Signing & Capabilities**, click **+ Capability** and add **Push Notifications**.

> ⚠️ **Step 4 is required for incoming calls, and skipping it fails silently.**
> The Background Modes in Info.plist declare intent, but only the Push
> Notifications capability creates the `.entitlements` file (with
> `aps-environment`) that authorises the device to receive a VoIP token. Without
> it, iOS never issues the token — no error, no log, no incoming calls; the app
> just waits forever. If sign-in works but the SDK never logs
> `registering apns …`, check this first: your target must have a
> `<YourApp>.entitlements` file containing `aps-environment`, wired for **both
> Debug and Release** configurations (Xcode sometimes adds only Debug — check
> `CODE_SIGN_ENTITLEMENTS` under Build Settings for the Release config too, or
> push will break only in production builds).

---

## 6. Known Xcode 26 / Apple Clang 21 compiler issues (`fmt` build error)

On bleeding-edge toolchains (**Xcode 26 / Clang 21**), the build may fail on the `fmt` package with:
```
call to consteval function 'fmt::…' is not a constant expression
```

To resolve this, update your `ios/Podfile` `post_install` block to override `FMT_USE_CONSTEVAL` to `0` (re-applied automatically on every `pod install`):

```ruby
post_install do |installer|
  # ... keep the existing react_native_post_install(...) call ...

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

If Xcode cache still shows the compile error after editing the Podfile, clean the build folders:
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/<YourApp>-*
rm -rf ~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex
```

---

## 7. Usage

```js
import PIOPIY from '@telecmi/piopiy-native';

// 1. Initialize the client
const piopiy = new PIOPIY({ name: 'iOS Agent', debug: true, ringTime: 40 });

// 2. Set up event listeners
piopiy.on('login', () => console.log('Signed in — ready for calls'));

// Receive inbound calls
piopiy.on('inComingCall', (data) => {
  console.log('Incoming call from:', data.from);
  
  // Bind these to your Answer / Reject buttons:
  // piopiy.answer();
  // piopiy.reject();
});

piopiy.on('ringing', () => console.log('Ringing...'));
piopiy.on('answered', () => console.log('Call connected'));

// 3. Sign in
piopiy.login('1001', 'secret', 'sbcind.telecmi.com');

// 4. Place an outbound call to a phone number (or another extension)
// TeleCMI connects the call through to the phone network.
piopiy.call('13158050050');
```

For the full method & event list (`mute`, `hold`, `sendDtmf`, `transfer`, `terminate`, …) see the **[API reference](README.md#api-reference)**.

### Speaker & Audio Routing
The SDK **automatically detects and integrates** with `react-native-incall-manager` under the hood. Toggle the loudspeaker using `speaker()`:

```js
piopiy.speaker(true);    // Route call audio to loudspeaker
piopiy.speaker(false);   // Route call audio to earpiece
piopiy.onSpeaker();      // Get current speaker state (boolean)
```

### No UI Components Required (Voice-Only)
Since this is a **voice-only** SDK, remote and local audio tracks are routed automatically by the device. You **do not** need to include or render any `<RTCView>` components from `react-native-webrtc` in your React Native UI code.

---

## Inbound calls while backgrounded (important)

Inbound calls ring and connect while the app is in the **foreground**. Receiving a call while the app is **backgrounded or killed** requires VoIP Push (**PushKit**) + **CallKit** — the SDK drives both once wired up.

Follow the **[Push Notifications guide](README.push-notifications.md)** for the complete setup.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No audio after answering** | Running on iOS Simulator (no mic input device). Run on a real iOS device. |
| **`mediaFailed` event** | Microphone permission was denied by the user. Verify app microphone permissions in Settings. |
| **`Unable to open base configuration reference file … Pods-<App>.debug.xcconfig`**<br>or **`Unable to load contents of file list: '/Target Support Files/…xcfilelist'`** | Either `pod install` hasn't been run (there is no `ios/Pods/`), or you opened `ios/<App>.xcodeproj` instead of **`ios/<App>.xcworkspace`**. Run `cd ios && bundle exec pod install`, then close Xcode and reopen the **`.xcworkspace`** — the `.xcodeproj` alone knows nothing about CocoaPods. |
| **`pod install` fails on `SocketRocket` / deployment target** | Set `platform :ios, '15.1'` in your `Podfile`, then run `pod install --repo-update`. |
| **`Unicode Normalization` errors during `pod install`** | Locale isn't UTF-8: prefix command with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`. |
| **`fmt` / `consteval` compiler error (Xcode 26)** | Apply the `post_install` patch inside your Podfile, then clear DerivedData and rebuild. |
| **`module map file '…modulemap' not found`** (naming `livekit_react_native`, `AsyncStorage`, or another Swift pod) | **Usually a cascade, not the real error.** A pod failed to compile, so its module map was never produced. Scroll up to the **first** `error:` in the build log — most often the `fmt` / `consteval` failure below. Fix that and these disappear. If there is no earlier error, check `ENV['RCT_NEW_ARCH_ENABLED'] = '0'` (**Step 4**), re-run `pod install`, delete DerivedData, rebuild. |
| **Native build errors after upgrading packages** | Re-run `pod install`; ensure `RCT_NEW_ARCH_ENABLED=0` is configured in the `Podfile`. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
