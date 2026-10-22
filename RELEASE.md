# Releasing the self-managed voice work

`@telecmi/piopiyjs` here is the source of truth for the React Native SDK
(`@telecmi/piopiy-native`, built `src/` → `lib/` → `native-pkg/`).

Making inbound voice a **self-managed** call (app-owned ring/in-call UI,
foreground audio, no system InCall UI) also needs changes in **two other
modules**. Their full, modified source is checked into `vendor/` — real files,
not patches. Copy them into the respective module repos, or use them directly.

## `vendor/react-native-callkeep` → `@telecmi/react-native-callkeep` (the CallKeep fork)

Full replacement files (same relative paths as the package):

```
android/src/main/java/io/wazo/callkeep/Constants.java
android/src/main/java/io/wazo/callkeep/RNCallKeepModule.java
android/src/main/java/io/wazo/callkeep/VoiceConnection.java
android/src/main/java/io/wazo/callkeep/VoiceConnectionService.java
android/src/main/java/io/wazo/callkeep/IncomingCallNotification.java
android/src/main/java/io/wazo/callkeep/IncomingCallActivity.java
android/src/main/java/io/wazo/callkeep/InCallReactSurface.java
android/src/main/java/io/wazo/callkeep/IncomingCallActionReceiver.java
index.js
```

What changed:
- Per-call **`selfManaged`** flag, independent of `hasVideo` (`EXTRA_SELF_MANAGED`), so voice can be self-managed while video still keys off `hasVideo`.
- Per-type React component name carried natively (`voiceInCallComponent` / `videoInCallComponent` defaults `PiopiyInCallShell` / `ConnleInCallShell`).
- `displayIncomingCallWithOptions(uuid, number, name, hasVideo, selfManaged)` — the single JS-facing method (New-Architecture-safe: unique name, no `Bundle` param, no overloads).
- Managed-account “Calling accounts” prompt suppressed when `selfManaged` / `selfManagedVoice`, and on request with **`skipAccountAlert: true`** — for apps whose calls all use the self-managed account (e.g. per-call `selfManaged` by `hasVideo`), where the managed account stays registered but unused. Skipping it also skips CallKeep's bundled runtime-permission request, so the app must request media permissions itself (`ensureMediaPermissions()` / `ensureCallPermissions()`).
  - Consumers that ring self-managed per call should pass it: `@telecmi/connle-video-native` now sets `skipAccountAlert: true` in its `RNCallKeep.setup()` (it previously showed *“This application needs phone-account access to show incoming calls”* on first launch even though none of its calls use the managed account).
- **Call teardown no longer depends on the managed “calling account” toggle** (`RNCallKeepModule`). `endCall()` / `endAllCalls()` / `rejectCall()` / `setConnectionState()` / `onHostDestroy()` used to bail out when the *managed* account was disabled in Settings — but a **self-managed** call (per-call `selfManaged`, `selfManagedVoice`) works fine while that account is off, so the Telecom connection was never disconnected. The connection’s own existence is the condition now (a self-managed account is enabled by default and must not be queried with `getPhoneAccount()` — that needs `READ_PHONE_NUMBERS` and throws on apps holding only `READ_PHONE_STATE`).
  - Why it matters: a leftover RINGING connection makes Android refuse every later call with **`MAX_RINGING_CALLS`** (`createConnectionFailed`) — the push arrives, the app sees it, but no ring UI is ever shown.
- **Stale RINGING calls are swept before a new call is added** (`displayIncomingCall` → `sweepStaleRingingCalls()`): any leftover RINGING/DIALING connection is dropped first, so a cancelled call can never silence the next one.
- **The banner notification is drawn by the app** (`IncomingCallNotification`): it now posts a **custom content view** (`res/layout/callkeep_incoming_call.xml`) with the caller's name, the call kind and the **Answer/Decline buttons in the app's own theme** (red decline / green answer pills — the same colours as the full-screen call surface). A platform `CallStyle` notification replaced the body with the system's own call chrome (and Android 14+ refuses a CallStyle outside the foreground-service state), so it could never match the app's buttons. The standard actions are still attached for the expanded notification, now carrying green/red handset icons (`res/drawable/ic_call_answer_green.xml`, `res/drawable/ic_call_end_red.xml`).
- **An incoming (self-managed) connection is now marked as a VOIP call** (`VoiceConnectionService.onCreateIncomingConnection` → `setAudioModeIsVoip(true)`, which the outgoing path already did). Without it Android treats the app as being in a **cellular** call: the call policy owns the communication device and pins it to the earpiece, so the speaker toggle (`setCommunicationDevice`) was accepted by the system and then immediately overridden — the call always played through the earpiece. Outgoing calls were unaffected (they create no Telecom connection, so no call policy applies).
- **The speaker toggle now moves the audio on Android 12+** (`RNCallKeepModule.setSpeakerOn(on)`): the legacy `AudioManager.setSpeakerphoneOn()` is deprecated and **ignored for apps that are not the default dialer** — the app asked for the loudspeaker, the system logged `preferredCommunicationDevice: speaker`, and the WebRTC audio stayed on the earpiece. The new native method sets the **communication device** explicitly (`setCommunicationDevice(...)` on API 31+, `clearCommunicationDevice()` for "off" so a connected headset wins again) and logs the route before/after. The SDK's `piopiy.speaker(on)` calls it for a LiveKit call, next to the LiveKit audio-output selection.
- **The ring UI uses the app's call-screen palette** (`IncomingCallActivity` / `IncomingCallNotification`): the full-screen ring surface was dark blue (`#0B1F3A`) with a blue subtitle while the answered call screen is green — it now uses the same gradient (`#11503c → #0a2f24 → #051a13`), the same subtitle colour (`#d7efe5`) and the same button colours (red `#FF4A4A` decline, green `#34d399` answer).
- **Foreground-service notification is valid** (`VoiceConnectionService.startForegroundService()`): a missing `notificationIcon` produced *"Attempted to start a foreground service … with a broken notification (no icon)"*, and Android then showed its own **“<app> is running”** notification instead. The small icon now falls back to the app icon and the title falls back to *"Call in progress"*. A valid FGS also means Android accepts the `CallStyle` ring notification (green/red Answer/Decline).
- **The foreground service is actually stopped** when the call ends: `stopForeground()` was called with `FOREGROUND_SERVICE_TYPE_MICROPHONE` (a *type* constant) where *flags* are expected, so the ongoing notification stayed in the shade after hangup. It now uses `STOP_FOREGROUND_REMOVE` (and no longer bails out when the shared settings no longer carry a `foregroundService` block — a second SDK’s `setup()` overwrites them).
- Ring/in-call surfaces (notification, `IncomingCallActivity`, `InCallReactSurface`) mount the per-type component.
- `IncomingCallActivity` now implements `PermissionAwareActivity`, so
  `PermissionsAndroid.request*` calls made from the React surface it hosts
  (phone state, microphone, camera, Bluetooth) reach the platform instead of
  throwing *"Tried to use permissions API but the host Activity doesn't
  implement PermissionAwareActivity"* and silently dropping the request. This
  covers the app's `CallScreen` permission effect and the fork's own
  `checkPhoneAccountEnabled` / `startCall` requests. Needs a fork version bump
  (`4.5.0` → `4.5.1`) to ship.

## `vendor/livekit-react-native` → `@livekit/react-native`

```
android/build.gradle
```

What changed: removed `jcenter()` (gone in Gradle 9) and bumped
`com.android.tools.build:gradle` `7.3.1 → 8.12.0` (matches RN 0.86). Copy over
`node_modules/@livekit/react-native/android/build.gradle` after install, or
maintain a fork / `patch-package`.

The SDK itself already contains everything else: `callKeep.android.selfManagedVoice`
/ `voiceInCallComponent`, self-managed routing in `callkeep.native.js`,
`piopiy.isCallAnswered()`, `getPushInfo()`, the LiveKit answer ordering, and
`livekit.preconnect`.

## Hanging up must close a half-joined LiveKit room (`src/livekitCall.native.js`)

Fixed in `src/`, and mirrored into the built `lib/` + `native-pkg/lib/`.

`_teardown()` used to call `room.disconnect()` **only when `roomConnected` was
true**, to avoid LiveKit's "cannot send signal request before connected, type:
leave" log. But a cold-start answer can carry **live two-way audio while the
join is still settling** — `room.connect()` never resolves and the signal keeps
retrying with "cannot send signal request before connected, type: **answer**".
In exactly that state the guard skipped the disconnect, so the engine and the
media session kept running: the agent tapped End, the app's in-call surface
closed, and the caller was still connected — both parties could still talk.

`_teardown()` now disconnects the room (and the preconnect room) regardless of
`roomConnected`, swallowing both a synchronous throw and an async rejection.
Closing the engine drops the media and the signal socket, which is what makes
the server release the far-end leg.

## An End tap must always dismiss the native call (`src/callkeep.native.js`)

Fixed in `src/`, and mirrored into the built `lib/` + `native-pkg/lib/`.

On Android the system call UI (and its lock-screen End button) is backed by a
Telecom connection that only goes away when something calls
`RNCallKeep.endCall(uuid)`. `_handleEndAction()` did that indirectly — only
through the `ended`/`hangup` listeners — so an End tap that arrived when the JS
side had **nothing left to end** fell into the `!hasIncomingSession` branch,
which ran `_clear()` and nothing else. `_clear()` only resets the bridge's own
fields: the Telecom connection survived, the call UI stayed on screen, and
tapping End again re-entered the same branch and again did nothing.

That is reachable in practice: if the far end hangs up first the server deletes
the room (`DisconnectReason 5` / `ROOM_DELETED`), the LiveKit session is torn
down and the native call is ended by the engine's own listeners — but a tap that
lands in that window (or on a push "ghost" call) hit the dead branch.

Both branches now call a new `_endNativeCall(uuid)`, which ends the native call
via `RNCallKeep.endCall(uuid)` (falling back to `endAllCalls()` when no uuid is
known) and is a no-op on iOS, where CallKit dismisses its own UI.

## One incoming-call UI: full screen when locked, banner when unlocked
(`IncomingCallNotification.java`)

Fixed in `vendor/react-native-callkeep/android/src/main/java/io/wazo/callkeep/IncomingCallNotification.java`.

`show()` posted every incoming call on the `callkeep_incoming_v2` channel
(`IMPORTANCE_HIGH`) and, for self-managed voice/video calls (`withCallScreen`),
also set a full-screen intent. A locked device *additionally* launched
`IncomingCallActivity` directly. Those were two independent UIs — the high
importance channel still allowed a heads-up banner — so a locked phone showed the
app's full-screen call screen **and** a call popup on top of it.

The branch is now decided before the notification is built:

- **locked or screen off** (`isDeviceLocked()`): the full-screen call screen is
  launched directly (the full-screen intent is kept only as a fallback), and the
  notification is posted on a new `callkeep_incoming_callscreen_v1` channel at
  `IMPORTANCE_DEFAULT` — it still rings and vibrates, but can never become a
  heads-up banner.
- **unlocked**: no full-screen intent and no direct launch, so the notification
  on the HIGH channel *is* the incoming-call UI, i.e. the normal call banner.

The extra channel gets a new id deliberately: Android ignores an importance
change on a channel that already exists (the user/system setting wins), so
re-using `callkeep_incoming_v2` would leave every installed device on HIGH.

## The ring says what kind of call it is (`IncomingCallActivity` /
`IncomingCallNotification` / `RNCallKeepModule` / `index.js`)

Fixed in `vendor/react-native-callkeep/...` + `src/callkeep.native.js` (mirrored
into the built `lib/` and `native-pkg/lib/`).

The ring surface's second line was hardcoded `"Incoming video call"`, so every
incoming call — voice, team, contact — was announced as video. It is now derived
from the call itself:

| call | line under the caller |
| --- | --- |
| contact (1:1 / PSTN) | `Incoming call · <number>` |
| team | `Incoming call` (the team already rides the caller line) |
| video | `Incoming video call` |

Video is known natively (`EXTRA_HAS_VIDEO`); team vs contact is only known to
the app (the SIP `X-Team-Name` header or the push's `team` field), so the bridge
passes `callKind: 'team' | 'contact'` through `displayIncomingCall(...)`'s
options. On Android that options bag never reached native — the JS wrapper only
forwarded `selfManaged` — so a flat 6-arg export
`displayIncomingCallWithOptionsAndKind(...)` was added (a new name, not an
overload: the New Architecture rejects duplicate exports and `Bundle` params).
Native stores it as `EXTRA_CALL_KIND`, and `VoiceConnection.onShowIncomingCallUi`
turns it into the subtitle via `IncomingCallNotification.callSubtitle()`.

The subtitle reaches both ring surfaces: the full-screen `IncomingCallActivity`
(`EXTRA_SUBTITLE`, also on the full-screen/answer intents) and the notification's
content text. Behaviour is unchanged — a team call still shows its
`name — TeamName` caller line exactly as before.

## The ring notification must survive Android 14's CallStyle rule
(`IncomingCallNotification.java`)

Fixed in `vendor/react-native-callkeep/android/src/main/java/io/wazo/callkeep/IncomingCallNotification.java`.

Android 14+ refuses a `Notification.CallStyle` notification unless the posting app
is in the foreground-service state:

```
java.lang.IllegalArgumentException: ... Not posted.
CallStyle notifications must be for a foreground service
```

The fork posts the ring from `VoiceConnection.onShowIncomingCallUi()`, i.e. the
moment Telecom creates the connection — *before* the JS bridge has run the app's
`startCallForegroundService()`. The two race, so the ring notification was
silently dropped on some calls (it only ever worked when a previous call's
foreground service was still winding down). Symptom: the locked screen still
rang (that is the full-screen activity, not the notification) while the
unlocked/foreground/background/killed states showed no banner at all.

`show()` now builds the notification in a helper and retries once: if the
`CallStyle` post is refused it reposts the same title/text/Answer/Decline
actions as a plain notification, which has no foreground-service requirement and
still becomes a heads-up banner on the HIGH channel.

## Release steps

1. **CallKeep fork** — copy the `vendor/react-native-callkeep` files into the
   fork repo, then `npm version minor && npm publish`. Bump the SDK dependency
   (`scripts/stage-native.mjs` → `@telecmi/react-native-callkeep`) to the new
   version.
2. **piopiy SDK** — `npm run build-node && npm run stage:native` →
   `cd native-pkg && npm publish` (bump `version` in the root `package.json`
   first; `stage:native` syncs it).
3. **Apps (connle-ai)** — install the new SDK, pin the supported LiveKit stack
   (`@livekit/react-native ~2.8.0`, `@livekit/react-native-webrtc ~125.0.12`),
   copy `vendor/livekit-react-native/android/build.gradle` over the installed
   file, then enable:
   ```js
   new PIOPIY({
     callKeep: { android: {
       selfManagedVoice: true,
       voiceInCallComponent: 'PiopiyInCallShell', // register this component
       foregroundService: { channelId: 'com.piopiy.callkeep', channelName: 'Incoming calls',
                            notificationTitle: 'Call in progress', notificationIcon: 'ic_launcher' },
     } },
   });
   ```
   Register the `PiopiyInCallShell` React component (the fork mounts it on its
   over-keyguard surface); `examples/react-native/src/InCallShell.tsx` is a
   reference (name, timer, mute/speaker, hang up).
