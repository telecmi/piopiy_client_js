import _ from 'lodash';
import { EventEmitter } from 'events';
import ua from './userAgent';
import Audio from './audio';
import rest from './rest';
import { SocketCMI } from './socket';
// Platform-resolved: callkeep.native.js on React Native, callkeep.js (no-op) on web.
import CallKeepBridge from './callkeep';
// Platform-resolved: livekitCall.native.js on React Native, livekitCall.js (no-op) on web.
import LiveKitCall from './livekitCall';
// Platform-resolved: pushToken.native.js on React Native, pushToken.js (no-op) on web.
import PushTokenManager from './pushToken';





let userAgent = new ua();
let cmiAudio = new Audio();
let RestCMI = new rest();

// registerToken/unregisterToken are React Native only — a no-op on web/Node.
const IS_REACT_NATIVE = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// Mirror of the other modules' debug sink (globalThis.__piopiyLog).
function _log(line) {
    try {
        const g = (typeof globalThis !== 'undefined') ? globalThis : null;
        if (g && typeof g.__piopiyLog === 'function') g.__piopiyLog('[sdk] ' + line);
    } catch { /* ignore */ }
}
export default class extends EventEmitter {



    constructor(options) {
        super()
        this.piopiyOption = {};
        this.ua = {};
        this._token = null;       // backend session token (from login), used as the push API bearer
        this._pushToken = null;   // last registered device push token (so unregisterToken knows which)
        this._pendingRegister = null; // registerToken() call queued before the login token arrived
        // True after an explicit logout() in this app session. Invite pushes are
        // REFUSED while set: the push payload alone is enough to join the call
        // (room + JWT), so login state wouldn't gate it otherwise — a signed-out
        // device whose token removal failed server-side would still ring AND be
        // answerable. Cleared by login(); a killed app relaunched by a push
        // starts false, keeping the cold-start call flow intact.
        this._signedOut = false;
        this._region = null;      // SBC host/region from login(), sent with the push registration
        let option = options || {};
        EventEmitter.bind(this);
        this.name = 'PIOPIYJS';
        this.version = '0.18.1';
        this.ice_servers = [
            { 'urls': 'stun:stunind.telecmi.com' }
        ]
        this.piopiyOption.debug = (_.isBoolean(option.debug)) ? option.debug : false;
        // debug:true with no app-provided sink: route the SDK's internal
        // diagnostics to the console so they appear in Metro. Without this,
        // every explanation the SDK logs (e.g. WHY the push token was skipped)
        // is invisible unless the app wires globalThis.__piopiyLog itself.
        if (this.piopiyOption.debug) {
            try {
                const g = (typeof globalThis !== 'undefined') ? globalThis : null;
                if (g && typeof g.__piopiyLog !== 'function') {
                    // eslint-disable-next-line no-console
                    g.__piopiyLog = (line) => console.log('[piopiy]', line);
                }
            } catch { /* ignore */ }
        }
        this.piopiyOption.autoplay = _.isBoolean(option.autoplay) ? option.autoplay : true;
        this.piopiyOption.autoReboot = _.isBoolean(option.autoReboot) ? option.autoReboot : true;
        this.piopiyOption.ringTime = _.isNumber(option.ringTime) ? option.ringTime : 40;
        this.piopiyOption.displayName = _.isString(option.name) ? option.name : null;
        // SIP registration lifetime in seconds. Shorter = a stale contact (from a
        // killed/backgrounded app) clears from the SBC faster, so incoming calls fall
        // through to the push path sooner instead of being relayed to a dead socket.
        // Default 120s (jsSIP's own default is 600s); 60–120 is the mobile sweet spot.
        this.piopiyOption.registerExpires = _.isNumber(option.registerExpires) ? option.registerExpires : 120;
        // Optional CallKeep config (appName, android channel, ...). The built-in
        // bridge auto-activates on React Native when react-native-callkeep is installed.
        this.piopiyOption.callKeep = _.isObject(option.callKeep) ? option.callKeep : {};
        // Optional LiveKit inbound config ({url}). React Native only: inbound calls
        // can arrive as a LiveKit room held server-side (see livekitIncoming()).
        this.piopiyOption.livekit = _.isObject(option.livekit) ? option.livekit : {};
        // Fetch and register the device push token automatically (React Native).
        // On by default — it is what an app needs for background calls. Set false
        // to manage the token yourself with registerToken().
        this.piopiyOption.autoPushToken = _.isBoolean(option.autoPushToken) ? option.autoPushToken : true;
        // Override the TeleCMI API base URL (staging/testing). Defaults to production.
        if (_.isString(option.apiBase) && option.apiBase.trim()) {
            RestCMI.setApiBase(option.apiBase);
        }

        if (this.piopiyOption.autoplay) {

            cmiAudio.audioTag();
        }

        // LiveKit inbound engine (inert on web / when @livekit/react-native isn't installed).
        this._livekit = new LiveKitCall(this, this.piopiyOption.livekit);
        // Native incoming-call UI bridge (no-op on web / when callkeep isn't installed).
        this._callkeep = new CallKeepBridge(this, this.piopiyOption.callKeep);
        // Automatic device push-token registration (no-op on web / when the push
        // libraries aren't installed). Starts watching immediately; the token is
        // queued by registerToken() until login() completes.
        this._pushToken_mgr = new PushTokenManager(this);
        if (this.piopiyOption.autoPushToken) {
            this._pushToken_mgr.start();
        }

    }



    login(user_id, password, region) {
        this._signedOut = false;

        let _this = this;
        let sbc_region = region || 'sbcsg.telecmi.com';
        if (_.isString(user_id) && _.isString(password)) {

            // Remember the SBC/region so the push registration can include it.
            _this._region = sbc_region;

            var credentials = {
                uri: user_id + '@' + sbc_region,
                authorization_user: user_id,
                password: password,
                debug: this.piopiyOption.debug,
                display_name: this.piopiyOption.displayName,
                no_answer_timeout: this.piopiyOption.ringTime,
                register: true,
                register_expires: this.piopiyOption.registerExpires,
                region: sbc_region,
                session_timers: false
            }

            userAgent.start(credentials, _this);





            RestCMI.getToken(user_id, password, (data) => {
                if (data.code == 200) {
                    _this._token = data.token;
                    _this.socketCMI = new SocketCMI(data.token, _this)

                    // Flush a push registration that was queued before the token arrived.
                    if (_this._pendingRegister) {
                        let pending = _this._pendingRegister;
                        _this._pendingRegister = null;
                        _this.registerToken(pending.push, pending.callback);
                    }
                } else {
                    _this.emit('loginFailed', { code: 407, status: 'Token generation failed' });

                    // Auth token unavailable — fail any queued push registration's callback.
                    if (_this._pendingRegister) {
                        let pending = _this._pendingRegister;
                        _this._pendingRegister = null;
                        if (typeof pending.callback === 'function') {
                            pending.callback({ code: 1008, status: 'auth token unavailable' });
                        }
                    }
                }
            })
        } else {
            throw new Error("invalid user_id or password");
        }
    }


    /**
     * Sign out. The device's push token is unregistered from the TeleCMI
     * platform first (POST /push/unregister) so this device stops being woken
     * for incoming calls, then the session is torn down.
     *
     * Order matters: the unregister call needs the auth token obtained at
     * login(), which the teardown clears. It is a no-op when no push token is
     * registered (web, or push not set up).
     *
     * @param {(data: any) => void} [callback] receives the unregister response
     */
    logout(callback) {
        let _this = this;
        _this._signedOut = true;
        const done = (data) => { if (typeof callback === 'function') callback(data); };

        if (IS_REACT_NATIVE && _this._pushToken && _this._token) {
            // The unregister MUST land or the platform keeps pushing calls to a
            // signed-out device — retry once before giving up, and log loudly on
            // final failure (the client-side _signedOut guard still refuses any
            // call that arrives before the row is cleaned up server-side).
            const attempt = (retriesLeft) => {
                try {
                    _this.unregisterToken((data) => {
                        if (data && data.code === 200) return done(data);
                        if (retriesLeft > 0) {
                            _log('push unregister failed (' + JSON.stringify(data) + ') — retrying in 2s');
                            setTimeout(() => attempt(retriesLeft - 1), 2000);
                            return;
                        }
                        _log('push unregister FAILED after retry — token may linger server-side; invite pushes are refused client-side until next sign-in');
                        done(data || { code: 1007, status: 'push token unregister failed' });
                    });
                } catch {
                    done({ code: 1007, status: 'push token unregister failed' });
                }
            };
            attempt(1);
        } else {
            done({ code: 200, status: 'no push token to unregister' });
        }

        userAgent.stop(_this);
    }

    call(to, options) {
        let _this = this;
        if (!_.isString(to)) {
            _this.emit('error', { code: 1002, status: 'Invalid type to call' })
            return;
        }

        if (_.isObject(options)) {
            if (!isString(options.extra_param)) {
                _this.emit('error', { code: 1002, status: 'extra_param must be string' });
                return;
            }
        }


        userAgent.make(to, _this, options);
    }

    terminate() {
        let _this = this;
        // An active (or still-ringing) LiveKit inbound call — leave the room.
        if (_this._livekit && _this._livekit.isCall(null)) {
            _this._livekit.end('terminate');
            return;
        }
        userAgent.terminate(_this);
    }

    /**
     * Hand an inbound-call push to the SDK. Just forward the raw push payload;
     * the SDK shows the incoming-call UI and connects the call on answer. Two
     * shapes arrive from the platform:
     *  - invite  {uuid, ...}                 — rings (emits 'inComingCall')
     *  - cancel  {type: 'cancel_call', uuid} — caller hung up while ringing;
     *    dismisses the incoming-call UI. React Native only.
     * @param {{uuid: string, type?: string, from?: string, [k: string]: any}} info
     * @returns {boolean} true if the push was accepted for handling
     */
    /**
     * Android only: register the handler for call pushes that arrive while the
     * app is backgrounded or killed. Call once from your app's index.js, at
     * module scope (the OS runs that file headlessly to deliver the push):
     *
     *   import { piopiy } from './src/callService';
     *   piopiy.registerBackgroundPushHandler();
     *
     * Safe no-op on iOS (wake-ups arrive via PushKit natively) and on web.
     * Foreground pushes on both platforms are forwarded to the SDK
     * automatically — no app code involved.
     */
    registerBackgroundPushHandler() {
        return this._pushToken_mgr && typeof this._pushToken_mgr.registerHeadlessHandler === 'function'
            ? this._pushToken_mgr.registerHeadlessHandler()
            : false;
    }

    handleIncomingPush(info) {
        // Explicitly signed out: refuse invite pushes (the payload alone could
        // join the call — see _signedOut above). Dismiss the natively-reported
        // ringing screen (iOS reports before JS runs) via callkeepCancel.
        // Cancel pushes still process — dismissing is always safe.
        if (this._signedOut && info && info.uuid && info.type !== 'cancel_call') {
            _log('invite push refused — user is signed out (token still registered server-side?)');
            try { this.emit('callkeepCancel', { uuid: String(info.uuid).toLowerCase(), reason: 'signed out' }); } catch { /* ignore */ }
            return false;
        }
        // The same push can reach us twice — the SDK forwards pushes itself
        // (since 0.23.0) AND apps built on the older docs forward them too.
        // setPending() dedupes invites by uuid; cancels are deduped here, or
        // the second delivery would log a duplicate missed call.
        if (info && info.type === 'cancel_call' && info.uuid) {
            const uuid = String(info.uuid).toLowerCase();
            this._handledCancels = this._handledCancels || [];
            if (this._handledCancels.includes(uuid)) return true;
            this._handledCancels.push(uuid);
            if (this._handledCancels.length > 20) this._handledCancels.shift();
            if (this._livekit && this._livekit.isCall(uuid)) {
                this._livekit.end('caller cancelled');
            } else {
                // No pending call in the engine (e.g. cold start where only the
                // native CallKit report happened) — dismiss the UI directly.
                try { this.emit('callkeepCancel', { uuid, reason: 'caller cancelled' }); } catch { /* ignore */ }
                try { this.emit('missedCall', { uuid, from: info.from || info.caller || null, reason: 'cancelled', transport: 'push' }); } catch { /* ignore */ }
            }
            return true;
        }
        return this._livekit ? this._livekit.setPending(info) : false;
    }

    /** @deprecated Renamed to handleIncomingPush(). Kept as an alias. */
    livekitIncoming(info) {
        return this.handleIncomingPush(info);
    }


    reRegister() {
        userAgent.re_register();
    }

    /**
     * Register the device push token with the backend (POST /push/register).
     * The backend stores it so the SBC can wake this device with a VoIP/FCM push when
     * a call arrives while the app is offline. Call after login(); call again to update
     * a rotated token. If called before the login auth token is ready, it is queued
     * and sent automatically once login completes. React Native only; no-op on web.
     * @param {{provider: string, token: string, platform?: string}} push
     * @param {(data: any) => void} [callback]
     */
    registerToken(push, callback) {
        let _this = this;
        const done = (data) => { if (typeof callback === 'function') callback(data); };

        if (!IS_REACT_NATIVE) {
            return;
        }
        if (!_.isObject(push) || !isString(push.provider) || !isString(push.token)) {
            const err = { code: 1006, status: 'invalid push options: provider and token are required' };
            _this.emit('error', err);
            done(err);
            return;
        }

        // The login auth token is fetched asynchronously; if it isn't ready yet,
        // queue this registration and flush it from the login token callback.
        if (!_this._token) {
            _this._pendingRegister = { push, callback };
            return;
        }

        _this._pushToken = push.token;

        RestCMI.registerPush(
            _this._token,
            { token: push.token, provider: push.provider, platform: push.platform, sbc: _this._region },
            (data) => {
                if (data && data.code === 200) {
                    _this.emit('pushRegistered', data);
                } else {
                    _this.emit('error', { code: 1007, status: 'push token register failed', data });
                }
                done(data);
            }
        );
    }

    /**
     * Remove the device push token from the backend (POST /push/unregister),
     * stopping push wake-ups. Uses the last token passed to registerToken().
     * React Native only; no-op on web.
     * @param {(data: any) => void} [callback]
     */
    unregisterToken(callback) {
        let _this = this;
        const done = (data) => { if (typeof callback === 'function') callback(data); };

        if (!IS_REACT_NATIVE) {
            return;
        }
        if (!_this._pushToken) {
            const err = { code: 1008, status: 'no push token registered' };
            _this.emit('error', err);
            done(err);
            return;
        }

        RestCMI.unregisterPush(
            _this._token,
            { token: _this._pushToken },
            (data) => {
                if (data && data.code === 200) {
                    _this._pushToken = null;
                    _this.emit('pushUnregistered', data);
                } else {
                    _this.emit('error', { code: 1007, status: 'push token unregister failed', data });
                }
                done(data);
            }
        );
    }



    answer() {
        let _this = this;
        // If CallKit is showing this call (iOS), answer THROUGH CallKit so its UI
        // leaves the ringing state and the audio session activates. The resulting
        // answerCall event re-enters the bridge, which routes to LiveKit or SIP.
        if (_this._callkeep && typeof _this._callkeep.answerFromApp === 'function' && _this._callkeep.answerFromApp()) {
            return;
        }
        // LiveKit inbound answered from the app UI with no CallKit in play
        // (e.g. Android): join the held room directly.
        if (_this._livekit && _this._livekit.hasPending()) {
            _this._livekit.answer();
            return;
        }
        userAgent.answer(_this);
    }
    reject() {
        let _this = this;
        // A ringing LiveKit inbound call — decline it (dismisses CallKit too).
        if (_this._livekit && _this._livekit.hasPending()) {
            _this._livekit.end('rejected');
            return;
        }
        userAgent.reject(_this);
    }

    sendDtmf(no) {
        let _this = this;
        userAgent.dtmf(no, _this);
    }

    hold() {
        let _this = this;
        userAgent.hold(_this);
    }

    unHold() {
        let _this = this;
        userAgent.unhold(_this);
    }

    mute() {
        let _this = this;
        // Inbound (room) call: disable the published mic track.
        if (_this._livekit && typeof _this._livekit.setMuted === 'function' && _this._livekit.isCall(null)) {
            _this._livekit.setMuted(true);
            return;
        }
        userAgent.mute(_this);
    }

    unMute() {
        let _this = this;
        if (_this._livekit && typeof _this._livekit.setMuted === 'function' && _this._livekit.isCall(null)) {
            _this._livekit.setMuted(false);
            return;
        }
        userAgent.unmute(_this);
    }

    speaker(on) {
        let _this = this;
        // LiveKit inbound call: route via the LiveKit audio session (the SIP
        // path's InCallManager isn't driving this call's audio).
        if (_this._livekit && typeof _this._livekit.setSpeaker === 'function' && _this._livekit.isCall && _this._livekit.isCall(null)) {
            return _this._livekit.setSpeaker(on);
        }
        return userAgent.speaker(on, _this);
    }

    isLogedIn() {
        let _this = this;
        return userAgent.islogedin(_this);
    }

    isConnected() {
        let _this = this;
        return userAgent.isConnected(_this);
    }

    onHold() {
        let _this = this;
        return userAgent.onhold(_this);
    }

    onMute() {
        let _this = this;
        if (_this._livekit && typeof _this._livekit.isMuted === 'function' && _this._livekit.isCall(null)) {
            return _this._livekit.isMuted();
        }
        return userAgent.onmute(_this);
    }

    onSpeaker() {
        let _this = this;
        if (_this._livekit && typeof _this._livekit.isSpeakerOn === 'function' && _this._livekit.isCall(null)) {
            return _this._livekit.isSpeakerOn();
        }
        return userAgent.onspeaker(_this);
    }

    transfer(to, callback) {
        let _this = this;
        if (!_this.socketCMI) {
            if (typeof callback === 'function') {
                callback({ error: "SocketCMI is not initialized" });
            }
            return;
        }

        let callId = userAgent.getCallId(_this);
        if (!callId) {
            if (typeof callback === 'function') {
                callback({ error: "No active call found" });
            }
            return;
        }

        _this.socketCMI.transfer(callId, to, (data) => {
            if (typeof callback === 'function') {
                callback(data)
            }
        })
    }

    teamTransfer(to, callback) {
        let _this = this;
        if (!_this.socketCMI) {
            if (typeof callback === 'function') {
                callback({ error: "SocketCMI is not initialized" });
            }
            return;
        }

        let callId = userAgent.getCallId(_this);
        if (!callId) {
            if (typeof callback === 'function') {
                callback({ error: "No active call found" });
            }
            return;
        }

        _this.socketCMI.teamTransfer(callId, to, (data) => {
            if (typeof callback === 'function') {
                callback(data)
            }
        })
    }



    merge() {
        let _this = this;
        userAgent.dtmf('0', _this);
    }

    cancel() {
        let _this = this;
        userAgent.dtmf('#', _this);
    }


    getCallId() {
        let _this = this;
        return userAgent.getCallId(_this);

    }

    getCallID() {
        let _this = this;
        return userAgent.getCallID(_this);

    }

}

const isString = (value) => {
    return typeof value === 'string';
}

