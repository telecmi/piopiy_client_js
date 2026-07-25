/**
 * @format
 */

import {AppRegistry, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import pushCallService from './src/pushCallService';

// Initialise the call/push bridge as early as possible. This module also runs
// when the OS launches the app *headlessly* to deliver a background push, so the
// SDK + CallKeep must be set up here, not only inside the React tree.
pushCallService.init();

// Android only: a high-priority FCM *data* message wakes the app here even when it
// was killed. (iOS background wake-ups arrive via PushKit, handled natively.)
// Firebase is lazy-required so it's never loaded on iOS, where it isn't linked.
// Wrapped in try/catch: without android/app/google-services.json Firebase throws
// "No Firebase App '[DEFAULT]'…" — that must not abort this module, or
// AppRegistry.registerComponent below never runs and the app can't boot at all
// (the misleading '"PiopiyRNExample" has not been registered' error).
if (Platform.OS === 'android') {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      await pushCallService.onIncomingPush(remoteMessage?.data);
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[index] FCM unavailable — push wake-ups disabled. Add android/app/google-services.json ' +
        'and rebuild (see README.push-notifications.md). ' + (e?.message ?? e),
    );
  }
}

AppRegistry.registerComponent(appName, () => App);
