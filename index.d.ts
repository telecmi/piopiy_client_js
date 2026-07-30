export interface PiopiyOptions {
  name?: string;
  debug?: boolean;
  autoplay?: boolean;
  autoReboot?: boolean;
  ringTime?: number;
  /**
   * How long the device stays registered, in seconds (default 120). A shorter
   * value clears a killed/backgrounded app's stale registration faster, so
   * incoming calls fall through to the push path sooner instead of being sent
   * to a device that can no longer answer. 60–120 suits most mobile apps.
   */
  registerExpires?: number;
  /**
   * Optional config for the built-in CallKeep bridge (React Native only). The bridge
   * auto-activates when `react-native-callkeep` is installed — it shows the native
   * incoming-call UI for foreground calls and routes Answer/Reject back to the SDK.
   * e.g. `{ ios: { appName: 'MyApp' }, android: { foregroundService: {...} } }`.
   */
  callKeep?: { ios?: Record<string, any>; android?: Record<string, any> };
  /**
   * Automatically fetch this device's push token and register it with TeleCMI,
   * re-registering whenever the OS rotates it (React Native only; **default
   * `true`**). Requires `react-native-voip-push-notification` (iOS) and
   * `@react-native-firebase/messaging` (Android) — if they aren't installed the
   * SDK stays inert. Set `false` to manage the token yourself via
   * `registerToken()`.
   */
  autoPushToken?: boolean;
  /**
   * Android push (React Native only): your app's Firebase messaging module.
   * Install `@react-native-firebase/app` + `/messaging`, then pass:
   * ```ts
   * messaging: Platform.OS === 'android'
   *   ? require('@react-native-firebase/messaging').default
   *   : undefined
   * ```
   * The SDK never imports Firebase itself, so iOS-only apps skip Firebase
   * entirely. Without this option, Android push is disabled (logged, no crash).
   */
  messaging?: unknown;
  /**
   * Override the TeleCMI API base URL used for login and push-token
   * registration. Defaults to production — set this only for testing against a
   * staging environment, e.g. `'https://stagerest.telecmi.com/v2'`.
   */
  apiBase?: string;
  /**
   * @internal Advanced/testing only — normally omitted. Fallback media server
   * URL used if an inbound-call push arrives without one. In production the
   * platform delivers the URL inside the push and the SDK connects
   * automatically, so you should not set this.
   */
  livekit?: { url?: string };
}

/**
 * Device push descriptor passed to `registerToken()`. The SDK registers it with
 * TeleCMI so this device can be woken when a call arrives while the app is
 * backgrounded or killed.
 * **React Native only** — a no-op on the web build (browsers have no APNs/FCM).
 */
export interface PiopiyPushOptions {
  /** Push service: "apns" (iOS VoIP) or "fcm" (Android). */
  provider: string;
  /** The device push token. */
  token: string;
  /** Optional device platform, "ios" | "android". */
  platform?: string;
}

export default class PIOPIY {
  constructor(options?: PiopiyOptions);

  login(userId: string, password: string, region?: string): void;
  /**
   * Sign out. On React Native the device's push token is unregistered from
   * TeleCMI first, so this device stops being woken for incoming calls; the
   * session is then torn down. The optional callback receives the unregister
   * response (`{ code: 200 }` on success).
   */
  logout(callback?: (data: any) => void): void;

  /** Register the device push token with TeleCMI so this device can be woken for incoming calls. Call after login(). React Native only; no-op on web. */
  registerToken(push: PiopiyPushOptions, callback?: (data: any) => void): void;
  /** Remove the device push token (e.g. on logout or Do-Not-Disturb). React Native only; no-op on web. */
  unregisterToken(callback?: (data: any) => void): void;

  call(to: string, options?: { extra_param?: string }): void;
  /**
   * Hand an inbound-call push to the SDK (React Native only). Forward the raw
   * push payload; the SDK shows the incoming-call UI and connects on answer.
   *  - invite `{uuid, ...}` — rings (emits 'inComingCall')
   *  - cancel `{type: 'cancel_call', uuid}` — caller hung up while ringing;
   *    dismisses the incoming-call UI.
   */
  /**
   * Android only: register the handler for call pushes that arrive while the
   * app is backgrounded or killed. Call once from index.js at module scope.
   * Safe no-op on iOS and web. Foreground pushes are forwarded automatically.
   */
  registerBackgroundPushHandler(): boolean;
  handleIncomingPush(
    info:
      | { uuid: string; [key: string]: any }
      | { type: 'cancel_call'; uuid: string; from?: string },
  ): boolean;
  /** @deprecated Renamed to handleIncomingPush(). */
  livekitIncoming(info: { uuid: string; [key: string]: any }): boolean;
  answer(): void;
  reject(): void;
  terminate(): void;
  reRegister(): void;

  sendDtmf(tone: string | number): void;
  hold(): void;
  unHold(): void;
  mute(): void;
  unMute(): void;
  
  /** Route call audio to the loudspeaker (true) or earpiece (false). React Native only; no-op on web. */
  speaker(on: boolean): boolean;

  isLogedIn(): boolean;
  isConnected(): boolean;
  onHold(): boolean;
  onMute(): boolean;
  /** Whether the loudspeaker is currently on. */
  onSpeaker(): boolean;

  transfer(to: string, callback?: (data: any) => void): void;
  teamTransfer(to: string, callback?: (data: any) => void): void;
  merge(): void;
  cancel(): void;

  getCallId(): string | false;
  getCallID(): string | false;

  /**
   * Subscribe to an SDK event. Event names and payloads are fully typed — see
   * {@link PiopiyEventMap}. Unknown names are a compile-time error, so typos
   * like `'incomingCall'` are caught before they silently do nothing.
   *
   * ```ts
   * piopiy.on('inComingCall', (call) => {
   *   console.log(call.from);   // typed
   *   piopiy.answer();
   * });
   * ```
   */
  on<E extends PiopiyEventName>(event: E, handler: (data: PiopiyEventMap[E]) => void): this;
  off<E extends PiopiyEventName>(event: E, handler: (data: PiopiyEventMap[E]) => void): this;
  once<E extends PiopiyEventName>(event: E, handler: (data: PiopiyEventMap[E]) => void): this;
  removeAllListeners(event?: PiopiyEventName): this;
  emit<E extends PiopiyEventName>(event: E, ...args: any[]): boolean;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Generic `{ code, status }` payload used by most lifecycle events. */
export interface PiopiyStatus {
  code: number;
  status: string;
}

/** An inbound call is ringing. Extra fields come from TeleCMI call routing. */
export interface PiopiyIncomingCall {
  /** Caller's display name or number. */
  from: string;
  /**
   * Caller's resolved display name (e.g. the customer's name from your CRM),
   * when the platform provides it. Absent otherwise — show `from` instead.
   */
  name?: string;
  /** Unique TeleCMI call UUID (falls back to the protocol call id). */
  call_id: string;
  /** Team that routed the call, when applicable. */
  team_name?: string;
  /** The destination number that was dialled. */
  to_number?: string;
  /** Extension that transferred the call to you, when applicable. */
  transfer_from?: string;
  /** Additional transfer routing information. */
  transfer?: string;
  /** `'push'` when the call was delivered via a push notification. */
  transport?: 'push';
}

/** A ringing call ended without the user acting on it. React Native. */
export interface PiopiyMissedCall {
  uuid: string;
  /** Caller's number, when the platform provided it. */
  from: string | null;
  /** `'cancelled'` = caller hung up · `'ring_timeout'` = rang out (e.g. offline). */
  reason: 'cancelled' | 'ring_timeout';
  transport?: 'push';
}

/** Call terminated. `reason`/`transport` are present on push-delivered calls. */
export interface PiopiyEnded extends PiopiyStatus {
  reason?: string;
  transport?: 'push';
}

/** Remote media stream is ready (`status` is the WebRTC MediaStream). */
export interface PiopiyCallStream {
  code: number;
  status: any;
}

/** Hold state changed. `whom` says which side initiated it. */
export interface PiopiyHold extends PiopiyStatus {
  whom: 'myself' | 'other';
}

/** Outbound vs inbound leg for progress events. */
export interface PiopiyProgress extends PiopiyStatus {
  type?: 'outbound' | 'incoming';
}

/** A DTMF tone was sent or received. */
export interface PiopiyDtmf {
  code: number;
  dtmf: string;
  type: 'incoming' | 'outgoing';
}

/** Every event the SDK emits, mapped to its payload type. */
export interface PiopiyEventMap {
  // --- connection & registration ---
  connected: PiopiyStatus;
  disconnected: PiopiyStatus;
  login: PiopiyStatus;
  loginFailed: PiopiyStatus;
  logout: PiopiyStatus;
  /** The server ended this session (e.g. the extension signed in elsewhere). */
  sbc_logout: { code: number; reason: string };
  /** The transport dropped; the SDK reconnects automatically. */
  net_changed: { code: number; msg: string };

  // --- call lifecycle ---
  inComingCall: PiopiyIncomingCall;
  trying: PiopiyProgress;
  ringing: PiopiyProgress;
  answered: PiopiyStatus & { transport?: 'push' };
  hold: PiopiyHold;
  unhold: PiopiyHold;
  ended: PiopiyEnded;
  hangup: PiopiyStatus;
  missedCall: PiopiyMissedCall;
  error: PiopiyStatus;

  // --- media ---
  callStream: PiopiyCallStream;
  mediaFailed: PiopiyStatus;
  dtmf: PiopiyDtmf;
  NETStats: { code: number; msg: string };
  RTC: { state: 'connected' | 'disconnected'; msg: string };
  RTCStats: any;

  // --- push (React Native) ---
  pushRegistered: any;
  pushUnregistered: any;
  /** Internal: the native incoming-call UI should be dismissed. */
  callkeepCancel: { uuid: string; reason: string };

  // --- server notifications ---
  transfer: { state: 'init' | 'trying' | 'answered' | 'failed' | 'ended'; [key: string]: any };
  record: { state: 'start' | 'stop'; [key: string]: any };
}

/** Union of every valid event name. */
export type PiopiyEventName = keyof PiopiyEventMap;
