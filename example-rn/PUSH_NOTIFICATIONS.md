# Push Notifications (incoming calls while backgrounded / killed)

This guide finishes the native wiring for the JS push integration already added to
this example:

- [`src/pushCallService.ts`](src/pushCallService.ts) — bridges push tokens, the native call UI, and the PIOPIY SDK
- [`index.js`](index.js) — registers the FCM background handler + initialises the service
- [`App.tsx`](App.tsx) — routes login / answer / reject through the service

> **Foreground calls already work without any of this.** Push is only needed to
> receive a call when the app is **backgrounded or killed** — the SDK's WebSocket
> registration dies there, so the SBC wakes the device with a push, the app
> re-registers, and the SIP INVITE is then delivered.

## How it fits together

```
token   → piopiy.registerToken({provider, token})   (after login; SBC stores it, RFC 8599)
call     → SBC sees device offline → sends VoIP push (iOS) / FCM data (Android)
push     → OS wakes the app → CallKeep shows the native incoming-call UI
         → service re-registers PIOPIY so the INVITE can arrive
INVITE   → piopiy 'inComingCall' (correlated to the CallKeep call)
answer   → CallKit/ConnectionService 'answerCall' → piopiy.answer()
```

**Prerequisite (server side):** the TeleCMI SBC must already send a push when a
call arrives for an offline device. Your SBC reads the `pn-provider` / `pn-prn`
params the SDK puts on the REGISTER Contact and targets the stored token; it sets
the APNs topic from its own push-credential config. This guide is the **device**
half only.

---

## 1. Install

```bash
# from example-rn/
npm install
cd ios && pod install && cd ..    # iOS only
```

Packages added to `package.json`: `react-native-callkeep`,
`react-native-voip-push-notification`, `@react-native-firebase/app`,
`@react-native-firebase/messaging`, `@react-native-async-storage/async-storage`.

---

## 2. iOS — PushKit (VoIP push) + CallKit

iOS uses **PushKit** for VoIP, not FCM. Apple requires that **every** VoIP push
report a CallKit call in the same run loop — the native code below does that, then
hands the payload to JS.

### 2a. Xcode capabilities

Open `ios/PiopiyRNExample.xcworkspace` → target → **Signing & Capabilities**:

- Add **Push Notifications**.
- Add **Background Modes** → check **Voice over IP** and **Audio, AirPlay, and Picture in Picture**.
  (Already declared in `Info.plist`: `UIBackgroundModes = audio, voip`.)

### 2b. AppDelegate — PushKit hooks

`ios/PiopiyRNExample/AppDelegate.h` — add the PushKit delegate:

```objc
#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <PushKit/PushKit.h>

@interface AppDelegate : RCTAppDelegate <PKPushRegistryDelegate>
@end
```

`ios/PiopiyRNExample/AppDelegate.mm` — add the imports and register VoIP, then
add the two PushKit delegate methods:

```objc
#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"
#import <PushKit/PushKit.h>

// Inside didFinishLaunchingWithOptions, BEFORE `return [super application:...]`:
  // Native setup lets CallKeep queue Answer/End taps that happen before JS starts.
  [RNCallKeep setup:@{
    @"appName": @"PiopiyRNExample",
    @"supportsVideo": @NO,
  }];
  [RNVoipPushNotificationManager voipRegistration];

// --- PushKit delegate methods (add to the @implementation) ---

- (void)pushRegistry:(PKPushRegistry *)registry
didUpdatePushCredentials:(PKPushCredentials *)credentials
             forType:(PKPushType)type
{
  // VoIP token → JS ('register' event) → piopiy.registerToken(...)
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry
didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type
withCompletionHandler:(void (^)(void))completion
{
  NSString *uuid = payload.dictionaryPayload[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *handle = payload.dictionaryPayload[@"from"] ?: @"Unknown";
  NSString *name = payload.dictionaryPayload[@"from"] ?: @"Incoming call";

  // REQUIRED by iOS 13+: report a CallKit call synchronously for every VoIP push.
  [RNCallKeep reportNewIncomingCall:uuid
                             handle:handle
                         handleType:@"generic"
                           hasVideo:NO
                localizedCallerName:name
                    supportsHolding:YES
                       supportsDTMF:YES
                   supportsGrouping:YES
                 supportsUngrouping:YES
                        fromPushKit:YES
                            payload:payload.dictionaryPayload
              withCompletionHandler:completion];

  // Hand the payload to JS ('notification' event) so the service re-registers PIOPIY.
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
}
```

### 2c. APNs key (for the SBC)

- Give your SBC/push-gateway team an **APNs Auth Key (.p8)** (or VoIP cert) configured
  for this app. The SBC sets the VoIP topic (`<your.bundle.id>.voip`) from that
  push-credential config — so the client sends only `pn-provider=apns` +
  `pn-prn=<voip token>` on the REGISTER, no `pn-param` needed.
- If your SBC instead expects the topic from the client, pass it via
  `registerToken({provider: 'apns', token, param: '<bundle>.voip'})`.

> The iOS Simulator cannot receive VoIP pushes — test on a real device.

---

## 3. Android — FCM (high-priority data message) + ConnectionService

### 3a. Firebase project

1. Create / open a Firebase project, add an Android app with package
   **`com.piopiyrnexample`** (match your `applicationId`).
2. Download **`google-services.json`** → place it at
   `android/app/google-services.json`.

### 3b. Gradle

`android/build.gradle` (buildscript → dependencies):

```gradle
classpath("com.google.gms:google-services:4.4.2")
```

`android/app/build.gradle` (top, after the other `apply plugin` lines):

```gradle
apply plugin: "com.google.gms.google-services"
```

### 3c. Push payload must be **data-only + high priority**

To wake a killed app through
[`messaging().setBackgroundMessageHandler`](index.js), the SBC must send a
**data** message (no `notification` block) with `priority: "high"`. Include at
least:

```json
{ "data": { "uuid": "<server-generated-uuid>", "from": "+13158050050" }, "android": { "priority": "high" } }
```

The FCM token reaches the SBC as `pn-provider=fcm`, `pn-prn=<fcm token>` on the
REGISTER (the service calls `registerToken` after login).

---

## 4. What the SBC should put in the push payload

Both platforms read these keys (see `onIncomingPush` in the service):

| Key | Purpose |
| :--- | :--- |
| `uuid` | Stable call id — used for the CallKit/ConnectionService call so it correlates with the later INVITE. Generate it server-side. |
| `from` | Caller id shown on the native call screen before the INVITE arrives. |

---

## 5. Test

1. `npm run ios` / `npm run android` on a **real device**, log in.
2. **Foreground:** call the extension → native call UI + in-app banner appear.
3. **Background:** background the app, call → the OS shows the system incoming-call screen.
4. **Killed:** swipe the app away, call → it should still ring (this is the whole point).

Watch the on-screen **Event log** (push/CallKeep lines are surfaced there) and
`adb logcat` / Xcode console for `[pushCall]` lines.

---

## 6. Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| iOS: no VoIP push | Real device only; Push Notifications + VoIP background mode enabled; the SBC's APNs key valid for this app's `.voip` topic. |
| iOS: app killed after a push | You must report a CallKit call for **every** VoIP push (the AppDelegate code does this). Don't skip it. |
| Android: killed app never rings | The push must be **data-only + high priority** (not a `notification` message), or the OS won't run the background handler. |
| Android: no incoming UI | Grant the notifications permission; on some OEMs enable "display over other apps" / disable battery optimization for the app. |
| Re-register after wake fails | The service re-logs-in from credentials saved in AsyncStorage (see the **security note** in the service — use Keychain/Keystore in production). |
| Call rings but no audio after answer | iOS: start/route audio only after `didActivateAudioSession`. Confirm `react-native-incall-manager` is installed. |
