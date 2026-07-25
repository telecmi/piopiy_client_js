# PIOPIY SDK — React Native Android Setup

**Platform:** 🤖 Android

> 🤖 **This is the Android guide.** Building for **iOS** or **Web / Electron**?
> → **[iOS guide](README.react-native-ios.md)** · **[Web & Electron guide](README.web.md)**

Use the `@telecmi/piopiy-native` React Native voice SDK in a **bare React Native** Android app to place and receive calls. Under the hood, the SDK registers (via WebRTC) with the TeleCMI SBC (Session Border Controller), allowing you to make and receive high-quality voice calls to **PSTN (Public Switched Telephone Network) numbers**, custom SIP extensions, and app-to-app configurations.

---

## Requirements

- **Node 18+**.
- **Android Studio / Android SDK** and **JDK 17**.
- A physical Android device is recommended, though the Android emulator can use your computer's microphone.
- A TeleCMI / PIOPIY SBC account (**username**, **password**, **domain**).

---

## 1. Install the SDK

Follow **Step 1 of the [React Native guide](README.react-native.md)** — one install
command plus a small `react-native.config.js`, then come back here for the Android
native setup.

---

## 2. Configure Permissions

Open `android/app/src/main/AndroidManifest.xml` and declare the following permissions inside the `<manifest>` block:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

---

## 3. Request Microphone Permission at Runtime

Declaring permissions in the Manifest is not enough for Android 6.0+. You must explicitly ask the user for microphone access at runtime before connecting or placing a call:

```js
import { PermissionsAndroid } from 'react-native';

async function requestAndroidMicPermission() {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Voice calls require microphone access.',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn(err);
    return false;
  }
}
```

---

## 4. Gradle Configuration

- The bundled WebRTC engine requires **`minSdkVersion` 24+** (Android 7.0). Confirm this setting in `android/build.gradle` (or `android/app/build.gradle` depending on your React Native version).
- Build the project using **JDK 17** (the React Native 0.76+ default).

---

## 5. ProGuard / R8 Rules (Release Builds)

If you compile release builds with minification enabled, add the following line to `android/app/proguard-rules.pro` to keep WebRTC modules from being stripped:

```
-keep class org.webrtc.** { *; }
```

---

## 6. Usage

```js
import { PermissionsAndroid } from 'react-native';
import PIOPIY from '@telecmi/piopiy-native';

// 1. Initialize the client
const piopiy = new PIOPIY({ name: 'Android Agent', debug: true, ringTime: 40 });

// 2. Set up event listeners
piopiy.on('login', () => console.log('Registered with SBC'));

// Receive inbound calls
piopiy.on('inComingCall', (data) => {
  console.log('Incoming call from:', data.from);
  
  // Bind these to your Answer / Reject buttons:
  // piopiy.answer();
  // piopiy.reject();
});

piopiy.on('ringing', () => console.log('Ringing...'));
piopiy.on('answered', () => console.log('Call connected'));

// 3. Log in function (requests permission first)
async function handleLogin() {
  const hasMicPermission = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  );
  
  if (!hasMicPermission) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Microphone access is required to make calls.',
        buttonPositive: 'OK'
      }
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log('Microphone permission denied');
      return;
    }
  }

  piopiy.login('1001', 'secret', 'sbcind.telecmi.com');
}

// 4. Place an outbound call to a PSTN number (or another extension)
// The TeleCMI SBC automatically bridges this WebRTC call to the PSTN telephone network.
async function makeCall() {
  piopiy.call('13158050050');
}
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

Inbound calls ring and connect while the app is in the **foreground**. Receiving a call while the app is **backgrounded or killed** requires a high-priority **FCM** data message + **ConnectionService** — the SDK drives the call UI once wired up.

Follow the **[Push Notifications guide](README.push-notifications.md)** for the complete setup.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No audio on emulator** | Ensure the emulator has access to your host machine's microphone in AVD settings. |
| **`mediaFailed` event** | The microphone permission was denied. Verify app settings and prompt on login/call. |
| **Build error: minSdkVersion** | Ensure `minSdkVersion = 24` (or higher) is configured in your project's gradle build scripts. |
| **Release build crashes** | R8/ProGuard stripped WebRTC bindings. Add `-keep class org.webrtc.** { *; }` to `proguard-rules.pro`. |
| **No call audio in background** | Ensure `FOREGROUND_SERVICE` and `WAKE_LOCK` are added to your Manifest, and background routing is set up. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
