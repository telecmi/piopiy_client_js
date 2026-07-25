module.exports = {
  dependencies: {
    // The SDK's bundled audio/WebRTC engine. Autolinking only scans an app's
    // DIRECT dependencies, and these arrive transitively with the SDK — so they
    // must be listed here or calls fail at runtime with
    // "WebRTC engine could not be loaded". (See README.react-native.md Step 1.)
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    // iOS receives incoming calls via PushKit (react-native-voip-push-notification),
    // NOT FCM — so exclude Firebase from iOS autolinking. This keeps the Firebase
    // CocoaPods out of the iOS build entirely (they're Android-only here), which
    // avoids the static-library / modular-headers build errors.
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};
