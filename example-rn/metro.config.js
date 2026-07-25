const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// This example app lives *inside* the SDK repo and consumes the SDK directly
// from the parent folder (no `npm install @telecmi/piopiy-native`). Metro is told:
//
//   * watchFolders -> also read the SDK's built `lib/` and its runtime deps
//     (lodash, jssip, socket.io-client, underscore) from the parent
//     node_modules.
//   * extraNodeModules -> resolve the bare import `@telecmi/piopiy-native` to the repo root.
//     Metro then honours the package's "react-native" field
//     (lib/index.native.js). Any other bare import the SDK needs but the parent
//     does not provide (react-native-webrtc, react-native-incall-manager,
//     react, react-native, events, ...) falls back to THIS app's node_modules.
const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '..');
const nm = name => path.join(projectRoot, 'node_modules', name);

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [sdkRoot],
  resolver: {
    extraNodeModules: new Proxy(
      {
        // RN apps install `@telecmi/piopiy-native`; this example consumes the SDK source
        // from the parent repo, so alias the package name to the repo root
        // (Metro reads its `react-native` field → lib/index.native.js).
        '@telecmi/piopiy-native': sdkRoot,
        // The SDK still `require()`s the old package names. Alias them to
        // LiveKit's forks so jsSIP + the CallKeep bridge resolve onto LiveKit's
        // WebRTC/CallKeep without rewriting the published SDK. (@livekit/
        // react-native-webrtc is API-compatible for registerGlobals/mediaDevices;
        // @livekit/react-native-callkeep is a drop-in fork of react-native-callkeep.)
        'react-native-webrtc': nm('@livekit/react-native-webrtc'),
        'react-native-callkeep': nm('@livekit/react-native-callkeep'),
      },
      {
        get: (target, name) =>
          Object.prototype.hasOwnProperty.call(target, name)
            ? target[name]
            : nm(String(name)),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
