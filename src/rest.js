
// Base URL for login (/user/login) and push tokens (/push/register, /push/unregister).
// The value already includes the /v2 prefix.
//
// PRODUCTION is the default. Point it elsewhere at runtime with the SDK's
// `apiBase` option (e.g. new PIOPIY({ apiBase: 'https://stagerest.telecmi.com/v2' }))
// rather than editing this file — that way a staging URL can never be released.
const DEFAULT_API_BASE = 'https://rest.telecmi.com/v2';
let PUSH_API_BASE = DEFAULT_API_BASE;

export default class {

    /** Override the API base URL (testing/staging). Falls back to production. */
    setApiBase( base ) {
        PUSH_API_BASE = ( typeof base === 'string' && base.trim() ) ? base.trim().replace( /\/+$/, '' ) : DEFAULT_API_BASE;
        return PUSH_API_BASE;
    }

    getToken(user_id, password, callback) {

        var url = PUSH_API_BASE + '/user/login';
        this._log('POST ' + url + ' (auth token for push registration)');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.timeout = 5000; // Set timeout to 5 seconds

        const self = this;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) { // Check if request is complete
                self._log('HTTP ' + xhr.status + ' ← /user/login body=' + String(xhr.responseText || '').slice(0, 200));
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

    _log(line) {
        try {
            const g = (typeof globalThis !== 'undefined') ? globalThis : null;
            if (g && typeof g.__piopiyLog === 'function') g.__piopiyLog('[rest] ' + line);
        } catch { /* ignore */ }
    }

    _pushCall(path, authToken, body, callback) {
        this._log('POST ' + PUSH_API_BASE + path + ' auth=' + (authToken ? 'yes' : 'NO') +
            ' body=' + JSON.stringify({ ...body, token: body && body.token ? String(body.token).slice(0, 10) + '…' : undefined }));

        var url = PUSH_API_BASE + path;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        if (authToken) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
        }
        xhr.timeout = 5000;

        const self = this;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                self._log('HTTP ' + xhr.status + ' ← ' + path + ' body=' + String(xhr.responseText || '').slice(0, 300));
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
            self._log('NETWORK ERROR ← ' + path + ' (is the host reachable from the device?)');
            callback({ code: 500 });
        };

        xhr.ontimeout = function () {
            self._log('TIMEOUT ← ' + path);
            callback({ code: 408 });
        };

        xhr.send(JSON.stringify(body));
    }

}
