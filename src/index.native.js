// React Native entry point.
// jsSIP expects the WebRTC + mediaDevices APIs on the global scope; register
// them from react-native-webrtc before the PIOPIY UA is ever constructed.
const { registerGlobals } = require( 'react-native-webrtc' );
registerGlobals();

const PIOPIY = require( './piopiy' ).default;
module.exports = PIOPIY;
