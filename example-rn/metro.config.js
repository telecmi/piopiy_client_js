const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// This example consumes the SDK the same way your app does: `@telecmi/piopiy-native`
// is a normal dependency in package.json, resolved from node_modules. There is no
// alias back to the repo source, so what you run here is exactly what npm ships.
//
// To test un-published SDK changes, build a tarball and install it:
//   (repo root)   npm run build-node && npm run stage:native
//                 cd native-pkg && npm pack
//   (example-rn)  npm install ../native-pkg/telecmi-piopiy-native-<version>.tgz
const projectRoot = __dirname;
const nm = name => path.join(projectRoot, 'node_modules', name);

/** @type {import('metro-config').MetroConfig} */
const config = {
  resolver: {
    extraNodeModules: new Proxy(
      {
        // This example installs LiveKit's forks rather than the upstream
        // packages, so point the upstream names at them. The SDK accepts either
        // (it tries both), and a normal app installing `react-native-callkeep`
        // straight from npm needs none of this.
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
