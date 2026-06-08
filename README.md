# PIOPIY Client JS SDK

**Platforms:** 🌐 Web · 💻 Electron · 📱 iOS · 🤖 Android

The PIOPIY WebRTC SDK for JavaScript enables high-quality voice communication —
make and receive calls to PSTN (Public Switched Telephone Network), App-to-App,
and Browser-to-Browser.

**One package, every platform.** The same SDK runs on the **Web**, **Electron (Desktop)**, and on **React
Native** (iOS & Android); your bundler automatically selects the right build, so
you write the same call code everywhere.

## Key Features
- **Crystal Clear Audio**: High-fidelity WebRTC-based voice.
- **Cross-Platform**: One SDK for Web, Electron, and React Native (iOS & Android).
- **Rich Call Control**: Mute, Hold, Transfer, and DTMF support.
- **Metadata Support**: Extract custom SIP headers and transfer information.

---

## Pick your platform

Installation and native setup differ per platform, so each has a dedicated guide.
The **call API itself is identical** on both — it's documented in the
[API reference](#api-reference) below.

| Platform | Setup guide |
| :--- | :--- |
| 🌐 **Web & Electron** | **→ [Web & Electron guide](README.web.md)** |
| 📱 **React Native iOS** | **→ [iOS guide](README.react-native-ios.md)** |
| 🤖 **React Native Android** | **→ [Android guide](README.react-native-android.md)** |

```bash
npm install piopiyjs
```

> [!NOTE]
> **React Native** additionally needs the native peers `react-native-webrtc` and
> `react-native-incall-manager` — see the [iOS guide](README.react-native-ios.md) and [Android guide](README.react-native-android.md)
> for details. **Web & Electron** users install only `piopiyjs`.

> [!TIP]
> A complete, runnable React Native example app (inbound + outbound calls) lives
> in [`example-rn/`](example-rn).


---

## Quick Start Example

Here is a complete example of initializing, connecting, placing/answering calls, and handling events. This works on both Web and React Native.

```javascript
import PIOPIY from 'piopiyjs';

// 1. Initialize the client
const piopiy = new PIOPIY({
    name: "Agent Name",
    debug: true,
    autoplay: true,
    ringTime: 60,
});

// 2. Attach Event Handlers
piopiy.on("connected", (data) => {
    console.log("Connected to SBC:", data);
});

piopiy.on("disconnected", (data) => {
    console.log("Disconnected from SBC:", data);
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
import PIOPIY from 'piopiyjs';

const piopiy = new PIOPIY({
    name: "Display Name",
    debug: false,
    autoplay: true,
    autoReboot: true,
    ringTime: 60,
});
```

#### Configuration Options
| Attribute | Description | Type | Default |
| :--- | :--- | :--- | :--- |
| `name` | Your display name shown to other parties | string | `none` |
| `debug` | Enable detailed console logging for troubleshooting | boolean | `false` |
| `autoplay` | Automatically handle and play remote audio streams | boolean | `true` |
| `autoReboot` | Automatically attempt reconnection on session drop | boolean | `true` |
| `ringTime` | Maximum duration for an incoming call to ring (seconds) | number | `60` |

## Authentication

Connect to the PIOPIY SBC using your account credentials.

```javascript
//        username   password    domain
piopiy.login("user_id", "password", "sbcind.telecmi.com");
```

#### Regional SBC Endpoints
| Region | SBC URI |
| :--- | :--- |
| **Asia** | `sbcsg.telecmi.com` |
| **Europe** | `sbcuk.telecmi.com` |
| **America** | `sbcus.telecmi.com` |
| **India** | `sbcind.telecmi.com`, `sbcindncr.telecmi.com` |

---

## API Reference

> ✅ The methods and events below are **identical on Web and React Native** — both platform guides link back here, so the API lives in one place.

### Methods

#### `call(phone_number, options)`
Initiates an outgoing call to a PSTN number or another extension.
- **`phone_number`**: The target number in E.164 format (e.g., `13158050050`).
- **`options`**: (Optional) JSON object containing `extra_param` for custom webhook headers.
  ```javascript
  piopiy.call("13158050050", { extra_param: "custom_header_value" });
  ```

#### `getCallId()` / `getCallID()`
Returns the unique identifier for the current active call.
- **Returns**: A `string` (UUID or SIP ID) or `false` if no active call exists.
> [!TIP]
> Use this method to track calls or interact with the PIOPIY REST API.

#### `answer()`
Answers an incoming call.

#### `reject()`
Rejects/Disconnects an incoming call.

#### `terminate()`
Hangs up an ongoing call.

#### `hold()` / `unHold()`
Places the active call on hold or resumes it.

#### `mute()` / `unMute()`
Mutes or unmutes your local microphone.

#### `speaker(on)` · _React Native only_
Routes call audio to the **loudspeaker** (`true`) or **earpiece** (`false`) and returns the new state. On the **Web** this is a safe no-op.

#### `sendDtmf(tone)`
Sends a DTMF tone (0-9, *, #) to the remote party.

#### `transfer(to, callback)`
Transfers the active call to another agent or phone number.
- **`to`**: Target extension or E.164 number.
- **`callback`**: (Optional) Function triggered when the transfer request is processed, receiving status/error data.

#### `teamTransfer(to, callback)`
Transfers the active call to a specific team or group.
- **`to`**: Target team identifier.
- **`callback`**: (Optional) Function triggered when the transfer request is processed, receiving status/error data.

#### `merge()`
Shortcut helper method that sends the DTMF tone `'0'`. Primarily used to bridge/merge calls during transfer flows.

#### `cancel()`
Shortcut helper method that sends the DTMF tone `'#'`. Primarily used to cancel a transfer attempt.

#### `reRegister()`
Manually triggers registration with the SBC. Useful for recovering from network connection changes or dropouts on mobile devices.

#### `isLogedIn()`
Check if the client is currently authenticated and registered with the SBC.
- **Returns**: `boolean`

#### `isConnected()`
Check if the WebSocket connection to the SBC is currently active.
- **Returns**: `boolean`

#### `onHold()`
Check if the active call is currently on hold.
- **Returns**: `boolean`

#### `onMute()`
Check if the microphone is currently muted.
- **Returns**: `boolean`

#### `onSpeaker()`
Check if the loudspeaker is currently turned on (React Native only).
- **Returns**: `boolean`

#### `logout()`
Disconnects from the SBC session.

### Event Handlers

The SDK uses an event-driven architecture. Listen for events using `.on(eventName, callback)`.

#### Connection & Registration Events

* **`connected`**
  Triggered when the WebSocket connection to the SBC is successfully established.
  * **Payload**: `{ code: 200, status: "SBC connected" }`

* **`disconnected`**
  Triggered when the WebSocket connection to the SBC drops or is closed.
  * **Payload**: `{ code: 1000, status: "SBC disconneced" }`

* **`login`**
  Triggered upon successful registration.
  * **Payload**: `{ code: 200, status: "login successfully" }`

* **`loginFailed`**
  Triggered when authentication or registration fails.
  * **Payload**: `{ code: number, status: string }`
  * *Common codes*: `401` (Invalid credentials), `405` (Too many connections), `407` (Token generation or IP registration failed).

* **`logout`**
  Triggered when the user logs out successfully.
  * **Payload**: `{ code: 200, status: "logout successfully" }`

#### Call Lifecycle Events

* **`inComingCall`**
  Triggered when a new call arrives.
  * **Payload**:
    ```json
    {
      "from": "1001",
      "team_name": "Support",
      "to_number": "13158050050",
      "call_id": "a1b2c3d4-e5f6...",
      "transfer_from": "1002",
      "transfer_to": "1001"
    }
    ```

* **`trying`**
  Triggered when an outgoing call is being initiated.
  * **Payload**: `{ code: 100, status: "trying", type: "outbound" }`

* **`ringing`**
  Triggered when the call is currently ringing.
  * **Payload**: `{ code: 183, status: "ringing", type: "outbound" | "inbound" }`

* **`answered`**
  Triggered when the call has been answered.
  * **Payload**: `{ code: 200, status: "answered" }`

* **`hold`**
  Triggered when the call status changes to hold.
  * **Payload**: `{ code: 200, status: "call on hold", whom: "local" | "remote" }`

* **`unhold`**
  Triggered when the call status returns to active.
  * **Payload**: `{ code: 200, status: "call on active", whom: "local" | "remote" }`

* **`ended`**
  Triggered when a connected call is hung up.
  * **Payload**: `{ code: number, status: string }` (e.g. `{ code: 200, status: "call ended" }`)

* **`hangup`**
  Triggered when an incoming or outgoing call is rejected/canceled before answering.
  * **Payload**: `{ code: number, status: string }` (e.g. `{ code: 200, status: "call hangup" }`)

* **`error`**
  Triggered when a call action fails or an invalid parameter is provided.
  * **Payload**: `{ code: number, status: string }`

#### Media & In-Call Events

* **`callStream`**
  Triggered when the remote media stream is established.
  * **Payload**: `{ code: 200, status: MediaStream }`

* **`mediaFailed`**
  Triggered if the SDK cannot access local audio devices (e.g., microphone permission denied).
  * **Payload**: `{ code: 415, status: string }`

* **`dtmf`**
  Triggered when a DTMF tone is sent or received.
  * **Payload**: `{ code: 200, dtmf: string, type: "local" | "remote" }`

* **`NETStats`**
  Triggered upon network issues during a session (e.g. gateway timeouts).
  * **Payload**: `{ code: 408, msg: "Request timeout" }`

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
