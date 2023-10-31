"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _stats = _interopRequireDefault(require("./stats"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var RTCStat = new _stats["default"]();
var cmi_session = {};
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  _createClass(_default, [{
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
  return _default;
}();