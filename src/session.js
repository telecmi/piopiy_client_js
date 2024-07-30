import _ from 'lodash';
import rtcpeer from './RTCPeer';



let RTCPeer = new rtcpeer();

let cmi_session = {};
let cmi_ua = {};
var timeout;
var cmi_timeout;

export default class {




    make ( to, ua, _this, options ) {


        if ( !_.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'already in call' } )
            return;
        }


        var cmi_media_cons = { 'audio': true, 'video': false }
        if ( localStorage.getItem( 'deviceId' ) ) {
            cmi_media_cons['audio'] = { deviceId: localStorage.getItem( 'deviceId' ) }
        }




        var eventHandlers = {
            'progress': function ( e ) {

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
            'ended': function ( e ) {
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }
            },
            'confirmed': function ( e ) {
                if ( timeout ) {
                    clearTimeout( timeout );
                    clearTimeout( cmi_timeout );
                }

            }
        };

        cmi_ua = ua;

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
                    `X-cmi-extra_param:${options.extra_param}`,
                ];

                call_options['extraHeaders'] = extraHeaders;
            }
        }



        cmi_session = ua.call( to, call_options )


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
        if ( session.originator != "local" ) {



            _this.emit( 'inComingCall', { from: session.request.from._display_name || 'unknown' } )
        }

        if ( session.request ) {

            if ( session.originator != "local" ) {
                const headers = session.request;
                var call_uuid = headers.getHeader( 'X-cmi-uuid' );

                cmi_session['call_ID'] = call_uuid;

            } else {
                cmi_session['call_ID'] = session.request.call_id;

            }
            cmi_session['call_id'] = session.request.call_id;
        }


        this.initSession( cmi_session, _this )
    }

    answer ( ua, _this ) {
        cmi_ua = ua;
        if ( _.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        if ( cmi_session.isEstablished() ) {
            _this.emit( 'error', { code: 1002, status: 'call already  answered' } )
            return;
        }



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
        cmi_ua = ua;
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

        cmi_ua = ua;
        cmi_session.terminate();
    }

    hangup ( ua, _this ) {
        if ( _.isEmpty( ua.sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'call not found' } )
            return;
        }

        cmi_ua = ua;
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


    onmute ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( !cmi_session.isEstablished() ) {

            return false;
        }


        return cmi_session.isMuted().audio;
    }


    onhold ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( !cmi_session.isEstablished() ) {

            return false;
        }


        return cmi_session.isOnHold().local;
    }


    getCallId ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( ( !cmi_session.isEstablished() && !cmi_session.isInProgress() ) ) {

            return false;
        }


        return cmi_session['call_id'] || false;

    }

    getCallID ( ua, _this ) {

        if ( _.isEmpty( ua._sessions ) ) {


            return false;
        }

        if ( ( !cmi_session.isEstablished() && !cmi_session.isInProgress() ) ) {

            return false;
        }


        return cmi_session['call_ID'] || false;

    }


    initSession ( cmisession, _this ) {

        cmisession.on( 'failed', ( e ) => {



            if ( e.originator == "local" ) {

                _this.emit( 'hangup', { code: e.status_code || 200, status: 'call hangup' } )
            } else {
                _this.emit( 'ended', { code: e?.message?.status_code || 200, status: e?.message?.reason_phrase || 'call ended' } )
            }

        } );

        if ( cmisession._connection ) {
            cmisession._connection.onaddstream = ( e ) => {

                if ( _this.piopiyOption.autoplay ) {
                    if ( e.stream ) {

                        var remoteAudio = document.getElementById( 'telecmi_audio_tag' );
                        remoteAudio.srcObject = e.stream;
                        remoteAudio.play();
                    }
                }

                _this.emit( 'callStream', { code: 200, status: e.stream } );
            }
        }






        cmisession.on( 'sending', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';

            _this.emit( 'trying', { code: 100, status: 'trying', type: type } )


        } );


        cmisession.on( 'peerconnection', ( e ) => {

            e.peerconnection.onaddstream = ( e ) => {

                if ( _this.piopiyOption.autoplay ) {
                    if ( e.stream ) {

                        var remoteAudio = document.getElementById( 'telecmi_audio_tag' );
                        remoteAudio.srcObject = e.stream;
                        remoteAudio.play();
                    }
                }

                _this.emit( 'callStream', { code: 200, status: e.stream } );
            }

            if ( cmisession.connection ) {
                try {
                    RTCPeer.connections( cmisession, cmisession.connection, _this )
                } catch ( e ) {
                    alert( e )
                }

            }

        } );

        cmisession.on( 'progress', ( e ) => {
            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'ringing', { code: 183, status: 'ringing', type: type } );



            if ( cmisession.connection ) {
                try {
                    RTCPeer.connections( cmisession, cmisession.connection, _this )
                } catch ( e ) {
                    alert( e )
                }

            }


        } );

        cmisession.on( 'accepted', ( e ) => {

            if ( e.originator == "local" ) {
                return;
            }

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'answered', { code: 200, status: 'answered' } )
        } );

        cmisession.on( 'confirmed', ( e ) => {


            if ( e.originator == "local" ) {
                return;
            }


            if ( cmisession._request ) {

                _this.call_id = cmisession._request.call_id;
            }

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'answered', { code: 200, status: 'answered' } )
        } );


        cmisession.on( 'getusermediafailed', ( e ) => {



            _this.emit( 'mediaFailed', { code: 415, status: e || 'user media failed' } )
        } );

        cmisession.on( "icecandidate", ( event ) => {

            if ( event.candidate.type === "srflx" &&
                event.candidate.relatedAddress !== null &&
                event.candidate.relatedPort !== null ) {
                event.ready();
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