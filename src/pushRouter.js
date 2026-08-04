// Web build: no push, no router — a no-op with the same shape.
export function getPushRouter() {
    return {
        version: 1,
        register() { },
        onUnrouted() { },
        dispatch() { return false; },
        publishToken() { },
        onToken() { },
    };
}
