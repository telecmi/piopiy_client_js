// TeleCMI cross-SDK push router.
//
// One app may contain several TeleCMI SDKs (voice: @telecmi/piopiy-native,
// video: @telecmi/connle-video), but Android allows exactly ONE FCM background
// handler and the device has exactly ONE push token. The router makes that
// safe with no dependency between the SDK packages: it lives on a well-known
// global, whichever SDK loads first installs it, and every SDK (and the app)
// registers the payload `type`s it owns.
//
//   route by data.type:
//     'incoming_call' / 'cancel_call'  → voice SDK
//     'video_call'    / 'video_cancel' → video SDK
//     no type at all                   → voice SDK (legacy payloads)
//     anything unrouted                → the app's onUnrouted callback
//
// The claimer (the SDK that actually owns the OS-level handlers) also
// publishes the device token here, so co-resident SDKs register the SAME
// token with their own backends instead of fighting over the OS APIs.

const KEY = '__telecmiPushRouter';

function createRouter() {
    const routes = new Map();     // type -> handler
    let defaultHandler = null;    // typeless payloads (legacy voice invites)
    let unrouted = null;          // app callback for everything else
    const tokenSubs = [];
    let lastToken = null;         // { token, provider, platform }

    return {
        version: 1,

        /** An SDK claims the payload types it owns. */
        register( types, handler, opts ) {
            ( types || [] ).forEach( ( t ) => routes.set( t, handler ) );
            if ( opts && opts.isDefault ) defaultHandler = handler;
        },

        /** The app's hook for pushes no SDK owns (its own FCM uses). */
        onUnrouted( cb ) { unrouted = cb; },

        /** The OS-handler owner feeds every push through here. */
        dispatch( data ) {
            if ( !data || typeof data !== 'object' ) return false;
            const handler = ( data.type && routes.get( data.type ) )
                || ( !data.type && defaultHandler )
                || null;
            if ( handler ) { try { handler( data ); } catch { /* handler's problem */ } return true; }
            if ( unrouted ) { try { unrouted( data ); } catch { /* app's problem */ } return true; }
            return false;
        },

        /** The OS-handler owner publishes the device token for everyone. */
        publishToken( info ) {
            lastToken = info;
            tokenSubs.forEach( ( cb ) => { try { cb( info ); } catch { /* ignore */ } } );
        },

        /** Co-resident SDKs subscribe to register the same token elsewhere. */
        onToken( cb ) {
            tokenSubs.push( cb );
            if ( lastToken ) { try { cb( lastToken ); } catch { /* ignore */ } }
        },
    };
}

/** Get (or install) the app-wide router. */
export function getPushRouter() {
    const g = ( typeof globalThis !== 'undefined' ) ? globalThis : {};
    if ( !g[ KEY ] ) g[ KEY ] = createRouter();
    return g[ KEY ];
}
