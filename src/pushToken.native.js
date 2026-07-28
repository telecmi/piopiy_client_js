// Automatic device push-token registration — React Native build.
//
// Removes the boilerplate every app used to write: fetch the device push token,
// register it with TeleCMI, and re-register when the OS rotates it. Enabled by
// default (`autoPushToken`), and fully inert when the push libraries are not
// installed — apps that manage tokens themselves keep using registerToken().
//
// Soft-required peers (same pattern as the CallKeep bridge):
//   iOS     react-native-voip-push-notification  (PushKit / VoIP push)
//   Android @react-native-firebase/messaging     (FCM)

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

// Android FCM. NEVER required on iOS: pulling @react-native-firebase into an
// iOS build fails with "Module 'FirebaseCore' not found". The require is lazy
// AND guarded by Platform.OS so it is never evaluated on iOS.
function loadMessaging() {
    if ( Platform.OS !== 'android' ) return null;
    try {
        const mod = require( '@react-native-firebase/messaging' );
        return mod && ( mod.default || mod );
    } catch {
        return null;
    }
}

export default class PushTokenManager {

    constructor( piopiy ) {
        this.piopiy = piopiy;
        this.started = false;
        this.lastToken = null;
        this.cleanups = [];
    }

    /** Begin watching for the device push token. Idempotent. */
    start() {
        if ( this.started ) return true;
        this.started = true;

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
            // A token issued before JS booted is replayed here on cold launch.
            VoipPush.addEventListener( 'didLoadWithEvents', ( events ) => {
                ( events || [] ).forEach( ( evt ) => {
                    if ( evt && evt.name === 'RNVoipPushRemoteNotificationsRegisteredEvent' ) {
                        this._onToken( evt.data, 'apns', 'ios' );
                    }
                } );
            } );
            VoipPush.registerVoipToken();
            this.cleanups.push( () => {
                try { VoipPush.removeEventListener( 'register' ); } catch { /* ignore */ }
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
        const messaging = loadMessaging();
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

            dbg( 'auto push token: watching for the Android FCM token' );
            return true;
        } catch ( e ) {
            dbg( 'auto push token: Android setup failed —', e && e.message );
            return false;
        }
    }

    // Register a freshly issued (or rotated) token.
    _onToken( token, provider, platform ) {
        if ( !token || typeof token !== 'string' ) return;
        // The OS re-emits the same token on every launch — only send changes.
        // (An app that also registers manually therefore causes no extra calls.)
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
