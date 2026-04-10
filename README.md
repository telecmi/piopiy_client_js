# PIOPIY Client JS SDK

The PIOPIY WebRTC SDK for Javascript enables high-quality voice communication directly within the browser. It supports making and receiving calls to PSTN (Public Switched Telephone Network), App-to-App, and Browser-to-Browser.

## Key Features
- **Crystal Clear Audio**: High-fidelity WebRTC-based voice.
- **Cross-Platform**: Seamless communication between browsers and traditional phones.
- **Rich Call Control**: Mute, Hold, Transfer, and DTMF support.
- **Metadata Support**: Extract custom SIP headers and transfer information.

---

## Installation

### Installation via NPM
```bash
npm install piopiyjs
```

### Installation via Yarn
```bash
yarn add piopiyjs
```

---

## Quick Start

### 1. Initialization
Create a new PIOPIY instance with your configuration.

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

### 2. Authentication
Connect to the PIOPIY SBC using your account credentials.

```javascript
piopiy.login("user_id", "password", "SBC_URI");
```

#### Regional SBC Endpoints
| Region | SBC URI |
| :--- | :--- |
| **Asia** | `sbcsg.telecmi.com` |
| **Europe** | `sbcuk.telecmi.com` |
| **America** | `sbcus.telecmi.com` |
| **India** | `sbcind.telecmi.com`, `sbcindncr.telecmi.com` |

---

## Methods

### `call(phone_number, options)`
Initiates an outgoing call to a PSTN number or another extension.
- **`phone_number`**: The target number in E.164 format (e.g., `13158050050`).
- **`options`**: (Optional) JSON object containing `extra_param` for webhook headers.

### `getCallId()`
Returns the unique identifier for the current active call.
- **Returns**: A `string` (UUID or SIP ID) or `false` if no active call exists.
> [!TIP]
> Use this method to track calls or interact with the PIOPIY REST API.

### `answer()`
Answers an incoming call.

### `reject()`
Rejects/Disconnects an incoming call.

### `terminate()`
Hangs up an ongoing call.

### `hold()` / `unHold()`
Places the active call on hold or resumes it.

### `mute()` / `unMute()`
Mutes or unmutes your local microphone.

### `sendDtmf(tone)`
Sends a DTMF tone (0-9, *, #) to the remote party.

### `transfer(to)`
Transfers the call to another agent or number.

### `teamTransfer(to)`
Transfers the call to a specific team or group.


### `logout()`
Disconnects from the SBC session.

---

## Event Handlers

The SDK uses an event-driven architecture. Listen for events using `.on(eventName, callback)`.

### Authentication Events
- **`login`**: Triggered upon successful authentication.
- **`loginFailed`**: Triggered when authentication fails (e.g., code 401: Invalid credentials).
- **`logout`**: Triggered when the user logs out successfully.

### Call Lifecycle Events
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

### Media Events
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
