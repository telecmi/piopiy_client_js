const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// This example consumes the SDK exactly the way your app does: every package —
// including `@telecmi/piopiy-native` — is a normal dependency in package.json,
// resolved from node_modules with NO aliases or resolver overrides. If it
// bundles and runs here, it bundles and runs in a customer app. (Earlier
// versions aliased `react-native-callkeep` to a fork here, which hid several
// resolution bugs the docs-following path hit — never add aliases back.)
//
// To test un-published SDK changes, build a tarball and install it:
//   (repo root)   npm run build-node && npm run stage:native
//                 cd native-pkg && npm pack
//   (example-rn)  npm install ../native-pkg/telecmi-piopiy-native-<version>.tgz

/** @type {import('metro-config').MetroConfig} */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
