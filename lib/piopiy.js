'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _events = require('events');

var _userAgent = require('./userAgent');

var _userAgent2 = _interopRequireDefault(_userAgent);

var _audio = require('./audio');

var _audio2 = _interopRequireDefault(_audio);

var _rest = require('./rest');

var _rest2 = _interopRequireDefault(_rest);

var _socket = require('./socket');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var userAgent = new _userAgent2.default();
var cmiAudio = new _audio2.default();
var RestCMI = new _rest2.default();

var _class = function (_EventEmitter) {
    _inherits(_class, _EventEmitter);

    function _class(options) {
        _classCallCheck(this, _class);

        var _this2 = _possibleConstructorReturn(this, (_class.__proto__ || Object.getPrototypeOf(_class)).call(this));

        _this2.piopiyOption = {};
        _this2.ua = {};
        var option = options || {};
        _events.EventEmitter.bind(_this2);
        _this2.name = 'PIOPIYJS';
        _this2.version = '0.0.5';
        _this2.ice_servers = [{ 'urls': 'stun:stunind.telecmi.com' }];
        _this2.piopiyOption.debug = _lodash2.default.isBoolean(option.debug) ? option.debug : false;
        _this2.piopiyOption.autoplay = _lodash2.default.isBoolean(option.autoplay) ? option.autoplay : true;
        _this2.piopiyOption.autoReboot = _lodash2.default.isBoolean(option.autoReboot) ? option.autoReboot : true;
        _this2.piopiyOption.ringTime = _lodash2.default.isNumber(option.ringTime) ? option.ringTime : 60;
        _this2.piopiyOption.displayName = _lodash2.default.isString(option.name) ? option.name : null;

        if (_this2.piopiyOption.autoplay) {

            cmiAudio.audioTag();
        }

        return _this2;
    }

    _createClass(_class, [{
        key: 'login',
        value: function login(user_id, password, region) {

            var _this = this;
            var sbc_region = region || 'sbcsg.telecmi.com';
            if (_lodash2.default.isString(user_id) && _lodash2.default.isString(password)) {

                var credentials = {
                    uri: user_id + '@' + region,
                    authorization_user: user_id,
                    password: password,
                    debug: this.piopiyOption.debug,
                    display_name: this.piopiyOption.displayName,
                    no_answer_timeout: this.piopiyOption.ringTime,
                    register: true,
                    region: sbc_region,
                    session_timers: false
                };

                userAgent.start(credentials, _this);

                RestCMI.getToken(user_id, password, function (data) {
                    if (data.code == 200) {

                        _this.socketCMI = new _socket.SocketCMI(data.token, _this);
                    }
                });
            } else {
                throw new Error("invalid user_id or password");
            }
        }
    }, {
        key: 'logout',
        value: function logout() {
            var _this = this;
            userAgent.stop(_this);
        }
    }, {
        key: 'call',
        value: function call(to) {
            var _this = this;
            if (!_lodash2.default.isString(to)) {
                _this.emit('error', { code: 1002, status: 'Invalid type to call' });
                return;
            }

            userAgent.make(to, _this);
        }
    }, {
        key: 'terminate',
        value: function terminate() {
            var _this = this;
            userAgent.terminate(_this);
        }
    }, {
        key: 'reRegister',
        value: function reRegister() {
            userAgent.re_register();
        }
    }, {
        key: 'answer',
        value: function answer() {
            var _this = this;
            userAgent.answer(_this);
        }
    }, {
        key: 'reject',
        value: function reject() {
            var _this = this;
            userAgent.reject(_this);
        }
    }, {
        key: 'sendDtmf',
        value: function sendDtmf(no) {
            var _this = this;
            userAgent.dtmf(no, _this);
        }
    }, {
        key: 'hold',
        value: function hold() {
            var _this = this;
            userAgent.hold(_this);
        }
    }, {
        key: 'unHold',
        value: function unHold() {
            var _this = this;
            userAgent.unhold(_this);
        }
    }, {
        key: 'mute',
        value: function mute() {

            var _this = this;
            userAgent.mute(_this);
        }
    }, {
        key: 'unMute',
        value: function unMute() {

            var _this = this;
            userAgent.unmute(_this);
        }
    }, {
        key: 'isLogedIn',
        value: function isLogedIn() {
            var _this = this;
            return userAgent.islogedin(_this);
        }
    }, {
        key: 'isConnected',
        value: function isConnected() {
            var _this = this;
            return userAgent.isConnected(_this);
        }
    }, {
        key: 'onHold',
        value: function onHold() {
            var _this = this;
            return userAgent.onhold(_this);
        }
    }, {
        key: 'onMute',
        value: function onMute() {
            var _this = this;
            return userAgent.onmute(_this);
        }
    }, {
        key: 'transfer',
        value: function transfer(uuid, to) {
            var _this = this;
            _this.socketCMI.transfer(uuid, to);
        }
    }, {
        key: 'getCallId',
        value: function getCallId() {
            var _this = this;
            return userAgent.getCallId(_this);
        }
    }]);

    return _class;
}(_events.EventEmitter);

exports.default = _class;