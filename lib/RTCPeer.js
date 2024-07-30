"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _stats = _interopRequireDefault(require("./stats"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var RTCStat = new _stats["default"]();
var cmi_session = {};
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  return _createClass(_default, [{
    key: "connections",
    value: function connections(session, RTCPeer, _this) {
      RTCPeer.oniceconnectionstatechange = function (event) {
        if (RTCPeer.iceConnectionState == 'disconnected') {
          if (_this.cmi_webrtc_stats) {
            clearInterval(_this.cmi_webrtc_stats);
          }
          session.renegotiate({
            rtcOfferConstraints: {
              iceRestart: true,
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            }
          });
          _this.emit('RTC', {
            state: 'disconnected',
            msg: 'CMI_NET'
          });
        } else if (RTCPeer.iceConnectionState == 'connected') {
          RTCStat.getStats(RTCPeer, _this);
          _this.emit('RTC', {
            state: 'connected',
            msg: 'CMI_NET'
          });
        }
      };
    }
  }]);
}();