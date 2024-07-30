"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _events = require("events");
var _userAgent = _interopRequireDefault(require("./userAgent"));
var _audio = _interopRequireDefault(require("./audio"));
var _rest = _interopRequireDefault(require("./rest"));
var _socket = require("./socket");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _callSuper(t, o, e) { return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e)); }
function _possibleConstructorReturn(t, e) { if (e && ("object" == _typeof(e) || "function" == typeof e)) return e; if (void 0 !== e) throw new TypeError("Derived constructors may only return object or undefined"); return _assertThisInitialized(t); }
function _assertThisInitialized(e) { if (void 0 === e) throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); return e; }
function _isNativeReflectConstruct() { try { var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); } catch (t) {} return (_isNativeReflectConstruct = function _isNativeReflectConstruct() { return !!t; })(); }
function _getPrototypeOf(t) { return _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function (t) { return t.__proto__ || Object.getPrototypeOf(t); }, _getPrototypeOf(t); }
function _inherits(t, e) { if ("function" != typeof e && null !== e) throw new TypeError("Super expression must either be null or a function"); t.prototype = Object.create(e && e.prototype, { constructor: { value: t, writable: !0, configurable: !0 } }), Object.defineProperty(t, "prototype", { writable: !1 }), e && _setPrototypeOf(t, e); }
function _setPrototypeOf(t, e) { return _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function (t, e) { return t.__proto__ = e, t; }, _setPrototypeOf(t, e); }
var userAgent = new _userAgent["default"]();
var cmiAudio = new _audio["default"]();
var RestCMI = new _rest["default"]();
var _default = exports["default"] = /*#__PURE__*/function (_EventEmitter) {
  function _default(options) {
    var _this2;
    _classCallCheck(this, _default);
    _this2 = _callSuper(this, _default);
    _this2.piopiyOption = {};
    _this2.ua = {};
    var option = options || {};
    _events.EventEmitter.bind(_this2);
    _this2.name = 'PIOPIYJS';
    _this2.version = '0.0.5';
    _this2.ice_servers = [{
      'urls': 'stun:stunind.telecmi.com'
    }];
    _this2.piopiyOption.debug = _lodash["default"].isBoolean(option.debug) ? option.debug : false;
    _this2.piopiyOption.autoplay = _lodash["default"].isBoolean(option.autoplay) ? option.autoplay : true;
    _this2.piopiyOption.autoReboot = _lodash["default"].isBoolean(option.autoReboot) ? option.autoReboot : true;
    _this2.piopiyOption.ringTime = _lodash["default"].isNumber(option.ringTime) ? option.ringTime : 60;
    _this2.piopiyOption.displayName = _lodash["default"].isString(option.name) ? option.name : null;
    if (_this2.piopiyOption.autoplay) {
      cmiAudio.audioTag();
    }
    return _this2;
  }
  _inherits(_default, _EventEmitter);
  return _createClass(_default, [{
    key: "login",
    value: function login(user_id, password, region) {
      var _this = this;
      var sbc_region = region || 'sbcsg.telecmi.com';
      if (_lodash["default"].isString(user_id) && _lodash["default"].isString(password)) {
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
    key: "logout",
    value: function logout() {
      var _this = this;
      userAgent.stop(_this);
    }
  }, {
    key: "call",
    value: function call(to, options) {
      var _this = this;
      if (!_lodash["default"].isString(to)) {
        _this.emit('error', {
          code: 1002,
          status: 'Invalid type to call'
        });
        return;
      }
      if (_lodash["default"].isObject(options)) {
        if (!isString(options.extra_param)) {
          _this.emit('error', {
            code: 1002,
            status: 'extra_param must be string'
          });
          return;
        }
      }
      userAgent.make(to, _this, options);
    }
  }, {
    key: "terminate",
    value: function terminate() {
      var _this = this;
      userAgent.terminate(_this);
    }
  }, {
    key: "reRegister",
    value: function reRegister() {
      userAgent.re_register();
    }
  }, {
    key: "answer",
    value: function answer() {
      var _this = this;
      userAgent.answer(_this);
    }
  }, {
    key: "reject",
    value: function reject() {
      var _this = this;
      userAgent.reject(_this);
    }
  }, {
    key: "sendDtmf",
    value: function sendDtmf(no) {
      var _this = this;
      userAgent.dtmf(no, _this);
    }
  }, {
    key: "hold",
    value: function hold() {
      var _this = this;
      userAgent.hold(_this);
    }
  }, {
    key: "unHold",
    value: function unHold() {
      var _this = this;
      userAgent.unhold(_this);
    }
  }, {
    key: "mute",
    value: function mute() {
      var _this = this;
      userAgent.mute(_this);
    }
  }, {
    key: "unMute",
    value: function unMute() {
      var _this = this;
      userAgent.unmute(_this);
    }
  }, {
    key: "isLogedIn",
    value: function isLogedIn() {
      var _this = this;
      return userAgent.islogedin(_this);
    }
  }, {
    key: "isConnected",
    value: function isConnected() {
      var _this = this;
      return userAgent.isConnected(_this);
    }
  }, {
    key: "onHold",
    value: function onHold() {
      var _this = this;
      return userAgent.onhold(_this);
    }
  }, {
    key: "onMute",
    value: function onMute() {
      var _this = this;
      return userAgent.onmute(_this);
    }
  }, {
    key: "transfer",
    value: function transfer(to) {
      var _this = this;
      _this.socketCMI.transfer(userAgent.getCallId(_this), to);
    }
  }, {
    key: "merge",
    value: function merge() {
      var _this = this;
      userAgent.dtmf('0', _this);
    }
  }, {
    key: "cancel",
    value: function cancel() {
      var _this = this;
      userAgent.dtmf('#', _this);
    }
  }, {
    key: "getCallId",
    value: function getCallId() {
      var _this = this;
      return userAgent.getCallId(_this);
    }
  }, {
    key: "getCallID",
    value: function getCallID() {
      var _this = this;
      return userAgent.getCallID(_this);
    }
  }]);
}(_events.EventEmitter);
var isString = function isString(value) {
  return typeof value === 'string';
};