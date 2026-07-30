// Holds the app-provided Firebase messaging module for Android push.
//
// Set by the '@telecmi/piopiy-native/android-push' side-effect import (whose
// .ios variant is an empty module, so Firebase never enters an iOS bundle);
// read by the push-token manager. The `messaging` constructor option remains
// as an explicit override for apps that prefer passing the module directly.
let messagingModule = null;

export function setMessaging( mod ) {
    messagingModule = mod || null;
}

export function getMessaging() {
    return messagingModule;
}
