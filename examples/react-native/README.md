# PIOPIY React Native Example (iOS & Android)

A complete calling app on
[`@telecmi/piopiy-native`](https://www.npmjs.com/package/@telecmi/piopiy-native):
sign in, dial out, and receive calls on the native call screen — including
push wake-ups when the app is backgrounded or killed. The app imports exactly
three things (`react`, `react-native`, the SDK) and contains **zero push code**.

## Prerequisites

- A working React Native dev environment ([official guide](https://reactnative.dev/docs/set-up-your-environment))
- A **physical device** for push calls (simulators can't receive VoIP/FCM pushes)
- A TeleCMI agent id + password, with push credentials uploaded on the
  [Connly dashboard](https://connle.telecmi.com) (APNs `.p8` for iOS, FCM
  service account for Android — see the [push guide](../../README.push-notifications.md))

## 1. Install

```bash
npm install
```

## 2. iOS — run it

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

Open `ios/PiopiyExample.xcworkspace` in Xcode (the **workspace**, not the
project — it only exists after `pod install`):

1. Target **PiopiyExample** → Signing & Capabilities → select your **Team**
2. **+ Capability → Push Notifications** (without it, no incoming calls — and
   the failure is silent apart from the SDK's 10-second warning log)
3. Set your own **Bundle Identifier** (it must match an App ID with Push
   Notifications enabled in your Apple developer account)

Then:

```bash
npx react-native run-ios --device
```

## 3. Android — run it

1. Register your `applicationId` (see `android/app/build.gradle`) as an
   Android app in **your Firebase project** and download `google-services.json`
   into `android/app/` (not committed — every integrator uses their own).
   The Firebase packages themselves are already in `package.json`, and the
   gradle wiring (classpath + plugin) is already in place — see the
   [Android checklist](../../README.push-notifications.md) for what each piece does.
2. Run:

```bash
npx react-native run-android
```

3. First run: if a call push arrives but no call UI shows, enable the app's
   **calling account** — Settings → Calls → Calling accounts → PiopiyExample.

## 4. Try it

1. **Sign in** — the log pane shows the SDK registering the device push token
   (you wrote no code for that)
2. **Call out** — enter a number, tap Call
3. **Call the agent** from another phone — Answer/Reject in-app when
   foregrounded, native call screen when backgrounded or killed
4. **Sign out** — the token unregisters; the device stops ringing

## Where to look in the code

| File | Shows |
| :--- | :--- |
| [`src/callService.ts`](src/callService.ts) | the entire SDK integration — client, sign-in, typed events |
| [`App.tsx`](App.tsx) | UI — every button is one SDK call (`answer()`, `reject()`, `speaker()`, …) |
| [`index.js`](index.js) | one line for Android background wake-ups |
| [`react-native.config.js`](react-native.config.js) | registers the SDK's bundled native modules |

Guides: [React Native setup](../../README.react-native.md) ·
[iOS](../../README.react-native-ios.md) ·
[Android](../../README.react-native-android.md) ·
[Push notifications](../../README.push-notifications.md)
