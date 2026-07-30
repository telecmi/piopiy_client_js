# PIOPIY Web Example

A single-file browser softphone using
[`@telecmi/piopiyjs`](https://www.npmjs.com/package/@telecmi/piopiyjs) —
sign in, dial out, receive calls, mute. No build step: the SDK loads from
npm's CDN.

## Run

The microphone requires a secure context, so serve the file (don't open it
with `file://`):

```bash
cd examples/web
npx serve .
```

Open the printed `http://localhost:…` URL, sign in with a TeleCMI agent id +
password, and place a call. Grant the microphone prompt.

## Use it in your own app

```bash
npm install @telecmi/piopiyjs
```

```js
import PIOPIY from '@telecmi/piopiyjs';
```

Full API: [web guide](../../README.web.md) · [main README](../../README.md)
