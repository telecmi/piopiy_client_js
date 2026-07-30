# PIOPIY SDK — Push Notifications Guide

**Platform:** 📱 React Native (iOS & Android)

This guide walks you through integrating push notifications with the PIOPIY React Native SDK (`@telecmi/piopiy-native`).

Setting up push notifications is **required** to receive incoming calls when your application is **backgrounded or completely killed**.

> [!IMPORTANT]
> **TeleCMI hosts the entire push + media infrastructure.** You do **not** run or
> configure any push server, media server, or call-routing gateway, and you
> never set a media URL — the call's connection details are delivered **inside the
> push** and handled by the SDK automatically.
>
> Your responsibilities are only:
> 1. **Upload your push credentials to the [Connly dashboard](https://connle.telecmi.com)** — your Apple **APNs auth key** (`.p8`) for iOS and your Firebase **FCM service account** JSON for Android (see *Getting your push credentials* below). TeleCMI uses these to send the wake-up push to your devices.
> 2. **Do the native wiring** in this guide (PushKit/CallKit on iOS, FCM + ConnectionService on Android).
> 3. **Forward received pushes** to `handleIncomingPush()`.
>
> The device push token is fetched and registered **automatically** by the SDK —
> you don't write any token code. No `wss://` URLs, no server hostnames, no
> network config either; those are TeleCMI's side.

---

## Getting your push credentials

You generate these once from Apple and Google, then upload them in the
[Connly dashboard](https://connle.telecmi.com) → Push Notifications. You never
paste them into your app.

| Platform | What to generate | Where |
| :--- | :--- | :--- |
| **iOS** | An **APNs Auth Key** (`.p8`) + its Key ID and your Team ID | [Apple Developer](https://developer.apple.com) → Certificates, Identifiers & Profiles → **Keys** → create a key with **Apple Push Notifications service (APNs)** enabled |
| **Android** | A Firebase **service account** JSON | [Firebase Console](https://console.firebase.google.com) → Project settings → **Service accounts** → *Generate new private key*. (You also add `google-services.json` to your app — see Step 4b.) |

Upload the `.p8` (with Key ID + Team ID) and the service-account JSON on the
Connly dashboard for your app. Once they're in, TeleCMI can wake your devices —
nothing else about the push server is yours to configure.

---

## How it works

1. **Foreground**: The SDK keeps a live connection to TeleCMI. Incoming calls trigger the `inComingCall` event directly—**no push notifications needed**.
2. **Background / Killed**: The OS terminates background WebSockets. When a call arrives, the TeleCMI platform detects the device is offline and sends a high-priority push (VoIP Push via APNs on iOS, FCM on Android) using the certificates you submitted on the portal. The push carries everything the SDK needs to connect the call.
3. **App Wakeup**: The push wakes your app; the SDK instantly displays the native incoming-call UI (CallKit/ConnectionService), connects the call using the details in the push, and fires the `inComingCall` event.

---

## What you need — iOS vs Android

Push uses a **different transport per platform**, so the native setup differs:

| | iOS | Android |
| :--- | :--- | :--- |
| **Incoming-call UI** | CallKit — via the SDK's bundled `@telecmi/react-native-callkeep` *(driven automatically)* | ConnectionService — same bundled module |
| **Push transport** | VoIP Push / **PushKit** — `react-native-voip-push-notification` | **FCM** — `@react-native-firebase/app` + `@react-native-firebase/messaging` |
| **Firebase** | ❌ **Not used** — never installed, never imported | ✅ Required — **your app installs** `@react-native-firebase/app` + `/messaging`, adds `google-services.json` + the gradle plugin, and passes the module to the SDK (Step 4b) |
| **WebRTC / audio** | WebRTC engine bundled in `@telecmi/piopiy-native`; `react-native-incall-manager` for routing | same |
| **Native wiring** | AppDelegate PushKit + Push/VoIP capabilities + `Info.plist` background modes | FCM background handler + manifest permissions |

> **Key point:** iOS receives calls via **PushKit**, not Firebase. Installing
> `@react-native-firebase` for Android also pulls its CocoaPods into the iOS build,
> which fails with `Module 'FirebaseCore' not found`. Step 4a shows how to exclude it.

---

## Integration Steps

```
Step 1: Install Peer Libraries
  └── Step 2: Register/Unregister Push Tokens in JS
        └── Step 3: Implement the Shared Push & Call Service
              ├── Step 4a: Configure iOS Native Wiring (PushKit + CallKit)
              └── Step 4b: Configure Android Native Wiring (FCM + ConnectionService)
```

---

## Step 1: Install Peer Libraries

One command — the SDK plus the native push and telephony libraries:

```bash
npm install @telecmi/piopiy-native
```

The SDK ships its own call stack — the WebRTC engine, the native call-screen
module (`@telecmi/react-native-callkeep`), audio routing
(`react-native-incall-manager`), and iOS VoIP push
(`react-native-voip-push-notification`). Register these bundled modules once in
`react-native.config.js` (Step 4a · 0).

**Android push additionally requires Firebase — installed by YOUR app,
explicitly** (it is your Firebase project: your `google-services.json`, your
gradle plugin, your version choice — the SDK deliberately does not bundle it):

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

…then complete the **Step 4b checklist** (credentials, gradle, manifest, and
passing the module to the SDK). **iOS-only apps skip Firebase entirely** — the
SDK never imports it.

> [!NOTE]
> **Storage is your choice.** The SDK does not require any storage library. If
> you want to persist credentials so a killed-state push can re-login, add one
> yourself — e.g. `react-native-keychain` (recommended for credentials) or
> `@react-native-async-storage/async-storage`. Pin whichever you pick to a
> version compatible with your React Native release.

Then add the `react-native.config.js` from **Step 4a · 0** and install the iOS pods. Use the project's **bundler** (the system `pod` can crash on
newer macOS with `ffi`/Unicode errors) and a UTF-8 locale:

```bash
cd ios
bundle install
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
cd ..
```

> `@react-native-firebase` is for **Android FCM only**. It also tries to build on iOS and
> fails — you must exclude it from iOS first (**Step 4a · 0**) before `pod install`.

---

## Step 2: Push tokens — handled for you

**There is nothing to write here.** The SDK fetches this device's push token
(PushKit on iOS, FCM on Android), registers it with TeleCMI after `login()`, and
re-registers automatically whenever the OS rotates the token:

```javascript
const piopiy = new PIOPIY({ name: 'Mobile Agent' });   // autoPushToken is on by default
piopiy.login(userId, password, region);                 // token registered automatically
```

Listen for `pushRegistered` if you want to confirm it happened:

```javascript
piopiy.on('pushRegistered', (res) => console.log('device ready for push calls', res));
```

### Managing the token yourself (optional)

Set `autoPushToken: false` and call `registerToken()` when you have a token —
useful if your app already owns the push lifecycle:

```javascript
const piopiy = new PIOPIY({ name: 'Mobile Agent', autoPushToken: false });
piopiy.registerToken({ provider: 'apns', token, platform: 'ios' });
```

* **Timing-safe**: calling it before login completes is fine — it's **queued** and sent once login finishes.
* **No URL or backend to configure** — the endpoint is TeleCMI's hosted REST, built into the SDK.
* An optional **`callback`** receives the response — `{ code: 200, ... }` on success, or an error code (`1006` = bad args, `1007` = request failed).
* `unregisterToken(callback?)` removes the token.

> [!TIP]
> **`logout()` already does this for you.** Signing out unregisters the device's
> push token before tearing down the session, so a signed-out device stops being
> woken for calls. Pass a callback if you want to observe it:
> ```javascript
> piopiy.logout(res => console.log('push unregistered', res));
> ```

### `PiopiyPushOptions` Schema (for manual registration)

| Property | Type | Description |
| :--- | :--- | :--- |
| `provider` | `string` | Push service provider: `'apns'` for iOS VoIP, `'fcm'` for Android. |
| `token` | `string` | The native device push token. |
| `platform` | `string` | *(Optional)* `'ios'` or `'android'`. |

---

## Step 3: The call service (JS) — smaller than you expect

Everything push-related is inside the SDK: it fetches and registers the device
token, forwards received call pushes to itself, shows the native call UI, and
wires Answer/Reject back to the call. Your service is just: create the client,
sign in, listen to events.

```javascript
// src/callService.js
import { Platform } from 'react-native';
import PIOPIY from '@telecmi/piopiy-native';

export const piopiy = new PIOPIY({
  name: 'Mobile Agent',
  debug: true,
  callKeep: { ios: { appName: 'YourAppName' } },
  // Android push (FCM): your app's Firebase module — see Step 4b checklist.
  // iOS-only apps omit this line (and never install Firebase).
  messaging: Platform.OS === 'android'
    ? require('@react-native-firebase/messaging').default
    : undefined,
});

piopiy.on('inComingCall', (call) => {
  // Native UI is already ringing; update your in-app UI here.
  // call.from (number) · call.name (resolved caller name) · call.team_name
});
piopiy.on('answered', () => console.log('call connected'));
piopiy.on('ended', () => console.log('call ended'));
piopiy.on('missedCall', (m) => console.log('missed call from', m.from));
```

Plus **one line in `index.js`** so Android background/killed wake-ups reach the
SDK (the OS runs `index.js` headlessly to deliver them — this must be at module
scope, before `AppRegistry.registerComponent`). It is a safe no-op on iOS,
where wake-ups arrive natively via PushKit:

```javascript
// index.js
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {piopiy} from './src/callService';

piopiy.registerBackgroundPushHandler();   // Android killed/background wake-ups

AppRegistry.registerComponent(appName, () => App);
```

> [!NOTE]
> **Forwarding pushes manually?** Apps built on older SDK versions call
> `piopiy.handleIncomingPush(data)` from their own push listeners. That keeps
> working — the SDK dedupes double deliveries — but new apps don't need any of
> it.

---

## Step 4a: Configure iOS Native Wiring (PushKit + CallKit)

### 0. Create `react-native.config.js` (required)
One file at your **project root**, doing two required jobs:

1. **Registers the SDK's bundled audio/WebRTC engine** for autolinking.
   Autolinking only scans your app's *direct* dependencies, so it can't see an
   engine that ships inside the SDK. Without these two lines the app builds but
   calls fail at runtime with *"WebRTC engine could not be loaded"*. You don't
   install these packages — they arrive with the SDK.
2. **Keeps your Firebase packages off the iOS build** — iOS uses PushKit, not
   FCM, and without this the iOS build fails with `Module 'FirebaseCore' not found`.

```javascript
// react-native.config.js
module.exports = {
  dependencies: {
    // 1. the SDK's bundled engine and call UI — required for calls to work.
    //    These arrive WITH the SDK; you never install them yourself.
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    '@telecmi/react-native-callkeep': {},
    'react-native-incall-manager': {},
    'react-native-voip-push-notification': {},
    // 2. Firebase is Android-only here — exclude it from iOS
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};
```

Also make sure your JS never *loads* Firebase on iOS: lazy-`require` it only on Android
(see the guarded `index.js` in Step 4b and the Android branch of your service), instead
of a top-level `import`. Then re-run `bundle exec pod install` — the Firebase pods drop
out of the iOS project (`Removing FirebaseCore, RNFBMessaging, …`).

### 1. Xcode Capabilities
Open your workspace in Xcode, go to target settings → **Signing & Capabilities**:
* Add **Push Notifications**.
* Add **Background Modes** and check **Voice over IP** and **Audio, AirPlay, and Picture in Picture**.

### 2. Configure `Info.plist`
Declare the microphone usage description and background modes:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for making and receiving voice calls.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

### 3. Update `AppDelegate.h`
Add the PushKit registry delegate declaration:
```objc
#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <PushKit/PushKit.h>

@interface AppDelegate : RCTAppDelegate <PKPushRegistryDelegate>
@end
```

### 4. Update `AppDelegate.mm`
Register VoIP notifications and relay the PushKit payload to React Native CallKeep and your JS code:
```objc
#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"
#import <PushKit/PushKit.h>

// Inside didFinishLaunchingWithOptions, before `return [super application:...];`:
// Native setup lets CallKeep queue Answer/End taps that happen before JS starts.
[RNCallKeep setup:@{
  @"appName": @"YourAppName",
  @"supportsVideo": @NO,
}];
[RNVoipPushNotificationManager voipRegistration];

// Add the delegate methods inside your @implementation AppDelegate:

- (void)pushRegistry:(PKPushRegistry *)registry
didUpdatePushCredentials:(PKPushCredentials *)credentials
             forType:(PKPushType)type
{
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry
didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type
withCompletionHandler:(void (^)(void))completion
{
  NSString *uuid = payload.dictionaryPayload[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *caller = payload.dictionaryPayload[@"from"] ?: @"Incoming call";
  // {type:"cancel_call"}: the caller hung up while this device was still
  // ringing (sent with the SAME uuid as the invite push).
  BOOL isCancel = [payload.dictionaryPayload[@"type"] isEqual:@"cancel_call"];

  if (isCancel) {
    // iOS 13+ requires reporting a call for EVERY VoIP push, so report first,
    // then end INSIDE the completion (never racing ahead of the report). This
    // dismisses the still-ringing invite call — it shares the same uuid.
    // 2 = CXCallEndedReasonRemoteEnded.
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"generic"
                             hasVideo:NO
                  localizedCallerName:caller
                      supportsHolding:YES
                         supportsDTMF:YES
                     supportsGrouping:YES
                   supportsUngrouping:YES
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:^{
      [RNCallKeep endCallWithUUID:uuid reason:2];
      completion();
    }];
  } else {
    // Synchronously report to CallKit (iOS 13+ requirement for EVERY VoIP push)
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"generic"
                             hasVideo:NO
                  localizedCallerName:caller
                      supportsHolding:YES
                         supportsDTMF:YES
                     supportsGrouping:YES
                   supportsUngrouping:YES
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:completion];
    // NATIVE ring-timeout backstop. The SDK already bounds ringing from JS
    // (ringTime, default 40 s), but iOS parks the JS thread shortly after a
    // background wake — if the device also lost its connection, the server's
    // cancel push can never arrive and the JS timer never fires. A native
    // timer keeps ticking regardless. Keep it a few seconds ABOVE ringTime so
    // the JS timer handles the normal case. isCallActive is NO while still
    // ringing; 3 = CXCallEndedReasonUnanswered (logged as a missed call).
    NSString *ringUuid = [uuid copy];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(45 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (![RNCallKeep isCallActive:ringUuid]) {
        [RNCallKeep endCallWithUUID:ringUuid reason:3];
      }
    });
  }

  // Relay the notification to JS
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
}
```

> [!NOTE]
> **Customising the CallKit in-call buttons.** The `supports*` / `hasVideo` flags
> in `reportNewIncomingCall` map to `CXCallUpdate` capabilities and control which
> buttons the native call screen shows:
> - `hasVideo:NO` + `supportsVideo:false` (in `RNCallKeep.setup`) → hides the **FaceTime/video** button
> - `supportsDTMF:NO` → hides the **keypad/dialpad** button (you can still send DTMF programmatically via the SDK's `sendDtmf()`)
> - `supportsGrouping:NO` + `supportsUngrouping:NO` → hides the **add-call/merge** button
>
> Set these to `NO` for a stripped-down 1:1 call screen. The CallKit button grid
> itself is system-rendered — you can only enable/disable these documented
> capabilities, not add or fully restyle buttons.

---

## Step 4b: Configure Android Native Wiring (FCM + ConnectionService)

Everything Android needs, as one explicit checklist — each item is detailed in
the numbered sections below. The npm install brings all *code* (Firebase
included); these are the **project files you must touch**:

| # | What | File | Missing it looks like |
| :--- | :--- | :--- | :--- |
| 0 | `npm install @react-native-firebase/app @react-native-firebase/messaging` | `package.json` | app fails to bundle (the `messaging` require in your service can't resolve) |
| 0b | Pass the module to the SDK: `messaging: Platform.OS === 'android' ? require('@react-native-firebase/messaging').default : undefined` in `new PIOPIY({…})` | your call service | SDK logs `Android push needs Firebase: install … and pass the module` |
| 1 | `google-services.json` from your Firebase project (package name must match your `applicationId`) | `android/app/google-services.json` | no FCM token; SDK logs `FCM getToken failed — No Firebase App '[DEFAULT]'` |
| 2 | Google services **classpath** | `android/build.gradle` | plugin below can't apply |
| 3 | Google services **plugin** | `android/app/build.gradle` (bottom) | no FCM token, same log as #1 |
| 4 | Permissions block | `android/app/src/main/AndroidManifest.xml` | mic/notification failures at runtime |
| 5 | CallKeep `VoiceConnectionService` declaration | same manifest, inside `<application>` | startup red box: `SecurityException: Registering a PhoneAccount…` |
| 6 | `react-native.config.js` (Step 4a · 0 — shared with iOS) | project root | native modules missing at runtime |
| 7 | One line in `index.js`: `piopiy.registerBackgroundPushHandler()` | `index.js` | calls only ring while the app is open |
| 8 | *(first run, on-device)* enable the app's **calling account** if prompted — Settings → Calls → Calling accounts | device setting | push arrives (log shows it) but no call UI appears |

Verify #1–#3 took effect: after a rebuild and sign-in, the app log shows
`registering fcm …` followed by `push token registered`.

### 1. Firebase Credentials
Place your `google-services.json` at `android/app/google-services.json`.

### 2. Gradle Setup
In `android/build.gradle` (buildscript dependencies):
```gradle
classpath("com.google.gms:google-services:4.4.2")
```
In `android/app/build.gradle` (add at the bottom):
```gradle
apply plugin: "com.google.gms.google-services"
```

### 3. Update `AndroidManifest.xml`
Ensure permissions and ConnectionService options are present:
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

You must also declare CallKeep's `ConnectionService` **inside `<application>`** —
it is NOT merged from the library manifest, and without the
`BIND_TELECOM_CONNECTION_SERVICE` guard Android's Telecom framework rejects the
PhoneAccount registration at startup
(`SecurityException: Registering a PhoneAccount requires either: (1) …
BIND_TELECOM_CONNECTION_SERVICE …`):

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

> [!NOTE]
> The Firebase messaging service (unlike the ConnectionService) IS merged
> automatically from its library manifest via React Native autolinking.

### 4. Show the in-call UI over the lock screen (`MainActivity`)

When a call is answered on a **locked** phone, Android keeps your Activity behind
the keyguard — the audio connects but the RN in-call screen only appears after
the user unlocks. Flag `MainActivity` so it may show over the lock screen and
wake the display (`android/app/src/main/java/<pkg>/MainActivity.kt`):

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
      .requestDismissKeyguard(this, null)
  } else {
    @Suppress("DEPRECATION")
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
    )
  }
}
```

(Add the matching imports: `android.app.KeyguardManager`, `android.content.Context`,
`android.os.Build`, `android.os.Bundle`, `android.view.WindowManager`.)

> [!NOTE]
> **You don't configure any call/media URL.** TeleCMI serves the media over
> secure `wss://` and delivers the connection details inside the push — the SDK
> connects the call automatically. There's no cleartext/network-security config
> to add for production. (The `network_security_config.xml` you may see in the
> example app is only a convenience for pointing the example at a local dev
> server during SDK development; a normal integration doesn't need it.)

### 4. Background Message Handler (JS Entrypoint)

One SDK call at the top of `index.js` (module scope, before App registry) —
the OS runs this file headlessly to deliver a push while the app is
backgrounded or killed:

```javascript
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { piopiy } from './src/callService';

piopiy.registerBackgroundPushHandler();   // Android wake-ups; no-op on iOS

AppRegistry.registerComponent(appName, () => App);
```

No Firebase imports in your code — the SDK handles the messaging library
internally, and degrades gracefully (a log line, no crash) if
`google-services.json` is missing.

> [!WARNING]
> Android requires the push payload sent by the server to be **data-only** (i.e. containing a `"data"` object, but **no** `"notification"` block) with **high priority**. If a notification block is present, the OS will handle it instead of calling your background JS code.

### 5. The native call screen ships with the SDK — nothing to install or patch

The SDK bundles **`@telecmi/react-native-callkeep`** (upstream
react-native-callkeep 4.3.16 plus the fix for a startup crash on React
Native 0.76+'s New Architecture). It arrives automatically with
`@telecmi/piopiy-native`; the `react-native.config.js` entry from
**Step 4a · 0** registers it for autolinking, and that's all.

> [!WARNING]
> Do **not** also install `react-native-callkeep` in your app — two copies of
> the same native module collide at `pod install` (duplicate `RNCallKeep` pod)
> and in the Android build (duplicate `io.wazo.callkeep` classes). Upgrading
> from an older setup that installed and patched it? Remove all of:
> `npm uninstall react-native-callkeep patch-package`, delete
> `patches/react-native-callkeep*.patch`, and drop the `postinstall` script.

---

## Push payloads: invite, cancel, and the ring timeout

Hand every call push straight to the SDK — it understands both payload shapes:

```javascript
// invite: {uuid, room, token, url?, from?, name?, team?}
//         → rings (emits 'inComingCall' with from / name / team_name).
//           The native call screen shows "name — team", falling back to
//           the number when either is absent.
// cancel: {type: 'cancel_call', uuid}
//         → caller hung up pre-answer; dismisses the ringing CallKit UI
piopiy.handleIncomingPush(pushData);
```

The server sends `cancel_call` (same `uuid` as the invite) when the caller hangs
up while the device is still ringing, so the phone stops ringing instead of
ringing into a dead room.

**Missed-call notifications are local — no server push needed.** When a ringing
call ends without the user acting on it (caller cancelled, or the ring timed
out), the SDK emits `missedCall`:

```javascript
piopiy.on('missedCall', ({ uuid, from, reason }) => {
  // reason: 'cancelled' (caller hung up) | 'ring_timeout' (e.g. device offline)
  // Show a local notification with your notification library, e.g. notifee:
  notifee.displayNotification({
    title: 'Missed call',
    body: `Missed call from ${from ?? 'unknown'}`,
  });
});
```

A deliberate user **reject does not** emit `missedCall`. On iOS, CallKit
additionally logs the missed call in the Phone app's Recents automatically.

**Ring timeout.** If the device loses its network right after the invite push,
the cancel push can never arrive. The SDK bounds ringing with `ringTime`
(constructor option, **default 40 s**) — after that the pending call is ended
and logged as missed. On iOS also keep the native backstop from Step 4a
(45 s `dispatch_after`): iOS parks the JS thread shortly after a background
wake, so only a native timer is guaranteed to fire in the killed/locked case.

---

## Step 5: Testing Push Configuration

1. **Foreground Test**: Connect the SDK, place an inbound call, and verify it fires the `inComingCall` event.
2. **Background Test**: Press the home button to background the app. Place an inbound call. Verify the native CallKit/ConnectionService screen appears and you can answer.
3. **Terminated Test**: Swipe the app away to kill it. Place an inbound call. Verify the device wakes up, shows the native incoming call UI, and successfully bridges audio.
4. **Caller-Cancel Test**: Ring the device (background/killed), hang up from the caller side before answering. The ringing UI should dismiss within ~1–2 s.
5. **Offline Ring Test**: Ring the device, then enable airplane mode while it rings. Ringing must stop at `ringTime` (40 s; up to 45 s on a locked/killed iPhone via the native backstop).

---

## Troubleshooting

| Symptom | Resolution |
| :--- | :--- |
| **iOS: Call screen shows but app crashes** | iOS terminates apps that fail to report a CallKit call synchronously inside `didReceiveIncomingPushWithPayload`. Ensure `[RNCallKeep reportNewIncomingCall:...]` is executed immediately. |
| **Android: Headless task doesn't fire when killed** | Verify that the FCM payload is data-only (no `notification` object in JSON) and has `priority: "high"`. |
| **Android (New Architecture): `Unable to parse @ReactMethod annotations… Module exports two methods to JavaScript with the same name: "displayIncomingCall"`** | You have the upstream `react-native-callkeep` installed alongside the SDK's bundled `@telecmi/react-native-callkeep` (which already contains the fix). Remove the upstream package and any patch-package leftovers — see **Step 4b · 5**. |
| **Android: red box at startup — `Registering a PhoneAccount requires either: (1) … BIND_TELECOM_CONNECTION_SERVICE …`** | The CallKeep `ConnectionService` is missing from *your app's* `AndroidManifest.xml` — it is NOT merged from the library. Add the `<service android:name="io.wazo.callkeep.VoiceConnectionService" …>` block from **Step 4b · 3**. |
| **Call connects but there is no audio** | Check that `react-native-incall-manager` is correctly installed. On iOS, make sure the audio session is activated through CallKit's `didActivateAudioSession` event before routing media. |
| **iOS build: `Module 'FirebaseCore' not found`** | Firebase is Android-only here. Exclude `@react-native-firebase` from iOS via `react-native.config.js` (**Step 4a · 0**), guard your JS Firebase calls to Android, then re-run `bundle exec pod install`. |
| **`pod install` crashes — `ffi` extension / Unicode Normalization error** | The system CocoaPods/Ruby is broken on newer macOS. Run via the project's bundler with a UTF-8 locale: `bundle install && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install`. |
| **iOS crash on launch mentioning Firebase / `GoogleService-Info.plist`** | You loaded Firebase on iOS. It's Android-only — exclude it (**Step 4a · 0**) and lazy-`require` it only in your `Platform.OS === 'android'` branches. |

---

## License
Apache-2.0 © [TeleCMI](https://telecmi.com)
