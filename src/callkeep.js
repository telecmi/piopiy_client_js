// Web build: no native call UI — helpers resolve to the enabled state.
export default class CallKeepBridge {
    constructor() { }
    async hasPhoneAccount() { return true; }
    checkPhoneAccountEnabled() { return this.hasPhoneAccount(); }
    async openPhoneAccounts() { return false; }
}
