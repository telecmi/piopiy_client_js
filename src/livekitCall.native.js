// LiveKit inbound-call engine — React Native build.
//
// Architecture: OUTBOUND calls stay on jsSIP / SIP-over-WSS. INBOUND calls are
// delivered the gateway way (like Twilio/Plivo): FreeSWITCH bridges the caller
// into a LiveKit room via LiveKit SIP, the VoIP push carries {uuid, room,
// token, url}, and the app simply joins the room when the user answers. The
// room waits server-side, so joining is retryable — no one-shot SIP INVITE to
// catch on a cold launch.
//
// Soft-required: stays fully inert unless `@livekit/react-native` is installed.

import { Platform } from 'react-native';

// Internal debug hook, mirrored to the persistent capture sink like the other
// SDK modules. Set LK_DEBUG = false before publishing the SDK.
const LK_DEBUG = false;
const dbg = ( ...args ) => {
    // eslint-disable-next-line no-console -- gated debug logging
    if ( LK_DEBUG ) { console.log( '[piopiy:livekit]', ...args ); }
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__piopiyLog === 'function' ) {
            g.__piopiyLog( '[livekit] ' + args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' ) );
        }
    } catch { /* ignore */ }
};

// Optional peer — the LiveKit client SDK.
// Hermes has no DOMException, but livekit-client `extends DOMException` at
// module scope — polyfill it BEFORE requiring the LiveKit packages or their
// module evaluation throws ("Property 'DOMException' doesn't exist").
if ( typeof globalThis.DOMException === 'undefined' ) {
    globalThis.DOMException = class DOMException extends Error {
        constructor( message, name ) {
            super( message || '' );
            this.name = name || 'Error';
            this.code = 0;
        }
    };
}

let lk = null;
let lkLoadError = null;
try {
    lk = require( '@livekit/react-native' );
} catch ( e ) {
    lkLoadError = ( e && e.message ) || String( e );
    dbg( 'engine load FAILED:', lkLoadError );
    lk = null;
}

// The Room class lives in livekit-client (a dependency of
// @livekit/react-native, which does NOT re-export it).
let lkClient = null;
let lkClientLoadError = null;
try {
    lkClient = require( 'livekit-client' );
} catch ( e ) {
    lkClientLoadError = ( e && e.message ) || String( e );
    dbg( 'livekit-client load FAILED:', lkClientLoadError );
    lkClient = null;
}

// One-line engine status, printable anywhere (also used by setPending so the
// root cause shows up next to the failure, not only in the startup logs).
const engineStatus = () =>
    'rn=' + ( lk ? 'ok' : 'FAILED(' + lkLoadError + ')' ) +
    ' client=' + ( lkClient ? ( lkClient.Room ? 'ok' : 'loaded-but-no-Room-export' ) : 'FAILED(' + lkClientLoadError + ')' );

// The WebRTC audio-session bridge. @livekit/react-native-webrtc ships with
// piopiyjs; plain react-native-webrtc is the legacy fallback. Used to sync
// WebRTC's audio unit with CallKit's didActivate/didDeactivate — LiveKit's
// documented CallKit pattern.
let rtcAudioSession = null;
// Only require SDK dependencies here — see the note in index.native.js about
// Metro's static resolution of optional requires.
try {
    const webrtc = require( '@livekit/react-native-webrtc' );
    rtcAudioSession = ( webrtc && webrtc.RTCAudioSession ) || null;
} catch {
    rtcAudioSession = null;
}

let globalsRegistered = false;

export default class LiveKitCall {

    constructor( piopiy, config ) {
        this.piopiy = piopiy;
        this.config = config || {};
        this.room = null;        // live Room while connected
        this.roomConnected = false; // room.connect() resolved (safe to disconnect)
        this.pending = null;     // {uuid, room, token, url, from} while ringing
        this.activeUUID = null;  // CallKit uuid of the connected call
        this.ringTimer = null;   // bounds the pending (ringing) state
        this.muted = false;      // mic muted on the connected call
        this.speakerOn = false;  // loudspeaker route active
        this.answered = false;   // call joined + 'answered' emitted (for late UI mounts)
        this.held = false;       // local hold (a LiveKit call has no SIP hold)
        // Opt-in pre-connect (Android): join the held room WHILE the call is
        // ringing, so the answer doesn't have to run room.connect() after the
        // OS's system-managed in-call screen has backgrounded the app — Android
        // throttles that WebRTC connect, so the caller kept ringing until the
        // app was brought forward. See livekit.preconnect.
        this.preconnectEnabled = !!( config && config.preconnect ) && Platform.OS === 'android';
        this.preconnectRoom = null;    // Room connected during ringing (not yet adopted)
        this.preconnectStarted = false;
        this.preconnectDone = false;
        this.preconnectPromise = null; // in-flight room.connect() while ringing

        // LiveKit needs its globals (adds to what react-native-webrtc registers).
        if ( lk && typeof lk.registerGlobals === 'function' && !globalsRegistered ) {
            try {
                lk.registerGlobals();
                globalsRegistered = true;
            } catch ( e ) {
                dbg( 'registerGlobals failed:', e && e.message );
            }
            // LiveKit's native module sets a GLOBAL videoChat/defaultToSpeaker
            // WebRTC audio config at init — wrong for a phone app: every call
            // (SIP ones included) would answer on loudspeaker. Reset to
            // voice-call defaults (earpiece; speaker toggle still works).
            try {
                if ( lk.AudioSession && typeof lk.AudioSession.configureAudio === 'function' ) {
                    lk.AudioSession.configureAudio( { ios: { defaultOutput: 'earpiece' } } );
                    dbg( 'global audio config reset: defaultOutput=earpiece (voiceChat)' );
                }
            } catch ( e ) {
                dbg( 'configureAudio failed:', e && e.message );
            }
        }
        // Always print engineStatus(): "inert" alone hides WHY (a load error, or
        // livekit-client resolving without its Room export), which is the first
        // thing anyone debugging a silent answered call needs to know.
        dbg( 'engine', this.available() ? 'READY' : 'INERT', '—', engineStatus() );
    }

    available() {
        return !!( lk && lkClient && lkClient.Room );
    }

    // Called (via piopiy.livekitIncoming) when a VoIP push carries room info.
    setPending( info ) {
        if ( !this.available() ) {
            dbg( 'setPending ignored — engine unavailable:', engineStatus() );
            return false;
        }
        if ( !info || !info.uuid || !info.room || !info.token ) {
            dbg( 'setPending rejected — uuid, room and token are required' );
            return false;
        }
        // Dedupe: the same call can arrive via the VoIP-push event AND the
        // CallKit didDisplayIncomingCall payload recovery.
        if ( this.pending && this.pending.uuid === String( info.uuid ).toLowerCase() ) {
            dbg( 'setPending — already pending for this uuid, ignoring duplicate' );
            return true;
        }
        this.pending = {
            uuid: String( info.uuid ).toLowerCase(),
            room: info.room,
            token: info.token,
            url: info.url || this.config.url || null,
            // `caller` is the FCM form of `from` ('from' is an FCM-reserved
            // data key, so Android pushes deliver it renamed).
            from: info.from || info.caller || 'Incoming call',
            name: ( info.name && String( info.name ).trim() ) || null,
            team: info.team || null,
        };
        dbg( 'pending inbound call — from', this.pending.from, '| room', this.pending.room, '| uuid', this.pending.uuid );
        // Ring timeout (ringTime, same default as the SIP flow's no_answer_timeout):
        // if the device loses its connection right after the push, the server's
        // cancel push can never arrive — without a local bound the CallKit screen
        // would ring forever. Cleared on answer() and by _teardown().
        const ringSec = ( this.piopiy && this.piopiy.piopiyOption && this.piopiy.piopiyOption.ringTime ) || 40;
        if ( this.ringTimer ) clearTimeout( this.ringTimer );
        this.ringTimer = setTimeout( () => {
            this.ringTimer = null;
            if ( this.pending && !this.activeUUID ) {
                dbg( 'ring timeout — no answer after', ringSec, 's, ending pending call' );
                this.end( 'ring timeout' );
            }
        }, ringSec * 1000 );
        // Same event surface as the SIP inbound path, so app UIs work unchanged.
        // `name` is the caller's display name (platform-resolved; may be absent),
        // `team_name` matches the field the SIP inbound path has always used.
        this.piopiy.emit( 'inComingCall', {
            from: this.pending.from,
            name: this.pending.name || undefined,
            team_name: this.pending.team || undefined,
            call_id: this.pending.uuid,
            transport: 'push',
        } );
        // Pre-connect the room while ringing (opt-in) — see the constructor.
        if ( this.preconnectEnabled && !this.preconnectStarted ) {
            this._startPreconnect();
        }
        return true;
    }

    hasPending() {
        return !!this.pending;
    }

    // Is this CallKit uuid (or, with null, any call) ours?
    isCall( uuid ) {
        const u = uuid ? String( uuid ).toLowerCase() : null;
        if ( this.pending && ( !u || this.pending.uuid === u ) ) return true;
        if ( this.activeUUID && ( !u || this.activeUUID === u ) ) return true;
        return false;
    }

    // Join the held room. Called from the CallKeep bridge on CallKit answer
    // (or directly for an Android in-app answer).
    async answer() {
        const call = this.pending;
        if ( !call ) {
            dbg( 'answer(): no pending LiveKit call' );
            return false;
        }
        if ( !call.url ) {
            dbg( 'answer(): no LiveKit URL — push had no `url` and no livekit.url option was set' );
            this.piopiy.emit( 'error', { code: 1009, status: 'call connection URL missing' } );
            this.end( 'no url' );
            return false;
        }
        this.pending = null;
        this.activeUUID = call.uuid;
        if ( this.ringTimer ) {
            clearTimeout( this.ringTimer );
            this.ringTimer = null;
        }
        dbg( 'answer(): joining room', call.room, 'at', call.url );

        // answer() awaits several times (audio config, room connect). A cancel
        // or hangup can land BETWEEN those awaits — its teardown nulls
        // activeUUID. Without re-checking after every await, the in-flight
        // answer 'resurrects' the dead call: it sets this.room, enables the
        // mic and emits 'answered' AFTER the app already saw 'hangup', leaving
        // a phantom in-call panel and stale native state that corrupts the
        // NEXT incoming call's UI. This guard makes teardown win the race.
        const aborted = () => this.activeUUID !== call.uuid;

        // Pre-connect audio setup. LiveKit's RN engine on Android needs the
        // audio session started BEFORE connecting — otherwise the peer-connection
        // engine never reaches connected and publishing fails with
        // "publishing rejected as engine not connected within timeout"
        // (livekit-client LocalParticipant). This is safe with self-managed
        // voice (the app stays foreground) and bounded so it can't hang.
        if ( Platform.OS === 'android' && lk.AudioSession && typeof lk.AudioSession.startAudioSession === 'function' ) {
            try {
                await Promise.race( [
                    lk.AudioSession.startAudioSession(),
                    new Promise( ( resolve ) => setTimeout( resolve, 2500 ) ),
                ] );
                dbg( 'AudioSession started (pre-connect)' );
            } catch ( e ) {
                dbg( 'AudioSession pre-start failed:', e && e.message );
            }
        }
        // iOS: CallKit owns AVAudioSession activation; only set the category.
        if ( Platform.OS === 'ios' && lk.AudioSession && typeof lk.AudioSession.setAppleAudioConfiguration === 'function' ) {
            try {
                await lk.AudioSession.setAppleAudioConfiguration( {
                    audioCategory: 'playAndRecord',
                    audioCategoryOptions: [ 'allowBluetooth' ],
                    audioMode: 'voiceChat',
                } );
                dbg( 'Apple audio configured: playAndRecord / voiceChat' );
            } catch ( e ) {
                dbg( 'Apple audio config failed:', e && e.message );
            }
        }

        if ( aborted() ) {
            dbg( 'answer aborted — call ended while preparing audio' );
            return false;
        }

        // Adopt a room that pre-connect already joined while ringing (opt-in);
        // otherwise connect now. An in-flight preconnect is awaited (bounded)
        // rather than duplicated.
        let room = null;
        let preconnected = !!( this.preconnectDone && this.preconnectRoom );
        if ( !preconnected && this.preconnectRoom && this.preconnectPromise ) {
            dbg( 'answer(): waiting for in-flight preconnect' );
            try {
                await Promise.race( [
                    this.preconnectPromise,
                    new Promise( ( resolve ) => setTimeout( resolve, 4000 ) ),
                ] );
            } catch { /* the preconnect's own catch handles failures */ }
            preconnected = !!( this.preconnectDone && this.preconnectRoom );
        }
        if ( preconnected ) {
            room = this.preconnectRoom;
            this.preconnectRoom = null;
            this.preconnectStarted = false;
            this.preconnectDone = false;
            this.preconnectPromise = null;
            dbg( 'answer(): using pre-connected room' );
            // The preconnect handler only cleans up while the room is still the
            // preconnect room; re-bind it as the active room so a later
            // disconnect ends the call.
            try { room.removeAllListeners( 'disconnected' ); } catch { /* ignore */ }
            this.room = room;
            this.roomConnected = true;   // pre-connect already joined
            room.on( 'disconnected', ( reason ) => {
                if ( this.room !== room ) return;
                dbg( 'room disconnected —', reason ? String( reason ) : 'no reason' );
                this._teardown( 'ended' );
            } );
        } else {
            if ( this.preconnectRoom ) {
                const pr = this.preconnectRoom;
                const prConnected = this.preconnectDone;
                this.preconnectRoom = null;
                this.preconnectStarted = false;
                this.preconnectDone = false;
                this.preconnectPromise = null;
                try { pr.removeAllListeners( 'disconnected' ); } catch { /* ignore */ }
                if ( prConnected ) {
                    try { pr.disconnect(); } catch { /* ignore */ }
                }
            }
            try {
                room = new lkClient.Room();
                this.room = room;
                room.on( 'disconnected', ( reason ) => {
                    // Ignore events from a room this engine no longer owns (e.g.
                    // one we abandoned below after losing the answer/cancel race).
                    if ( this.room !== room ) return;
                    dbg( 'room disconnected —', reason ? String( reason ) : 'no reason' );
                    this._teardown( 'ended' );
                } );
                await room.connect( call.url, call.token, { autoSubscribe: true } );
                this.roomConnected = true;
            } catch ( e ) {
                if ( aborted() ) {
                    // The teardown that beat us already emitted the end events —
                    // stay silent instead of stacking an error on a finished call.
                    dbg( 'room.connect failed after cancel — already torn down:', e && e.message );
                    return false;
                }
                dbg( 'room.connect FAILED —', e && e.message );
                this.piopiy.emit( 'error', { code: 1010, status: 'call connection failed: ' + ( e && e.message ) } );
                this._teardown( 'ended' );
                return false;
            }
        }

        if ( aborted() ) {
            dbg( 'answer aborted — call cancelled during connect; leaving room' );
            if ( this.room === room ) this.room = null;
            try { room.disconnect(); } catch { /* ignore */ }
            return false;
        }

        // Answered the instant the room is joined. Joining is what stops the
        // caller's ringback and moves the native call UI out of "ringing", so
        // emit it NOW — do NOT gate it on audio or the microphone. Starting the
        // Android audio session and enabling the mic can be slow or blocked
        // while the app is backgrounded (the system in-call screen is up);
        // doing them here would re-introduce the delay. They run asynchronously,
        // after the connection is already up.
        dbg( 'room CONNECTED — emitting answered; starting audio + microphone' );
        this.answered = true;
        this.piopiy.emit( 'answered', { code: 200, status: 'answered', transport: 'push' } );
        Promise.resolve()
            .then( async () => {
                if ( Platform.OS !== 'ios' && lk.AudioSession && typeof lk.AudioSession.startAudioSession === 'function' ) {
                    // Bounded: a backgrounded start must never hang the call.
                    await Promise.race( [
                        lk.AudioSession.startAudioSession(),
                        new Promise( ( resolve ) => setTimeout( resolve, 2500 ) ),
                    ] );
                    dbg( 'AudioSession started (or timed out)' );
                }
                await room.localParticipant.setMicrophoneEnabled( true );
            } )
            .then( () => {
                if ( aborted() ) {
                    dbg( 'answer aborted — call cancelled just after connect; leaving room' );
                    if ( this.room === room ) this.room = null;
                    try { room.disconnect(); } catch { /* ignore */ }
                }
            } )
            .catch( ( e ) => dbg( 'audio/mic setup failed:', e && e.message ) );
        return true;
    }

    // Opt-in pre-connect: join the held room while the call is still ringing, so
    // answer() doesn't have to connect after the system-managed in-call screen
    // has backgrounded the app (Android throttles that WebRTC connect). The mic
    // is NOT enabled here — audio/publish happen on answer().
    _startPreconnect() {
        const call = this.pending;
        if ( !call || !call.url ) return;
        if ( this.preconnectStarted || this.preconnectRoom ) return;
        this.preconnectStarted = true;
        const room = new lkClient.Room();
        this.preconnectRoom = room;
        room.on( 'disconnected', ( reason ) => {
            // Only clean up while this is still the preconnect room; once
            // answer() adopts it, the active-room handler takes over.
            if ( this.preconnectRoom !== room ) return;
            dbg( 'preconnect room disconnected —', reason ? String( reason ) : 'no reason' );
            this.preconnectRoom = null;
            this.preconnectStarted = false;
            this.preconnectDone = false;
        } );
        dbg( 'preconnect: connecting while ringing', call.room );
        this.preconnectPromise = room.connect( call.url, call.token, { autoSubscribe: true } )
            .then( () => {
                this.preconnectPromise = null;
                if ( this.preconnectRoom !== room ) {
                    // Cancelled/ended during connect — discard quietly.
                    try { room.disconnect(); } catch { /* ignore */ }
                    return;
                }
                this.preconnectDone = true;
                dbg( 'preconnect: room CONNECTED while ringing' );
            } )
            .catch( ( e ) => {
                this.preconnectPromise = null;
                if ( this.preconnectRoom === room ) {
                    this.preconnectRoom = null;
                    this.preconnectStarted = false;
                    this.preconnectDone = false;
                }
                dbg( 'preconnect failed:', e && e.message );
                // connect() rejected — the room is not connected, so do NOT
                // disconnect it (LiveKit errors "leave before connected").
            } );
    }

    // Route call audio to the loudspeaker (true) or back to the default route /
    // earpiece (false). iOS: immediate AVAudioSession output override.
    async setSpeaker( on ) {
        if ( !lk || !lk.AudioSession || typeof lk.AudioSession.selectAudioOutput !== 'function' ) {
            dbg( 'setSpeaker ignored — AudioSession.selectAudioOutput unavailable' );
            return false;
        }
        try {
            // The output names are PLATFORM specific. LiveKit's Android module
            // maps them to an AudioDeviceKind ('speaker' / 'earpiece' /
            // 'bluetooth' / 'headset') and silently IGNORES the iOS-only
            // 'force_speaker' / 'default' — so on Android the speaker toggle
            // was a no-op and the call stayed on the route it started on.
            const target = Platform.OS === 'android'
                ? ( on ? 'speaker' : 'earpiece' )
                : ( on ? 'force_speaker' : 'default' );
            await lk.AudioSession.selectAudioOutput( target );
            this.speakerOn = !!on;
            // Android 12+ ignores the legacy setSpeakerphoneOn() for apps that
            // are not the default dialer, so the WebRTC track stays on the
            // earpiece even though the system logged the request. Set the
            // COMMUNICATION DEVICE explicitly (the native bridge does it).
            try {
                const bridge = this.piopiy && this.piopiy._callkeep;
                if ( bridge && typeof bridge.setSpeakerOn === 'function' ) {
                    bridge.setSpeakerOn( !!on );
                }
            } catch ( e ) { /* the native route is best effort */ }
            dbg( 'speaker', on ? 'ON (loudspeaker)' : 'off (default route)', '->', target );
            return true;
        } catch ( e ) {
            dbg( 'setSpeaker failed:', e && e.message );
            return false;
        }
    }

    // Mute / unmute the microphone on the connected call. Disables the published
    // mic track (setMicrophoneEnabled(false)) — the room stays connected and the
    // far end keeps talking; they just stop hearing this side.
    setMuted( muted ) {
        if ( !this.room || !this.room.localParticipant ) {
            dbg( 'setMuted ignored — no connected room' );
            return false;
        }
        try {
            this.room.localParticipant.setMicrophoneEnabled( !muted );
            this.muted = !!muted;
            dbg( 'microphone', muted ? 'MUTED' : 'unmuted' );
            return true;
        } catch ( e ) {
            dbg( 'setMuted failed:', e && e.message );
            return false;
        }
    }

    isMuted() {
        return !!this.muted;
    }

    // Hold for a LiveKit (room) call. There is no SIP session to put on hold, so
    // hold is simply the local mute: stop publishing mic audio and keep the room
    // joined — the remote party hears silence until resume. Resume always
    // unmutes (plain hold-on-mute, no state to restore).
    setHold( held ) {
        if ( !this.room || !this.room.localParticipant ) {
            dbg( 'setHold ignored — no connected room' );
            return false;
        }
        this.held = !!held;
        this.setMuted( !!held );
        dbg( held ? 'call on hold — microphone muted' : 'call resumed — microphone unmuted' );
        return true;
    }

    isHeld() {
        return !!this.held;
    }

    // DTMF on a room call. LiveKit's SIP bridge turns each packet into a DTMF
    // event on the PSTN leg; with no SIP participant in the room nothing
    // receives them, and that is not an error (the SIP agent would have thrown
    // 1002 'call not found', which is what the keypad/record used to hit).
    sendDtmf( digits ) {
        const seq = String( digits || '' ).replace( /\s+/g, '' );
        if ( !seq || !this.room || !this.room.localParticipant ) {
            dbg( 'sendDtmf ignored — no connected room' );
            return false;
        }
        const codeFor = ( d ) => {
            const c = String( d ).toUpperCase();
            if ( c === '*' ) return 10;
            if ( c === '#' ) return 11;
            if ( c >= 'A' && c <= 'D' ) return 12 + ( c.charCodeAt( 0 ) - 65 );
            const n = Number( c );
            return Number.isInteger( n ) && n >= 0 && n <= 9 ? n : null;
        };
        try {
            for ( const d of seq ) {
                const code = codeFor( d );
                if ( code === null ) continue;
                const p = this.room.localParticipant.publishDtmf( code, String( d ) );
                if ( p && typeof p.catch === 'function' ) p.catch( () => {} );
            }
            dbg( 'DTMF sent:', seq );
            return true;
        } catch ( e ) {
            dbg( 'sendDtmf failed:', e && e.message );
            return false;
        }
    }

    isSpeakerOn() {
        return !!this.speakerOn;
    }

    // Whether the current call has joined and 'answered' was emitted. Lets a UI
    // that mounts AFTER the answer (e.g. an in-app call screen rendered on the
    // 'answered' event) start in the connected state instead of waiting for an
    // event it already missed.
    isAnswered() {
        return !!this.answered;
    }

    // Hang up / reject. Safe to call in any state.
    end( reason ) {
        const uuid = this.activeUUID || ( this.pending && this.pending.uuid ) || null;
        const wasActive = !!this.activeUUID;
        const from = this.pending && this.pending.from;
        if ( !uuid && !this.room ) return false;   // nothing to end
        dbg( 'end() —', reason || 'hangup' );
        this._teardown( wasActive ? 'hangup' : null );
        if ( !wasActive && uuid ) {
            // Still ringing: dismiss the CallKit UI through the bridge.
            try { this.piopiy.emit( 'callkeepCancel', { uuid, reason: reason || 'rejected' } ); } catch { /* ignore */ }
            // ALSO emit a call-termination event so the app's OWN in-app
            // incoming-call screen dismisses. The native CallKeep UI is handled
            // by callkeepCancel above, but an app that also renders its own
            // ringing UI (on 'inComingCall') listens to 'ended'/'hangup' to hide
            // it. _teardown() was called with null (ringing → no media to end),
            // so it emitted nothing — without this the in-app UI rings forever.
            try { this.piopiy.emit( 'ended', { code: 200, status: 'call ended', reason: reason || 'rejected', transport: 'push' } ); } catch { /* ignore */ }
            // A ringing call that ends WITHOUT the user acting on it is a missed
            // call (caller gave up, or ringing timed out offline). A user reject
            // is deliberate and does not count. Apps listen to this to show a
            // LOCAL "missed call" notification — no server push needed; on iOS
            // CallKit already logs the missed call in the Phone app's Recents.
            if ( reason === 'caller cancelled' || reason === 'ring timeout' ) {
                const missedReason = reason === 'ring timeout' ? 'ring_timeout' : 'cancelled';
                try { this.piopiy.emit( 'missedCall', { uuid, from: from || null, reason: missedReason, transport: 'push' } ); } catch { /* ignore */ }
            }
        }
        return true;
    }

    // CallKit activated the AVAudioSession → sync WebRTC's audio unit to it
    // (LiveKit's documented CallKit integration). Only acts on our own calls.
    onAudioSessionActivated() {
        if ( !this.isCall( null ) ) return;
        try {
            if ( rtcAudioSession && typeof rtcAudioSession.audioSessionDidActivate === 'function' ) {
                rtcAudioSession.audioSessionDidActivate();
                dbg( 'CallKit audio session active → RTCAudioSession synced' );
            }
        } catch ( e ) {
            dbg( 'audioSessionDidActivate failed:', e && e.message );
        }
    }

    onAudioSessionDeactivated() {
        try {
            if ( rtcAudioSession && typeof rtcAudioSession.audioSessionDidDeactivate === 'function' ) {
                rtcAudioSession.audioSessionDidDeactivate();
            }
        } catch { /* ignore */ }
    }

    _teardown( emitEvent ) {
        const hadCall = !!( this.room || this.pending || this.activeUUID || this.preconnectRoom );
        const room = this.room;
        const roomWasConnected = this.roomConnected;
        const pre = this.preconnectRoom;
        const preWasConnected = this.preconnectDone;
        this.room = null;
        this.roomConnected = false;
        this.pending = null;
        this.activeUUID = null;
        this.muted = false;
        this.speakerOn = false;
        this.answered = false;
        this.held = false;
        this.preconnectRoom = null;
        this.preconnectStarted = false;
        this.preconnectDone = false;
        this.preconnectPromise = null;
        if ( this.ringTimer ) {
            clearTimeout( this.ringTimer );
            this.ringTimer = null;
        }
        if ( pre ) {
            try { pre.removeAllListeners( 'disconnected' ); } catch { /* ignore */ }
            // Same reasoning as the active room below: a half-joined room still
            // holds a live session, so it must be closed rather than abandoned.
            const preDisconnect = (() => {
                try { return pre.disconnect(); } catch { return null; }
            })();
            try { if ( preDisconnect && typeof preDisconnect.catch === 'function' ) preDisconnect.catch( () => {} ); } catch { /* ignore */ }
            dbg( 'teardown — preconnect room closed (connected:', preWasConnected, ')' );
        }
        if ( room ) {
            try { room.removeAllListeners( 'disconnected' ); } catch { /* ignore */ }
            // Disconnect the room EVEN IF it never reported a finished connect. A
            // join that is still settling (LiveKit "cannot send signal request
            // before connected, type: answer" during a cold-start answer) can carry
            // LIVE two-way audio while roomConnected stays false. Skipping the
            // disconnect in that state left the engine — and the media session —
            // running, so after the agent tapped End the agent's screen closed but
            // the room stayed occupied and the caller kept talking. Closing the
            // engine drops the media and the signal socket, which is what tells the
            // server (and the far-end leg) that the agent left.
            const roomDisconnect = (() => {
                try { return room.disconnect(); } catch { return null; }
            })();
            try { if ( roomDisconnect && typeof roomDisconnect.catch === 'function' ) roomDisconnect.catch( () => {} ); } catch { /* ignore */ }
            dbg( 'teardown — room closed (connected:', roomWasConnected, ')' );
        }
        try {
            if ( lk && lk.AudioSession && typeof lk.AudioSession.stopAudioSession === 'function' ) {
                lk.AudioSession.stopAudioSession();
            }
        } catch { /* ignore */ }
        if ( hadCall && emitEvent ) {
            this.piopiy.emit( emitEvent, {
                code: 200,
                status: emitEvent === 'hangup' ? 'call hangup' : 'call ended',
                transport: 'push',
            } );
        }
    }
}
