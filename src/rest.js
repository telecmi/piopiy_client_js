
// Base URL for login (/user/login) and push tokens (/push/register, /push/unregister).
// The value already includes the /v2 prefix.
const PUSH_API_BASE = 'https://stagerest.telecmi.com/v2';

export default class {

    getToken(user_id, password, callback) {

        var url = PUSH_API_BASE + '/user/login';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.timeout = 5000; // Set timeout to 5 seconds

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) { // Check if request is complete
                if (xhr.status === 200) {
                    try {
                        var response = JSON.parse(xhr.responseText);
                        if (response.code === 200) {

                            callback({ code: 200, token: response.token });
                        } else {
                            callback({ code: 407 });
                        }
                    } catch {
                        // Ignore error
                        callback({ code: 407 });
                    }
                } else {
                    callback({ code: 407 });
                }
            }
        };

        xhr.onerror = function () {
            callback({ code: 407 });
        };

        xhr.ontimeout = function () {
            callback({ code: 407 });
        };

        var data = {
            id: user_id,
            password: password
        };

        xhr.send(JSON.stringify(data));

    }


    // Register the device push token with the backend (POST PUSH_API_BASE/push/register).
    registerPush(authToken, body, callback) {
        this._pushCall('/push/register', authToken, body, callback);
    }

    // Remove the device push token from the backend (POST PUSH_API_BASE/push/unregister).
    unregisterPush(authToken, body, callback) {
        this._pushCall('/push/unregister', authToken, body, callback);
    }

    _pushCall(path, authToken, body, callback) {

        var url = PUSH_API_BASE + path;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        if (authToken) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
        }
        xhr.timeout = 5000;

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        callback(JSON.parse(xhr.responseText));
                    } catch {
                        callback({ code: 500 });
                    }
                } else {
                    callback({ code: xhr.status || 500 });
                }
            }
        };

        xhr.onerror = function () {
            callback({ code: 500 });
        };

        xhr.ontimeout = function () {
            callback({ code: 408 });
        };

        xhr.send(JSON.stringify(body));
    }

}
