// LiveKit inbound-call engine — web build (no-op).
//
// Inbound-over-LiveKit is a React Native feature (VoIP push + CallKit).
// Browsers keep the jsSIP inbound path, so this stub keeps piopiy.js
// platform-agnostic: livekitCall.native.js is picked on React Native.
export default class LiveKitCall {
    constructor() { }
    available() { return false; }
    setPending() { return false; }
    hasPending() { return false; }
    isCall() { return false; }
    answer() { return Promise.resolve( false ); }
    end() { return false; }
    onAudioSessionActivated() { }
    onAudioSessionDeactivated() { }
}
