"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
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
    key: "getToken",
    value: function getToken(user_id, password, callback) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://rest.telecmi.com/v2/user/login', true);
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.timeout = 5000; // Set timeout to 5 seconds

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          // Check if request is complete
          if (xhr.status === 200) {
            var response = JSON.parse(xhr.responseText);
            if (response.code === 200) {
              callback({
                code: 200,
                token: response.token
              });
            } else {
              callback({
                code: 407
              });
            }
          } else {
            callback({
              code: 407
            });
          }
        }
      };
      xhr.onerror = function () {
        callback({
          code: 407
        });
      };
      xhr.ontimeout = function () {
        callback({
          code: 407
        });
      };
      var data = {
        id: user_id,
        password: password
      };
      xhr.send(JSON.stringify(data));
    }
  }]);
}();