"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var userAgent = new _userAgent["default"]();
var cmiAudio = new _audio["default"]();
var RestCMI = new _rest["default"]();
var _default = exports["default"] = /*#__PURE__*/function (_EventEmitter) {
  _inherits(_default, _EventEmitter);
  var _super = _createSuper(_default);
  function _default(options) {
    var _this2;
    _classCallCheck(this, _default);
    _this2 = _super.call(this);
    _this2.piopiyOption = {};
    _this2.ua = {};
    var option = options || {};
    _events.EventEmitter.bind(_assertThisInitialized(_this2));
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
  _createClass(_default, [{
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
    value: function call(to) {
      var _this = this;
      if (!_lodash["default"].isString(to)) {
        _this.emit('error', {
          code: 1002,
          status: 'Invalid type to call'
        });
        return;
      }
      userAgent.make(to, _this);
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
  return _default;
}(_events.EventEmitter);