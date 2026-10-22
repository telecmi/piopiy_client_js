// Built-in CallKeep bridge — React Native build.
//
// Auto-activates whenever `react-native-callkeep` is installed: it shows the
// native incoming-call UI for foreground calls and wires the user's Answer/Reject
// taps back to the SDK, so apps don't have to write this bridge themselves.
//
// Scope = "bridge only": for the backgrounded/killed path, iOS reports the VoIP
// push synchronously in AppDelegate and Android shows CallKeep from the FCM
// handler. This bridge listens via `didDisplayIncomingCall` and dedupes, so it
// never double-shows the call.
import { Platform, Linking, NativeModules } from 'react-native';
// Shared audio-session controls. On iOS the bridge starts/stops InCallManager in
// lock-step with CallKit's audio session (see the `didActivateAudioSession` wiring
// below); session.native.js defers its own start when setCallKitAudioManaged(true).
import { callAudio, setCallKitAudioManaged, webrtcAudio } from './session';

// Internal debug hook. TEMP: enabled to trace the answer/audio flow during
// debugging — the lines appear in the Metro console as [piopiy:callkit] …
// Set CK_DEBUG = false (or restore the no-op) before publishing the SDK.
const CK_DEBUG = false;
const dbg = ( ...args ) => {
    // eslint-disable-next-line no-console -- gated debug logging
    if ( CK_DEBUG ) { console.log( '[piopiy:callkit]', ...args ); }
    // Optional persistent sink (set by the host app as globalThis.__piopiyLog) so
    // the killed/locked cold-launch sequence can be read from on-device storage
    // after unlocking — Console.app/Metro aren't usable on a locked cold-launch.
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__piopiyLog === 'function' ) {
            g.__piopiyLog( '[callkit] ' + args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' ) );
        }
    } catch { /* ignore */ }
};

// Optional native peer — the app installs react-native-callkeep (native
// AppDelegate/manifest wiring lives there). The @livekit fork is accepted as
// a drop-in alternative. Degrade gracefully if neither is installed.
// Require ONLY 'react-native-callkeep' — the package the setup guide tells apps
// to install. Metro resolves require() statically, so adding a fallback require
// for a fork the app hasn't installed makes the bundle fail at runtime with
// The SDK ships its OWN CallKeep — @telecmi/react-native-callkeep, upstream
// 4.3.16 plus the duplicate-@ReactMethod fix that crashes Android on RN 0.76+.
// Bundling it means apps install nothing and patch nothing (patch-package is
// gone from the setup). Do NOT also install react-native-callkeep in the app:
// two copies of the same native module collide at pod install / gradle build.
let RNCallKeep = null;
try {
    const mod = require( '@telecmi/react-native-callkeep' );
    RNCallKeep = mod && ( mod.default || mod );
} catch {
    RNCallKeep = null;
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, ( c ) => {
        const r = ( Math.random() * 16 ) | 0;
        const v = c === 'x' ? r : ( r & 0x3 ) | 0x8;
        return v.toString( 16 );
    } );
}

export default class CallKeepBridge {

    constructor( piopiy, config ) {
        this.piopiy = piopiy;
        this.config = config || {};
        this.currentCallUUID = null;   // the CallKeep call currently shown (ours or the push handler's)
        this.hasIncomingSession = false; // true once the SDK's INVITE has arrived
        this.pendingAnswer = false;    // user answered before the INVITE landed
        this.callActive = false;
        this.answeredViaCallKit = false; // answer came from the CallKit UI (so CallKit will activate the audio session)
        this.audioStarted = false;     // iOS: CallKit's audio session is active
        this.audioSessionActive = false;
        this.pendingAudioAnswer = false;
        this.audioAnswerTimer = null;
        this.inviteTimer = null;       // dismisses a "ghost" CallKit call if no INVITE arrives in time
        this.replayedInitialEvents = {}; // de-dupe CallKit actions replayed after a cold start
        // How long to wait for the SIP INVITE after a pushed call is displayed
        // before giving up and ending the CallKit UI. Override via callKeep config.
        this.inviteTimeoutMs = ( this.config.inviteTimeoutMs ) || 25000;
        // Android: route inbound VOICE through the fork's SELF-MANAGED phone
        // account instead of the system-managed one. Self-managed calls show the
        // app's own ring surfaces (WhatsApp-style Answer/Reject notification and
        // a full-screen in-call screen) and keep the app foreground, so the JS
        // LiveKit room join + audio can't be suspended by the system InCall UI
        // taking the foreground/audio focus. Enable via
        // callKeep.android.selfManagedVoice.
        this.selfManagedVoice = !!( this.config.android && this.config.android.selfManagedVoice );

        if ( !RNCallKeep ) {
            // react-native-callkeep not installed — bridge stays inert.
            return;
        }

        this._setup();
        this._wire();
    }

    // --- Calling-account helpers (Android) ---
    //
    // System-managed ConnectionService calls only show UI when the user has
    // enabled this app's PhoneAccount. Samsung/Moto/Vivo/iQOO expose it under
    // Settings → Calls → Calling accounts, but Realme/OPPO ODialer (Realme UI /
    // ColorOS, e.g. Realme C83 / Realme 11 on Android 16) hides that entry, so
    // the account stays registered-but-disabled and displayIncomingCall() is a
    // silent no-op: the JS log shows "pending inbound call" but no system UI.
    // These helpers let the app detect that state and deep-link straight to
    // the Telecom toggle, bypassing the hidden Settings entry.

    /** True when this app's PhoneAccount is registered AND enabled. Android only (iOS: true). */
    async hasPhoneAccount() {
        if ( Platform.OS !== 'android' ) return true;
        if ( !RNCallKeep ) return false;
        try {
            if ( typeof RNCallKeep.hasPhoneAccount === 'function' ) {
                return !!( await RNCallKeep.hasPhoneAccount() );
            }
        } catch ( e ) {
            dbg( 'hasPhoneAccount check failed:', e && e.message );
        }
        try {
            if ( typeof RNCallKeep.checkPhoneAccountEnabled === 'function' ) {
                return !!( await RNCallKeep.checkPhoneAccountEnabled() );
            }
        } catch ( e ) {
            dbg( 'checkPhoneAccountEnabled failed:', e && e.message );
        }
        return false;
    }

    /** Alias kept for readability at call sites. */
    checkPhoneAccountEnabled() {
        return this.hasPhoneAccount();
    }

    /** An app-provided native helper that can open the Calling-accounts screen
     *  on OEMs whose ODialer ignores the generic intent (Realme/OPPO/…). Apps
     *  add a tiny native module named `PiopiyCallingAccounts` with `open()`;
     *  when present the SDK routes both its own call and CallKeep's first-run
     *  prompt through it. See README.react-native-android.md. */
    _callingAccountsHelper() {
        try {
            const h = NativeModules && NativeModules.PiopiyCallingAccounts;
            return ( h && typeof h.open === 'function' ) ? h : null;
        } catch { /* ignore */ }
        return null;
    }

    /** Redirect CallKeep's OWN first-run "enable calling account" prompt to the
     *  helper. The fork only targets Samsung/OnePlus with the explicit Telecom
     *  activity; everywhere else (Realme!) its OK button fires the generic
     *  intent, which ODialer swallows — so the user taps OK and nothing happens.
     *  Overriding the native module's method makes that same OK open the screen.
     *  Must run BEFORE CallKeep.setup() triggers the prompt. */
    _redirectCallKeepAccountPrompt() {
        const helper = this._callingAccountsHelper();
        if ( !helper ) return;
        try {
            const rnck = NativeModules && NativeModules.RNCallKeep;
            if ( !rnck ) return;
            const open = () => { try { helper.open(); } catch { /* ignore */ } };
            rnck.openPhoneAccounts = open;
            rnck.openPhoneAccountSettings = open;
            dbg( 'calling-account prompt redirected to PiopiyCallingAccounts helper' );
        } catch ( e ) {
            dbg( 'redirect of CallKeep account prompt failed:', e && e.message );
        }
    }

    /**
     * Open the system Calling-accounts screen so the user can enable this app.
     * Prefers an app-provided `PiopiyCallingAccounts` native helper (works on
     * Realme/OPPO where the generic intent is swallowed), then the bundled
     * native module (Samsung/OnePlus explicit path), then the generic action.
     * Returns true if an intent was fired. Android only (iOS: false).
     */
    async openPhoneAccounts() {
        if ( Platform.OS !== 'android' ) return false;
        // 0. App-provided helper — the only path that works on Realme/OPPO.
        const helper = this._callingAccountsHelper();
        if ( helper ) {
            try {
                const ok = await helper.open();
                dbg( 'openPhoneAccounts via PiopiyCallingAccounts helper →', ok );
                if ( ok ) return true;
            } catch ( e ) {
                dbg( 'PiopiyCallingAccounts helper failed:', e && e.message );
            }
        }
        const mod = ( NativeModules && NativeModules.RNCallKeep ) || null;
        // 1. Bundled native module (Samsung/OnePlus explicit path + generic fallback inside).
        if ( mod ) {
            try {
                if ( typeof mod.openPhoneAccounts === 'function' ) {
                    mod.openPhoneAccounts();
                    dbg( 'openPhoneAccounts via native module' );
                    return true;
                }
            } catch ( e ) {
                dbg( 'native openPhoneAccounts failed:', e && e.message );
            }
            try {
                if ( typeof mod.openPhoneAccountSettings === 'function' ) {
                    mod.openPhoneAccountSettings();
                    dbg( 'openPhoneAccountSettings via native module' );
                    return true;
                }
            } catch ( e ) {
                dbg( 'native openPhoneAccountSettings failed:', e && e.message );
            }
        }
        // 2. Explicit Telecom component — reaches Realme/OPPO/vivo/Xiaomi
        // ODialer builds where the generic action resolves to nothing.
        try {
            const manufacturer = String( ( Platform.constants && Platform.constants.Manufacturer ) || '' ).toLowerCase();
            const needsExplicit = /realme|oppo|vivo|iqoo|oneplus|samsung|xiaomi|redmi|poco/i.test( manufacturer ) || true;
            if ( needsExplicit && Linking && typeof Linking.sendIntent === 'function' ) {
                await Linking.sendIntent( 'android.telecom.action.CHANGE_PHONE_ACCOUNTS', [] );
                dbg( 'openPhoneAccounts via Linking.sendIntent CHANGE_PHONE_ACCOUNTS' );
                return true;
            }
        } catch ( e ) {
            dbg( 'Linking.sendIntent CHANGE_PHONE_ACCOUNTS failed:', e && e.message );
        }
        // 3. Generic view fallback.
        try {
            if ( Linking && typeof Linking.openSettings === 'function' ) {
                await Linking.openSettings();
                return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    /**
     * Fire-and-forget guard used before showing Android UI: when the account
     * is disabled, displayIncomingCall() silently does nothing, so log loudly
     * (with the fix action) instead of leaving only "incoming from …" behind.
     */
    _warnIfAccountDisabled( where ) {
        if ( Platform.OS !== 'android' || !RNCallKeep ) return;
        this.hasPhoneAccount().then( ( ok ) => {
            if ( !ok ) {
                dbg( ( where || 'incoming call' ) + ': PhoneAccount DISABLED — system UI will not show. '
                    + 'Realme/OPPO: open Calling accounts via piopiy.openPhoneAccounts() and enable this app, '
                    + 'then set battery to Unrestricted + Auto-start on.' );
                try {
                    this.piopiy.emit( 'error', {
                        code: 1011,
                        status: 'calling account disabled — enable it via openPhoneAccounts()',
                    } );
                } catch { /* ignore */ }
            }
        } ).catch( () => { } );
    }

    // Safe event registration. RNCallKeep.addEventListener(type) internally calls
    // listeners[type](handler); an unknown/misspelled type makes that an undefined
    // call that THROWS — and since this runs in the constructor, it would crash the
    // whole app at startup (AppRegistry never runs). Swallow it so one bad listener
    // only disables that one feature.
    _on( type, handler ) {
        try {
            RNCallKeep.addEventListener( type, handler );
        } catch ( e ) {
            dbg( 'addEventListener("' + type + '") failed:', e && e.message );
        }
    }

    // What the native call screen shows as the caller. Caller name when the
    // platform resolved one, else the number; team/queue appended when present:
    //   "Priya Sharma — support3"  ·  "+91… — support3"  ·  "+91…"
    /**
     * Route the app's call audio to the loudspeaker (true) or back to the
     * default route (false).
     *
     * On Android 12+ the legacy setSpeakerphoneOn() is a no-op for apps that
     * are not the default dialer — the app asks for the loudspeaker and the
     * WebRTC audio stays on the earpiece. The native layer sets the
     * communication device explicitly instead.
     */
    setSpeakerOn( on ) {
        try {
            if ( typeof RNCallKeep.setSpeakerOn !== 'function' ) return false;
            RNCallKeep.setSpeakerOn( !!on );
            return true;
        } catch ( e ) {
            dbg( 'setSpeakerOn failed:', e && e.message );
            return false;
        }
    }

    _callDisplay( d, from ) {
        const name = ( d && d.name && String( d.name ).trim() ) || '';
        const team = ( d && ( d.team_name || d.team ) ) || '';
        const primary = name || from;
        return team ? primary + ' — ' + team : primary;
    }

    /**
     * Set the DISPLAY name of the ringing call.
     *
     * The platform only knows the caller's NUMBER; the app resolves the real
     * name from its own contacts DB and hands it over here, so the native ring
     * notification (and the OS call UI) show "Priya Sharma" instead of
     * "+91 12031 34091". The notification is updated IN PLACE — no new
     * heads-up, no re-ring — and the "— <team>" suffix of the caller line is
     * kept.
     */
    setIncomingCallName( name ) {
        if ( !name || !this.currentCallUUID ) return false;
        const team = this._incomingTeam || '';
        const display = team ? `${name} — ${team}` : name;
        try {
            if ( typeof RNCallKeep.updateIncomingCallName !== 'function' ) return false;
            RNCallKeep.updateIncomingCallName( this.currentCallUUID, display );
            dbg( 'incoming call name →', display );
            return true;
        } catch ( e ) {
            dbg( 'setIncomingCallName failed:', e && e.message );
            return false;
        }
    }

    _setup() {
        const ck = this.config;
        // Route CallKeep's own first-run prompt through the app helper (Realme).
        this._redirectCallKeepAccountPrompt();
        try {
            RNCallKeep.setup( {
                ios: {
                    appName: ( ck.ios && ck.ios.appName ) || 'PIOPIY',
                    supportsVideo: false,
                    ...( ck.ios || {} ),
                },
                android: {
                    alertTitle: 'Permissions required',
                    alertDescription: 'This app needs access to manage phone calls to show incoming calls.',
                    cancelButton: 'Cancel',
                    okButton: 'OK',
                    // With selfManagedVoice the inbound voice calls use the
                    // SELF-MANAGED account, which Android enables by default —
                    // so tell CallKeep to skip its managed-account prompt. Do
                    // NOT set `selfManaged` here: that would flip the global
                    // account kind and disturb a co-resident video SDK.
                    ...( this.selfManagedVoice ? { selfManagedVoice: true } : {} ),
                    foregroundService: {
                        channelId: 'com.piopiy.callkeep',
                        channelName: 'PIOPIY incoming calls',
                        notificationTitle: 'Call in progress',
                    },
                    ...( ck.android || {} ),
                },
            } ).then( () => {
                RNCallKeep.setAvailable( true );
                if ( Platform.OS === 'android' ) {
                    RNCallKeep.registerPhoneAccount();
                    RNCallKeep.registerAndroidEvents();
                }
            } ).catch( () => { } );
        } catch {
            // setup failed (native side not linked yet) — leave the bridge inert.
        }
    }

    _wire() {
        const piopiy = this.piopiy;

        // --- Native UI actions -> SDK ---
        this._on( 'answerCall', ( data ) => this._handleAnswerAction( data ) );

        this._on( 'endCall', ( data ) => this._handleEndAction( data ) );

        this._on( 'didPerformSetMutedCallAction', ( { muted } ) => {
            if ( muted ) {
                piopiy.mute();
            } else {
                piopiy.unMute();
            }
        } );

        this._on( 'didPerformDTMFAction', ( { digits } ) => {
            if ( digits ) {
                piopiy.sendDtmf( digits );
            }
        } );

        // Hold / resume from the system call UI (CallKit on iOS). AppDelegate
        // reports supportsHolding:YES, so without this the Hold button is a no-op.
        // NOTE: the event key is "didToggleHoldCallAction" (Hold, not Held) — the
        // wrong name makes RNCallKeep call an undefined listener and throws.
        this._on( 'didToggleHoldCallAction', ( { hold } ) => {
            if ( hold ) {
                piopiy.hold();
            } else {
                piopiy.unHold();
            }
        } );

        // A call was displayed — possibly by the app's push/background handler.
        // Track its UUID so the foreground handler below doesn't double-show it.
        this._on( 'didDisplayIncomingCall', ( data ) => this._handleDisplayedIncomingCall( data ) );

        // iOS cold-start path: the user can tap Answer/End before the React Native
        // bridge exists. react-native-callkeep queues those actions and exposes them
        // through didLoadWithEvents/getInitialEvents once JS is alive. Replay them so
        // lock-screen Answer behaves the same as a live answerCall event.
        this._on( 'didLoadWithEvents', ( events ) => this._handleInitialEvents( events ) );
        this._replayInitialEvents();

        // --- SDK events -> native UI ---
        piopiy.on( 'inComingCall', ( d ) => {
            // Inbound arrives two ways: a SIP INVITE (foreground, jsSIP) or a
            // LiveKit room delivered by push. setPending() emits transport:'push';
            // an earlier build emitted 'livekit' — accept BOTH. Get this wrong and
            // the branch below displays a SECOND CallKit call with a fresh uuid,
            // whose Answer/End then fight the one the push already put on screen.
            const isLiveKit = !!( d && ( d.transport === 'push' || d.transport === 'livekit' ) );
            // hasIncomingSession means "a SIP session exists". A LiveKit call has
            // none, and claiming otherwise sends endCall down the SIP reject path.
            if ( !isLiveKit ) {
                this.hasIncomingSession = true;
            }
            this._clearInviteTimeout();   // a genuine call is here
            const from = ( d && d.from ) ? String( d.from ) : 'Unknown';
            // Remember the team label of this call: a later name update (a name
            // the app resolved from its own contacts DB) has to keep the
            // "— <team>" suffix the caller line was shown with.
            this._incomingTeam = ( d && ( d.team_name || d.team ) ) ? String( d.team_name || d.team ) : '';
            dbg( 'inComingCall', isLiveKit ? '(LiveKit room)' : '(SIP INVITE arrived)', 'from', from,
                '— hasIncomingSession:', this.hasIncomingSession, 'pendingAnswer:', this.pendingAnswer );

            // Foreground with no preceding push: show the native UI now.
            if ( !this.currentCallUUID ) {
                const display = this._callDisplay( d, from );
                // How the ring surface labels this call: a team call (the SIP
                // X-Team-Name header / the push's `team` field) reads as a plain
                // "Incoming call" with the team already in the caller line,
                // while a 1:1/PSTN contact call also shows the number — the app
                // is the only place that knows the difference.
                const callKind = d && ( d.team_name || d.team ) ? 'team' : 'contact';
                // Android voice → self-managed account (see selfManagedVoice):
                // the fork keys the account off its `hasVideo` argument, so we
                // pass true to put this call on the self-managed account and get
                // the app's own ring/in-call surfaces instead of the OS InCall UI.
                const useSelfManaged = Platform.OS === 'android' && this.selfManagedVoice;
                if ( isLiveKit && d.call_id && Platform.OS === 'ios' ) {
                    // iOS push inbound: CallKit is ALREADY ringing — the
                    // AppDelegate reported the call before JS booted (iOS
                    // requires it for every VoIP push). Adopt that uuid;
                    // displaying a second call creates two CallKit entries
                    // whose Answer/End fight.
                    this.currentCallUUID = String( d.call_id ).toLowerCase();
                    dbg( 'adopting iOS push callUUID', this.currentCallUUID );
                } else if ( isLiveKit && d.call_id ) {
                    // Android push inbound: NOTHING has displayed yet — there
                    // is no native pre-report; this bridge owns the incoming
                    // UI. Display with the push's uuid so answer/cancel/end
                    // all correlate.
                    this.currentCallUUID = String( d.call_id ).toLowerCase();
                    dbg( 'android push call — displaying incoming UI', this.currentCallUUID, useSelfManaged ? '(self-managed)' : '(system-managed)' );
                    if ( !useSelfManaged ) {
                        this._warnIfAccountDisabled( 'android push call' );
                    }
                    RNCallKeep.displayIncomingCall( this.currentCallUUID, from, display, 'number', false, { selfManaged: useSelfManaged, callKind } );
                } else {
                    this.currentCallUUID = uuidv4();
                    if ( !useSelfManaged ) {
                        this._warnIfAccountDisabled( 'android incoming call' );
                    }
                    RNCallKeep.displayIncomingCall( this.currentCallUUID, from, display, 'number', false, { selfManaged: useSelfManaged, callKind } );
                }

                // iOS only: refresh the already-ringing CallKit screen with the
                // richest display (name/team ride the push payload; the native
                // report may only know the number). Android just displayed with
                // the full string above — updateDisplay would race the
                // still-initializing connection and log a spurious warning.
                if ( Platform.OS === 'ios' && this.currentCallUUID && display !== from ) {
                    try {
                        RNCallKeep.updateDisplay( this.currentCallUUID, display, from );
                        dbg( 'updateDisplay →', display );
                    } catch ( e ) {
                        dbg( 'updateDisplay failed:', e && e.message );
                    }
                }
            }

            // User answered from the lock screen before the INVITE arrived.
            if ( this.pendingAnswer ) {
                this.pendingAnswer = false;
                this._answerSipWhenReady();
            }
        } );

        piopiy.on( 'answered', () => {
            this.callActive = true;
            if ( this.currentCallUUID ) {
                RNCallKeep.setCurrentCallActive( this.currentCallUUID );
            }
            // iOS audio start. Normally CallKit fires didActivateAudioSession and we
            // start audio there. But two paths miss it: (1) in-app answer (no CallKit
            // action), and (2) the killed/locked cold-launch, where that event is
            // delayed or dropped — leaving the call CONNECTED BUT SILENT. So: give
            // didActivateAudioSession a brief head start (it's the cleanest moment to
            // start, avoiding the too-early detach), then if audio still hasn't begun,
            // start it ourselves so the call always has sound.
            if ( Platform.OS === 'ios' ) {
                setTimeout( () => {
                    if ( this.callActive && !this.audioStarted ) {
                        dbg( 'answered: didActivateAudioSession not seen -> fallback enable audio' );
                        this.audioStarted = true;
                        webrtcAudio.enable();
                        callAudio.start();
                    }
                }, 1500 );
            }
        } );

        const onEnd = () => {
            if ( this.currentCallUUID ) {
                RNCallKeep.endCall( this.currentCallUUID );
            }
            this._clear();
        };
        piopiy.on( 'ended', onEnd );
        piopiy.on( 'hangup', onEnd );
        piopiy.on( 'callkeepCancel', ( data ) => {
            const uuid = ( data && data.uuid ) || this.currentCallUUID;
            if ( uuid ) {
                RNCallKeep.endCall( uuid );
            }
            this._clear();
        } );

        // --- iOS: hand the audio session to CallKit ---
        // CallKit owns the AVAudioSession and activates it only after the answer
        // action is fulfilled. Start WebRTC audio I/O then (not at answer() time),
        // so the audio unit attaches to CallKit's session — otherwise the call
        // answers but is silent. setCallKitAudioManaged() tells session.native.js
        // to skip its own (too-early) start on this path.
        if ( Platform.OS === 'ios' ) {
            setCallKitAudioManaged( true );
            // Put react-native-webrtc in MANUAL audio mode at startup so its audio
            // unit only runs when CallKit's session is active (driven below). This
            // is the fix for "answered but silent" on push-woken / locked calls.
            webrtcAudio.initManual();
            this._on( 'didActivateAudioSession', () => {
                dbg( 'didActivateAudioSession (CallKit activated the AVAudioSession) -> starting audio' );
                this.audioStarted = true;
                this.audioSessionActive = true;
                if ( this.piopiy._livekit && this.piopiy._livekit.isCall( null ) ) {
                    // LiveKit call: sync WebRTC's audio unit to CallKit's session.
                    this.piopiy._livekit.onAudioSessionActivated();
                } else {
                    webrtcAudio.enable();   // SIP call: start WebRTC audio (manual mode)
                    callAudio.start();      // InCallManager: routing / proximity
                }
                this._flushPendingAudioAnswer();
            } );
            this._on( 'didDeactivateAudioSession', () => {
                dbg( 'didDeactivateAudioSession -> stopping audio' );
                this.audioStarted = false;
                this.audioSessionActive = false;
                if ( this.piopiy._livekit && this.piopiy._livekit.isCall( null ) ) {
                    this.piopiy._livekit.onAudioSessionDeactivated();
                } else {
                    webrtcAudio.disable();
                    callAudio.stop();
                }
            } );

            // The user changed the audio route on the NATIVE call screen (the
            // CallKit speaker button). Mirror it into the engine — otherwise
            // the engine still believes its last route, its next config
            // re-assert flips the CallKit button back, and button and audio
            // end up disagreeing (button off, loudspeaker still playing).
            // Re-asserting through setSpeaker() makes state and route agree,
            // so onSpeaker() and the in-app toggle stay correct too. The
            // route change our own setSpeaker() triggers re-enters here with
            // a matching state and is ignored — no feedback loop.
            this._on( 'didChangeAudioRoute', ( data ) => {
                const output = String( ( data && data.output ) || '' );
                if ( !output ) return;
                const on = /speaker/i.test( output );
                const lkCall = this.piopiy._livekit;
                if ( lkCall && lkCall.isCall( null ) && typeof lkCall.setSpeaker === 'function' ) {
                    if ( typeof lkCall.isSpeakerOn === 'function' && lkCall.isSpeakerOn() === on ) return;
                    dbg( 'didChangeAudioRoute →', output, '— syncing engine speaker', on ? 'ON' : 'off' );
                    lkCall.setSpeaker( on );
                }
            } );
        }
    }

    _handleAnswerAction( data ) {
        const callUUID = data && data.callUUID;
        if ( this._isForeignCall( callUUID, data && data.payload ) ) {
            dbg( 'answerCall ignored — call owned by the video SDK:', callUUID );
            return;
        }
        dbg( 'answerCall event from CallKit UI' );
        if ( callUUID ) {
            this.currentCallUUID = callUUID;
        }
        if ( Platform.OS === 'android' && !this.selfManagedVoice ) {
            // System-managed: bring the app forward. Self-managed voice already
            // has its own call surface (and the app is foreground); forcing the
            // main app forward here churns the React host and can disrupt the
            // in-flight LiveKit room join.
            RNCallKeep.backToForeground();
        }
        // Announce the answer BEFORE joining: `answered` only fires once the
        // LiveKit room is connected (audio session + WebRTC, often several
        // seconds), so a UI that waits for it shows the in-call screen late.
        // `answering` lets the app open that screen on the tap and render its
        // "Connecting…" state; `answered` still marks the real connection.
        try {
            this.piopiy.emit( 'answering', {
                call_id: callUUID || null,
                transport: 'push',
            } );
        } catch { /* event surface is best effort */ }
        this._answer();
    }

    _handleEndAction( data ) {
        const callUUID = data && data.callUUID;
        if ( this._isForeignCall( callUUID, data && data.payload ) ) {
            dbg( 'endCall ignored — call owned by the video SDK:', callUUID );
            return;
        }
        if ( callUUID ) {
            this.currentCallUUID = callUUID;
        }
        // LiveKit inbound (ringing or connected) — end it via the LiveKit engine.
        const lkCall = this.piopiy._livekit;
        if ( lkCall && lkCall.isCall( callUUID ) ) {
            dbg( 'endCall event -> LiveKit call, disconnecting room' );
            lkCall.end( 'callkit endCall' );
            this._clear();
            return;
        }
        dbg( 'endCall event from CallKit UI — callActive:', this.callActive, 'hasIncomingSession:', this.hasIncomingSession );
        // No real SIP session behind this CallKit call (a push "ghost" with no
        // INVITE, or a call whose LiveKit room/SIP session already ended — e.g.
        // the far end hung up and the room was deleted first). CallKit dismisses
        // its own UI on iOS, but on Android _clear() only resets our own
        // bookkeeping: the Telecom connection survived, so the system/lock-screen
        // End button stayed on screen and tapping it re-entered this very branch
        // and again did nothing — the user could not hang up. End the native call
        // here so that tap always dismisses the UI.
        if ( !this.hasIncomingSession ) {
            this._clear();
            this._endNativeCall( callUUID );
            return;
        }
        // Decline (still ringing) vs hang up (answered) — let the SDK pick the verb.
        if ( this.callActive ) {
            this.piopiy.terminate();
        } else {
            this.piopiy.reject();
        }
        this._clear();
        this._endNativeCall( callUUID );
    }

    /**
     * Dismiss the NATIVE call (Telecom connection / CallKit call) for an endCall
     * event that the JS side has nothing left to hand to the SDK. Without this
     * the system call UI outlives the call and its End button becomes a no-op.
     * Safe to call with no uuid (falls back to ending everything this bridge
     * owns) and when the connection is already gone.
     */
    _endNativeCall( callUUID ) {
        if ( Platform.OS !== 'android' || !RNCallKeep ) return;
        try {
            const uuid = callUUID || this.currentCallUUID;
            if ( uuid ) {
                RNCallKeep.endCall( uuid );
            } else if ( typeof RNCallKeep.endAllCalls === 'function' ) {
                RNCallKeep.endAllCalls();
            }
        } catch ( e ) {
            dbg( '_endNativeCall failed:', e && e.message );
        }
    }

    /** Calls owned by ANOTHER TeleCMI SDK in this app (the video SDK). One
     *  app has ONE native call UI, so its events reach this bridge too. */
    _isForeignCall( callUUID, payload ) {
        const id = String( callUUID || '' ).toLowerCase();
        // Shared-router ownership is authoritative when known: the SDK that
        // RANG the call owns its events (payload sniffing below stays as the
        // fallback for payloads that never crossed the router).
        try {
            const owner = require( './pushRouter' ).getPushRouter().callOwner( id );
            if ( owner ) return owner !== 'piopiy';
        } catch { /* router unavailable — fall through */ }
        const type = payload && typeof payload.type === 'string' ? payload.type : '';
        if ( type.indexOf( 'video_' ) === 0 ) {
            if ( id ) {
                this._foreignUUIDs = this._foreignUUIDs || [];
                if ( this._foreignUUIDs.indexOf( id ) === -1 ) {
                    this._foreignUUIDs.push( id );
                    if ( this._foreignUUIDs.length > 20 ) this._foreignUUIDs.shift();
                }
            }
            return true;
        }
        return !!( id && this._foreignUUIDs && this._foreignUUIDs.indexOf( id ) !== -1 );
    }

    _handleDisplayedIncomingCall( data ) {
        const callUUID = data && data.callUUID;
        // The video SDK's call (payload type video_*): its push carries the
        // same {room, token} shape this bridge recovers LiveKit calls from, so
        // without this guard a video call would be adopted as a voice call —
        // answering it then fails ("call connection URL missing") and ends the
        // shared native call, killing the video call.
        if ( this._isForeignCall( callUUID, data && data.payload ) ) {
            dbg( 'ignoring call owned by the video SDK —', callUUID );
            return;
        }
        dbg( 'didDisplayIncomingCall — callUUID:', callUUID );
        if ( callUUID ) {
            // Don't let a secondary/duplicate display steal the uuid of an
            // active LiveKit pending call.
            const lkCall = this.piopiy._livekit;
            if ( this.currentCallUUID && lkCall && lkCall.isCall( this.currentCallUUID ) && !lkCall.isCall( callUUID ) ) {
                dbg( 'ignoring secondary displayed call', callUUID, '— keeping', this.currentCallUUID );
            } else {
                this.currentCallUUID = callUUID;
            }
        }
        // A pushed call was shown, but the SIP INVITE may never arrive
        // (register failed, no creds, server didn't deliver). Arm a timeout so
        // a "ghost" call is dismissed instead of ringing into nothing.
        this._armInviteTimeout();

        // Cold-start recovery: the CallKit report carries the FULL push payload
        // (AppDelegate reports fromPushKit with the dictionary). If the VoIP-push
        // JS event lost the launch race and never delivered {room, token} to the
        // app, recover the LiveKit call from here. setPending emits inComingCall,
        // which clears the ghost timeout armed above.
        const p = data && data.payload;
        if ( p && p.room && p.token && this.piopiy._livekit && !this.piopiy._livekit.hasPending() ) {
            dbg( 'didDisplayIncomingCall carries LiveKit payload — recovering room', p.room );
            this.piopiy._livekit.setPending( {
                uuid: p.uuid || callUUID,
                room: p.room,
                token: p.token,
                url: p.url,
                from: p.from,
            } );
        }
    }

    _handleInitialEvents( events ) {
        if ( !Array.isArray( events ) ) return;

        events.forEach( ( event ) => {
            if ( !event || !event.name ) return;
            const data = event.data || {};
            const callUUID = data.callUUID || '';
            const key = event.name + ':' + callUUID;
            if ( this.replayedInitialEvents[ key ] ) return;
            this.replayedInitialEvents[ key ] = true;
            this._handleInitialEvent( event.name, data );
        } );
    }

    _handleInitialEvent( name, data ) {
        switch ( name ) {
        case 'RNCallKeepDidDisplayIncomingCall':
            this._handleDisplayedIncomingCall( data );
            break;
        case 'RNCallKeepPerformAnswerCallAction':
            this._handleAnswerAction( data );
            break;
        case 'RNCallKeepPerformEndCallAction':
            this._handleEndAction( data );
            break;
        case 'RNCallKeepDidActivateAudioSession':
            this.audioStarted = true;
            this.audioSessionActive = true;
            if ( this.piopiy._livekit && this.piopiy._livekit.isCall( null ) ) {
                this.piopiy._livekit.onAudioSessionActivated();
            } else {
                webrtcAudio.enable();
                callAudio.start();
            }
            this._flushPendingAudioAnswer();
            break;
        case 'RNCallKeepDidDeactivateAudioSession':
            this.audioStarted = false;
            this.audioSessionActive = false;
            if ( this.piopiy._livekit && this.piopiy._livekit.isCall( null ) ) {
                this.piopiy._livekit.onAudioSessionDeactivated();
            } else {
                webrtcAudio.disable();
                callAudio.stop();
            }
            break;
        default:
            break;
        }
    }

    _replayInitialEvents() {
        if ( !RNCallKeep || typeof RNCallKeep.getInitialEvents !== 'function' ) return;

        try {
            RNCallKeep.getInitialEvents()
                .then( ( events ) => {
                    this._handleInitialEvents( events );
                    if ( typeof RNCallKeep.clearInitialEvents === 'function' ) {
                        RNCallKeep.clearInitialEvents();
                    }
                } )
                .catch( () => { } );
        } catch {
            // Older react-native-callkeep builds may not expose initial-event replay.
        }
    }

    // React Native inbound is ALWAYS a LiveKit room delivered by push — jsSIP is
    // outbound-only here (web keeps its SIP inbound path; this file is RN-only).
    // So an answer means exactly one thing: join the held room. There is no SIP
    // INVITE to wait for on this platform, ever.
    _answer() {
        // Answer came from the CallKit UI -> CallKit will activate the audio
        // session (didActivateAudioSession), so we don't need the in-app fallback.
        this.answeredViaCallKit = true;
        const lkCall = this.piopiy._livekit;
        if ( lkCall && lkCall.isCall( this.currentCallUUID ) ) {
            dbg( '_answer() -> joining LiveKit room' );
            this._joinLiveKitRoom();
        } else {
            // Lock-screen answer on a cold launch: the tap can land before the
            // push payload has reached JS, so the room isn't registered yet.
            // Defer — 'inComingCall' fires when setPending() gets the payload,
            // and its pendingAnswer flush joins the room then.
            dbg( '_answer() -> room not registered yet, deferring (pendingAnswer=true)' );
            this.pendingAnswer = true;
        }
    }

    _answerSipWhenReady() {
        // Kept under its historic name (called from the inComingCall pendingAnswer
        // flush); on RN "ready" now simply means the LiveKit room is registered.
        this._clearAudioAnswerFallback();
        this.pendingAudioAnswer = false;
        this._joinLiveKitRoom();
    }

    // Join the room held server-side. Retryable against the waiting room; no
    // INVITE involved.
    _joinLiveKitRoom() {
        const lkCall = this.piopiy._livekit;
        if ( !lkCall || !lkCall.isCall( this.currentCallUUID ) ) {
            dbg( '_joinLiveKitRoom() -> no LiveKit call for uuid', this.currentCallUUID, '— nothing to join' );
            return;
        }
        lkCall.answer().then( ( ok ) => {
            if ( ok && this.currentCallUUID ) {
                try { RNCallKeep.setCurrentCallActive( this.currentCallUUID ); } catch { /* ignore */ }
            } else if ( !ok && this.currentCallUUID ) {
                try { RNCallKeep.endCall( this.currentCallUUID ); } catch { /* ignore */ }
                this._clear();
            }
        } );
    }

    _flushPendingAudioAnswer() {
        if ( !this.pendingAudioAnswer || !this.hasIncomingSession ) return;

        dbg( '_flushPendingAudioAnswer() -> audio active, answering SIP' );
        this._clearAudioAnswerFallback();
        this.pendingAudioAnswer = false;
        this.piopiy.answer();
    }

    _armAudioAnswerFallback() {
        this._clearAudioAnswerFallback();
        this.audioAnswerTimer = setTimeout( () => {
            this.audioAnswerTimer = null;
            if ( this.pendingAudioAnswer && this.hasIncomingSession ) {
                dbg( 'didActivateAudioSession not received quickly -> answering SIP anyway' );
                this.pendingAudioAnswer = false;
                this.piopiy.answer();
            }
        }, 1200 );
    }

    _clearAudioAnswerFallback() {
        if ( this.audioAnswerTimer ) {
            clearTimeout( this.audioAnswerTimer );
            this.audioAnswerTimer = null;
        }
    }

    // Answer an in-progress CallKit call from the APP's own UI (not the CallKit
    // button). Routing through CallKit's answer action makes its UI leave the
    // ringing state and activates the audio session — so an in-app answer behaves
    // exactly like tapping Answer in CallKit. Returns true if it took over the
    // answer; the caller must then NOT perform the SIP answer itself, because the
    // resulting `answerCall` event re-enters _answer() and does it (answeredViaCallKit
    // guards against a loop). iOS only.
    answerFromApp() {
        if ( Platform.OS === 'ios' && RNCallKeep && this.currentCallUUID && !this.answeredViaCallKit ) {
            dbg( 'in-app answer -> routing through CallKit.answerIncomingCall() so the ringing UI clears' );
            RNCallKeep.answerIncomingCall( this.currentCallUUID );
            return true;
        }
        return false;
    }

    _clear() {
        this._clearInviteTimeout();
        this._clearAudioAnswerFallback();
        this.currentCallUUID = null;
        this.hasIncomingSession = false;
        this.pendingAnswer = false;
        this.pendingAudioAnswer = false;
        this.callActive = false;
        this.answeredViaCallKit = false;
        this.audioStarted = false;
        this.audioSessionActive = false;
    }

    // Ghost-call guard. A pushed call is shown before we know the SIP INVITE will
    // arrive. If it doesn't (register failed, no creds, server didn't deliver),
    // end the CallKit call so it dismisses instead of ringing into a dead call.
    _armInviteTimeout() {
        this._clearInviteTimeout();
        if ( this.hasIncomingSession ) return;   // INVITE already here — genuine call
        // LiveKit inbound: no SIP INVITE will ever arrive — the room waits
        // server-side, so the ghost-call guard must not kill the CallKit UI.
        if ( this.piopiy._livekit && this.piopiy._livekit.isCall( this.currentCallUUID ) ) return;
        this.inviteTimer = setTimeout( () => {
            this.inviteTimer = null;
            if ( !this.hasIncomingSession && this.currentCallUUID ) {
                dbg( 'no INVITE within ' + this.inviteTimeoutMs + 'ms -> ending ghost CallKit call' );
                try { RNCallKeep.endCall( this.currentCallUUID ); } catch { dbg( 'end ghost CallKit call failed' ); }
                this._clear();
            }
        }, this.inviteTimeoutMs );
    }

    _clearInviteTimeout() {
        if ( this.inviteTimer ) {
            clearTimeout( this.inviteTimer );
            this.inviteTimer = null;
        }
    }
}
