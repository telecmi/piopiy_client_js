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
import { Platform } from 'react-native';
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

        if ( !RNCallKeep ) {
            // react-native-callkeep not installed — bridge stays inert.
            return;
        }

        this._setup();
        this._wire();
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
    _callDisplay( d, from ) {
        const name = ( d && d.name && String( d.name ).trim() ) || '';
        const team = ( d && ( d.team_name || d.team ) ) || '';
        const primary = name || from;
        return team ? primary + ' — ' + team : primary;
    }

    _setup() {
        const ck = this.config;
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
            dbg( 'inComingCall', isLiveKit ? '(LiveKit room)' : '(SIP INVITE arrived)', 'from', from,
                '— hasIncomingSession:', this.hasIncomingSession, 'pendingAnswer:', this.pendingAnswer );

            // Foreground with no preceding push: show the native UI now.
            if ( !this.currentCallUUID ) {
                const display = this._callDisplay( d, from );
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
                    dbg( 'android push call — displaying incoming UI', this.currentCallUUID );
                    RNCallKeep.displayIncomingCall( this.currentCallUUID, from, display );
                } else {
                    this.currentCallUUID = uuidv4();
                    RNCallKeep.displayIncomingCall( this.currentCallUUID, from, display );
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
        dbg( 'answerCall event from CallKit UI' );
        if ( callUUID ) {
            this.currentCallUUID = callUUID;
        }
        if ( Platform.OS === 'android' ) {
            RNCallKeep.backToForeground();
        }
        this._answer();
    }

    _handleEndAction( data ) {
        const callUUID = data && data.callUUID;
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
        // INVITE, or a call already ended / dismissed by us). CallKit dismisses
        // its own UI; there is nothing to terminate/reject, so just clear.
        if ( !this.hasIncomingSession ) {
            this._clear();
            return;
        }
        // Decline (still ringing) vs hang up (answered) — let the SDK pick the verb.
        if ( this.callActive ) {
            this.piopiy.terminate();
        } else {
            this.piopiy.reject();
        }
        this._clear();
    }

    _handleDisplayedIncomingCall( data ) {
        const callUUID = data && data.callUUID;
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
