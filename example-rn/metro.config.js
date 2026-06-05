const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// This example app lives *inside* the piopiyjs SDK repo and consumes the SDK
// directly from the parent folder (no `npm install piopiyjs`). Metro is told:
//
//   * watchFolders -> also read the SDK's built `lib/` and its runtime deps
//     (lodash, jssip, socket.io-client, underscore) from the parent
//     node_modules.
//   * extraNodeModules -> resolve the bare import `piopiyjs` to the repo root.
//     Metro then honours the package's "react-native" field
//     (lib/index.native.js). Any other bare import the SDK needs but the parent
//     does not provide (react-native-webrtc, react-native-incall-manager,
//     react, react-native, events, ...) falls back to THIS app's node_modules.
const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '..');

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [sdkRoot],
  resolver: {
    extraNodeModules: new Proxy(
      {piopiyjs: sdkRoot},
      {
        get: (target, name) =>
          Object.prototype.hasOwnProperty.call(target, name)
            ? target[name]
            : path.join(projectRoot, 'node_modules', String(name)),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
