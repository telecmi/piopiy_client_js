"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _default = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  _createClass(_default, [{
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
  return _default;
}();
exports["default"] = _default;