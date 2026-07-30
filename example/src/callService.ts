/**
 * callService — everything the app must do for calls.
 *
 * Written by following README.push-notifications.md only. Note what is NOT
 * here: no push-token code at all. The SDK fetches and registers the device
 * token itself (autoPushToken, on by default) and re-registers on rotation.
 * The app contains NO push code at all — the SDK forwards received pushes
 * to itself; index.js adds one line for Android background wake-ups.
 */
// MUST come before the SDK import — see src/sdkLog.ts
import {attachSdkLog} from './sdkLog';
import {Platform, PermissionsAndroid} from 'react-native';
import PIOPIY, {type PiopiyEventName} from '@telecmi/piopiy-native';
// Android push (FCM): this one side-effect import wires YOUR app's Firebase
// module into the SDK. On iOS it resolves to an empty module — Firebase never
// enters the iOS bundle. Requires @react-native-firebase/app + /messaging
// (installed by this app; see the Android setup guide). iOS-only apps delete
// this line and skip Firebase entirely.
import '@telecmi/piopiy-native/android-push';
// NOTE: this example deliberately uses ONLY the packages the SDK docs tell
// you to install. Saved sign-in details therefore live in memory (retype
// after a full restart). A real app would use AsyncStorage or the Keychain —
// that's an app choice, not an SDK requirement.

// ---------------------------------------------------------------------------
// CONFIGURE THIS — the only values you need to change for your own app.
// ---------------------------------------------------------------------------
/**
 * Default TeleCMI region. The app lets you override it in the UI, so you only
 * need to change this if you want a different pre-filled value:
 *   Asia (default) sbcsg.telecmi.com
 *   Europe         sbcuk.telecmi.com
 *   America        sbcus.telecmi.com
 *   India          sbcind.telecmi.com  ·  sbcindncr.telecmi.com
 */
export const DEFAULT_REGION = 'sbcsg.telecmi.com';

/** Shown on the native iOS call screen — use your own app's name. */
const APP_NAME = 'PiopiyExample';
// ---------------------------------------------------------------------------

// Surface the SDK's internal diagnostics (audio routing, CallKit, push) in the
// app's on-screen log. The SDK calls globalThis.__piopiyLog for every internal
// trace when `debug: true`.

export const piopiy = new PIOPIY({
  name: APP_NAME,
  debug: true,
  callKeep: {ios: {appName: APP_NAME}},
  // autoPushToken defaults to true — the device token is handled for us.
  // The API base defaults to production (https://rest.telecmi.com/v2); set the
  // `apiBase` option only if you need to point at a different environment.
});

export type CallState = 'idle' | 'incoming' | 'outgoing' | 'active';

/**
 * Wire the events you care about. Names and payloads are fully typed.
 * `onState` reports connection / call state so the UI can react.
 */
export function onEvent(
  log: (line: string) => void,
  onState?: (s: {signedIn?: boolean; call?: CallState; peer?: string | null}) => void,
) {
  const set = (v: Parameters<NonNullable<typeof onState>>[0]) => onState && onState(v);
  // Pipe the SDK's internal traces into the same log view, replaying anything
  // logged before the UI was ready (including module-load failures).
  attachSdkLog(log);
  const handlers: Array<[PiopiyEventName, (d?: any) => void]> = [
    ['login', () => { set({signedIn: true}); log('✅ signed in — ready for calls'); }],
    ['loginFailed', d => { set({signedIn: false}); log(`⚠️ login failed: ${d?.code} ${d?.status}`); }],
    ['logout', () => { set({signedIn: false, call: 'idle', peer: null}); log('👋 signed out'); }],
    ['connected', () => log('connected')],
    ['disconnected', () => log('disconnected')],

    // The SDK registered this device for push automatically.
    ['pushRegistered', d => log(`📲 push token registered: ${JSON.stringify(d)}`)],

    ['inComingCall', c => { set({call: 'incoming', peer: c?.from ?? null}); log(`📞 incoming from ${c?.from} (${c?.call_id})`); }],
    ['trying', () => { set({call: 'outgoing'}); log('trying…'); }],
    ['ringing', () => log('ringing…')],
    ['answered', () => { set({call: 'active'}); log('call connected'); }],
    ['ended', () => { set({call: 'idle', peer: null}); log('call ended'); }],
    ['hangup', () => { set({call: 'idle', peer: null}); log('call hung up'); }],
    ['missedCall', m => log(`📵 missed call from ${m?.from} (${m?.reason})`)],
    ['error', e => log(`⚠️ error ${e?.code}: ${e?.status}`)],
  ];
  handlers.forEach(([evt, fn]) => piopiy.on(evt, fn));
  return () => handlers.forEach(([evt, fn]) => piopiy.off(evt, fn));
}

export async function login(user: string, password: string, region?: string) {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS,
    ].filter(Boolean) as any);
  }
  const useRegion = (region || '').trim() || DEFAULT_REGION;
  await saveCreds({user, password, region: useRegion});
  piopiy.login(user, password, useRegion);
}

// ---------------------------------------------------------------------------
// Saved sign-in details
//
// Convenience for testing so you don't retype credentials on every launch.
// ---------------------------------------------------------------------------
let savedCreds: SavedCreds | null = null;

export type SavedCreds = {user: string; password: string; region: string};

export async function saveCreds(c: SavedCreds): Promise<void> {
  savedCreds = c;
}

export async function loadCreds(): Promise<SavedCreds | null> {
  return savedCreds;
}

export async function clearCreds(): Promise<void> {
  savedCreds = null;
}

/**
 * Sign out. The SDK unregisters this device's push token first (so it stops
 * being woken for incoming calls), then tears down the session — you don't
 * have to call unregisterToken() yourself.
 */
export function signOut(log?: (line: string) => void) {
  piopiy.logout(res => {
    if (log) {
      log(`push token unregister → ${res?.code} ${res?.status ?? ''}`.trim());
    }
  });
}
