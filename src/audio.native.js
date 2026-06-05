// React Native variant of audio.js.
// There is no DOM <audio> element on React Native; react-native-webrtc routes
// the remote audio track to the device output automatically, so this is a
// no-op that preserves the same shape used by piopiy.js.
export default class {

    audioTag () {
        // intentionally empty on React Native
    }

}
