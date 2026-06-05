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
  }

  export default class PIOPIY {
    constructor(options?: PiopiyOptions);

    login(userId: string, password: string, region?: string): void;
    logout(): void;

    call(to: string, options?: {extra_param?: string}): void;
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
