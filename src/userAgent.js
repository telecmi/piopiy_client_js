import _ from 'lodash';
import cmisession from './session';
import session from './session';
const SIP = require( 'jssip' );


let cmi_ua = {}
let cmi_session = new cmisession();
let socket = new SIP.WebSocketInterface( 'wss://sbc.telecmi.com' );

export default class {

    start ( credentials, _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1001, status: 'Please logout before you login' } );
                return;
            }

        }


        if ( credentials.debug === true ) {
            SIP.debug.enable( 'JsSIP:*' );
        } else {

            SIP.debug.disable( 'JsSIP:*' );
        }


        credentials['sockets'] = [socket];

        cmi_ua = new SIP.UA( credentials );


        cmi_ua.on( 'registered', ( e ) => {
            _this.emit( 'login', { code: 200, status: 'login successfully' } )
        } );

        cmi_ua.on( 'unregistered', ( e ) => {
            _this.emit( 'logout', { code: 200, status: 'logout successfully' } )
        } );

        cmi_ua.on( 'registrationFailed', ( e ) => {
            _this.emit( 'loginFailed', { code: e.statusCode, status: 'invalid user' } )
        } );


        cmi_ua.on( 'newRTCSession', ( session ) => {



            if ( session.originator != "local" ) {
                if ( !_.isEmpty( cmi_ua._sessions ) ) {
                    if ( Object.keys( cmi_ua._sessions ).length > 1 ) {
                        session.session.terminate();
                        return;
                    }

                }
            }


            cmi_session.invite( session, _this )


        } );


        if ( !cmi_ua.isConnected() ) {
            cmi_ua.start();
        }



    }


    stop () {

        if ( cmi_ua ) {

            if ( cmi_ua.isRegistered() ) {
                cmi_ua.stop();
                cmi_ua.unregister();
            }

        }

    }

    make ( to, _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login to call' } );
                return;
            }

        }

        cmi_session.make( to, cmi_ua, _this )

    }

    terminate ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }

        cmi_session.terminate( cmi_ua, _this );

    }

    hangup ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }

        cmi_session.hangup( cmi_ua, _this );

    }

    answer ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }

        cmi_session.answer( cmi_ua, _this );

    }

    reject ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }

        cmi_session.reject( cmi_ua, _this );

    }


    dtmf ( no, _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }

        if ( !_.isNumber( no ) ) {
            _this.emit( 'error', { code: 1005, status: 'invalid dtmf type ' } );
            return;
        }

        cmi_session.dtmf( no, cmi_ua, _this );
    }


    hold ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }



        cmi_session.hold( cmi_ua, _this );
    }

    unhold ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }



        cmi_session.unhold( cmi_ua, _this );
    }





}