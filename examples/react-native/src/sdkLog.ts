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

(globalThis as any).__piopiyLog = (line: string) => {
  const entry = `[sdk] ${line}`;
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
