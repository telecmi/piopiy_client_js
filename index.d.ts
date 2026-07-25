export interface PiopiyOptions {
  name?: string;
  debug?: boolean;
  autoplay?: boolean;
  autoReboot?: boolean;
  ringTime?: number;
  /**
   * SIP registration lifetime in seconds (default 120; jsSIP's own default is 600).
   * A shorter expiry means a stale contact from a killed/backgrounded app clears from
   * the SBC faster, so incoming calls fall through to the push-notification path sooner
   * instead of being relayed to a dead socket. 60–120 is a good mobile range.
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
   * LiveKit inbound-call config (React Native only). Inbound calls arrive the
   * gateway way: the VoIP push carries {uuid, room, token, url?}; the SDK holds
   * it and joins the room when the user answers. `url` is the fallback LiveKit
   * server URL for pushes that carry none.
   */
  livekit?: { url?: string };
}

/**
 * Device push descriptor passed to `registerToken()`. The SDK POSTs it to the
 * backend push API so the SBC can wake this device when a call arrives offline.
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

  /** Register the device push token with the backend (POST /push/register). Call after login(). React Native only; no-op on web. */
  registerToken(push: PiopiyPushOptions, callback?: (data: any) => void): void;
  /** Remove the device push token from the backend (POST /push/unregister). React Native only; no-op on web. */
  unregisterToken(callback?: (data: any) => void): void;

  call(to: string, options?: { extra_param?: string }): void;
  /**
   * Feed an inbound-call VoIP push to the SDK (React Native only). Two shapes:
   *  - invite `{uuid, room, token, url?, from?}` — emits 'inComingCall' and
   *    joins the held room when the user answers.
   *  - cancel `{type: 'cancel_call', uuid}` — the caller hung up while this
   *    device was still ringing; dismisses the CallKit/ConnectionService UI and
   *    the pending call.
   */
  livekitIncoming(
    info:
      | { uuid: string; room: string; token: string; url?: string; from?: string }
      | { type: 'cancel_call'; uuid: string; from?: string },
  ): boolean;
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
