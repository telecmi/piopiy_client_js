"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SocketCMI = void 0;
var _socket = _interopRequireDefault(require("socket.io-client"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var SocketCMI = /*#__PURE__*/function () {
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

    var socket = this.socket;
    this.socket.on('disconnect', function (reson) {
      _this.ready_transfer = false;
      if (reson == 'transport close') {
        _this.emit('net_changed', {
          code: 400,
          msg: 'network changed'
        });
      }
    });
    this.socket.on("connect_error", function (err) {
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
    this.socket.on('cmi_record', function (data) {
      _this.emit('record', data);
    });
  }
  _createClass(SocketCMI, [{
    key: "transfer",
    value: function transfer(uuid, to) {
      if (this.socket.connected) {
        this.socket.emit('agent-call-transfer', {
          uuid: uuid,
          to: to
        });
      } else {}
    }
  }, {
    key: "cancel",
    value: function cancel(uuid) {
      this.socket('agent-cancel-transfer', {
        uuid: uuid
      });
    }
  }]);
  return SocketCMI;
}();
exports.SocketCMI = SocketCMI;