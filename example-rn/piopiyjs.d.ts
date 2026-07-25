// Minimal ambient types for the local piopiyjs SDK (it ships as plain JS).
// Lets the example app's editor/tsc understand the imported class.
declare module 'piopiyjs' {
  type PiopiyHandler = (data: any) => void;

  export interface PiopiyOptions {
    name?: string;
    debug?: boolean;
    autoplay?: boolean;
    autoReboot?: boolean;
    ringTime?: number;
    /** SIP registration lifetime in seconds (default 120). Shorter clears a stale contact from the SBC faster so calls fall through to push sooner. */
    registerExpires?: number;
    /** CallKeep config for the built-in native call-UI bridge (RN only, auto-activates when react-native-callkeep is installed). */
    callKeep?: {ios?: Record<string, any>; android?: Record<string, any>};
    /** LiveKit inbound-call config (RN only): fallback server URL when the push payload has no `url`. */
    livekit?: {url?: string};
  }

  /** Device push descriptor passed to registerToken(); POSTed to the backend push API. */
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

    /** Register the device push token with the backend (POST /push/register). Call after login(). */
    registerToken(push: PiopiyPushOptions, callback?: (data: any) => void): void;
    /** Remove the device push token from the backend (POST /push/unregister). */
    unregisterToken(callback?: (data: any) => void): void;

    call(to: string, options?: {extra_param?: string}): void;
    /** Feed an inbound VoIP push carrying LiveKit room info ({uuid, room, token, url?, from?}). RN only. */
    livekitIncoming(info: {uuid: string; room: string; token: string; url?: string; from?: string}): boolean;
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

    on(event: string, handler: PiopiyHandler): this;
    off(event: string, handler: PiopiyHandler): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: any[]): boolean;
  }
}
