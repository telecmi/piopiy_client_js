# PIOPIY Client JS SDK

**Platforms:** 🌐 Web · 💻 Electron · 📱 iOS · 🤖 Android

The PIOPIY WebRTC SDK for JavaScript enables high-quality voice communication —
make and receive real phone calls, app-to-app calls, and browser-to-browser calls.

**One API, two packages.** The SDK ships as two packages that share the **same
call API** — pick the one for your platform:

| Platform | Package |
| :--- | :--- |
| 🌐 **Web & Electron** | [`@telecmi/piopiyjs`](https://www.npmjs.com/package/@telecmi/piopiyjs) |
| 📱 **React Native** (iOS & Android) | [`@telecmi/piopiy-native`](https://www.npmjs.com/package/@telecmi/piopiy-native) |

> [!IMPORTANT]
> **Migrating from the old `piopiyjs` package?** The unscoped `piopiyjs` on npm is
> **deprecated** and no longer maintained. Move to the scoped packages above:
>
> | Old (deprecated) | New |
> | :--- | :--- |
> | `npm install piopiyjs` (web) | `npm install @telecmi/piopiyjs` |
> | `import PIOPIY from 'piopiyjs'` (React Native) | `npm install @telecmi/piopiy-native` → `import PIOPIY from '@telecmi/piopiy-native'` |
>
> The call API is unchanged — only the package name and (on React Native) the
> import path change. See the
> [upgrade guide in the changelog](CHANGELOG.md#-upgrading-from-016x) for the
> full before/after.

## Key Features
- **Crystal Clear Audio**: High-fidelity WebRTC-based voice.
- **Cross-Platform**: One SDK for Web, Electron, and React Native (iOS & Android).
- **Rich Call Control**: Mute, Hold, Transfer, and DTMF support.
- **Call Metadata**: Read caller info and transfer details, and attach your own data to calls.

---

## Pick your platform

Installation and native setup differ per platform, so each has a dedicated guide.
The **call API itself is identical** on both — it's documented in the
[API reference](#api-reference) below.

| Platform | Setup guide |
| :--- | :--- |
| 🌐 **Web & Electron** | **→ [Web & Electron guide](README.web.md)** |
| 📱 **React Native (Shared)** | **→ [React Native guide](README.react-native.md)** |
| 📱 **React Native iOS** | **→ [iOS guide](README.react-native-ios.md)** |
| 🤖 **React Native Android** | **→ [Android guide](README.react-native-android.md)** |
| 🔔 **Push Notifications** | **→ [Push Notifications guide](README.push-notifications.md)** |
| 📝 **Changes & upgrading** | **→ [Changelog](CHANGELOG.md)** |

```bash
# Web & Electron — pure JS, no native dependencies
npm install @telecmi/piopiyjs

# React Native — SDK core + bundled native WebRTC engine
npm install @telecmi/piopiy-native react-native-callkeep react-native-incall-manager
```

> [!NOTE]
> Same API on every platform — React Native imports from `@telecmi/piopiy-native`,
> Web/Electron from `@telecmi/piopiyjs`. See the [React Native guide](README.react-native.md).

> [!TIP]
> A complete, runnable React Native example app (inbound + outbound calls) lives
> in [`example-rn/`](example-rn).


---

## The 30-second version

Log in, then make or receive a call. That's the whole happy path.

```javascript
import PIOPIY from '@telecmi/piopiyjs'; // React Native: '@telecmi/piopiy-native'

const piopiy = new PIOPIY({ name: 'Agent' });

// --- MAKE a call ---
piopiy.on('login', () => piopiy.call('13158050050'));   // dial once registered
piopiy.login('user_id', 'password', 'sbcind.telecmi.com');

// --- RECEIVE a call ---
piopiy.on('inComingCall', (call) => {
  console.log('Incoming call from', call.from);
  piopiy.answer();   // or piopiy.reject()
});

// --- know when it ends ---
piopiy.on('ended', () => console.log('call ended'));
```

That's it for the web. On **React Native** you also need microphone permission before
calling, and — to receive calls while backgrounded/killed — the one-time
[push-notification setup](README.push-notifications.md). The full API is below.

---

## Quick Start Example

Here is a complete example of initializing, connecting, placing/answering calls, and handling events. This works on both Web and React Native — on React Native just import from `@telecmi/piopiy-native` instead of `@telecmi/piopiyjs` (identical API).

```javascript
import PIOPIY from '@telecmi/piopiyjs';   // React Native: import PIOPIY from '@telecmi/piopiy-native';

// 1. Initialize the client
const piopiy = new PIOPIY({
    name: "Agent Name",
    debug: true,
    autoplay: true,
    ringTime: 40,
});

// 2. Attach Event Handlers
piopiy.on("connected", (data) => {
    console.log("Connected:", data);
});

piopiy.on("disconnected", (data) => {
    console.log("Disconnected:", data);
});

piopiy.on("login", (data) => {
    console.log("Logged in successfully:", data);
    
    // 3. Make an outbound call
    piopiy.call("13158050050");
});

piopiy.on("loginFailed", (err) => {
    console.error("Login failed:", err.code, err.status);
});

piopiy.on("inComingCall", (data) => {
    console.log("Incoming call from:", data.from);
    // Answer or reject the call
    piopiy.answer();
});

piopiy.on("ringing", (data) => {
    console.log("Call is ringing...", data);
});

piopiy.on("answered", (data) => {
    console.log("Call answered and active:", data);
});

piopiy.on("ended", (data) => {
    console.log("Call ended:", data.status);
});

piopiy.on("error", (err) => {
    console.error("Call error:", err);
});

// 4. Authenticate
piopiy.login("user_id", "password", "sbcind.telecmi.com");
```

---

## Initialization

Create a PIOPIY instance with your configuration. This is the same on every platform.

```javascript
import PIOPIY from '@telecmi/piopiyjs';   // React Native: import PIOPIY from '@telecmi/piopiy-native';

const piopiy = new PIOPIY({
    name: "Display Name",
    debug: false,
    autoplay: true,
    autoReboot: true,
    ringTime: 40,
});
```

#### Configuration Options
| Attribute | Description | Type | Default |
| :--- | :--- | :--- | :--- |
| `name` | Your display name shown to other parties | string | `none` |
| `debug` | Enable detailed console logging for troubleshooting | boolean | `false` |
| `autoplay` | Automatically handle and play remote audio streams | boolean | `true` |
| `autoReboot` | Automatically attempt reconnection on session drop | boolean | `true` |
| `ringTime` | Maximum duration for an incoming call to ring (seconds) | number | `40` |
| `registerExpires` | How long the device stays registered (seconds). Shorter values clear a killed app's stale registration faster, so background calls fall through to push sooner | number | `120` |

> **React Native only:** an extra `callKeep` option configures the native incoming-call UI (e.g. `{ ios: { appName: 'YourApp' } }`). See the [Push Notifications guide](README.push-notifications.md).

## Authentication

Sign in with the TeleCMI credentials for the extension you want to place and receive calls on.

```javascript
//              username     password          region
piopiy.login("user_id", "password", "sbcind.telecmi.com");
```

#### Parameters of `login(userId, password, region)`
- **`userId`** (string): Your TeleCMI user ID or agent extension.
- **`password`** (string): Your extension password.
- **`region`** (string, optional): The TeleCMI region your account belongs to (see the table below). Defaults to Asia (`sbcsg.telecmi.com`).

#### Regional Endpoints
| Region | Endpoint |
| :--- | :--- |
| **Asia (Default)** | `sbcsg.telecmi.com` |
| **Europe** | `sbcuk.telecmi.com` |
| **America** | `sbcus.telecmi.com` |
| **India** | `sbcind.telecmi.com`, `sbcindncr.telecmi.com` |

---

## API Reference

> ✅ The methods and events below are **identical on Web and React Native** — both platform guides link back here, so the API lives in one place.

### Methods

#### `call(phone_number, options)`
Places an outgoing call to a phone number or another agent extension.
- **`phone_number`** (string): The target number in E.164 format (e.g., `"13158050050"`) or extension (e.g., `"1002"`).
- **`options`** (optional): JSON object containing:
  - **`extra_param`** (string): Custom metadata. Sent with the call as `X-cmi-extra_param`, so you can pass your own data through to TeleCMI webhooks and routing rules.
  ```javascript
  piopiy.call("13158050050", { extra_param: "my_custom_tracking_id_123" });
  ```

#### `getCallId()`
Returns the local session identifier for the current call.
- **Returns**: A `string` call ID, or `false` if no call is active.
- **Availability**: Available immediately when the call is initiated or received.

#### `getCallID()`
Returns the unique TeleCMI session UUID for the current call.
- **Returns**: A TeleCMI unique UUID `string`, or `false` if no call is active.
- **Availability**: Available only after the call session is in progress (ringing) or established (answered). Use this identifier when querying status or recording logs via the TeleCMI REST API.

#### `answer()`
Answers an incoming call.

#### `reject()`
Rejects/disconnects an incoming call.

#### `terminate()`
Hangs up an ongoing active call.

#### `hold()` / `unHold()`
Places the active call on hold or resumes it.

#### `mute()` / `unMute()`
Mutes or unmutes your local microphone audio.

#### `speaker(on)` · _React Native only_
Routes call audio to the **loudspeaker** (`true`) or **earpiece** (`false`) and returns the final state (boolean). On the **Web** this is a safe no-op returning `false`.

#### `sendDtmf(tone)`
Sends a DTMF tone (0-9, *, #) to the remote party.

#### `transfer(to, callback)`
Transfers the active call to another agent or phone number.
- **`to`** (string): Target extension or E.164 number.
- **`callback`** (optional): Function triggered when the transfer request is processed by the server, receiving status or error objects.
  ```javascript
  piopiy.transfer("1002", (res) => {
      if (res.error) {
          console.error("Transfer failed:", res.error);
      } else {
          console.log("Transfer response:", res); // e.g. { code: 200, status: "transfer success" }
      }
  });
  ```

#### `teamTransfer(to, callback)`
Transfers the active call to a specific team group.
- **`to`** (string): Target team identifier/name.
- **`callback`** (optional): Function triggered when the transfer request is processed, receiving status or error objects.

#### `merge()`
Shortcut helper method that sends the DTMF tone `'0'`. Commonly used to bridge/merge the caller with the transfer target agent during warm transfer flows.

#### `cancel()`
Shortcut helper method that sends the DTMF tone `'#'`. Commonly used to cancel a transfer attempt and retrieve the original call.

#### `reRegister()`
Manually re-registers the device with TeleCMI. Useful for recovering from network connection changes (e.g. WiFi to LTE) or dropouts on mobile devices.

#### `isLogedIn()`
Checks if the client is signed in and ready to make or receive calls.
- **Returns**: `boolean`

#### `isConnected()`
Checks if the connection to TeleCMI is currently active.
- **Returns**: `boolean`

#### `onHold()`
Checks if the active call is currently placed on hold locally.
- **Returns**: `boolean`

#### `onMute()`
Checks if the local microphone is currently muted.
- **Returns**: `boolean`

#### `onSpeaker()`
Checks if the loudspeaker is currently turned on (React Native only).
- **Returns**: `boolean`

#### `logout()`
Signs out and disconnects.

#### Push-notification methods · _React Native only_
For receiving calls while backgrounded or killed. Full setup in the [Push Notifications guide](README.push-notifications.md). No-ops on Web.

- **`registerToken(push, callback?)`** — register this device's push token so TeleCMI can wake it for incoming calls. Call after `login()`. `push` = `{ provider: 'apns' | 'fcm', token, platform? }`. Queued automatically if called before login completes.
- **`unregisterToken(callback?)`** — remove the device's push token (e.g. on logout or Do-Not-Disturb).
- **`handleIncomingPush(pushData)`** — hand a received call push to the SDK. It shows the incoming-call UI and connects the call on answer. Accepts the invite payload `{ uuid, room, token, url?, from? }` or a cancel payload `{ type: 'cancel_call', uuid }` (caller hung up while ringing).

### Event Handlers

The SDK uses an event-driven architecture. Listen for events using `.on(eventName, callback)`.

#### Connection & Registration Events

* **`connected`**
  Triggered when the connection to TeleCMI is established.
  * **Payload**: `{ code: 200, status: "connected" }`

* **`disconnected`**
  Triggered when the connection to TeleCMI drops or is closed.
  * **Payload**: `{ code: 1000, status: "disconnected" }`

* **`login`**
  Triggered when sign-in succeeds and the device is ready for calls.
  * **Payload**: `{ code: 200, status: "login successfully" }`

* **`loginFailed`**
  Triggered when authentication or registration fails.
  * **Payload**: `{ code: number, status: string }`
  * *Common codes*: `401` (Invalid credentials), `405` (Too many connections), `407` (Token generation or IP registration failed).

* **`logout`**
  Triggered when the user logs out successfully.
  * **Payload**: `{ code: 200, status: "logout successfully" }`

* **`sbc_logout`**
  Triggered when the server forces a logout (e.g. the same extension signed in elsewhere).
  * **Payload**: `{ code: number, reason: string }` (e.g., `{ reason: "login from other device" }`)

* **`net_changed`**
  Triggered when the transport connection is dropped due to network switches/disconnects. The SDK automatically attempts reconnects under the hood.
  * **Payload**: `{ code: 400, msg: "network changed" }`

#### Call Lifecycle Events

* **`inComingCall`**
  Triggered when a new incoming call arrives.
  * **Payload Keys & Header Mappings**:
    | Payload Key | Source Header | Description |
    | :--- | :--- | :--- |
    | `from` | `From` | Display name of the calling party. |
    | `call_id` | `X-Call-ID` / `X-cmi-uuid` | Unique TeleCMI UUID for the call. |
    | `team_name` | `X-Team-Name` | Name of the team routing the call. |
    | `to_number` | `X-To-Number` | The destination number called. |
    | `transfer_from` | `X-Transfer-From` | Extension of the agent who initiated the transfer (if transferred). |
    | `transfer` | `X-Transfer` | Additional transfer routing parameters. |
  * **Payload Schema**:
    ```json
    {
      "from": "1001",
      "call_id": "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
      "team_name": "Support",
      "to_number": "13158050050",
      "transfer_from": "1002",
      "transfer": "1001"
    }
    ```

* **`trying`**
  Triggered when an outgoing call is being initiated.
  * **Payload**: `{ code: 100, status: "trying", type: "outbound" | "incoming" }`

* **`ringing`**
  Triggered when the call is currently ringing.
  * **Payload**: `{ code: 183, status: "ringing", type: "outbound" | "incoming" }`

* **`answered`**
  Triggered when the call has been answered and is now active.
  * **Payload**: `{ code: 200, status: "answered" }`

* **`hold`**
  Triggered when the call status changes to hold.
  * **Payload**: `{ code: 200, status: "call on hold", whom: "myself" | "other" }`

* **`unhold`**
  Triggered when the call status returns to active from hold.
  * **Payload**: `{ code: 200, status: "call on active", whom: "myself" | "other" }`

* **`ended`**
  Triggered when a connected call is hung up by the remote party.
  * **Payload**: `{ code: number, status: string }` (e.g. `{ code: 200, status: "call ended" }`)

* **`hangup`**
  Triggered when an incoming or outgoing call is rejected or canceled before answering.
  * **Payload**: `{ code: number, status: string }` (e.g. `{ code: 200, status: "call hangup" }`)

* **`missedCall`** · _React Native push calls_
  Triggered when a ringing inbound call ends **without the user acting on it** — the caller hung up, or ringing timed out (e.g. the device was offline). Use it to show a local "missed call" notification. A deliberate `reject()` does **not** fire this.
  * **Payload**: `{ uuid: string, from: string | null, reason: "cancelled" | "ring_timeout", transport: "push" }`

* **`error`**
  Triggered when a call action fails or invalid options are supplied.
  * **Payload**: `{ code: number, status: string }`

#### Media & In-Call Events

* **`callStream`**
  Triggered when the remote media stream is established.
  * **Payload**: `{ code: 200, status: MediaStream }` (where `status` is the WebRTC `MediaStream` object)

* **`mediaFailed`**
  Triggered if the SDK cannot access local audio devices (e.g., microphone permission denied).
  * **Payload**: `{ code: 415, status: string }`

* **`dtmf`**
  Triggered when a DTMF tone is sent or received.
  * **Payload**: `{ code: 200, dtmf: string, type: "incoming" | "outgoing" }`

* **`NETStats`**
  Triggered upon network issues during a session (e.g. gateway timeouts).
  * **Payload**: `{ code: 408, msg: "Request timeout" }`

* **`transfer`**
  Triggered when there is a transfer event status change via the socket notification layer.
  * **Payload**: `{ state: "init" | "trying" | "answered" | "failed" | "ended", ... }`

* **`record`**
  Triggered when a call recording event/status notification is received from the server.
  * **Payload**: `{ state: "start" | "stop", ... }`

---

---

## Development & Security
The SDK includes built-in ESLint rules to ensure code quality.

```bash
# Run linter
npm run lint

# Auto-fix lint errors
npm run lint:fix
```

## License
Apache-2.0 © [TeleCMI](https://telecmi.com)
