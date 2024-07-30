"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _RTCPeer = _interopRequireDefault(require("./RTCPeer"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var RTCPeer = new _RTCPeer["default"]();
var cmi_session = {};
var cmi_ua = {};
var timeout;
var cmi_timeout;
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  return _createClass(_default, [{
    key: "make",
    value: function make(to, ua, _this, options) {
      if (!_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'already in call'
        });
        return;
      }
      var cmi_media_cons = {
        'audio': true,
        'video': false
      };
      if (localStorage.getItem('deviceId')) {
        cmi_media_cons['audio'] = {
          deviceId: localStorage.getItem('deviceId')
        };
      }
      var eventHandlers = {
        'progress': function progress(e) {},
        'failed': function failed(e) {
          if (timeout) {
            clearTimeout(timeout);
            clearTimeout(cmi_timeout);
          }
          if (e) {
            if (e.message) {
              if (e.message.status_code == 407) {
                _this.emit('loginFailed', {
                  code: 407,
                  status: 'invalid user'
                });
              }
            }
          }
        },
        'ended': function ended(e) {
          if (timeout) {
            clearTimeout(timeout);
            clearTimeout(cmi_timeout);
          }
        },
        'confirmed': function confirmed(e) {
          if (timeout) {
            clearTimeout(timeout);
            clearTimeout(cmi_timeout);
          }
        }
      };
      cmi_ua = ua;
      var call_options = {
        'eventHandlers': eventHandlers,
        mediaConstraints: cmi_media_cons,
        pcConfig: {
          'iceServers': _this.ice_servers
        }
      };
      if (_lodash["default"].isObject(options)) {
        if (isString(options.extra_param)) {
          var extraHeaders = ["X-cmi-extra_param:".concat(options.extra_param)];
          call_options['extraHeaders'] = extraHeaders;
        }
      }
      cmi_session = ua.call(to, call_options);
      cmi_timeout = setTimeout(function () {
        if (cmi_session && cmi_session.status === 1) {
          _this.emit('NETStats', {
            code: 408,
            msg: 'Request timeout'
          });
        }
      }, 5000);
      timeout = setTimeout(function () {
        if (cmi_session && cmi_session.status === 1) {
          cmi_session.terminate();
          ua.stop();
          ua.start();
        }
      }, 10000);
    }
  }, {
    key: "invite",
    value: function invite(session, _this) {
      cmi_session = session.session;
      if (session.originator != "local") {
        _this.emit('inComingCall', {
          from: session.request.from._display_name || 'unknown'
        });
      }
      if (session.request) {
        if (session.originator != "local") {
          var headers = session.request;
          var call_uuid = headers.getHeader('X-cmi-uuid');
          cmi_session['call_ID'] = call_uuid;
        } else {
          cmi_session['call_ID'] = session.request.call_id;
        }
        cmi_session['call_id'] = session.request.call_id;
      }
      this.initSession(cmi_session, _this);
    }
  }, {
    key: "answer",
    value: function answer(ua, _this) {
      cmi_ua = ua;
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'call already  answered'
        });
        return;
      }
      cmi_session.answer({
        mediaConstraints: {
          'audio': true,
          'video': false
        },
        pcConfig: {
          'iceServers': _this.ice_servers
        }
      });
    }
  }, {
    key: "reject",
    value: function reject(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (cmi_session.isEnded()) {
        _this.emit('error', {
          code: 1002,
          status: 'call already ended'
        });
        return;
      }
      cmi_ua = ua;
      cmi_session.terminate();
    }
  }, {
    key: "terminate",
    value: function terminate(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (cmi_session.isEnded()) {
        _this.emit('error', {
          code: 1002,
          status: 'call already ended'
        });
        return;
      }
      cmi_ua = ua;
      cmi_session.terminate();
    }
  }, {
    key: "hangup",
    value: function hangup(ua, _this) {
      if (_lodash["default"].isEmpty(ua.sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      cmi_ua = ua;
      cmi_session.bye();
    }
  }, {
    key: "dtmf",
    value: function dtmf(no, ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (!cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'dtmf not allowed'
        });
        return;
      }
      var options = {
        'transportType': 'RFC2833'
      };
      cmi_session.sendDTMF(no, options);
    }
  }, {
    key: "hold",
    value: function hold(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (!cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'hold not allowed'
        });
        return;
      }
      if (cmi_session.isOnHold().local) {
        _this.emit('error', {
          code: 1002,
          status: 'call already in hold'
        });
        return;
      }
      cmi_session.hold();
    }
  }, {
    key: "unhold",
    value: function unhold(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (!cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'hold not allowed'
        });
        return;
      }
      if (!cmi_session.isOnHold().local) {
        _this.emit('error', {
          code: 1002,
          status: 'call not in hold'
        });
        return;
      }
      cmi_session.unhold();
    }
  }, {
    key: "mute",
    value: function mute(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (!cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'mute not allowed'
        });
        return;
      }
      if (cmi_session.isMuted().audio) {
        _this.emit('error', {
          code: 1002,
          status: 'call already in mute'
        });
        return;
      }
      cmi_session.mute();
    }
  }, {
    key: "unmute",
    value: function unmute(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        _this.emit('error', {
          code: 1002,
          status: 'call not found'
        });
        return;
      }
      if (!cmi_session.isEstablished()) {
        _this.emit('error', {
          code: 1002,
          status: 'mute not allowed'
        });
        return;
      }
      if (!cmi_session.isMuted().audio) {
        _this.emit('error', {
          code: 1002,
          status: 'call not in mute'
        });
        return;
      }
      cmi_session.unmute();
    }
  }, {
    key: "onmute",
    value: function onmute(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        return false;
      }
      if (!cmi_session.isEstablished()) {
        return false;
      }
      return cmi_session.isMuted().audio;
    }
  }, {
    key: "onhold",
    value: function onhold(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        return false;
      }
      if (!cmi_session.isEstablished()) {
        return false;
      }
      return cmi_session.isOnHold().local;
    }
  }, {
    key: "getCallId",
    value: function getCallId(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        return false;
      }
      if (!cmi_session.isEstablished() && !cmi_session.isInProgress()) {
        return false;
      }
      return cmi_session['call_id'] || false;
    }
  }, {
    key: "getCallID",
    value: function getCallID(ua, _this) {
      if (_lodash["default"].isEmpty(ua._sessions)) {
        return false;
      }
      if (!cmi_session.isEstablished() && !cmi_session.isInProgress()) {
        return false;
      }
      return cmi_session['call_ID'] || false;
    }
  }, {
    key: "initSession",
    value: function initSession(cmisession, _this) {
      cmisession.on('failed', function (e) {
        if (e.originator == "local") {
          _this.emit('hangup', {
            code: e.status_code || 200,
            status: 'call hangup'
          });
        } else {
          var _e$message, _e$message2;
          _this.emit('ended', {
            code: (e === null || e === void 0 || (_e$message = e.message) === null || _e$message === void 0 ? void 0 : _e$message.status_code) || 200,
            status: (e === null || e === void 0 || (_e$message2 = e.message) === null || _e$message2 === void 0 ? void 0 : _e$message2.reason_phrase) || 'call ended'
          });
        }
      });
      if (cmisession._connection) {
        cmisession._connection.onaddstream = function (e) {
          if (_this.piopiyOption.autoplay) {
            if (e.stream) {
              var remoteAudio = document.getElementById('telecmi_audio_tag');
              remoteAudio.srcObject = e.stream;
              remoteAudio.play();
            }
          }
          _this.emit('callStream', {
            code: 200,
            status: e.stream
          });
        };
      }
      cmisession.on('sending', function (e) {
        var type = e.originator == 'local' ? 'incoming' : 'outgoing';
        _this.emit('trying', {
          code: 100,
          status: 'trying',
          type: type
        });
      });
      cmisession.on('peerconnection', function (e) {
        e.peerconnection.onaddstream = function (e) {
          if (_this.piopiyOption.autoplay) {
            if (e.stream) {
              var remoteAudio = document.getElementById('telecmi_audio_tag');
              remoteAudio.srcObject = e.stream;
              remoteAudio.play();
            }
          }
          _this.emit('callStream', {
            code: 200,
            status: e.stream
          });
        };
        if (cmisession.connection) {
          try {
            RTCPeer.connections(cmisession, cmisession.connection, _this);
          } catch (e) {
            alert(e);
          }
        }
      });
      cmisession.on('progress', function (e) {
        var type = e.originator == 'local' ? 'incoming' : 'outgoing';
        _this.emit('ringing', {
          code: 183,
          status: 'ringing',
          type: type
        });
        if (cmisession.connection) {
          try {
            RTCPeer.connections(cmisession, cmisession.connection, _this);
          } catch (e) {
            alert(e);
          }
        }
      });
      cmisession.on('accepted', function (e) {
        if (e.originator == "local") {
          return;
        }
        var type = e.originator == 'local' ? 'incoming' : 'outgoing';
        _this.emit('answered', {
          code: 200,
          status: 'answered'
        });
      });
      cmisession.on('confirmed', function (e) {
        if (e.originator == "local") {
          return;
        }
        if (cmisession._request) {
          _this.call_id = cmisession._request.call_id;
        }
        var type = e.originator == 'local' ? 'incoming' : 'outgoing';
        _this.emit('answered', {
          code: 200,
          status: 'answered'
        });
      });
      cmisession.on('getusermediafailed', function (e) {
        _this.emit('mediaFailed', {
          code: 415,
          status: e || 'user media failed'
        });
      });
      cmisession.on("icecandidate", function (event) {
        if (event.candidate.type === "srflx" && event.candidate.relatedAddress !== null && event.candidate.relatedPort !== null) {
          event.ready();
        }
      });
      cmisession.on('newDTMF', function (e) {
        var type = e.originator == 'local' ? 'incoming' : 'outgoing';
        _this.emit('dtmf', {
          code: 200,
          dtmf: e.dtmf._tone,
          type: type
        });
      });
      cmisession.on('hold', function (e) {
        var type = e.originator == 'local' ? 'myself' : 'other';
        _this.emit('hold', {
          code: 200,
          status: 'call on hold',
          whom: type
        });
      });
      cmisession.on('unhold', function (e) {
        var type = e.originator == 'local' ? 'myself' : 'other';
        _this.emit('unhold', {
          code: 200,
          status: 'call on active',
          whom: type
        });
      });
      cmisession.on('ended', function (e) {
        if (_this.cmi_webrtc_stats) {
          clearInterval(_this.cmi_webrtc_stats);
        }
        if (e.originator == 'local') {
          _this.emit('hangup', {
            code: 200,
            status: 'call hangup'
          });
        } else {
          _this.emit('ended', {
            code: 200,
            status: 'call ended'
          });
        }
      });
    }
  }]);
}();
var isString = function isString(value) {
  return typeof value === 'string';
};