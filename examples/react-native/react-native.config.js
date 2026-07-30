module.exports = {
  dependencies: {
    // 1. The SDK's bundled audio/WebRTC engine. Autolinking only scans DIRECT
    //    dependencies, and these arrive with the SDK — without them the app
    //    builds but calls fail with "WebRTC engine could not be loaded".
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    '@telecmi/react-native-callkeep': {},
    'react-native-incall-manager': {},
    'react-native-voip-push-notification': {},
    // 2. Firebase is Android-only here (iOS uses PushKit). Excluding it from
    //    iOS avoids the "Module 'FirebaseCore' not found" build failure.
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};
