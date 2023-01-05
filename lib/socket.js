'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.SocketCMI = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _socket = require('socket.io-client');

var _socket2 = _interopRequireDefault(_socket);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SocketCMI = function () {
    function SocketCMI(token, _this) {
        var _this2 = this;

        _classCallCheck(this, SocketCMI);

        this.socket = (0, _socket2.default)('https://notify.telecmi.com', {
            query: { token: token }
        });

        // this.socket = io( 'http://localhost:8181', {
        //     query: { token: token }
        // } );


        var socket = this.socket;

        this.socket.on('disconnect', function (reson) {
            _this.ready_transfer = false;
        });

        this.socket.on("connect_error", function (err) {
            _this.ready_transfer = false;
        });

        this.socket.on('connect', function () {
            _this.ready_transfer = true;
            _this2.socket.emit('wssip-agent-opt', { join: true });
        });

        this.socket.on('cmi_transfer', function (data) {

            if (data.state == 'init') {
                _this.emit('api-cmi-transfer', data);
            }
            _this.emit('transfer', data);
        });

        this.socket.on('cmi_record', function (data) {

            _this.emit('record', data);
        });
    }

    _createClass(SocketCMI, [{
        key: 'transfer',
        value: function transfer(uuid, to) {

            if (this.socket.connected) {
                this.socket.emit('agent-call-transfer', { uuid: uuid, to: to });
            } else {}
        }
    }, {
        key: 'cancel',
        value: function cancel(uuid) {
            this.socket('agent-cancel-transfer', { uuid: uuid });
        }
    }]);

    return SocketCMI;
}();

exports.SocketCMI = SocketCMI;