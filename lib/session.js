'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var cmi_session = {};

var _class = function () {
    function _class() {
        _classCallCheck(this, _class);
    }

    _createClass(_class, [{
        key: 'make',
        value: function make(to, ua, _this) {

            if (!_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'already in call' });
                return;
            }

            cmi_session = ua.call(to, {
                mediaConstraints: { 'audio': true, 'video': false },
                pcConfig: {
                    'iceServers': _this.ice_servers
                }
            });
        }
    }, {
        key: 'invite',
        value: function invite(session, _this) {

            cmi_session = session.session;
            if (session.originator != "local") {

                _this.emit('inComingCall', { from: session.request.from._display_name || 'unknown' });
            }

            if (session.request) {
                cmi_session['call_id'] = session.request.call_id;
            }

            this.initSession(cmi_session, _this);
        }
    }, {
        key: 'answer',
        value: function answer(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'call already  answered' });
                return;
            }

            cmi_session.answer({
                mediaConstraints: { 'audio': true, 'video': false }, pcConfig: {
                    'iceServers': _this.ice_servers
                }
            });
        }
    }, {
        key: 'reject',
        value: function reject(ua, _this) {
            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (cmi_session.isEnded()) {
                _this.emit('error', { code: 1002, status: 'call already ended' });
                return;
            }

            cmi_session.terminate();
        }
    }, {
        key: 'terminate',
        value: function terminate(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (cmi_session.isEnded()) {
                _this.emit('error', { code: 1002, status: 'call already ended' });
                return;
            }

            cmi_session.terminate();
        }
    }, {
        key: 'hangup',
        value: function hangup(ua, _this) {
            if (_lodash2.default.isEmpty(ua.sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            cmi_session.bye();
        }
    }, {
        key: 'dtmf',
        value: function dtmf(no, ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (!cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'dtmf not allowed' });
                return;
            }
            var options = {

                'transportType': 'RFC2833'
            };

            cmi_session.sendDTMF(no, options);
        }
    }, {
        key: 'hold',
        value: function hold(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (!cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'hold not allowed' });
                return;
            }

            if (cmi_session.isOnHold().local) {
                _this.emit('error', { code: 1002, status: 'call already in hold' });
                return;
            }

            cmi_session.hold();
        }
    }, {
        key: 'unhold',
        value: function unhold(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (!cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'hold not allowed' });
                return;
            }

            if (!cmi_session.isOnHold().local) {
                _this.emit('error', { code: 1002, status: 'call not in hold' });
                return;
            }

            cmi_session.unhold();
        }
    }, {
        key: 'mute',
        value: function mute(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (!cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'mute not allowed' });
                return;
            }

            if (cmi_session.isMuted().audio) {
                _this.emit('error', { code: 1002, status: 'call already in mute' });
                return;
            }

            cmi_session.mute();
        }
    }, {
        key: 'unmute',
        value: function unmute(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                _this.emit('error', { code: 1002, status: 'call not found' });
                return;
            }

            if (!cmi_session.isEstablished()) {
                _this.emit('error', { code: 1002, status: 'mute not allowed' });
                return;
            }

            if (!cmi_session.isMuted().audio) {
                _this.emit('error', { code: 1002, status: 'call not in mute' });
                return;
            }

            cmi_session.unmute();
        }
    }, {
        key: 'onmute',
        value: function onmute(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                return false;
            }

            if (!cmi_session.isEstablished()) {

                return false;
            }

            return cmi_session.isMuted().audio;
        }
    }, {
        key: 'onhold',
        value: function onhold(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                return false;
            }

            if (!cmi_session.isEstablished()) {

                return false;
            }

            return cmi_session.isOnHold().local;
        }
    }, {
        key: 'getCallId',
        value: function getCallId(ua, _this) {

            if (_lodash2.default.isEmpty(ua._sessions)) {

                return false;
            }

            if (!cmi_session.isEstablished()) {

                return false;
            }

            return cmi_session['call_id'] || false;
        }
    }, {
        key: 'initSession',
        value: function initSession(cmisession, _this) {

            cmisession.on('failed', function (e) {

                if (e.originator == "local") {

                    _this.emit('hangup', { code: 200, status: 'call hangup', call_id: _this.call_id });
                } else {
                    _this.emit('ended', { code: 200, status: e.cause || 'call ended', call_id: _this.call_id });
                }
            });

            if (cmisession._connection) {
                cmisession._connection.onaddstream = function (e) {

                    if (_this.piopiyOption.autoplay) {
                        if (e.stream) {

                            var remoteAudio = document.getElementById('telecmi_audio_tag');
                            remoteAudio.srcObject = e.stream;
                            remoteAudio.play();
                        }
                    }

                    _this.emit('callStream', { code: 200, status: e.stream, call_id: _this.call_id });
                };
            }

            cmisession.on('sending', function (e) {

                var type = e.originator == 'local' ? 'incoming' : 'outgoing';
                _this.emit('trying', { code: 100, status: 'trying', type: type, call_id: _this.call_id });
            });

            cmisession.on('peerconnection', function (e) {

                e.peerconnection.onaddstream = function (e) {

                    if (_this.piopiyOption.autoplay) {
                        if (e.stream) {

                            var remoteAudio = document.getElementById('telecmi_audio_tag');
                            remoteAudio.srcObject = e.stream;
                            remoteAudio.play();
                        }
                    }

                    _this.emit('callStream', { code: 200, status: e.stream });
                };
            });

            cmisession.on('progress', function (e) {

                var type = e.originator == 'local' ? 'incoming' : 'outgoing';
                _this.emit('ringing', { code: 183, status: 'ringing', type: type, call_id: _this.call_id });
            });

            cmisession.on('accepted', function (e) {

                if (e.originator == "local") {
                    return;
                }

                var type = e.originator == 'local' ? 'incoming' : 'outgoing';
                _this.emit('answered', { code: 200, status: 'answered', call_id: _this.call_id });
            });

            cmisession.on('confirmed', function (e) {

                if (e.originator == "local") {
                    return;
                }

                if (cmisession._request) {

                    _this.call_id = cmisession._request.call_id;
                }

                var type = e.originator == 'local' ? 'incoming' : 'outgoing';
                _this.emit('answered', { code: 200, status: 'answered', call_id: _this.call_id });
            });

            cmisession.on('getusermediafailed', function (e) {

                _this.emit('mediaFailed', { code: 200, status: e || 'user media failed', call_id: _this.call_id });
            });

            cmisession.on("icecandidate", function (event) {

                if (event.candidate.type === "srflx" && event.candidate.relatedAddress !== null && event.candidate.relatedPort !== null) {
                    event.ready();
                }
            });

            cmisession.on('newDTMF', function (e) {

                var type = e.originator == 'local' ? 'incoming' : 'outgoing';
                _this.emit('dtmf', { code: 200, dtmf: e.dtmf._tone, type: type, call_id: _this.call_id });
            });

            cmisession.on('hold', function (e) {

                var type = e.originator == 'local' ? 'myself' : 'other';
                _this.emit('hold', { code: 200, status: 'call on hold', whom: type, call_id: _this.call_id });
            });

            cmisession.on('unhold', function (e) {

                var type = e.originator == 'local' ? 'myself' : 'other';
                _this.emit('unhold', { code: 200, status: 'call on active', whom: type, call_id: _this.call_id });
            });

            cmisession.on('ended', function (e) {

                if (e.originator == 'local') {
                    _this.emit('hangup', { code: 200, status: 'call hangup', call_id: _this.call_id });
                } else {
                    _this.emit('ended', { code: 200, status: 'call ended', call_id: _this.call_id });
                }
            });
        }
    }]);

    return _class;
}();

exports.default = _class;