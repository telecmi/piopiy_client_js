module.exports = {
  dependencies: {
    // iOS receives incoming calls via PushKit (react-native-voip-push-notification),
    // NOT FCM — so exclude Firebase from iOS autolinking. This keeps the Firebase
    // CocoaPods out of the iOS build entirely (they're Android-only here), which
    // avoids the static-library / modular-headers build errors.
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};
