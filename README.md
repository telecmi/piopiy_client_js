# PIOPIY Client JS SDK

**Platforms:** 🌐 Web · 📱 iOS · 🤖 Android

The PIOPIY WebRTC SDK for JavaScript enables high-quality voice communication —
make and receive calls to PSTN (Public Switched Telephone Network), App-to-App,
and Browser-to-Browser.

**One package, every platform.** The same SDK runs on the **Web** and on **React
Native** (iOS & Android); your bundler automatically selects the right build, so
you write the same call code everywhere.

## Key Features
- **Crystal Clear Audio**: High-fidelity WebRTC-based voice.
- **Cross-Platform**: One SDK for browsers and React Native (iOS & Android).
- **Rich Call Control**: Mute, Hold, Transfer, and DTMF support.
- **Metadata Support**: Extract custom SIP headers and transfer information.

---

## Pick your platform

Installation and native setup differ per platform, so each has a dedicated guide.
The **call API itself is identical** on both — it's documented in the
[API reference](#api-reference) below.

| Platform | Setup guide |
| :--- | :--- |
| 🌐 **Web / Browser** | **→ [Web guide](README.web.md)** |
| 📱 **React Native** (iOS & Android) | **→ [React Native guide](README.react-native.md)** |

```bash
npm install piopiyjs
```

> [!NOTE]
> **React Native** additionally needs the native peers `react-native-webrtc` and
> `react-native-incall-manager` — the [React Native guide](README.react-native.md)
> covers them. **Web** users install only `piopiyjs`.

> [!TIP]
> A complete, runnable React Native example app (inbound + outbound calls) lives
> in [`example-rn/`](example-rn).

---

## Initialization

Create a PIOPIY instance with your configuration. This is the same on every
platform.

```javascript
import PIOPIY from 'piopiyjs';

const piopiy = new PIOPIY({
    name: "Display Name",
    debug: false,
    autoplay: true,
    ringTime: 60,
});
```

#### Configuration Options
| Attribute | Description | Type | Default |
| :--- | :--- | :--- | :--- |
| `name` | Your display name shown to other parties | string | `none` |
| `debug` | Enable detailed console logging for troubleshooting | boolean | `false` |
| `autoplay` | Automatically handle and play remote audio streams | boolean | `true` |
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

> ✅ The methods and events below are **identical on Web and React Native** — both
> platform guides link back here, so the API lives in one place.

### Methods

#### `call(phone_number, options)`
Initiates an outgoing call to a PSTN number or another extension.
- **`phone_number`**: The target number in E.164 format (e.g., `13158050050`).
- **`options`**: (Optional) JSON object containing `extra_param` for webhook headers.

#### `getCallId()`
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
Routes call audio to the **loudspeaker** (`true`) or **earpiece** (`false`) and
returns the new state. On the **Web** this is a safe no-op (the browser / OS owns
the output device). Use `onSpeaker()` to read the current state.

#### `sendDtmf(tone)`
Sends a DTMF tone (0-9, *, #) to the remote party.

#### `transfer(to)`
Transfers the call to another agent or number.

#### `teamTransfer(to)`
Transfers the call to a specific team or group.

#### `logout()`
Disconnects from the SBC session.

### Event Handlers

The SDK uses an event-driven architecture. Listen for events using `.on(eventName, callback)`.

#### Authentication Events
- **`login`**: Triggered upon successful authentication.
- **`loginFailed`**: Triggered when authentication fails (e.g., code 401: Invalid credentials).
- **`logout`**: Triggered when the user logs out successfully.

#### Call Lifecycle Events
- **`inComingCall`**: Triggered when a new call arrives.
```javascript
piopiy.on("inComingCall", (data) => {
    console.log("Caller:", data.from);
    if (data.team_name) console.log("Team:", data.team_name);
    if (data.call_id) console.log("Unique ID:", data.call_id);
});
```
| Payload Property | Description |
| :--- | :--- |
| `from` | Display name or number of the caller |
| `team_name` | (Optional) Name of the assigned team/group |
| `to_number` | (Optional) The target virtual number |
| `call_id` | Unique identifier for this call session |
| `transfer_from` | (Optional) Originating agent if this is a transfer |
| `transfer_to` | (Optional) Target agent if this is a transfer |

- **`trying`**: The outgoing call is being initiated.
- **`ringing`**: The call is currently ringing.
- **`answered`**: The call has been picked up.
- **`ended`**: The call has concluded successfully.
- **`hangup`**: The call was terminated or rejected.
- **`error`**: A generic error occurred.

#### Media Events
- **`callStream`**: Triggered when the remote media stream is established.
- **`mediaFailed`**: Triggered if the SDK cannot access local audio devices.

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
