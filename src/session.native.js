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
import rtcpeer from './RTCPeer';


let RTCPeer = new rtcpeer();

let cmi_session = {};

var timeout;
var cmi_timeout;


// Optional native audio-session manager. Soft-required so the SDK still works
// when the host app has not installed it (calls then use the default route).
let InCallManager = null;
try {
    const mod = require( 'react-native-incall-manager' );
    InCallManager = mod && ( mod.default || mod );
} catch ( e ) {
    InCallManager = null;
}

// Tracks the current loudspeaker preference; reset when the audio session stops.
let speakerOn = false;

const incall = {
    start () {
        try {
            if ( InCallManager ) InCallManager.start( { media: 'audio' } );
        } catch ( e ) {
            // ignore
        }
    },
    stop () {
        try {
            if ( InCallManager ) InCallManager.stop();
        } catch ( e ) {
            // ignore
        }
        // InCallManager.stop() restores the default route, so clear our flag too.
        speakerOn = false;
    },
    setSpeaker ( on ) {
        try {
            if ( InCallManager ) InCallManager.setForceSpeakerphoneOn( !!on );
            speakerOn = !!on;
        } catch ( e ) {
            // ignore
        }
        return speakerOn;
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
            if ( stream ) {
                _this.emit( 'callStream', { code: 200, status: stream } );
            }
        } );
    } catch ( e ) {
        // ignore
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

            },
            'failed': function ( e ) {
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
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }
            },
            'confirmed': function () {
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }

            }
        };



        const call_options = {
            'eventHandlers': eventHandlers,
            mediaConstraints: cmi_media_cons,
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



        cmi_session = ua.call( to, call_options )

        incall.start();


        cmi_timeout = setTimeout( function () {

            if ( cmi_session && ( cmi_session.status === 1 ) ) {
                _this.emit( 'NETStats', { code: 408, msg: 'Request timeout' } )
            }
        }, 5000 );


        timeout = setTimeout( function () {

            if ( cmi_session && ( cmi_session.status === 1 ) ) {

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
            _this.emit( 'error', { code: 1002, status: 'call already  answered' } )
            return;
        }


        incall.start();

        cmi_session.answer( {
            mediaConstraints: { 'audio': true, 'video': false }, pcConfig: {
                'iceServers': _this.ice_servers
            }
        } );



    }

    reject ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( cmi_session.isEnded() ) {
            _this.emit( 'error', { code: 1002, status: 'call already ended' } )
            return;
        }

        cmi_session.terminate();

    }

    terminate ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( cmi_session.isEnded() ) {
            _this.emit( 'error', { code: 1002, status: 'call already ended' } )
            return;
        }


        cmi_session.terminate();
    }

    hangup ( ua, _this ) {
        if ( _.isEmpty( ua.sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
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
                } catch ( e ) {
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
                } catch ( e ) {
                    // ignore
                }

            }


        } );

        cmisession.on( 'accepted', ( e ) => {

            if ( e.originator == "local" ) {
                return;
            }

            _this.emit( 'answered', { code: 200, status: 'answered' } )
        } );

        cmisession.on( 'confirmed', ( e ) => {


            if ( e.originator == "local" ) {
                return;
            }


            if ( cmisession._request ) {

                _this.call_id = cmisession._request.call_id;
            }

            _this.emit( 'answered', { code: 200, status: 'answered' } )
        } );


        cmisession.on( 'getusermediafailed', ( e ) => {

            incall.stop();

            _this.emit( 'mediaFailed', { code: 415, status: e || 'user media failed' } )
        } );

        cmisession.on( "icecandidate", ( event ) => {

            // react-native-webrtc does not populate the parsed RTCIceCandidate
            // fields (type / relatedAddress / relatedPort), so detecting the
            // server-reflexive candidate via `event.candidate.type` always fails
            // and `ready()` is never called — jsSIP then blocks the answer SDP
            // until full ICE gathering completes, noticeably delaying inbound
            // audio. Fall back to parsing the raw candidate string so the answer
            // is sent as soon as a srflx (STUN) candidate is found.
            try {
                const candidate = event && event.candidate;
                if ( !candidate ) return;

                const candidateStr = ( typeof candidate.candidate === 'string' ) ? candidate.candidate : '';
                const type = candidate.type || ( /(?:^|\s)typ\s+(\w+)/.exec( candidateStr ) || [] )[ 1 ];

                if ( type === 'srflx' ) {
                    event.ready();
                }
            } catch ( e ) {
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
