// Web globals that React Native's JS engine (Hermes) does not provide.
//
// Must be loaded BEFORE anything that pulls in livekit-client: its bundled
// WebRTC adapter declares `class ... extends DOMException`, and an `extends`
// clause is evaluated when the module is *loaded*, not when the class is used.
// Hermes has no DOMException, so that require() throws
//   "Property 'DOMException' doesn't exist"
// and the whole LiveKit engine goes inert — inbound push calls then ring
// through CallKit but connect no room, which presents as an answered call with
// no audio and no error anywhere.

if ( typeof globalThis.DOMException === 'undefined' ) {

    // Legacy name → code, per the WebIDL DOMException spec. Only the values
    // livekit-client's adapter can construct are listed; anything else gets 0,
    // which is what the spec says for names outside this table.
    const LEGACY_CODES = {
        IndexSizeError: 1,
        HierarchyRequestError: 3,
        WrongDocumentError: 4,
        InvalidCharacterError: 5,
        NoModificationAllowedError: 7,
        NotFoundError: 8,
        NotSupportedError: 9,
        InvalidStateError: 11,
        SyntaxError: 12,
        InvalidModificationError: 13,
        NamespaceError: 14,
        InvalidAccessError: 15,
        TypeMismatchError: 17,
        SecurityError: 18,
        NetworkError: 19,
        AbortError: 20,
        URLMismatchError: 21,
        QuotaExceededError: 22,
        TimeoutError: 23,
        InvalidNodeTypeError: 24,
        DataCloneError: 25
    };

    class DOMException extends Error {

        constructor( message = '', name = 'Error' ) {
            super( message );
            this.name = name;
            this.message = message;
            this.code = LEGACY_CODES[ name ] || 0;
        }
    }

    globalThis.DOMException = DOMException;
}
