// Automatic device push-token registration is a React Native feature — browsers
// have no APNs/FCM — so the web build uses this no-op manager. The React Native
// build replaces this file with pushToken.native.js.
export default class PushTokenManager {
    constructor() { }
    start() { return false; }
    stop() { }
    registerHeadlessHandler() { return false; }
}
