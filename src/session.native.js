// React Native variant of session.js.
//
// Differences from the browser version (everything else is identical so that
// userAgent.js can use it unchanged):
//   * Remote media is surfaced via the Unified-Plan "track" event instead of
//     the deprecated onaddstream + a DOM <audio> element. react-native-webrtc
//     plays the remote audio to the device automatically.
//   * Microphone device selection via localStorage is dropped (default mic).
//   * alert() is removed; failures already surface through emitted events.
//   * react-native-incall-manager (optional) manages the audio session.
import _ from 'lodash';
import { Platform, NativeModules } from 'react-native';
import rtcpeer from './RTCPeer';


let RTCPeer = new rtcpeer();

let cmi_session = {};

var timeout;
var cmi_timeout;


// Internal debug hook. TEMP: enabled to trace the answer/audio flow during
// debugging — the lines appear in the Metro console as [piopiy:audio] …
// Set CK_DEBUG = false (or restore the no-op) before publishing the SDK.
const CK_DEBUG = false;
const dbg = ( ...args ) => {
    // eslint-disable-next-line no-console -- gated debug logging
    if ( CK_DEBUG ) { console.log( '[piopiy:audio]', ...args ); }
    // Optional persistent sink (set by the host app as globalThis.__piopiyLog) so
    // the killed/locked cold-launch sequence can be read from on-device storage
    // after unlocking — Console.app/Metro aren't usable on a locked cold-launch.
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__piopiyLog === 'function' ) {
            g.__piopiyLog( '[audio] ' + args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' ) );
        }
    } catch { /* ignore */ }
};

// Optional native audio-session manager. Soft-required so the SDK still works
// when the host app has not installed it (calls then use the default route).
let InCallManager = null;
try {
    const mod = require( 'react-native-incall-manager' );
    InCallManager = mod && ( mod.default || mod );
} catch {
    InCallManager = null;
}
dbg( 'react-native-incall-manager:', InCallManager ? 'LOADED' : 'NOT INSTALLED (audio will not route on iOS)' );

// Tracks the current loudspeaker preference; reset when the audio session stops.
let speakerOn = false;

const incall = {
    start () {
        try {
            dbg( 'incall.start() — InCallManager', InCallManager ? 'present, calling start({media:audio})' : 'MISSING (no-op)' );
            if ( InCallManager ) {
                InCallManager.start( { media: 'audio' } );
                // Re-assert the output route on every call. The bundled WebRTC
                // engine installs a GLOBAL audio config that defaults to the
                // loudspeaker (it targets video chat), which would make every
                // voice call answer on speaker. Honour the current preference —
                // earpiece unless the user turned the speaker on.
                InCallManager.setForceSpeakerphoneOn( !!speakerOn );
                dbg( 'incall.start() — route forced to', speakerOn ? 'speaker' : 'earpiece' );
            }
        } catch ( e ) {
            dbg( 'incall.start() ERROR', e && e.message );
        }
    },
    stop () {
        try {
            dbg( 'incall.stop()' );
            if ( InCallManager ) InCallManager.stop();
        } catch {
            // ignore
        }
        // InCallManager.stop() restores the default route, so clear our flag too.
        speakerOn = false;
    },
    setSpeaker ( on ) {
        try {
            if ( InCallManager ) InCallManager.setForceSpeakerphoneOn( !!on );
            speakerOn = !!on;
        } catch {
            // ignore
        }
        return speakerOn;
    }
};


// iOS CallKit owns the AVAudioSession and activates it only AFTER the answer
// action is fulfilled. Starting WebRTC audio before that (the old behaviour)
// leaves the audio unit detached from CallKit's session -> the call connects but
// is silent. The CallKeep bridge sets this flag so answer() defers the audio
// start to CallKit's `didActivateAudioSession` event, which the bridge drives via
// the exported `callAudio` controls below.
let callKitAudioManaged = false;
export function setCallKitAudioManaged ( v ) {
    callKitAudioManaged = !!v;
}
// Shared audio-session controls so the CallKeep bridge starts/stops the SAME
// InCallManager instance on the CallKit audio-session events.
export const callAudio = incall;


// iOS CallKit + react-native-webrtc MANUAL audio. In WebRTC's default (automatic)
// mode the VoIP audio unit starts as soon as a track is ready — which races
// CallKit's didActivateAudioSession on push-woken/locked answers and leaves the
// call silent (the -12985 "cannot interrupt others" fight seen in the logs). In
// manual mode WebRTC only runs its audio unit when we call setAudioEnabled(true),
// which the CallKeep bridge drives from CallKit's activate/deactivate events — so
// audio start is deterministic regardless of track-vs-activation timing.
//
// Requires the native methods added by the app's react-native-webrtc patch
// (example-rn/patches/react-native-webrtc+124.0.7.patch). If the patch is absent
// these are no-ops and WebRTC stays in automatic mode (today's behaviour), so this
// can never break a build that hasn't applied the patch.
const WebRTCModule = ( NativeModules && NativeModules.WebRTCModule ) || null;
const hasManualAudio = !!( WebRTCModule
    && typeof WebRTCModule.setManualAudio === 'function'
    && typeof WebRTCModule.setAudioEnabled === 'function' );

export const webrtcAudio = {
    available: hasManualAudio,
    // Put WebRTC in manual mode with the audio unit OFF. Call once at startup.
    initManual () {
        if ( Platform.OS !== 'ios' || !hasManualAudio ) {
            dbg( 'webrtcAudio.initManual skipped — ios:', Platform.OS === 'ios', 'patched:', hasManualAudio );
            return;
        }
        try {
            WebRTCModule.setManualAudio( true );
            WebRTCModule.setAudioEnabled( false );
            dbg( 'webrtcAudio: MANUAL mode ON, audio unit held OFF' );
        } catch ( e ) {
            dbg( 'webrtcAudio.initManual ERROR', e && e.message );
        }
    },
    // CallKit activated the AVAudioSession -> sync + start the audio unit.
    // Fully inert unless the manual-audio patch is present, so an unpatched build
    // keeps today's behaviour (InCallManager only) with no change.
    enable () {
        if ( Platform.OS !== 'ios' || !hasManualAudio ) return;
        try {
            WebRTCModule.audioSessionDidActivate();
            WebRTCModule.setAudioEnabled( true );
            dbg( 'webrtcAudio: ENABLED (CallKit session active)' );
        } catch ( e ) {
            dbg( 'webrtcAudio.enable ERROR', e && e.message );
        }
    },
    // CallKit deactivated the AVAudioSession -> stop the audio unit + sync.
    disable () {
        if ( Platform.OS !== 'ios' || !hasManualAudio ) return;
        try {
            WebRTCModule.setAudioEnabled( false );
            WebRTCModule.audioSessionDidDeactivate();
            dbg( 'webrtcAudio: DISABLED (CallKit session inactive)' );
        } catch ( e ) {
            dbg( 'webrtcAudio.disable ERROR', e && e.message );
        }
    }
};


// Bind the remote audio track. On React Native the audio is rendered to the
// device output automatically; we only relay the stream via callStream.
const attachRemoteStream = ( pc, _this ) => {
    if ( !pc || pc.__cmiTrackBound ) return;
    pc.__cmiTrackBound = true;
    try {
        pc.addEventListener( 'track', ( event ) => {
            const stream = ( event && event.streams && event.streams[ 0 ] ) || null;
            const kind = event && event.track && event.track.kind;
            dbg( 'remote track received — kind:', kind, 'stream:', stream ? 'yes' : 'no' );
            if ( stream ) {
                _this.emit( 'callStream', { code: 200, status: stream } );
            }
        } );
    } catch ( e ) {
        dbg( 'attachRemoteStream ERROR', e && e.message );
    }
};


export default class {




    make ( to, ua, _this, options ) {


        if ( !_.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'already in call' } )
            return;
        }


        var cmi_media_cons = { 'audio': true, 'video': false }




        var eventHandlers = {
            'progress': function () {
                dbg( 'outgoing: PROGRESS (1xx) received — remote is ringing' );
            },
            'failed': function ( e ) {
                dbg( 'outgoing: FAILED — cause:', e && e.cause,
                    'status:', e && e.message && e.message.status_code,
                    'originator:', e && e.originator );
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }
                if ( e ) {
                    if ( e.message ) {
                        if ( e.message.status_code == 407 ) {
                            _this.emit( 'loginFailed', { code: 407, status: 'invalid user' } )
                        }
                    }
                }
            },
            'ended': function () {
                dbg( 'outgoing: ENDED' );
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }
            },
            'confirmed': function () {
                dbg( 'outgoing: CONFIRMED (ACK) — call established' );
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }

            }
        };



        const call_options = {
            'eventHandlers': eventHandlers,
            mediaConstraints: cmi_media_cons,
            // jsSIP defaults rtcOfferConstraints to null and passes it straight to
            // createOffer(). The LiveKit react-native-webrtc fork throws
            // "Cannot convert null value to object" on null options — always hand
            // it a real object (harmless on stock react-native-webrtc too).
            rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
            pcConfig: {
                'iceServers': _this.ice_servers
            }
        }

        if ( _.isObject( options ) ) {
            if ( isString( options.extra_param ) ) {

                const extraHeaders = [
                    `X-cmi-extra_param:${ options.extra_param }`,
                ];

                call_options[ 'extraHeaders' ] = extraHeaders;
            }
        }



        dbg( 'make(): dialing', to, '— creating session (getUserMedia + SDP next)' );
        cmi_session = ua.call( to, call_options )
        dbg( 'make(): session object created — INVITE goes out once SDP is ready' );

        incall.start();
        // Outgoing calls are not CallKit-managed, so no didActivateAudioSession
        // fires for them. InCallManager activated the session above; in manual
        // audio mode we must explicitly start WebRTC's audio unit here, or the
        // call would be silent. No-op if the webrtc patch isn't applied.
        webrtcAudio.enable();


        cmi_timeout = setTimeout( function () {

            if ( cmi_session && ( cmi_session.status === 1 ) ) {
                dbg( 'make(): 5s and still no SIP response (status 1) → NETStats 408' );
                _this.emit( 'NETStats', { code: 408, msg: 'Request timeout' } )
            }
        }, 5000 );


        timeout = setTimeout( function () {

            if ( cmi_session && ( cmi_session.status === 1 ) ) {

                dbg( 'make(): 10s WATCHDOG — no response to INVITE → terminating call + restarting UA (this is the auto-hangup)' );
                cmi_session.terminate();
                ua.stop();
                ua.start();

            }
        }, 10000 );

    }


    invite ( session, _this ) {

        cmi_session = session.session;
        if ( session.request ) {

            if ( session.originator != "local" ) {
                const headers = session.request;

                // Robust header extraction with case-insensitive fallback
                const getHeader = ( name ) => {
                    return headers.getHeader( name ) || headers.getHeader( name.toLowerCase() ) || "";
                };

                var call_uuid = getHeader( 'X-cmi-uuid' );
                var team_name = getHeader( 'X-Team-Name' );
                var to_number = getHeader( 'X-To-Number' );
                var x_call_id = getHeader( 'X-Call-ID' );
                var transfer_from = getHeader( 'X-Transfer-From' );
                var transfer = getHeader( 'X-Transfer' );

                cmi_session[ 'call_ID' ] = x_call_id || call_uuid;
                cmi_session[ 'team_name' ] = team_name;
                cmi_session[ 'to_number' ] = to_number;
                cmi_session[ 'transfer_from' ] = transfer_from;
                cmi_session[ 'transfer' ] = transfer;

                const incoming_call_payload = {
                    from: session.request.from._display_name || 'unknown'
                };

                if ( team_name ) incoming_call_payload.team_name = team_name;
                if ( to_number ) incoming_call_payload.to_number = to_number;
                if ( transfer_from ) incoming_call_payload.transfer_from = transfer_from;
                if ( transfer ) incoming_call_payload.transfer = transfer;

                const final_call_id = x_call_id || session.request.call_id || "";
                if ( final_call_id ) incoming_call_payload.call_id = final_call_id;

                _this.emit( 'inComingCall', incoming_call_payload );

            } else {
                cmi_session[ 'call_ID' ] = session.request.call_id;

            }
            cmi_session[ 'call_id' ] = session.request.call_id;
        }


        this.initSession( cmi_session, _this )
    }

    answer ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'call already answered' } )
            return;
        }


        // On the CallKit path (iOS) the bridge starts audio on
        // `didActivateAudioSession`; starting here would be too early and the call
        // would answer silent. Off that path (Android, or no CallKit) start now.
        if ( !callKitAudioManaged ) {
            incall.start();
        }

        cmi_session.answer( {
            mediaConstraints: { 'audio': true, 'video': false },
            // Non-null constraints for the LiveKit webrtc fork: createAnswer (and
            // any later hold/renegotiate createOffer) reject null options with
            // "Cannot convert null value to object".
            rtcAnswerConstraints: {},
            rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
            pcConfig: {
                'iceServers': _this.ice_servers
            }
        } );



    }

    reject ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {
            // No live session (e.g. a push "ghost" call that never got an INVITE, or
            // a call that already ended). Hanging up nothing is a no-op, not an error.
            dbg( 'reject(): no active session — nothing to reject' );
            return;
        }

        if ( cmi_session.isEnded() ) {
            dbg( 'reject(): session already ended — nothing to reject' );
            return;
        }

        cmi_session.terminate();

    }

    terminate ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {
            // No live session — hanging up nothing is a no-op, not an error.
            dbg( 'terminate(): no active session — nothing to terminate' );
            return;
        }

        if ( cmi_session.isEnded() ) {
            dbg( 'terminate(): session already ended — nothing to terminate' );
            return;
        }


        cmi_session.terminate();
    }

    hangup ( ua, _this ) {
        // NOTE: must be `_sessions` (the previous `ua.sessions` was always undefined,
        // so this guard never worked).
        if ( _.isEmpty( ua._sessions ) ) {
            dbg( 'hangup(): no active session — nothing to hang up' );
            return;
        }


        cmi_session.bye();
    }




    dtmf ( no, ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( !cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'dtmf not allowed' } )
            return;
        }
        var options = {

            'transportType': 'RFC2833'
        };


        cmi_session.sendDTMF( no, options );
    }


    hold ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( !cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'hold not allowed' } )
            return;
        }

        if ( cmi_session.isOnHold().local ) {
            _this.emit( 'error', { code: 1002, status: 'call already in hold' } )
            return;
        }


        cmi_session.hold();
    }


    unhold ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( !cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'hold not allowed' } )
            return;
        }

        if ( !cmi_session.isOnHold().local ) {
            _this.emit( 'error', { code: 1002, status: 'call not in hold' } )
            return;
        }


        cmi_session.unhold();
    }


    mute ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( !cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'mute not allowed' } )
            return;
        }

        if ( cmi_session.isMuted().audio ) {
            _this.emit( 'error', { code: 1002, status: 'call already in mute' } )
            return;
        }


        cmi_session.mute();
    }


    unmute ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( !cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'mute not allowed' } )
            return;
        }

        if ( !cmi_session.isMuted().audio ) {
            _this.emit( 'error', { code: 1002, status: 'call not in mute' } )
            return;
        }


        cmi_session.unmute();
    }


    onmute ( ua ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( !cmi_session.isEstablished() ) {

            return false;
        }


        return cmi_session.isMuted().audio;
    }


    onhold ( ua ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( !cmi_session.isEstablished() ) {

            return false;
        }


        return cmi_session.isOnHold().local;
    }


    // Route audio between the earpiece and the loudspeaker. Native-only; the SDK
    // owns the audio session, so callers just flip the route.
    speaker ( on ) {
        return incall.setSpeaker( on );
    }


    onspeaker () {
        return speakerOn;
    }


    getCallId ( ua ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        return cmi_session[ 'call_id' ] || false;

    }

    getCallID ( ua ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( ( !cmi_session.isEstablished() && !cmi_session.isInProgress() ) ) {

            return false;
        }


        return cmi_session[ 'call_ID' ] || false;

    }


    initSession ( cmisession, _this ) {

        cmisession.on( 'failed', ( e ) => {

            incall.stop();
            webrtcAudio.disable();

            if ( e.originator == "local" ) {

                _this.emit( 'hangup', { code: e.status_code || 200, status: 'call hangup' } )
            } else {
                _this.emit( 'ended', { code: e?.message?.status_code || 200, status: e?.message?.reason_phrase || 'call ended' } )
            }

        } );

        if ( cmisession._connection ) {
            attachRemoteStream( cmisession._connection, _this );
        }


        cmisession.on( 'sending', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';

            _this.emit( 'trying', { code: 100, status: 'trying', type: type } )


        } );


        cmisession.on( 'peerconnection', ( e ) => {

            attachRemoteStream( e.peerconnection, _this );

            if ( cmisession.connection ) {
                try {
                    RTCPeer.connections( cmisession, cmisession.connection, _this )
                } catch {
                    // ignore
                }

            }

        } );

        cmisession.on( 'progress', ( e ) => {
            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'ringing', { code: 183, status: 'ringing', type: type } );



            if ( cmisession.connection ) {
                attachRemoteStream( cmisession.connection, _this );
                try {
                    RTCPeer.connections( cmisession, cmisession.connection, _this )
                } catch {
                    // ignore
                }

            }


        } );

        const emitAnswered = () => {
            if ( cmisession.__cmiAnsweredEmitted ) return;
            cmisession.__cmiAnsweredEmitted = true;

            if ( cmisession._request ) {
                _this.call_id = cmisession._request.call_id;
            }

            _this.emit( 'answered', { code: 200, status: 'answered' } );
        };

        cmisession.on( 'accepted', () => {
            // Incoming calls are answered locally, so jsSIP can report
            // originator="local" even though this is the moment the app should move
            // to active-call UI. Emit once for both incoming and outgoing calls.
            emitAnswered();
        } );

        cmisession.on( 'confirmed', () => {
            emitAnswered();
        } );


        cmisession.on( 'getusermediafailed', ( e ) => {

            incall.stop();
            webrtcAudio.disable();

            _this.emit( 'mediaFailed', { code: 415, status: e || 'user media failed' } )
        } );

        cmisession.on( "icecandidate", ( event ) => {

            // react-native-webrtc does not populate the parsed RTCIceCandidate
            // fields (type / relatedAddress / relatedPort), so detecting the
            // server-reflexive candidate via `event.candidate.type` always fails
            // and `ready()` is never called — jsSIP then blocks the answer SDP
            // until full ICE gathering completes, noticeably delaying inbound
            // audio. Fall back to parsing the raw candidate string. If no srflx
            // appears quickly during an iOS push wake-up, release the SDP anyway so
            // the SIP answer is not lost to the caller-side no-answer timer.
            try {
                const candidate = event && event.candidate;
                const ready = () => {
                    if ( cmisession.__cmiIceReadyCalled ) return;
                    cmisession.__cmiIceReadyCalled = true;
                    if ( cmisession.__cmiIceReadyTimer ) {
                        clearTimeout( cmisession.__cmiIceReadyTimer );
                        cmisession.__cmiIceReadyTimer = null;
                    }
                    event.ready();
                };

                if ( !candidate ) {
                    ready();
                    return;
                }

                const candidateStr = ( typeof candidate.candidate === 'string' ) ? candidate.candidate : '';
                const type = candidate.type || ( /(?:^|\s)typ\s+(\w+)/.exec( candidateStr ) || [] )[ 1 ];

                if ( type === 'srflx' || type === 'relay' ) {
                    ready();
                    return;
                }

                if ( !cmisession.__cmiIceReadyTimer ) {
                    cmisession.__cmiIceReadyTimer = setTimeout( ready, 1200 );
                }
            } catch {
                // ignore
            }
        } );


        cmisession.on( 'newDTMF', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'dtmf', { code: 200, dtmf: e.dtmf._tone, type: type } )
        } );

        cmisession.on( 'hold', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'myself' : 'other';
            _this.emit( 'hold', { code: 200, status: 'call on hold', whom: type } )
        } );


        cmisession.on( 'unhold', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'myself' : 'other';
            _this.emit( 'unhold', { code: 200, status: 'call on active', whom: type } )
        } );




        cmisession.on( 'ended', ( e ) => {

            incall.stop();
            webrtcAudio.disable();

            if ( _this.cmi_webrtc_stats ) {
                clearInterval( _this.cmi_webrtc_stats )
            }

            if ( e.originator == 'local' ) {
                _this.emit( 'hangup', { code: 200, status: 'call hangup' } )
            } else {
                _this.emit( 'ended', { code: 200, status: 'call ended' } )
            }


        } );


    }
}

const isString = ( value ) => {
    return typeof value === 'string';
}
