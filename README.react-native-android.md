# PIOPIY SDK — React Native Android Setup

**Platform:** 🤖 Android

> 🤖 **This is the Android guide.** Building for **iOS** or **Web / Electron**?
> → **[iOS guide](README.react-native-ios.md)** · **[Web & Electron guide](README.web.md)**

Use the `@telecmi/piopiy-native` React Native voice SDK in a **bare React Native** Android app to place and receive calls. It connects your app to TeleCMI so you can make and receive high-quality voice calls — to **real phone numbers**, to other agent extensions, or app-to-app.

---

## Requirements

- **Node 18+**.
- **Android Studio / Android SDK** and **JDK 17**.
- A physical Android device is recommended, though the Android emulator can use your computer's microphone.
- A TeleCMI account (**username**, **password**, **region**).

---

## 1. Install the SDK

Follow **Step 1 of the [React Native guide](README.react-native.md)** — one install
command plus a small `react-native.config.js`, then come back here for the Android
native setup.

---

## 2. Configure `AndroidManifest.xml` (permissions + ConnectionService)

Since SDK **0.25.0**, the ConnectionService declaration and the telephony
permissions **merge into your app automatically** from the SDK's bundled
call-screen module — there is nothing to hand-copy. The blocks below are the
reference for what arrives (verify with a manifest-merger report, or override
any entry with `tools:node` in your own manifest).

> [!NOTE]
> On SDK **≤ 0.24.x** you must add both blocks to
> `android/app/src/main/AndroidManifest.xml` yourself — the SDK initializes
> the native call system at `new PIOPIY(...)`, so a missing service block
> crashes at startup (the `SecurityException` shown below).

**Part 1 — permissions** (auto-merged since 0.25.0):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS" />
```

**Part 2 — the ConnectionService declaration** (auto-merged since 0.25.0).
Without it, Android's Telecom framework rejects the phone-account registration
at startup with:

```
java.lang.SecurityException: Registering a PhoneAccount requires either:
(1) The Service definition requires that the ConnectionService is guarded
with the BIND_TELECOM_CONNECTION_SERVICE ...
```

```xml
<service
  android:name="io.wazo.callkeep.VoiceConnectionService"
  android:label="@string/app_name"
  android:permission="android.permission.BIND_TELECOM_CONNECTION_SERVICE"
  android:foregroundServiceType="phoneCall|microphone"
  android:exported="true">
  <intent-filter>
      <action android:name="android.telecom.ConnectionService" />
  </intent-filter>
</service>
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

// 4. Place an outbound call to a phone number (or another extension)
// TeleCMI connects the call through to the phone network.
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

**Firebase is YOUR app's, set up explicitly** — the SDK does not bundle or
import it (iOS-only apps never touch it). The complete Android list:

1. `npm install @react-native-firebase/app @react-native-firebase/messaging`
2. `android/app/google-services.json` — from *your* Firebase project, matching your `applicationId`
3. `classpath("com.google.gms:google-services:4.4.2")` in `android/build.gradle`
4. `apply plugin: "com.google.gms.google-services"` at the bottom of `android/app/build.gradle`
5. Nothing in your manifest — the `VoiceConnectionService` declaration merges
   in from the SDK automatically. (If your manifest still carries a
   hand-copied declaration from older docs, **remove it** — a duplicate now
   fails the build with a manifest-merger conflict.)
6. `piopiy.registerBackgroundPushHandler()` — one line in `index.js`

That's the whole list — the SDK detects the installed Firebase automatically;
there is no SDK-side Firebase code to write.

Follow the **[Push Notifications guide](README.push-notifications.md)** — its
**Step 4b checklist** lists every item with the exact snippet and the symptom
you'll see if it's missing.

---

## Upgrading to 0.26.3+ (fixes answered-call silence from killed state)

`@telecmi/piopiy-native` **0.26.3** fixes two field-reported Android bugs:
calls answered while the app was **killed** connected but stayed **silent both
ways**, and an already-ended call could **ring again** minutes later (FCM
redelivery). Both fixes only take effect if the upgrade actually replaces the
old native call module, so upgrade exactly like this:

```bash
npm install @telecmi/piopiy-native@^0.26.3
rm -rf node_modules package-lock.json   # lockfile pins the OLD call module
npm install
```

Then verify — this must print **one** entry at **4.4.3 or later**:

```bash
npm ls @telecmi/react-native-callkeep
```

and rebuild the app (a JS-only reload is not enough — the fix is native).
Two follow-ups for existing installs:

- **Remove any `overrides`/`resolutions`** for `@telecmi/react-native-callkeep`
  from your `package.json` — they're no longer needed and a stale one can pin
  you to a broken version.
- **Remove any hand-copied `VoiceConnectionService`** declaration from your
  `AndroidManifest.xml` (see §2) — since callkeep 4.4.x the library declares
  it, and a duplicate fails the build with a manifest-merger conflict.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **Answered from killed state, but silent both ways** | You're on the old call module. Follow *Upgrading to 0.26.3+* above; `npm ls @telecmi/react-native-callkeep` must show 4.4.3+, then a full rebuild. |
| **A call that already ended rings again minutes later** | FCM redelivery of a stale push — fixed in SDK 0.26.3 (invites older than 45 s are dropped). Upgrade. |
| **Incoming calls stopped after an app update** | The app's **calling account** got disabled. On the phone: Settings → search "Calling accounts" (or Phone app → Settings → Calling accounts) → enable your app. One-time. |
| **Push arrives (visible in logs) but no ring UI** | Same calling-account setting as above; also confirm the notification permission was granted (Android 13+ shows the ring as a notification). |
| **No incoming calls when killed — Oppo / OnePlus / Xiaomi / vivo** | OEM battery management blocks the FCM wake-up: set the app's battery usage to **Unrestricted** and enable **Auto-start** for it. Advise your users in-app. |
| **Build fails: `Manifest merger failed` mentioning VoiceConnectionService** | Your manifest still hand-declares the service — remove it (the SDK's library manifest declares it since callkeep 4.4.x). |
| **Build fails: `No matching client found for package name`** | Your `google-services.json` doesn't contain your `applicationId` — regenerate it from your Firebase project after adding that package name. |
| **No audio on emulator** | Ensure the emulator has access to your host machine's microphone in AVD settings. |
| **`mediaFailed` event** | The microphone permission was denied. Verify app settings and prompt on login/call. |
| **Build error: minSdkVersion** | Ensure `minSdkVersion = 24` (or higher) is configured in your project's gradle build scripts. |
| **Release build crashes** | R8/ProGuard stripped WebRTC bindings. Add `-keep class org.webrtc.** { *; }` to `proguard-rules.pro`. |
| **No call audio in background** | Ensure `FOREGROUND_SERVICE` and `WAKE_LOCK` are added to your Manifest, and background routing is set up. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
