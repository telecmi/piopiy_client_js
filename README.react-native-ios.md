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

## 4. Podfile configuration — Disable New Architecture

WebRTC native modules build most reliably on iOS with the **New Architecture disabled**. 
Near the top of your `ios/Podfile` (before the `target` block), verify or add:

```ruby
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

---

## 5. Signing and Xcode Settings

1. Open the **`.xcworkspace`** file (not the `.xcodeproj`) in Xcode.
2. Select your project root in the sidebar, and choose the main app target.
3. Under the **Signing & Capabilities** tab, choose a valid **Team** and configure a unique **Bundle Identifier** (both are required to deploy to a physical iOS device).

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
| **`pod install` fails on `SocketRocket` / deployment target** | Set `platform :ios, '15.1'` in your `Podfile`, then run `pod install --repo-update`. |
| **`Unicode Normalization` errors during `pod install`** | Locale isn't UTF-8: prefix command with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`. |
| **`fmt` / `consteval` compiler error (Xcode 26)** | Apply the `post_install` patch inside your Podfile, then clear DerivedData and rebuild. |
| **Native build errors after upgrading packages** | Re-run `pod install`; ensure `RCT_NEW_ARCH_ENABLED=0` is configured in the `Podfile`. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
