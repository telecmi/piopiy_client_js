// React Native entry point.
//
// jsSIP expects the WebRTC + mediaDevices APIs on the global scope; we register
// them from react-native-webrtc before the PIOPIY UA is ever constructed.
//
// The WebRTC engine ships WITH piopiyjs (@livekit/react-native-webrtc is a
// direct dependency — API-compatible fork of react-native-webrtc). Apps that
// already use plain react-native-webrtc keep working: it is tried second.
// NOTE: only ever require packages that are real dependencies of this SDK.
// Metro resolves require() statically at bundle time, so a fallback require
// for a package the app hasn't installed is unresolvable and the whole bundle
// fails at runtime with: Requiring unknown module "undefined".
let webrtc;
try {
    webrtc = require( '@livekit/react-native-webrtc' );
} catch {
    throw new Error(
        "[piopiy] WebRTC engine could not be loaded. '@livekit/react-native-webrtc' "
        + 'ships with the SDK, so this usually means the install is incomplete. Run:\n\n'
        + '  npm install\n'
        + '  cd ios && bundle exec pod install   # iOS only\n\n'
        + "and make sure your app's react-native.config.js registers\n"
        + "'@livekit/react-native' and '@livekit/react-native-webrtc' for autolinking.\n"
        + 'Setup guide: https://github.com/telecmi/piopiy_client_js#readme'
    );
}

if ( typeof webrtc.registerGlobals !== 'function' ) {
    throw new Error(
        "[piopiyjs] The installed 'react-native-webrtc' does not expose registerGlobals(). "
        + 'Please install a supported version (>=106.0.0).'
    );
}

webrtc.registerGlobals();

const PIOPIY = require( './piopiy' ).default;
module.exports = PIOPIY;
