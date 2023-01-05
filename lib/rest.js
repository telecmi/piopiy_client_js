'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _class = function () {
    function _class() {
        _classCallCheck(this, _class);
    }

    _createClass(_class, [{
        key: 'getToken',
        value: function getToken(user_id, password, callback) {

            (0, _axios2.default)({ url: 'https://piopiy.telecmi.com/v1/agentLogin', method: 'post', data: { id: user_id, password: password }, timeout: 5000 }).then(async function (res) {

                if (res.data.code === 200) {
                    callback({ code: 200, token: res.data.token });
                } else {
                    callback({ code: 407 });
                }
            }).catch(function (error) {
                callback({ code: 407 });
            });
        }
    }]);

    return _class;
}();

exports.default = _class;