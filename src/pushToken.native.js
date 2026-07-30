// Automatic device push-token registration — React Native build.
//
// Removes the boilerplate every app used to write: fetch the device push token,
// register it with TeleCMI, and re-register when the OS rotates it. Enabled by
// default (`autoPushToken`), and fully inert when the push libraries are not
// installed — apps that manage tokens themselves keep using registerToken().
//
// iOS uses react-native-voip-push-notification (ships with the SDK).
// Android FCM uses @react-native-firebase/messaging — the APP installs it and
// passes the module in via `new PIOPIY({ messaging })`. The SDK deliberately
// has NO firebase require of its own: Metro resolves require() statically, so
// an SDK-side require would force every iOS-only app to install an
// Android-only package just to bundle. Injection keeps Firebase a conscious,
// documented Android setup step owned by the app (its Firebase project, its
// google-services.json, its version).

import { Platform } from 'react-native';

const dbg = ( ...args ) => {
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__piopiyLog === 'function' ) {
            g.__piopiyLog( '[push] ' + args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' ) );
        }
    } catch { /* ignore */ }
};

// iOS VoIP push. Loaded eagerly (safe on both platforms — it has no Firebase
// dependency), but only USED on iOS.
let VoipPush = null;
try {
    const mod = require( 'react-native-voip-push-notification' );
    VoipPush = mod && ( mod.default || mod );
} catch {
    VoipPush = null;
}

// Android FCM — the messaging module the APP injected via the `messaging`
// option (see the file header for why the SDK never requires it itself).
function loadMessaging( piopiy ) {
    if ( Platform.OS !== 'android' ) return null;
    const opt = piopiy && piopiy.piopiyOption && piopiy.piopiyOption.messaging;
    if ( !opt ) {
        dbg( 'Android push needs Firebase: install @react-native-firebase/app and /messaging, then pass the module — new PIOPIY({ messaging: require("@react-native-firebase/messaging").default }). See the Android setup guide.' );
        return null;
    }
    return opt.default || opt;
}

export default class PushTokenManager {

    constructor( piopiy ) {
        this.piopiy = piopiy;
        this.started = false;
        this.lastToken = null;    // last token SENT to the backend (dedupe)
        this.deviceToken = null;  // current device token, survives logout
        this.provider = null;
        this.platform = null;
        this.cleanups = [];
    }

    /** Begin watching for the device push token. Idempotent. */
    start() {
        if ( this.started ) return true;
        this.started = true;

        // logout() unregisters the token server-side — correct, the user asked
        // to stop being reachable. But the OS will NOT re-emit the token event
        // on the next sign-in (iOS fires 'register' only once per launch), so
        // without this hook a logout→login cycle leaves the device silently
        // unreachable: nothing re-registers, and offline calls 404 at the SBC.
        // Clear the dedupe on logout and re-send the kept device token on login.
        this.piopiy.on( 'logout', () => {
            this.lastToken = null;
        } );
        this.piopiy.on( 'login', () => {
            // Register on sign-in unless this exact token was actually SENT
            // (piopiy._pushToken is set only when the POST goes out with auth).
            // Checking "seen" state instead of "sent" state silently skipped
            // the retry when a fresh install's queued first registration was
            // lost — the token then only registered after a sign-out/sign-in.
            const sent = this.piopiy._pushToken;
            if ( this.deviceToken && sent !== this.deviceToken ) {
                dbg( 'auto push token: (re)registering after sign-in' );
                this.lastToken = null;
                this._onToken( this.deviceToken, this.provider, this.platform );
            }
        } );

        // Visibility for the silent failure modes: if the OS hasn't issued a
        // token shortly after start, say so — a missing Push Notifications
        // capability or blocked APNs connectivity otherwise shows NOTHING.
        setTimeout( () => {
            if ( !this.deviceToken ) {
                dbg( 'no device push token after 10s — check the Push Notifications capability (iOS), google-services.json (Android), and network' );
            }
        }, 10000 );

        if ( Platform.OS === 'ios' ) return this._startIOS();
        if ( Platform.OS === 'android' ) return this._startAndroid();
        dbg( 'auto push token: unsupported platform', Platform.OS );
        return false;
    }

    /** Stop watching. Does NOT unregister the token — that is the app's call. */
    stop() {
        this.cleanups.forEach( ( fn ) => { try { fn(); } catch { /* ignore */ } } );
        this.cleanups = [];
        this.started = false;
    }

    _startIOS() {
        if ( !VoipPush ) {
            dbg( 'auto push token: react-native-voip-push-notification not installed — skipping' );
            return false;
        }
        try {
            VoipPush.addEventListener( 'register', ( token ) => this._onToken( token, 'apns', 'ios' ) );
            // Incoming call pushes are forwarded to the SDK HERE — the app
            // writes no push-handling code and never imports the push library.
            VoipPush.addEventListener( 'notification', ( payload ) => this._onPush( payload ) );
            // Events issued before JS booted are replayed here on cold launch.
            VoipPush.addEventListener( 'didLoadWithEvents', ( events ) => {
                ( events || [] ).forEach( ( evt ) => {
                    if ( evt && evt.name === 'RNVoipPushRemoteNotificationsRegisteredEvent' ) {
                        this._onToken( evt.data, 'apns', 'ios' );
                    }
                    if ( evt && evt.name === 'RNVoipPushRemoteNotificationReceivedEvent' ) {
                        this._onPush( evt.data );
                    }
                } );
            } );
            VoipPush.registerVoipToken();
            this.cleanups.push( () => {
                try { VoipPush.removeEventListener( 'register' ); } catch { /* ignore */ }
                try { VoipPush.removeEventListener( 'notification' ); } catch { /* ignore */ }
                try { VoipPush.removeEventListener( 'didLoadWithEvents' ); } catch { /* ignore */ }
            } );
            dbg( 'auto push token: watching for the iOS VoIP token' );
            return true;
        } catch ( e ) {
            dbg( 'auto push token: iOS setup failed —', e && e.message );
            return false;
        }
    }

    _startAndroid() {
        const messaging = loadMessaging( this.piopiy );
        if ( !messaging ) {
            dbg( 'auto push token: @react-native-firebase/messaging not installed — skipping' );
            return false;
        }
        try {
            // Throws "No Firebase App '[DEFAULT]'" when google-services.json is
            // missing — caught so a misconfigured app degrades instead of crashing.
            messaging()
                .getToken()
                .then( ( token ) => this._onToken( token, 'fcm', 'android' ) )
                .catch( ( e ) => dbg( 'auto push token: FCM getToken failed —', e && e.message ) );

            const unsubscribe = messaging().onTokenRefresh( ( token ) => this._onToken( token, 'fcm', 'android' ) );
            if ( typeof unsubscribe === 'function' ) this.cleanups.push( unsubscribe );

            // Foreground call pushes forwarded to the SDK here — the app never
            // imports the push library.
            const offMessage = messaging().onMessage( ( msg ) => this._onPush( msg ) );
            if ( typeof offMessage === 'function' ) this.cleanups.push( offMessage );

            dbg( 'auto push token: watching for the Android FCM token' );
            return true;
        } catch ( e ) {
            dbg( 'auto push token: Android setup failed —', e && e.message );
            return false;
        }
    }

    /**
     * Android: handle call pushes that wake the app from BACKGROUND or KILLED
     * state. Must be called from the app's index.js (module scope — before
     * component registration), because the OS runs that file headlessly to
     * deliver the push. iOS needs nothing here (wake-ups arrive via PushKit,
     * handled natively), so this is a safe no-op there.
     */
    registerHeadlessHandler() {
        if ( Platform.OS !== 'android' ) return false;
        const messaging = loadMessaging( this.piopiy );
        if ( !messaging ) {
            dbg( 'headless push: @react-native-firebase/messaging unavailable — skipping' );
            return false;
        }
        try {
            messaging().setBackgroundMessageHandler( async ( msg ) => this._onPush( msg ) );
            dbg( 'headless push: Android background handler registered' );
            return true;
        } catch ( e ) {
            dbg( 'headless push: setup failed —', e && e.message );
            return false;
        }
    }

    // A call push arrived (any platform, any app state) — normalize the payload
    // shape and hand it to the SDK. iOS VoIP events wrap the dictionary as
    // {data}, or deliver it bare; FCM wraps it as {data} on the message.
    _onPush( raw ) {
        try {
            const data = ( raw && ( raw.data ?? raw ) ) || null;
            if ( !data || typeof data !== 'object' ) return;
            this.piopiy.handleIncomingPush( data );
        } catch ( e ) {
            dbg( 'push forward failed —', e && e.message );
        }
    }

    // Register a freshly issued (or rotated) token.
    _onToken( token, provider, platform ) {
        if ( !token || typeof token !== 'string' ) return;
        // Keep the device token (and its provider) across logout, so the next
        // sign-in can re-register without waiting for an OS event that will
        // never come.
        this.deviceToken = token;
        this.provider = provider;
        this.platform = platform;
        // The OS re-emits the same token on every launch — only send changes.
        // (An app that also registers manually therefore causes no extra calls.
        // lastToken is cleared on logout, so a re-login sends again.)
        if ( token === this.lastToken ) {
            dbg( 'auto push token: unchanged, skipping re-registration' );
            return;
        }
        this.lastToken = token;
        dbg( 'auto push token: registering', provider, `${String( token ).slice( 0, 10 )}…` );
        // registerToken() queues internally until login completes, so this is
        // safe whenever the token arrives.
        try {
            this.piopiy.registerToken( { provider, token, platform }, ( res ) => {
                dbg( 'auto push token: /push/register response →', res );
            } );
        } catch ( e ) {
            dbg( 'auto push token: registerToken threw —', e && e.message );
        }
    }
}
