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
  logout(): void;

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
   * Subscribe to an SDK event. Common events:
   *  - 'login' | 'loginFailed' | 'connected' | 'disconnected'
   *  - 'inComingCall' `{ from, call_id, transport }` — an inbound call is ringing
   *  - 'trying' | 'ringing' | 'answered' | 'callStream' | 'mediaFailed'
   *  - 'ended' | 'hangup' — the call terminated (also fires when a ringing call
   *    is cancelled/rejected/times out, so app UI can dismiss)
   *  - 'missedCall' `{ uuid, from, reason: 'cancelled' | 'ring_timeout', transport }`
   *    — a ringing call ended without the user acting on it; show a local
   *    missed-call notification (a deliberate reject does NOT emit this)
   *  - 'error' | 'pushRegistered'
   */
  on(event: string, handler: (data: any) => void): this;
  off(event: string, handler: (data: any) => void): this;
  removeAllListeners(event?: string): this;
  emit(event: string, ...args: any[]): boolean;
}
