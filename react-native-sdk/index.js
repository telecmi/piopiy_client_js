// piopiy-native — thin wrapper for React Native apps.
//
// It exists so RN apps get the WebRTC/LiveKit native engine as transitive
// npm dependencies of THIS package, while web/Electron apps installing plain
// `piopiyjs` stay 100% free of native packages.
//
// Metro resolves `piopiyjs` through its package.json `react-native` field
// (lib/index.native.js), which registers the WebRTC globals and wires the
// CallKeep / LiveKit bridges.
module.exports = require( 'piopiyjs' );
