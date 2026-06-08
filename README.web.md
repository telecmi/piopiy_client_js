# PIOPIY SDK — Web & Electron

**Platforms:** 🌐 Web / Browser · 💻 Electron (Desktop)

> 🌐 **This is the Web & Electron guide.** Building a **React Native** app instead?
> → **[React Native guide](README.react-native.md)**

High-quality WebRTC voice calling that runs directly in the browser or Electron window — register
with the SBC, place and receive calls, with mute / hold / DTMF / transfer.

> The **call API** (methods & events) is the same on every platform and is
> documented once in the **[API reference](README.md#api-reference)**. This guide
> covers the **browser and Electron** parts: install, secure-context, and audio.

---

## Requirements

- A modern browser (Chrome, Edge, Firefox, or Safari) or an **Electron** desktop application.
- **HTTPS.** Browsers only grant microphone access (`getUserMedia`) on a **secure
  origin**: `https://…` in production, or `http://localhost` during development. (Electron apps using local file protocols or custom schemes are exempt).
- A TeleCMI / PIOPIY SBC account (**username**, **password**, **domain**).

---

## 1. Install

```bash
npm install piopiyjs
```

> [!NOTE]
> On Web and Electron you install **only** `piopiyjs`. The `react-native-webrtc` /
> `react-native-incall-manager` packages are for React Native — do not install
> them here.

`import PIOPIY from 'piopiyjs'` automatically resolves the **browser build** (the
package's `main` entry); browser WebRTC is used under the hood.

> [!TIP]
> **Electron Apps:** Remember to handle permission requests for the microphone in your Electron main process using `session.defaultSession.setPermissionRequestHandler()` to allow the renderer process access to audio devices.

---

## 2. Initialize and log in

```js
import PIOPIY from 'piopiyjs';

const piopiy = new PIOPIY({ name: 'Agent', debug: true, autoplay: true, ringTime: 60 });

//        username   password    domain
piopiy.login('1001', 'secret', 'sbcind.telecmi.com');

piopiy.on('login',       () => console.log('registered — ready for calls'));
piopiy.on('loginFailed', (d) => console.log('login failed', d?.code, d?.status));
```

See [Regional SBC endpoints](README.md#authentication) for the right domain.

---

## 3. Audio in the browser

There is **no `<audio>` element to manage** — with `autoplay: true` (the default)
the SDK creates and plays the remote audio stream for you.

Two browser rules to know:

- **Microphone prompt.** The browser asks for mic permission on the **first**
  call. If the user denies it, audio fails (`mediaFailed`).
- **Autoplay policy.** Browsers block audio that didn't start from a user
  action. Always start calls from a **click/tap handler** (e.g. a "Call" button),
  not automatically on page load, or the first audio may be silent until the user
  interacts with the page.

---

## 4. Make and receive calls

```js
// Outbound
piopiy.call('13158050050');           // E.164 number or another extension
piopiy.on('ringing',  () => console.log('ringing'));
piopiy.on('answered', () => console.log('connected'));

// Inbound
piopiy.on('inComingCall', (data) => {
  console.log('incoming from', data.from);   // show an Answer / Reject UI
});
piopiy.answer();   // on Answer
piopiy.reject();   // on Reject
```

For the complete list of methods (`mute`, `hold`, `sendDtmf`, `transfer`,
`terminate`, …) and events, see the **[API reference](README.md#api-reference)**.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No mic prompt / `getUserMedia` fails** | You're not on a secure origin. Serve over **HTTPS** (or use `http://localhost`). |
| **First call has no audio** | Browser autoplay policy — start the call from a user **click**, not automatically. |
| **`mediaFailed`** | Microphone permission denied, or no input device. Check the browser's site permissions. |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
