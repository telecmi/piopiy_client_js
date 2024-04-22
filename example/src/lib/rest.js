"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _default = exports["default"] = /*#__PURE__*/function () {
  function _default() {
    _classCallCheck(this, _default);
  }
  _createClass(_default, [{
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
  return _default;
}();