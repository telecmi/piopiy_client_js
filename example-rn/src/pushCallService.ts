/**
 * pushCallService — push-token registration + killed-state wake-up.
 *
 * NOTE: CallKeep (the native incoming-call UI and the Answer/Reject wiring) now
 * lives INSIDE the SDK and auto-activates when react-native-callkeep is installed.
 * So this service no longer sets up CallKeep — it only does the parts that must
 * live in the app:
 *   • fetch the device push token (APNs VoIP / FCM) and register it with the SDK
 *   • persist credentials so a killed-state push can re-login
 *   • on a background/killed push: show the incoming-call UI + re-register
 *     (the SDK's built-in CallKeep bridge then takes over Answer/Reject)
 *
 * SECURITY NOTE: this example persists SIP credentials in AsyncStorage so the
 * headless wake-up path can re-login. In production use the Keychain / Keystore.
 */
import {EventEmitter} from 'events';
import {PermissionsAndroid, Platform} from 'react-native';
import PIOPIY from '@telecmi/piopiy-native';
import RNCallKeep from '@livekit/react-native-callkeep';
import VoipPushNotification from 'react-native-voip-push-notification';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @react-native-firebase is Android-only here (iOS uses PushKit) and is excluded
// from the iOS build via react-native.config.js — so it's lazy-required on Android.

const CREDS_KEY = '@piopiy/creds';
const DEBUG_KEY = '@piopiy/debuglog';
const DEFAULT_REGION = 'testsbc.telecmi.com';
// NOTE: In normal use you do NOT set a LiveKit/media URL — TeleCMI delivers the
// call's connection URL INSIDE the push, and the SDK uses it automatically. This
// constant is only a last-resort fallback for the rare push that carries no url
// (e.g. a local dev backend). A production integration can omit the `livekit`
// option entirely.
const LIVEKIT_URL = 'wss://livekit.telecmi.com';
const PUSH_INVITE_TIMEOUT_MS = 20000;

type Creds = {user: string; password: string; region: string};

/** Minimal v4 UUID for the killed-state CallKeep call (when the push has no uuid). */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class PushCallService extends EventEmitter {
  private piopiy: PIOPIY | null = null;
  private initialised = false;
  private lifecycleWired = false;
  private pushToken: string | null = null;
  private pendingWakeCallUUID: string | null = null;
  private pendingWakeTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeKeepAlive: ReturnType<typeof setInterval> | null = null;
  private lastPushUUID: string | null = null;
  private lastPushAt = 0;
  private debugLines: string[] = [];

  constructor() {
    super();
    // Persistent log sink: the SDK's internal [callkit]/[audio] traces call
    // globalThis.__piopiyLog, so they're captured to on-device storage alongside
    // [pushCall] lines — readable AFTER a killed/locked cold-launch, when
    // Console.app / Metro can't reach the device. See getDebugLog().
    try {
      (globalThis as any).__piopiyLog = (line: string) => this.persist(line);
    } catch {
      // ignore
    }
    // Recover a log persisted by a previous (possibly killed) process so the
    // cold-launch sequence survives a process restart before you read it.
    AsyncStorage.getItem(DEBUG_KEY)
      .then(raw => {
        if (!raw) {
          return;
        }
        try {
          this.debugLines = [...(JSON.parse(raw) as string[]), ...this.debugLines];
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }

  private persist(line: string): void {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    this.debugLines.push(`${ts} ${line}`);
    if (this.debugLines.length > 600) {
      this.debugLines = this.debugLines.slice(-600);
    }
    // fire-and-forget; survives a later process kill
    AsyncStorage.setItem(DEBUG_KEY, JSON.stringify(this.debugLines)).catch(() => {});
  }

  /** Full captured debug log (oldest→newest) for the app's Share/View button. */
  async getDebugLog(): Promise<string> {
    try {
      const raw = await AsyncStorage.getItem(DEBUG_KEY);
      const lines = raw ? (JSON.parse(raw) as string[]) : this.debugLines;
      return lines.join('\n');
    } catch {
      return this.debugLines.join('\n');
    }
  }

  /** Clear the captured log — call before each fresh killed-state test. */
  async clearDebugLog(): Promise<void> {
    this.debugLines = [];
    try {
      await AsyncStorage.removeItem(DEBUG_KEY);
    } catch {
      // ignore
    }
  }

  private log(line: string) {
    // eslint-disable-next-line no-console
    console.log('[pushCall]', line);
    this.persist(line);
    this.emit('log', line);
  }

  getClient(): PIOPIY {
    if (!this.piopiy) {
      // Constructing PIOPIY also activates the SDK's built-in CallKeep bridge (RN).
      this.piopiy = new PIOPIY({
        name: 'RN Push',
        debug: true,
        // Platform policy: calls never ring longer than 40s. Also bounds the
        // LiveKit push ring timeout (offline device stops ringing at 40s).
        ringTime: 40,
        // Shorter SIP registration so a backgrounded/killed app's stale contact
        // clears from the SBC fast → incoming calls fall through to push sooner.
        registerExpires: 120,
        callKeep: {ios: {appName: 'PiopiyRNExample'}},
        // Inbound-over-LiveKit: fallback server URL when the push has no `url`.
        livekit: {url: LIVEKIT_URL},
      });
    }
    return this.piopiy;
  }

  /** Idempotent. Safe to call from both index.js (headless) and App.tsx (UI). */
  init(): void {
    if (this.initialised) {
      return;
    }
    this.initialised = true;
    const piopiy = this.getClient();
    this.setupCallLifecycle(piopiy);
    this.setupPushTokens();
    this.log('service initialised (CallKeep handled by the SDK)');
  }

  private setupCallLifecycle(piopiy: PIOPIY): void {
    if (this.lifecycleWired) {
      return;
    }
    this.lifecycleWired = true;

    // Rich trace of the whole customer-call sequence, captured to the persistent
    // debug log so a killed/locked test can be read back after unlocking.
    piopiy.on('login', () => this.log('✅ login: REGISTERED with SBC'));
    piopiy.on('connected', () => this.log('socket: connected'));
    piopiy.on('disconnected', () => this.log('socket: disconnected'));
    piopiy.on('inComingCall', (d: any) => {
      this.log(`⭐ inComingCall — INVITE arrived from ${d?.from ?? '?'} (call_id=${d?.call_id ?? '?'})`);
      this.confirmPendingWakeCall('SIP INVITE received');
    });
    piopiy.on('trying', () => this.log('SIP: trying (100)'));
    piopiy.on('ringing', (d: any) => this.log(`SIP: ringing (${d?.type ?? '?'})`));
    piopiy.on('answered', () => {
      this.log('⭐ answered — 200 OK sent, media negotiating');
      this.confirmPendingWakeCall('call answered');
    });
    piopiy.on('callStream', () => this.log('callStream: remote media stream ready'));
    piopiy.on('mediaFailed', (d: any) => this.log(`⚠️ mediaFailed: ${JSON.stringify(d)}`));
    piopiy.on('loginFailed', (data: any) => {
      this.log(`⚠️ loginFailed: ${JSON.stringify(data)}`);
      this.cancelPendingWakeCall(`registration failed: ${JSON.stringify(data)}`);
    });
    piopiy.on('error', (d: any) => this.log(`⚠️ error: ${JSON.stringify(d)}`));
    // A ringing call ended without user action (caller hung up / ring timeout).
    // iOS already logs it in the Phone app's Recents via CallKit; a real app
    // would ALSO post a local notification here (e.g. notifee) — no server
    // push needed, the device knows everything already.
    piopiy.on('missedCall', (d: any) =>
      this.log(`📵 missedCall from ${d?.from ?? 'unknown'} (${d?.reason})`),
    );
    piopiy.on('ended', (d: any) => {
      this.log(`ended: ${JSON.stringify(d)}`);
      this.clearPendingWakeCall();
    });
    piopiy.on('hangup', (d: any) => {
      this.log(`hangup: ${JSON.stringify(d)}`);
      this.clearPendingWakeCall();
    });
  }

  // ---------------------------------------------------------------------------
  // Push tokens -> SDK.registerToken
  // ---------------------------------------------------------------------------
  private setupPushTokens(): void {
    this.log(`setupPushTokens on ${Platform.OS}`);

    if (Platform.OS === 'ios') {
      try {
        VoipPushNotification.addEventListener('register', (token: string) => {
          this.log(`iOS VoIP 'register' fired — token: ${this.short(token)}`);
          this.onPushToken(token);
        });
        VoipPushNotification.addEventListener('notification', (payload: any) => {
          this.log('iOS VoIP push received');
          this.onIncomingPush(payload?.data ?? payload);
        });
        VoipPushNotification.addEventListener('didLoadWithEvents', (events: any[]) => {
          this.log(`iOS didLoadWithEvents: ${JSON.stringify((events || []).map(e => e?.name))}`);
          (events || []).forEach(evt => {
            if (evt?.name === 'RNVoipPushRemoteNotificationReceivedEvent') {
              this.onIncomingPush(evt.data?.data ?? evt.data);
            } else if (evt?.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') {
              this.onPushToken(evt.data);
            }
          });
        });
        VoipPushNotification.registerVoipToken();
        this.log("iOS registerVoipToken() called — waiting for the 'register' event…");

        // No 'register' event = iOS issued no token (usually a setup gap, not a JS error).
        setTimeout(() => {
          if (!this.pushToken) {
            this.log(
              '⚠️ NO VoIP token after 10s. Likely causes: (1) AppDelegate PushKit not wired ' +
                '([RNVoipPushNotificationManager voipRegistration] + the pushRegistry: methods); ' +
                '(2) missing Push Notifications / Voice-over-IP capability in Xcode; ' +
                '(3) Push not enabled on the App ID (com.telecmi.piopirn) in your Apple Developer account; ' +
                '(4) running on a Simulator (VoIP push needs a real device).',
            );
          }
        }, 10000);
      } catch (e: any) {
        this.log(`iOS VoIP setup error: ${e?.message ?? e}`);
      }
    } else {
      try {
        const messaging = require('@react-native-firebase/messaging').default;
        messaging()
          .getToken()
          .then((token: string) => {
            this.log(`FCM getToken → ${this.short(token)}`);
            this.onPushToken(token);
          })
          .catch((e: any) => this.log(`FCM getToken failed: ${e?.message ?? e}`));
        messaging().onTokenRefresh((token: string) => this.onPushToken(token));
        messaging().onMessage(async (msg: any) => this.onIncomingPush(msg?.data));
      } catch (e: any) {
        this.log(`Android FCM setup error: ${e?.message ?? e}`);
      }
    }
  }

  private onPushToken(token: string | undefined | null): void {
    if (!token) {
      this.log('onPushToken called with an empty token — ignoring');
      return;
    }
    this.pushToken = token;
    this.log(`registering token with SBC (${Platform.OS})…`);
    // registerToken() queues until the login token is ready, so this is timing-safe.
    this.getClient().registerToken(this.pushDescriptor(token), (res: any) =>
      this.log(`registerToken → ${JSON.stringify(res)}`),
    );
  }

  /** Truncate a token for readable logs. */
  private short(token: string): string {
    return token ? `${token.slice(0, 10)}…(${token.length} chars)` : '(empty)';
  }

  private pushDescriptor(token: string) {
    return Platform.OS === 'ios'
      ? {provider: 'apns', token, platform: 'ios'}
      : {provider: 'fcm', token, platform: 'android'};
  }

  // ---------------------------------------------------------------------------
  // Killed / background push: show the call UI + re-register.
  // The SDK's CallKeep bridge takes over Answer/Reject from here (it sees this
  // display via `didDisplayIncomingCall` and de-dupes against its own).
  // ---------------------------------------------------------------------------
  async onIncomingPush(data: any): Promise<void> {
    const uuid = data?.uuid ?? data?.callUUID ?? uuidv4();
    const from = data?.from ?? data?.caller ?? 'Incoming call';

    // Caller hung up while we were still ringing — the SDK dismisses the CallKit
    // call. (The server sends a cancel push with the SAME uuid as the invite push.)
    if (data?.type === 'cancel_call') {
      this.log(`cancel push for ${uuid} — caller hung up, handing to the SDK`);
      (this.getClient() as any).handleIncomingPush({type: 'cancel_call', uuid, from});
      // SIP wake flow: stop the invite-wait keepalive/timeout for this call too.
      if (this.pendingWakeCallUUID === uuid) {
        this.clearPendingWakeCall();
      }
      return;
    }

    // Dedupe: a cold launch can deliver the SAME push twice — once via the
    // 'notification' event and once via the didLoadWithEvents replay. Processing it
    // twice runs login() twice; the second login tears down the first UA and builds
    // a new one, so the INVITE Kamailio forks lands on the orphaned/closed socket
    // and is never answered (Kamailio sees "registered ×2, forked ×2, no response").
    // Ignore a repeat of the same call within a short window.
    const now = Date.now();
    if (this.lastPushUUID === uuid && now - this.lastPushAt < 30000) {
      this.log(`duplicate push for ${uuid} — ignoring (already handling this call)`);
      return;
    }
    this.lastPushUUID = uuid;
    this.lastPushAt = now;

    // LiveKit inbound (gateway model): the push carries the held room + join
    // token — hand it to the SDK and skip the whole SIP re-register dance.
    // CallKit is already ringing (AppDelegate on iOS; displayed below on Android).
    const lkRoom = data?.room ?? data?.livekit_room;
    const lkToken = data?.token ?? data?.livekit_token;
    if (lkRoom && lkToken) {
      this.log(`⭐ LiveKit inbound — room ${lkRoom} from ${from}`);
      if (Platform.OS === 'android') {
        RNCallKeep.displayIncomingCall(uuid, String(from), String(from));
      }
      const accepted = (this.getClient() as any).handleIncomingPush({
        uuid,
        room: lkRoom,
        token: lkToken,
        url: data?.url ?? data?.livekit_url,
        from,
      });
      if (!accepted) {
        this.log('⚠️ handleIncomingPush rejected (engine unavailable or bad payload)');
      }
      return;
    }

    this.log(`incoming push from ${from}`);
    this.startPendingWakeCall(uuid);

    // iOS already reported the VoIP push synchronously in AppDelegate. Android
    // reaches this path from FCM, so JS is responsible for showing CallKeep.
    if (Platform.OS === 'android') {
      RNCallKeep.displayIncomingCall(uuid, String(from), String(from));
    }

    const registerStarted = await this.ensureRegistered();
    if (!registerStarted) {
      this.cancelPendingWakeCall('unable to start registration after push');
    }
  }

  private async ensureRegistered(): Promise<boolean> {
    const piopiy = this.getClient();
    const creds = await this.loadCreds();
    if (!creds) {
      this.log('no stored credentials — cannot re-register for the push');
      return false;
    }

    let loggedIn = false;
    try {
      loggedIn = piopiy.isLogedIn();
    } catch {
      loggedIn = false;
    }

    if (!loggedIn) {
      // Killed / cold launch: no UA yet → full login (which sends REGISTER).
      this.log('push wake: re-login');
      try {
        piopiy.login(creds.user, creds.password, creds.region);
        return true;
      } catch (e: any) {
        this.log(`push wake login failed to start: ${e?.message ?? e}`);
        return false;
      }
    }

    // App was only backgrounded: iOS suspended us, so the WebSocket is almost
    // certainly dead even though jsSIP may still report "connected". login() is a
    // no-op while registered, so it would NOT send the fresh REGISTER that
    // Kamailio's tsilo needs to fork the parked INVITE down to this device.
    // Force a transport reconnect + re-REGISTER via the SDK's net-recovery path.
    this.log('push wake: forcing reconnect + re-register');
    try {
      (piopiy as any).emit('net_changed');
      return true;
    } catch {
      // last resort — attempt a fresh login
      try {
        piopiy.login(creds.user, creds.password, creds.region);
        return true;
      } catch (e: any) {
        this.log(`push wake fallback login failed to start: ${e?.message ?? e}`);
        return false;
      }
    }
  }

  private startPendingWakeCall(uuid: string): void {
    if (this.pendingWakeCallUUID && this.pendingWakeCallUUID !== uuid) {
      this.cancelPendingWakeCall('new push replaced pending wake call');
    }

    this.pendingWakeCallUUID = uuid;

    // Keep the JS runtime scheduled while we wait for the forked INVITE. On a push
    // wake-up, iOS parks the JS the moment the re-REGISTER settles — so jsSIP never
    // parses the INVITE, which arrives once, right after the 200 OK (SIP-over-WS has
    // no retransmission). A light repeating timer keeps the event loop alive through
    // the CallKit window so the incoming INVITE is actually received and answered.
    // Touching the SIP connection each tick also nudges jsSIP's socket processing.
    // Cleared as soon as the call resolves (confirmed/cancelled/ended).
    if (this.wakeKeepAlive) {
      clearInterval(this.wakeKeepAlive);
    }
    this.wakeKeepAlive = setInterval(() => {
      try {
        this.piopiy?.isConnected();
      } catch {
        // ignore
      }
    }, 250);

    if (this.pendingWakeTimer) {
      clearTimeout(this.pendingWakeTimer);
    }
    this.pendingWakeTimer = setTimeout(() => {
      this.cancelPendingWakeCall('no SIP INVITE after push re-register timeout');
    }, PUSH_INVITE_TIMEOUT_MS);
  }

  private confirmPendingWakeCall(reason: string): void {
    if (!this.pendingWakeCallUUID) {
      return;
    }
    this.log(`push call confirmed: ${reason}`);
    this.clearPendingWakeCall();
  }

  private cancelPendingWakeCall(reason: string): void {
    const uuid = this.pendingWakeCallUUID;
    if (!uuid) {
      return;
    }
    this.log(`ending provisional push call: ${reason}`);
    this.clearPendingWakeCall();
    try {
      (this.getClient() as any).emit('callkeepCancel', {uuid, reason});
    } catch {
      // ignore
    }
    try {
      RNCallKeep.endCall(uuid);
    } catch (e: any) {
      this.log(`RNCallKeep.endCall failed: ${e?.message ?? e}`);
    }
  }

  private clearPendingWakeCall(): void {
    if (this.pendingWakeTimer) {
      clearTimeout(this.pendingWakeTimer);
      this.pendingWakeTimer = null;
    }
    if (this.wakeKeepAlive) {
      clearInterval(this.wakeKeepAlive);
      this.wakeKeepAlive = null;
    }
    this.pendingWakeCallUUID = null;
  }

  // ---------------------------------------------------------------------------
  // Public control surface (App.tsx buttons + index.js)
  // ---------------------------------------------------------------------------

  /**
   * Auto-login from credentials saved in local storage. Call on app launch so the
   * app re-registers automatically without re-entering anything. Returns the creds
   * it used, or null if nothing was stored (then show the login screen).
   */
  async tryAutoLogin(): Promise<Creds | null> {
    const creds = await this.loadCreds();
    if (!creds) {
      this.log('autoLogin: no saved credentials — showing login');
      return null;
    }
    this.log(`autoLogin: signing in as ${creds.user} @ ${creds.region}`);
    await this.login(creds.user, creds.password, creds.region);
    return creds;
  }

  async login(user: string, password: string, region: string): Promise<void> {
    const creds: Creds = {user, password, region: region || DEFAULT_REGION};
    await this.saveCreds(creds);
    await this.requestPermissions();
    const piopiy = this.getClient();
    piopiy.login(creds.user, creds.password, creds.region);
    if (this.pushToken) {
      piopiy.registerToken(this.pushDescriptor(this.pushToken));
    }
  }

  // The native CallKeep UI is wired by the SDK; these back the in-app buttons.
  answer(): void {
    this.piopiy?.answer();
  }
  reject(): void {
    this.piopiy?.reject();
  }
  hangup(): void {
    this.piopiy?.terminate();
  }

  async logout(): Promise<void> {
    try {
      this.piopiy?.unregisterToken();
      this.piopiy?.logout();
    } finally {
      await AsyncStorage.removeItem(CREDS_KEY);
    }
  }

  // ---------------------------------------------------------------------------
  // Permissions + credential persistence
  // ---------------------------------------------------------------------------
  private async requestPermissions(): Promise<void> {
    // iOS VoIP push (PushKit) needs no user permission.
    if (Platform.OS !== 'android') {
      return;
    }
    const perms = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS,
    ].filter(Boolean);
    try {
      await PermissionsAndroid.requestMultiple(perms as any);
    } catch (e: any) {
      this.log(`permission request failed: ${e?.message ?? e}`);
    }
  }

  private async saveCreds(creds: Creds): Promise<void> {
    try {
      await AsyncStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    } catch (e: any) {
      this.log(`saveCreds failed: ${e?.message ?? e}`);
    }
  }

  private async loadCreds(): Promise<Creds | null> {
    try {
      const raw = await AsyncStorage.getItem(CREDS_KEY);
      return raw ? (JSON.parse(raw) as Creds) : null;
    } catch {
      return null;
    }
  }
}

// Single shared instance for the whole app (UI + headless push paths).
const pushCallService = new PushCallService();
export default pushCallService;
