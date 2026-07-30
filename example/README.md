# PiopiyExample — the docs-only validation app

All application **code** is complete in this folder (UI, call service, native
push wiring, patches, Firebase config). What is deliberately NOT done:
**no package has been installed.** Install every dependency by following the
SDK docs, exactly as a customer would:

1. [React Native setup](https://github.com/telecmi/piopiy_client_js/blob/master/README.react-native.md) — the install command, then `bundle install && bundle exec pod install`
2. [iOS guide](https://github.com/telecmi/piopiy_client_js/blob/master/README.react-native-ios.md) — signing + **Push Notifications capability** (step 5.4)
3. [Android guide](https://github.com/telecmi/piopiy_client_js/blob/master/README.react-native-android.md)
4. [Push notifications](https://github.com/telecmi/piopiy_client_js/blob/master/README.push-notifications.md) — includes `patch-package` for react-native-callkeep (the patch file is already in `patches/`)

Identity is pre-set so existing push credentials work: iOS bundle id
`com.telecmi.piopirn`, Android package `com.piopiyrnexample`.

This app imports ONLY packages the docs tell you to install. Saved sign-in
details are in-memory by design (AsyncStorage is an app choice, not an SDK
requirement).
