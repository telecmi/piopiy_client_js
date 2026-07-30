/**
 * @format
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {piopiy} from './src/callService';

// Android: call pushes that arrive while the app is backgrounded or killed
// wake the app through this file — one SDK call registers the handler.
// Safe no-op on iOS (wake-ups arrive via PushKit, handled natively).
piopiy.registerBackgroundPushHandler();

AppRegistry.registerComponent(appName, () => App);
