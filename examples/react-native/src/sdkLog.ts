/**
 * SDK log sink — MUST be imported before @telecmi/piopiy-native.
 *
 * The SDK logs at module-evaluation time (e.g. why the WebRTC/LiveKit engine
 * failed to load). ES imports are hoisted, so if the sink is installed in the
 * same file that imports the SDK, those first messages are already gone.
 * Importing this module first guarantees the sink exists beforehand.
 */
const sinks: Array<(line: string) => void> = [];
const buffer: string[] = [];

// Mirror every SDK line to the native console so it also lands in logcat /
// Metro. Without this the SDK's diagnostics (why the push token was skipped,
// whether a push arrived, why the engine is inert) exist only in the on-screen
// pane — impossible to capture on a killed/locked device. On Android:
//   adb logcat | grep -i "ReactNativeJS.*piopiy"
const MIRROR_TO_LOGCAT = true;

(globalThis as any).__piopiyLog = (line: string) => {
  const entry = `[sdk] ${line}`;
  if (MIRROR_TO_LOGCAT) {
    // eslint-disable-next-line no-console
    console.log('[piopiy]', entry);
  }
  if (sinks.length === 0) {
    buffer.push(entry);
    if (buffer.length > 500) buffer.shift();
    return;
  }
  sinks.forEach(fn => {
    try {
      fn(entry);
    } catch {
      // ignore
    }
  });
};

/** Attach a sink and replay everything logged before the UI was ready. */
export function attachSdkLog(fn: (line: string) => void) {
  sinks.push(fn);
  buffer.splice(0).forEach(l => fn(l));
}
