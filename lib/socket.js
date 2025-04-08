"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SocketCMI = void 0;
var _socket = _interopRequireDefault(require("socket.io-client"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var SocketCMI = exports.SocketCMI = /*#__PURE__*/function () {
  function SocketCMI(token, _this) {
    var _this2 = this;
    _classCallCheck(this, SocketCMI);
    this.socket = (0, _socket["default"])('https://notify.telecmi.com', {
      query: {
        token: token
      }
    });

    // this.socket = io( 'http://localhost:8181', {
    //     query: { token: token }
    // } );

    this.socket.on('disconnect', function (reson) {
      _this.ready_transfer = false;
      console.log('disconnect', reson);
      if (reson == 'transport close') {
        _this.emit('net_changed', {
          code: 400,
          msg: 'network changed'
        });
      }
    });
    this.socket.on("connect_error", function () {
      _this.ready_transfer = false;
    });
    this.socket.on('connect', function () {
      _this.ready_transfer = true;
      _this2.socket.emit('wssip-agent-opt', {
        join: true
      });
    });
    this.socket.on('cmi_transfer', function (data) {
      if (data.state == 'init') {
        _this.sendDtmf("*9");
      }
      _this.emit('transfer', data);
    });
    this.socket.on('force_logout', function (data) {
      _this.logout();
      _this.emit('sbc_logout', data);
    });
    this.socket.on('cmi_record', function (data) {
      _this.emit('record', data);
    });
  }
  return _createClass(SocketCMI, [{
    key: "transfer",
    value: function transfer(uuid, to) {
      if (this.socket.connected) {
        this.socket.emit('agent-call-transfer', {
          uuid: uuid,
          to: to
        });
      }
    }
  }, {
    key: "cancel",
    value: function cancel(uuid) {
      this.socket('agent-cancel-transfer', {
        uuid: uuid
      });
    }
  }]);
}();