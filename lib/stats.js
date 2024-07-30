"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  return _createClass(_default, [{
    key: "getStats",
    value: function getStats(RTCPeer, _this) {
      var lastPacketsLost = 0;
      var lastPacketsSent = 0;
      var lastTimestamp = Date.now();
      var lastStats = null;
      var cmi_stats = {};
      _this.cmi_webrtc_stats = setInterval(function () {
        if (RTCPeer) {
          if (RTCPeer.connectionState) {
            if (RTCPeer.connectionState != 'connected') {
              clearInterval(_this.cmi_webrtc_stats);
            }
            RTCPeer.getStats().then(function (report) {
              report.forEach(function (stats) {
                if (stats.type === 'candidate-pair' && stats.nominated) {
                  var currentRoundTripTime = stats.currentRoundTripTime;

                  // Calculate delay and packet loss
                  var delay = currentRoundTripTime;
                  cmi_stats['delay'] = delay;
                }
                if (stats.type === 'inbound-rtp') {
                  var _packetsLost = stats.packetsLost;
                  var now = Date.now();
                  var timeElapsed = (now - lastTimestamp) / 1000; // time in seconds

                  var lostRate = (_packetsLost - lastPacketsLost) / timeElapsed;
                  cmi_stats['packetLostRate'] = lostRate;
                  lastPacketsLost = _packetsLost;
                  lastTimestamp = now;
                }
                if (stats.type === 'remote-inbound-rtp') {
                  var packetsLost = stats.packetsLost;
                  var fractionLost = stats.fractionLost;
                  var jitter = stats.jitter;
                  var rountTrip = stats.totalRoundTripTime;
                  cmi_stats['totalPacketLost'] = packetsLost;
                  cmi_stats['fractionLost'] = fractionLost;
                  cmi_stats['jitter'] = jitter;
                  cmi_stats['rountTrip'] = rountTrip;
                }
                if (stats.type === 'codec') {
                  var codec = stats.mimeType;
                  cmi_stats['codec'] = codec;
                }
                if (stats.type === 'local-candidate') {
                  var networktype = stats.networkType;
                  cmi_stats['network'] = networktype;
                }
              });
              _this.emit('RTCStats', cmi_stats);
            })["catch"](function (error) {});
          } else {
            clearInterval(_this.cmi_webrtc_stats);
          }
        } else {
          clearInterval(_this.cmi_webrtc_stats);
        }
      }, 1000);
    }
  }]);
}();