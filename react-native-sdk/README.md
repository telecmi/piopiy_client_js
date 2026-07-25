# piopiy-native

Official PIOPIY WebRTC SDK for **React Native** — the
[`piopiyjs`](https://www.npmjs.com/package/piopiyjs) core plus its native
WebRTC engine, in one install.

> Building for **web or Electron**? Install plain
> [`piopiyjs`](https://www.npmjs.com/package/piopiyjs) instead — pure JS,
> zero native dependencies.

## Install

```bash
npm install piopiy-native react-native-callkeep react-native-incall-manager
```

Create a `react-native.config.js` at your project root (registers the SDK's
engine for autolinking):

```javascript
// react-native.config.js
module.exports = {
  dependencies: {
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
  },
};
```

Then:

```bash
cd ios && bundle exec pod install && cd ..
```

## Usage

```javascript
import PIOPIY from 'piopiy-native';

const piopiy = new PIOPIY({ name: 'Mobile Agent', debug: false });
piopiy.login(userId, password, region);
```

The API is identical to `piopiyjs` — see the full guides:

* [React Native setup](https://github.com/telecmi/piopiy_client_js/blob/main/README.react-native.md)
* [iOS native setup](https://github.com/telecmi/piopiy_client_js/blob/main/README.react-native-ios.md)
* [Android native setup](https://github.com/telecmi/piopiy_client_js/blob/main/README.react-native-android.md)
* [Push notifications (PushKit / FCM)](https://github.com/telecmi/piopiy_client_js/blob/main/README.push-notifications.md)

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
