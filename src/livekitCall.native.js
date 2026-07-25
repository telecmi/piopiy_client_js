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
try {
    const webrtc = require( '@livekit/react-native-webrtc' );
    rtcAudioSession = ( webrtc && webrtc.RTCAudioSession ) || null;
} catch {
    try {
        const webrtc = require( 'react-native-webrtc' );
        rtcAudioSession = ( webrtc && webrtc.RTCAudioSession ) || null;
    } catch {
        rtcAudioSession = null;
    }
}

let globalsRegistered = false;

export default class LiveKitCall {

    constructor( piopiy, config ) {
        this.piopiy = piopiy;
        this.config = config || {};
        this.room = null;        // live Room while connected
        this.pending = null;     // {uuid, room, token, url, from} while ringing
        this.activeUUID = null;  // CallKit uuid of the connected call
        this.ringTimer = null;   // bounds the pending (ringing) state

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
        dbg( 'engine', this.available() ? 'READY (@livekit/react-native + livekit-client loaded)' : 'inert (@livekit/react-native or livekit-client not installed)' );
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
            from: info.from || 'Incoming call',
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
        this.piopiy.emit( 'inComingCall', { from: this.pending.from, call_id: this.pending.uuid, transport: 'livekit' } );
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
            this.piopiy.emit( 'error', { code: 1009, status: 'livekit url missing' } );
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

        try {
            if ( lk.AudioSession ) {
                // Voice-call session config: earpiece by default so the CallKit
                // speaker toggle works. (LiveKit's default is videoChat mode,
                // which forces the loudspeaker and pins the route.)
                if ( typeof lk.AudioSession.setAppleAudioConfiguration === 'function' ) {
                    await lk.AudioSession.setAppleAudioConfiguration( {
                        audioCategory: 'playAndRecord',
                        audioCategoryOptions: [ 'allowBluetooth' ],
                        audioMode: 'voiceChat',
                    } );
                    dbg( 'Apple audio configured: playAndRecord / voiceChat' );
                }
                // iOS + CallKit: do NOT activate the AVAudioSession ourselves —
                // CallKit owns activation, and racing it breaks its activation:
                // the call goes silent and the audio route sticks. RTCAudioSession
                // is synced on didActivateAudioSession (onAudioSessionActivated).
                if ( Platform.OS !== 'ios' && typeof lk.AudioSession.startAudioSession === 'function' ) {
                    await lk.AudioSession.startAudioSession();
                    dbg( 'AudioSession started' );
                }
            }
        } catch ( e ) {
            dbg( 'audio session setup failed:', e && e.message );
        }

        try {
            const room = new lkClient.Room();
            this.room = room;
            room.on( 'disconnected', ( reason ) => {
                dbg( 'room disconnected —', reason ? String( reason ) : 'no reason' );
                this._teardown( 'ended' );
            } );
            await room.connect( call.url, call.token, { autoSubscribe: true } );
            dbg( 'room CONNECTED — enabling microphone' );
            try {
                await room.localParticipant.setMicrophoneEnabled( true );
            } catch ( e ) {
                dbg( 'setMicrophoneEnabled failed:', e && e.message );
            }
            this.piopiy.emit( 'answered', { code: 200, status: 'answered', transport: 'livekit' } );
            return true;
        } catch ( e ) {
            dbg( 'room.connect FAILED —', e && e.message );
            this.piopiy.emit( 'error', { code: 1010, status: 'livekit connect failed: ' + ( e && e.message ) } );
            this._teardown( 'ended' );
            return false;
        }
    }

    // Route call audio to the loudspeaker (true) or back to the default route /
    // earpiece (false). iOS: immediate AVAudioSession output override.
    async setSpeaker( on ) {
        if ( !lk || !lk.AudioSession || typeof lk.AudioSession.selectAudioOutput !== 'function' ) {
            dbg( 'setSpeaker ignored — AudioSession.selectAudioOutput unavailable' );
            return false;
        }
        try {
            await lk.AudioSession.selectAudioOutput( on ? 'force_speaker' : 'default' );
            dbg( 'speaker', on ? 'ON (loudspeaker)' : 'off (default route)' );
            return true;
        } catch ( e ) {
            dbg( 'setSpeaker failed:', e && e.message );
            return false;
        }
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
            try { this.piopiy.emit( 'ended', { code: 200, status: 'call ended', reason: reason || 'rejected', transport: 'livekit' } ); } catch { /* ignore */ }
            // A ringing call that ends WITHOUT the user acting on it is a missed
            // call (caller gave up, or ringing timed out offline). A user reject
            // is deliberate and does not count. Apps listen to this to show a
            // LOCAL "missed call" notification — no server push needed; on iOS
            // CallKit already logs the missed call in the Phone app's Recents.
            if ( reason === 'caller cancelled' || reason === 'ring timeout' ) {
                const missedReason = reason === 'ring timeout' ? 'ring_timeout' : 'cancelled';
                try { this.piopiy.emit( 'missedCall', { uuid, from: from || null, reason: missedReason, transport: 'livekit' } ); } catch { /* ignore */ }
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
        const hadCall = !!( this.room || this.pending || this.activeUUID );
        const room = this.room;
        this.room = null;
        this.pending = null;
        this.activeUUID = null;
        if ( this.ringTimer ) {
            clearTimeout( this.ringTimer );
            this.ringTimer = null;
        }
        if ( room ) {
            try { room.removeAllListeners( 'disconnected' ); } catch { /* ignore */ }
            try { room.disconnect(); } catch { /* ignore */ }
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
                transport: 'livekit',
            } );
        }
    }
}
