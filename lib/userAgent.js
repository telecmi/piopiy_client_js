"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _session = _interopRequireDefault(require("./session"));
var _offline = _interopRequireDefault(require("./offline"));
var _jssip = _interopRequireDefault(require("jssip"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var cmi_ua = {};
var isConnected = false;
var cmi_session = new _session["default"]();
var cmi_offline = new _offline["default"]();
var socket = new _jssip["default"].WebSocketInterface('wss://sbcsg.telecmi.com');
if (typeof window !== 'undefined') {
  window.onbeforeunload = function () {
    cmi_offline.start(cmi_ua);
  };
}
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  _createClass(_default, [{
    key: "start",
    value: function start(credentials, _this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1001,
            status: 'Please logout before you login'
          });
          return;
        }
        if (cmi_ua.isConnected()) {
          cmi_ua.stop();
        }
      }
      if (credentials.debug === true) {
        _jssip["default"].debug.enable('JsSIP:*');
      } else {
        _jssip["default"].debug.disable('PIOPIY:*');
      }
      if (credentials['region']) {
        socket = new _jssip["default"].WebSocketInterface('wss://' + credentials['region']);
      }
      credentials['sockets'] = [socket];
      credentials['user_agent'] = 'PIOPIYJS';
      credentials['use_preloaded_route'] = true;
      cmi_ua = new _jssip["default"].UA(credentials);

      // _this.cmi_jssip_option = setInterval( () => {
      //     var eventHandlers = {
      //         'succeeded': function ( data ) {

      //         },
      //         'failed': function ( data ) { /* Your code here */

      //             cmi_ua.start();
      //         }
      //     };

      //     var options = {
      //         'eventHandlers': eventHandlers
      //     };

      //     cmi_ua.sendOptions( 'sip:' + credentials.uri, null, options );
      // }, 10000 )

      cmi_ua.on('registered', function (e) {
        _this.emit('login', {
          code: 200,
          status: 'login successfully'
        });
      });
      cmi_ua.on('unregistered', function (e) {
        _this.emit('logout', {
          code: 200,
          status: 'logout successfully'
        });
      });
      cmi_ua.on('connected', function (e) {
        _this.emit('connected', {
          code: 200,
          status: 'SBC connected'
        });
      });
      cmi_ua.on('disconnected', function (e) {
        _this.emit('disconnected', {
          code: 1000,
          status: 'SBC disconneced'
        });
      });
      cmi_ua.on('registrationFailed', function (e) {
        if (e.response) {
          if (e.response.status_code === 401) {
            _this.emit('loginFailed', {
              code: 401,
              status: 'invalid user'
            });
          }
          if (e.response.status_code === 503) {
            _this.emit('loginFailed', {
              code: 405,
              status: 'too many connection'
            });
          }
          if (e.response.status_code === 407) {
            _this.emit('loginFailed', {
              code: 407,
              status: 'invalid IP'
            });
          }
        }
      });
      _this.on('net_changed', function (data) {
        if (cmi_ua) {
          if (cmi_ua.isRegistered() & cmi_ua.isConnected()) {
            cmi_ua.transport.disconnect();
            //cmi_ua.transport._reconnect()
            cmi_ua.transport.connect();
            cmi_ua.start();
          }
        }
      });
      cmi_ua.on('newRTCSession', function (session) {
        if (session.originator != "local") {
          if (!_lodash["default"].isEmpty(cmi_ua._sessions)) {
            if (Object.keys(cmi_ua._sessions).length > 1) {
              session.session.terminate();
              return;
            }
          }
        }
        if (session.request) {
          _this.call_id = session.request.call_id;
        }
        cmi_session.invite(session, _this);
      });
      if (!isConnected) {
        cmi_ua.start();
      } else {
        cmi_ua.register();
      }
    }
  }, {
    key: "re_register",
    value: function re_register() {
      if (!cmi_ua.isRegistered()) {
        cmi_ua.register();
      }
    }
  }, {
    key: "stop",
    value: function stop(_this) {
      if (cmi_ua) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login'
          });
          return;
        }
        if (cmi_ua.isRegistered()) {
          cmi_ua.unregister();
          cmi_ua.stop();
        }
      }
    }
  }, {
    key: "make",
    value: function make(to, _this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login to call'
          });
          return;
        }
      }
      cmi_session.make(to, cmi_ua, _this);
    }
  }, {
    key: "terminate",
    value: function terminate(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.terminate(cmi_ua, _this);
    }
  }, {
    key: "hangup",
    value: function hangup(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.hangup(cmi_ua, _this);
    }
  }, {
    key: "answer",
    value: function answer(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.answer(cmi_ua, _this);
    }
  }, {
    key: "reject",
    value: function reject(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.reject(cmi_ua, _this);
    }
  }, {
    key: "dtmf",
    value: function dtmf(no, _this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      if (_lodash["default"].isEmpty(no) && !_lodash["default"].isNumber(no)) {
        _this.emit('error', {
          code: 1005,
          status: 'invalid dtmf type '
        });
        return;
      }
      cmi_session.dtmf(no, cmi_ua, _this);
    }
  }, {
    key: "hold",
    value: function hold(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.hold(cmi_ua, _this);
    }
  }, {
    key: "unhold",
    value: function unhold(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.unhold(cmi_ua, _this);
    }
  }, {
    key: "mute",
    value: function mute(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.mute(cmi_ua, _this);
    }
  }, {
    key: "unmute",
    value: function unmute(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          _this.emit('error', {
            code: 1002,
            status: 'Please login '
          });
          return;
        }
      }
      cmi_session.unmute(cmi_ua, _this);
    }
  }, {
    key: "islogedin",
    value: function islogedin(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (cmi_ua.isRegistered()) {
          return true;
        }
      }
      return false;
    }
  }, {
    key: "isConnected",
    value: function isConnected(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (cmi_ua.isConnected()) {
          return true;
        }
      }
      return false;
    }
  }, {
    key: "onmute",
    value: function onmute(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          return false;
        } else {
          return cmi_session.onmute(cmi_ua, _this);
        }
      }
    }
  }, {
    key: "onhold",
    value: function onhold(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          return false;
        } else {
          return cmi_session.onhold(cmi_ua, _this);
        }
      }
    }
  }, {
    key: "getCallId",
    value: function getCallId(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          return false;
        } else {
          return cmi_session.getCallId(cmi_ua, _this);
        }
      }
    }
  }, {
    key: "getCallID",
    value: function getCallID(_this) {
      if (!_lodash["default"].isEmpty(cmi_ua)) {
        if (!cmi_ua.isRegistered()) {
          return false;
        } else {
          return cmi_session.getCallID(cmi_ua, _this);
        }
      }
    }
  }]);
  return _default;
}();