import _ from 'lodash';
import cmisession from './session';
import offline from './offline';
import SIP from 'jssip';


let cmi_ua = {}
let isConnected = false;
let cmi_session = new cmisession();
let cmi_offline = new offline();
let socket = new SIP.WebSocketInterface( 'wss://sbcsg.telecmi.com' );
if ( typeof window !== 'undefined' ) {
    window.onbeforeunload = function () {
        cmi_offline.start( cmi_ua );
    };
}


export default class {




    start ( credentials, _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1001, status: 'Please logout before you login' } );
                return;
            }

            if ( cmi_ua.isConnected() ) {
                cmi_ua.stop();
            }

        }


        if ( credentials.debug === true ) {
            SIP.debug.enable( 'JsSIP:*' );

        } else {

            SIP.debug.disable( 'PIOPIY:*' );
        }



        if ( credentials['region'] ) {

            socket = new SIP.WebSocketInterface( 'wss://' + credentials['region'] );


        }
        credentials['sockets'] = [socket];
        credentials['user_agent'] = 'PIOPIYJS'
        credentials['use_preloaded_route'] = true






        cmi_ua = new SIP.UA( credentials );


        // _this.cmi_jssip_option = setInterval( () => {
        //     var eventHandlers = {
        //         'succeeded': function ( data ) {

        //         },
        //         'failed': function ( data ) { /* Your code here */

        //             cmi_ua.start();
        //         }
        //     };

        //     var options = {
        //         'eventHandlers': eventHandlers
        //     };

        //     cmi_ua.sendOptions( 'sip:' + credentials.uri, null, options );
        // }, 10000 )

        cmi_ua.on( 'registered', ( e ) => {
            _this.emit( 'login', { code: 200, status: 'login successfully' } )
        } );

        cmi_ua.on( 'unregistered', ( e ) => {


            _this.emit( 'logout', { code: 200, status: 'logout successfully' } )
        } );

        cmi_ua.on( 'connected', ( e ) => {
            _this.emit( 'connected', { code: 200, status: 'SBC connected' } )
        } );

        cmi_ua.on( 'disconnected', ( e ) => {
            _this.emit( 'disconnected', { code: 1000, status: 'SBC disconneced' } )
        } );


        cmi_ua.on( 'registrationFailed', ( e ) => {
            if ( e.response ) {

                if ( e.response.status_code === 401 ) {
                    _this.emit( 'loginFailed', { code: 401, status: 'invalid user' } )
                }

                if ( e.response.status_code === 503 ) {
                    _this.emit( 'loginFailed', { code: 405, status: 'too many connection' } )
                }

                if ( e.response.status_code === 407 ) {
                    _this.emit( 'loginFailed', { code: 407, status: 'invalid IP' } )
                }

            }


        } );

        _this.on( 'net_changed', ( data ) => {

            if ( cmi_ua ) {
                if ( cmi_ua.isRegistered() & cmi_ua.isConnected() ) {
                    cmi_ua.transport.disconnect()
                    //cmi_ua.transport._reconnect()
                    cmi_ua.transport.connect()
                    cmi_ua.start();
                }
            }

        } )




        cmi_ua.on( 'newRTCSession', ( session ) => {



            if ( session.originator != "local" ) {
                if ( !_.isEmpty( cmi_ua._sessions ) ) {
                    if ( Object.keys( cmi_ua._sessions ).length > 1 ) {
                        session.session.terminate();
                        return;
                    }

                }
            }

            if ( session.request ) {
                _this.call_id = session.request.call_id;

            }


            cmi_session.invite( session, _this )


        } );


        if ( !isConnected ) {
            cmi_ua.start();
        } else {

            cmi_ua.register()

        }



    }

    re_register () {

        if ( !cmi_ua.isRegistered() ) {
            cmi_ua.register();
        }
    }


    stop ( _this ) {

        if ( cmi_ua ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login' } );
                return;
            }

            if ( cmi_ua.isRegistered() ) {

                cmi_ua.unregister();
                cmi_ua.stop();

            }

        }

    }

    make ( to, _this, options ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login to call' } );
                return;
            }

        }



        cmi_session.make( to, cmi_ua, _this, options );

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

        if ( _.isEmpty( no ) && ( !_.isNumber( no ) ) ) {
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


    mute ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }



        cmi_session.mute( cmi_ua, _this );
    }

    unmute ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {
                _this.emit( 'error', { code: 1002, status: 'Please login ' } );
                return;
            }

        }



        cmi_session.unmute( cmi_ua, _this );
    }


    islogedin ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( cmi_ua.isRegistered() ) {

                return true;
            }

        }


        return false;

    }


    isConnected ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( cmi_ua.isConnected() ) {

                return true;
            }

        }


        return false;

    }





    onmute ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {

                return false;
            } else {
                return cmi_session.onmute( cmi_ua, _this );
            }

        }
    }

    onhold ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {

                return false;
            } else {
                return cmi_session.onhold( cmi_ua, _this );
            }

        }
    }


    getCallId ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {

                return false;
            } else {
                return cmi_session.getCallId( cmi_ua, _this );
            }

        }
    }

    getCallID ( _this ) {

        if ( !_.isEmpty( cmi_ua ) ) {

            if ( !cmi_ua.isRegistered() ) {

                return false;
            } else {
                return cmi_session.getCallID( cmi_ua, _this );
            }

        }
    }




}