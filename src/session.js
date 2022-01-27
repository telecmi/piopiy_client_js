import _ from 'lodash';




let cmi_session = {};


export default class {




    make ( to, ua, _this ) {

        if ( !_.isEmpty( ua._sessions ) ) {

            _this.emit( 'error', { code: 1002, status: 'already in call' } )
            return;
        }


        cmi_session = ua.call( to, {
            mediaConstraints: { 'audio': true, 'video': false },
            pcConfig: {
                'iceServers': _this.ice_servers
            }
        } )

    }


    invite ( session, _this ) {

        cmi_session = session.session;
        if ( session.originator != "local" ) {



            _this.emit( 'inComingCall', { from: session.request.from._display_name || 'unknown' } )
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


    initSession ( cmisession, _this ) {

        cmisession.on( 'failed', ( e ) => {

            if ( e.originator == "local" ) {

                _this.emit( 'hangup', { code: 200, status: 'call hangup' } )
            } else {
                _this.emit( 'ended', { code: 200, status: e.cause || 'call ended' } )
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

        } );

        cmisession.on( 'progress', ( e ) => {

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'ringing', { code: 183, status: 'ringing', type: type } )


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

            var type = ( e.originator == 'local' ) ? 'incoming' : 'outgoing';
            _this.emit( 'answered', { code: 200, status: 'answered' } )
        } );


        cmisession.on( 'getusermediafailed', ( e ) => {

            _this.emit( 'mediaFailed', { code: 200, status: e || 'user media failed' } )
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

            if ( e.originator == 'local' ) {
                _this.emit( 'hangup', { code: 200, status: 'call hangup' } )
            } else {
                _this.emit( 'ended', { code: 200, status: 'call ended' } )
            }


        } );














    }
}