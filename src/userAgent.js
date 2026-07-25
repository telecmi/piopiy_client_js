import _ from 'lodash';
import cmisession from './session';
import offline from './offline';
import SIP from 'jssip';

// React Native sets navigator.product === 'ReactNative'. Use a distinct SIP
// User-Agent header on mobile so the SBC/Kamailio can identify RN clients.
const IS_REACT_NATIVE = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// SDK-level signaling debug. TEMP: enabled to trace the register/call flow —
// lines appear in the Metro console as [piopiy:ua] and are also mirrored to the
// optional persistent sink (globalThis.__piopiyLog) so the app's Share-capture
// contains the full trace even when Metro/Console.app aren't attached.
// Set UA_DEBUG = false before publishing the SDK.
const UA_DEBUG = false;
const dbg = ( ...args ) => {
    if ( !UA_DEBUG ) return;
    const line = args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' );
    console.log( '[piopiy:ua]', line );
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__piopiyLog === 'function' ) {
            g.__piopiyLog( '[ua] ' + line );
        }
    } catch { /* ignore */ }
};


let cmi_ua = {}
let isConnected = false;
let cmi_session = new cmisession();
let cmi_offline = new offline();
let socket = new SIP.WebSocketInterface('wss://sbcsg.telecmi.com');
if (typeof window !== 'undefined') {
    window.onbeforeunload = function () {
        cmi_offline.start(cmi_ua);
    };
}


export default class {




    start(credentials, _this) {

        if (!_.isEmpty(cmi_ua)) {

            if (cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1001, status: 'Please logout before you login' });
                return;
            }

            if (cmi_ua.isConnected()) {
                cmi_ua.stop();
            }

        }


        if (credentials.debug === true) {
            SIP.debug.enable('JsSIP:*');
            // Route jsSIP's own protocol logs (REGISTER/INVITE and every SIP
            // message) into the persistent sink too, so the app's Share-capture
            // holds the complete SIP trace, not just SDK lifecycle lines.
            try {
                SIP.debug.log = (...args) => {
                    console.log(...args);
                    try {
                        const g = (typeof globalThis !== 'undefined') ? globalThis : null;
                        if (g && typeof g.__piopiyLog === 'function') {
                            g.__piopiyLog('[jssip] ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
                        }
                    } catch { /* ignore */ }
                };
            } catch { /* ignore */ }

        } else {

            SIP.debug.disable('PIOPIY:*');
        }



        if (credentials['region']) {

            socket = new SIP.WebSocketInterface('wss://' + credentials['region']);


        }
        dbg('start(): user', credentials.authorization_user,
            '→ wss://' + (credentials['region'] || 'sbcsg.telecmi.com'),
            'register_expires:', credentials.register_expires);
        credentials['sockets'] = [socket];
        credentials['user_agent'] = IS_REACT_NATIVE ? 'piopiy_mobile' : 'PIOPIYJS'
        credentials['use_preloaded_route'] = true






        cmi_ua = new SIP.UA(credentials);




        cmi_ua.on('registered', () => {
            dbg('REGISTERED — 200 OK to REGISTER');
            _this.emit('login', { code: 200, status: 'login successfully' })
        });



        cmi_ua.on('unregistered', () => {

            dbg('UNREGISTERED');
            _this.emit('logout', { code: 200, status: 'logout successfully' })
        });

        cmi_ua.on('connected', () => {
            dbg('transport CONNECTED — WSS socket up');
            _this.emit('connected', { code: 200, status: 'SBC connected' })
        });

        cmi_ua.on('disconnected', (e) => {
            dbg('transport DISCONNECTED', e && e.code, e && e.reason, e && e.error ? '(error)' : '');
            _this.emit('disconnected', { code: 1000, status: 'SBC disconneced' })
        });


        cmi_ua.on('registrationFailed', (e) => {
            dbg('REGISTRATION FAILED —', e && e.response ? 'status ' + e.response.status_code : 'cause ' + (e && e.cause));
            if (e.response) {

                if (e.response.status_code === 401) {
                    _this.emit('loginFailed', { code: 401, status: 'invalid user' })
                }

                if (e.response.status_code === 503) {
                    _this.emit('loginFailed', { code: 405, status: 'too many connection' })
                }

                if (e.response.status_code === 407) {
                    _this.emit('loginFailed', { code: 407, status: 'invalid IP' })
                }

            }


        });

        _this.on('net_changed', () => {

            if (cmi_ua) {
                if (cmi_ua.isRegistered()) {
                    if (cmi_ua.transport) {
                        if (cmi_ua.isConnected()) {
                            cmi_ua.transport.disconnect()
                        }
                        cmi_ua.transport.connect()
                    }
                    cmi_ua.start();
                }
            }

        })




        cmi_ua.on('newRTCSession', (session) => {

            try {
                dbg('newRTCSession —', session.originator === 'local'
                    ? 'OUTGOING to ' + (session.request && session.request.ruri ? session.request.ruri.toString() : '?')
                    : 'INCOMING from ' + (session.request && session.request.from ? session.request.from.toString() : '?'));
            } catch { dbg('newRTCSession —', session.originator); }

            if (session.originator != "local") {
                if (!_.isEmpty(cmi_ua._sessions)) {
                    if (Object.keys(cmi_ua._sessions).length > 1) {
                        session.session.terminate();
                        return;
                    }

                }
            }

            if (session.request) {
                _this.call_id = session.request.call_id;

            }


            cmi_session.invite(session, _this)


        });


        if (!isConnected) {
            cmi_ua.start();
        } else {

            cmi_ua.register()

        }



    }

    re_register() {

        if (!cmi_ua.isRegistered()) {
            cmi_ua.register();
        }
    }


    stop(_this) {

        if (cmi_ua) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login' });
                return;
            }

            if (cmi_ua.isRegistered()) {

                cmi_ua.unregister();
                cmi_ua.stop();

            }

        }

    }

    make(to, _this, options) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                dbg('make() BLOCKED — not registered (login first)');
                _this.emit('error', { code: 1002, status: 'Please login to call' });
                return;
            }

        }

        dbg('make() →', to, '| connected:', cmi_ua.isConnected ? cmi_ua.isConnected() : '?');

        cmi_session.make(to, cmi_ua, _this, options);

    }

    terminate(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }

        cmi_session.terminate(cmi_ua, _this);

    }

    hangup(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }

        cmi_session.hangup(cmi_ua, _this);

    }

    answer(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }

        cmi_session.answer(cmi_ua, _this);

    }

    reject(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }

        cmi_session.reject(cmi_ua, _this);

    }


    dtmf(no, _this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }

        if (_.isEmpty(no) && (!_.isNumber(no))) {
            _this.emit('error', { code: 1005, status: 'invalid dtmf type ' });
            return;
        }

        cmi_session.dtmf(no, cmi_ua, _this);
    }


    hold(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }



        cmi_session.hold(cmi_ua, _this);
    }

    unhold(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }



        cmi_session.unhold(cmi_ua, _this);
    }


    mute(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }



        cmi_session.mute(cmi_ua, _this);
    }

    unmute(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {
                _this.emit('error', { code: 1002, status: 'Please login ' });
                return;
            }

        }



        cmi_session.unmute(cmi_ua, _this);
    }


    islogedin() {

        if (!_.isEmpty(cmi_ua)) {

            if (cmi_ua.isRegistered()) {

                return true;
            }

        }


        return false;

    }


    isConnected() {

        if (!_.isEmpty(cmi_ua)) {

            if (cmi_ua.isConnected()) {

                return true;
            }

        }


        return false;

    }





    onmute(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {

                return false;
            } else {
                return cmi_session.onmute(cmi_ua, _this);
            }

        }
    }

    onhold(_this) {

        if (!_.isEmpty(cmi_ua)) {

            if (!cmi_ua.isRegistered()) {

                return false;
            } else {
                return cmi_session.onhold(cmi_ua, _this);
            }

        }
    }


    speaker(on, _this) {
        return cmi_session.speaker(on, cmi_ua, _this);
    }


    onspeaker(_this) {
        return cmi_session.onspeaker(cmi_ua, _this);
    }


    getCallId(_this) {
        if (!_.isEmpty(cmi_ua)) {
            if (!cmi_ua.isRegistered()) {
                return false;
            } else {
                return cmi_session.getCallId(cmi_ua, _this);
            }
        }
        return false;
    }

    getCallID(_this) {
        if (!_.isEmpty(cmi_ua)) {
            if (!cmi_ua.isRegistered()) {
                return false;
            } else {
                return cmi_session.getCallID(cmi_ua, _this);
            }
        }
        return false;
    }




}
