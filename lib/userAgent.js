'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _session = require('./session');

var _session2 = _interopRequireDefault(_session);

var _offline = require('./offline');

var _offline2 = _interopRequireDefault(_offline);

var _jssip = require('jssip');

var _jssip2 = _interopRequireDefault(_jssip);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var cmi_ua = {};
var isConnected = false;
var cmi_session = new _session2.default();
var cmi_offline = new _offline2.default();
var socket = new _jssip2.default.WebSocketInterface('wss://sbcsg.telecmi.com');

window.onbeforeunload = function () {
    cmi_offline.start(cmi_ua);
};

var _class = function () {
    function _class() {
        _classCallCheck(this, _class);
    }

    _createClass(_class, [{
        key: 'start',
        value: function start(credentials, _this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1001, status: 'Please logout before you login' });
                    return;
                }

                if (cmi_ua.isConnected()) {
                    cmi_ua.stop();
                }
            }

            if (credentials.debug === true) {
                _jssip2.default.debug.enable('JsSIP:*');
            } else {

                _jssip2.default.debug.disable('PIOPIY:*');
            }

            if (credentials['region']) {

                socket = new _jssip2.default.WebSocketInterface('wss://' + credentials['region']);
            }
            credentials['sockets'] = [socket];
            credentials['user_agent'] = 'PIOPIYJS';
            credentials['use_preloaded_route'] = true;

            cmi_ua = new _jssip2.default.UA(credentials);

            cmi_ua.on('registered', function (e) {
                _this.emit('login', { code: 200, status: 'login successfully' });
            });

            cmi_ua.on('unregistered', function (e) {

                _this.emit('logout', { code: 200, status: 'logout successfully' });
            });

            cmi_ua.on('connected', function (e) {
                _this.emit('connected', { code: 200, status: 'SBC connected' });
            });

            cmi_ua.on('disconnected', function (e) {
                _this.emit('disconnected', { code: 200, status: 'SBC disconneced' });
            });

            cmi_ua.on('registrationFailed', function (e) {

                if (e.response) {

                    if (e.response.status_code === 401) {
                        _this.emit('loginFailed', { code: 401, status: 'invalid user' });
                    }
                }
            });

            cmi_ua.on('newRTCSession', function (session) {

                if (session.originator != "local") {
                    if (!_lodash2.default.isEmpty(cmi_ua._sessions)) {
                        if (Object.keys(cmi_ua._sessions).length > 1) {
                            session.session.terminate();
                            return;
                        }
                    }
                }

                if (session.request) {
                    _this.call_id = session.request.call_id;
                }

                cmi_session.invite(session, _this);
            });

            if (!isConnected) {
                cmi_ua.start();
            } else {

                cmi_ua.register();
            }
        }
    }, {
        key: 're_register',
        value: function re_register() {

            if (!cmi_ua.isRegistered()) {
                cmi_ua.register();
            }
        }
    }, {
        key: 'stop',
        value: function stop(_this) {

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
    }, {
        key: 'make',
        value: function make(to, _this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login to call' });
                    return;
                }
            }

            cmi_session.make(to, cmi_ua, _this);
        }
    }, {
        key: 'terminate',
        value: function terminate(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.terminate(cmi_ua, _this);
        }
    }, {
        key: 'hangup',
        value: function hangup(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.hangup(cmi_ua, _this);
        }
    }, {
        key: 'answer',
        value: function answer(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.answer(cmi_ua, _this);
        }
    }, {
        key: 'reject',
        value: function reject(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.reject(cmi_ua, _this);
        }
    }, {
        key: 'dtmf',
        value: function dtmf(no, _this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            if (_lodash2.default.isEmpty(no) && !_lodash2.default.isNumber(no)) {
                _this.emit('error', { code: 1005, status: 'invalid dtmf type ' });
                return;
            }

            cmi_session.dtmf(no, cmi_ua, _this);
        }
    }, {
        key: 'hold',
        value: function hold(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.hold(cmi_ua, _this);
        }
    }, {
        key: 'unhold',
        value: function unhold(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.unhold(cmi_ua, _this);
        }
    }, {
        key: 'mute',
        value: function mute(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.mute(cmi_ua, _this);
        }
    }, {
        key: 'unmute',
        value: function unmute(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {
                    _this.emit('error', { code: 1002, status: 'Please login ' });
                    return;
                }
            }

            cmi_session.unmute(cmi_ua, _this);
        }
    }, {
        key: 'islogedin',
        value: function islogedin(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (cmi_ua.isRegistered()) {

                    return true;
                }
            }

            return false;
        }
    }, {
        key: 'isConnected',
        value: function isConnected(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (cmi_ua.isConnected()) {

                    return true;
                }
            }

            return false;
        }
    }, {
        key: 'onmute',
        value: function onmute(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {

                    return false;
                } else {
                    return cmi_session.onmute(cmi_ua, _this);
                }
            }
        }
    }, {
        key: 'onhold',
        value: function onhold(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {

                    return false;
                } else {
                    return cmi_session.onhold(cmi_ua, _this);
                }
            }
        }
    }, {
        key: 'getCallId',
        value: function getCallId(_this) {

            if (!_lodash2.default.isEmpty(cmi_ua)) {

                if (!cmi_ua.isRegistered()) {

                    return false;
                } else {
                    return cmi_session.getCallId(cmi_ua, _this);
                }
            }
        }
    }]);

    return _class;
}();

exports.default = _class;