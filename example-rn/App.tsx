/**
 * PIOPIY React Native test app — focused on INBOUND (incoming) calls.
 *
 * Flow:
 *   1. Enter your SBC credentials and tap "Login" (registers with the SBC).
 *   2. When someone calls this extension, the SDK fires `inComingCall` and the
 *      green incoming banner appears -> tap "Answer" (or "Reject").
 *   3. After answering, remote audio is routed to the device automatically.
 *
 * An outbound dialer is included too, so you can verify two-way audio.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PIOPIY, {type PiopiyEventName} from '@telecmi/piopiy-native';
import {mediaDevices} from '@livekit/react-native-webrtc';
import pushCallService from './src/pushCallService';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'active';

const DEFAULT_REGION = 'testsbc.telecmi.com';
const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

async function requestMicPermission(): Promise<boolean> {
  // iOS: trigger the mic permission prompt NOW, while the app is foreground and
  // UNLOCKED. The old code returned true and relied on "iOS prompts on the first
  // getUserMedia" — but for a push-woken incoming call that first getUserMedia
  // happens on the LOCK SCREEN, where iOS cannot present the prompt
  // ("no presenter that can handle this alert item"). The call then comes up with
  // no microphone, so no RTP flows and the server tears it down on media-timeout.
  // Priming here (e.g. at app launch) grants the mic once so later locked-screen
  // calls already have it. Opening + immediately stopping a track is enough to
  // surface the prompt; if already granted it's a no-op.
  if (Platform.OS === 'ios') {
    try {
      const stream = await mediaDevices.getUserMedia({audio: true});
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch {
      return false;
    }
  }
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'Voice calls need access to your microphone.',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export default function App(): React.JSX.Element {
  const piopiyRef = useRef<PIOPIY | null>(null);

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [dialNumber, setDialNumber] = useState('');

  const [registered, setRegistered] = useState(false);
  const [booting, setBooting] = useState(true); // true while we try auto-login from storage
  const [status, setStatus] = useState('Not logged in');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const log = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`${ts}  ${line}`, ...prev].slice(0, 200));
  }, []);

  // The PIOPIY instance is owned by pushCallService — it must live outside the
  // React tree so background/killed push wake-ups can drive it. init() is idempotent.
  useEffect(() => {
    pushCallService.init();
    const piopiy = pushCallService.getClient();
    piopiyRef.current = piopiy;

    // Prime the iOS mic permission up front, while the app is foreground and the
    // screen is unlocked. A later push-woken call answered on the LOCK SCREEN
    // can't surface the permission prompt, so without this the first call after a
    // fresh install has no microphone (no RTP -> remote media-timeout drop).
    // Fire-and-forget; no-op if already granted.
    requestMicPermission();

    const resetCall = () => {
      setCallState('idle');
      setIncomingFrom(null);
      setMuted(false);
      setHeld(false);
      // The SDK resets audio routing when the call ends; just clear the UI flag.
      setSpeakerOn(false);
    };

    const readyStatus = () => {
      let loggedIn = false;
      try {
        loggedIn = piopiy.isLogedIn();
      } catch {
        loggedIn = false;
      }
      setStatus(loggedIn ? 'Registered — ready for calls' : 'Call ended');
    };

    // All UI event handlers, kept as a list so we can detach exactly these on
    // cleanup. (Do NOT use removeAllListeners — the same instance also carries
    // pushCallService's CallKeep bridge listeners, which must survive remounts.)
    // PiopiyEventName keeps this list honest — a typo'd event name is a
    // compile error rather than a listener that silently never fires.
    const handlers: Array<[PiopiyEventName, (d?: any) => void]> = [
      // ---- Authentication ----
      ['login', () => {
        setRegistered(true);
        setBooting(false);
        setStatus('Registered — ready for calls');
        log('login: registered with SBC');
      }],
      ['loginFailed', (d: any) => {
        setRegistered(false);
        setBooting(false);
        setStatus(`Login failed (${d?.code}): ${d?.status}`);
        log(`loginFailed: ${JSON.stringify(d)}`);
      }],
      ['logout', () => {
        setRegistered(false);
        setStatus('Logged out');
        resetCall();
        log('logout');
      }],
      ['connected', () => log('connected: SBC socket up')],
      ['disconnected', () => log('disconnected: SBC socket down')],
      // ---- INBOUND (the important part) ----
      ['inComingCall', (d: any) => {
        setCallState('incoming');
        setIncomingFrom(d?.from ?? 'Unknown');
        setStatus(`Incoming call from ${d?.from ?? 'Unknown'}`);
        log(`inComingCall: ${JSON.stringify(d)}`);
      }],
      // ---- Call lifecycle ----
      ['trying', (d: any) => log(`trying: ${JSON.stringify(d)}`)],
      ['ringing', (d: any) => {
        if (d?.type === 'outgoing') {
          setStatus('Ringing…');
        }
        log(`ringing: ${JSON.stringify(d)}`);
      }],
      ['answered', () => {
        setCallState('active');
        setStatus('In call');
        log('answered: media connected');
      }],
      ['callStream', () => log('callStream: remote audio stream ready')],
      ['mediaFailed', (d: any) => {
        Alert.alert('Microphone error', 'Could not access the microphone.');
        log(`mediaFailed: ${JSON.stringify(d)}`);
      }],
      ['hold', (d: any) => log(`hold: ${JSON.stringify(d)}`)],
      ['unhold', (d: any) => log(`unhold: ${JSON.stringify(d)}`)],
      ['dtmf', (d: any) => log(`dtmf: ${JSON.stringify(d)}`)],
      ['ended', (d: any) => {
        resetCall();
        readyStatus();
        log(`ended: ${JSON.stringify(d)}`);
      }],
      ['hangup', (d: any) => {
        resetCall();
        readyStatus();
        log(`hangup: ${JSON.stringify(d)}`);
      }],
      ['error', (d: any) => log(`error: ${JSON.stringify(d)}`)],
    ];
    handlers.forEach(([evt, fn]) => piopiy.on(evt, fn));

    // Surface push / CallKeep diagnostics in the same on-screen log.
    pushCallService.on('log', log);

    // Auto-login from saved credentials so reopening the app re-registers
    // automatically — no need to re-enter anything. 'login'/'loginFailed' clear
    // the booting state; if nothing is stored we drop straight to the login form.
    pushCallService
      .tryAutoLogin()
      .then(creds => {
        if (creds) {
          setUserId(creds.user);
          setRegion(creds.region);
          setStatus('Restoring session…');
        } else {
          setBooting(false);
        }
      })
      .catch(() => setBooting(false));

    // Safety net: never get stuck on the spinner if no login event ever arrives.
    const bootFallback = setTimeout(() => setBooting(false), 8000);

    return () => {
      clearTimeout(bootFallback);
      handlers.forEach(([evt, fn]) => piopiy.off(evt, fn));
      pushCallService.off('log', log);
    };
  }, [log]);

  // ---- Button handlers ----
  const onLogin = useCallback(async () => {
    if (!userId.trim() || !password) {
      Alert.alert('Missing info', 'Enter your username and password.');
      return;
    }
    const ok = await requestMicPermission();
    if (!ok) {
      Alert.alert('Permission needed', 'Microphone permission is required.');
      return;
    }
    setStatus('Logging in…');
    log(`login attempt: ${userId.trim()} @ ${region.trim()}`);
    // Route through the service so the push token is attached to the REGISTER and
    // credentials are persisted for background wake-ups.
    pushCallService.login(userId.trim(), password, region.trim());
  }, [userId, password, region, log]);

  const onLogout = useCallback(() => {
    log('logout pressed');
    pushCallService.logout();
  }, [log]);

  const onAnswer = useCallback(() => {
    log('answer pressed');
    pushCallService.answer();
  }, [log]);

  const onReject = useCallback(() => {
    log('reject pressed');
    pushCallService.reject();
  }, [log]);

  const onHangup = useCallback(() => {
    log('hangup pressed');
    pushCallService.hangup();
  }, [log]);

  const onToggleMute = useCallback(() => {
    const p = piopiyRef.current;
    if (!p) {
      return;
    }
    if (muted) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  }, [muted]);

  const onToggleHold = useCallback(() => {
    const p = piopiyRef.current;
    if (!p) {
      return;
    }
    if (held) {
      p.unHold();
      setHeld(false);
    } else {
      p.hold();
      setHeld(true);
    }
  }, [held]);

  const onToggleSpeaker = useCallback(() => {
    const p = piopiyRef.current;
    if (!p) {
      return;
    }
    // One SDK call routes call audio to the loudspeaker / earpiece.
    const next = !speakerOn;
    p.speaker(next);
    setSpeakerOn(next);
    log(`speaker ${next ? 'on (loudspeaker)' : 'off (earpiece)'}`);
  }, [speakerOn, log]);

  const onCall = useCallback(async () => {
    if (!dialNumber.trim()) {
      Alert.alert('Enter a number', 'Type a number to dial first.');
      return;
    }
    const ok = await requestMicPermission();
    if (!ok) {
      return;
    }
    setCallState('outgoing');
    setStatus(`Calling ${dialNumber.trim()}…`);
    log(`call: ${dialNumber.trim()}`);
    piopiyRef.current?.call(dialNumber.trim());
  }, [dialNumber, log]);

  const onDtmf = useCallback(
    (tone: string) => {
      log(`dtmf send: ${tone}`);
      piopiyRef.current?.sendDtmf(tone);
    },
    [log],
  );

  // Killed/locked-call capture: share the persisted sequence after a test.
  const onShareDebugLog = useCallback(async () => {
    try {
      const text = await pushCallService.getDebugLog();
      if (!text) {
        Alert.alert('Capture', 'The capture is empty.');
        return;
      }
      await Share.share({message: text});
    } catch (e: any) {
      Alert.alert('Capture', `Could not read log: ${e?.message ?? e}`);
    }
  }, []);

  const onClearDebugCapture = useCallback(async () => {
    await pushCallService.clearDebugLog();
    log('capture cleared — ready for a killed-state test');
  }, [log]);

  // ---- UI ----
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0b1f3a" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PIOPIY · React Native</Text>
        <Text style={styles.headerStatus}>{status}</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {booting ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Restoring session…</Text>
            <Text style={styles.muted}>Signing you back in automatically.</Text>
          </View>
        ) : !registered ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Login</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect={false}
              value={userId}
              onChangeText={setUserId}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Domain (e.g. testsbc.telecmi.com)"
              autoCapitalize="none"
              autoCorrect={false}
              value={region}
              onChangeText={setRegion}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={onLogin}>
              <Text style={styles.primaryBtnText}>Login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Signed in</Text>
              <TouchableOpacity onPress={onLogout}>
                <Text style={styles.linkText}>Logout</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.muted}>{userId || '—'}</Text>
          </View>
        )}

        {/* Incoming call banner — the inbound highlight */}
        {callState === 'incoming' && (
          <View style={[styles.card, styles.incomingCard]}>
            <Text style={styles.incomingLabel}>Incoming call</Text>
            <Text style={styles.incomingFrom}>{incomingFrom}</Text>
            <View style={styles.rowBetween}>
              <TouchableOpacity
                style={[styles.callBtn, styles.rejectBtn]}
                onPress={onReject}>
                <Text style={styles.callBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callBtn, styles.answerBtn]}
                onPress={onAnswer}>
                <Text style={styles.callBtnText}>Answer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active / outgoing call controls */}
        {(callState === 'active' || callState === 'outgoing') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {callState === 'outgoing' ? 'Calling…' : 'On call'}
            </Text>
            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]}
                onPress={onToggleMute}
                disabled={callState !== 'active'}>
                <Text style={styles.ctrlBtnText}>
                  {muted ? 'Unmute' : 'Mute'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlBtn, held && styles.ctrlBtnActive]}
                onPress={onToggleHold}
                disabled={callState !== 'active'}>
                <Text style={styles.ctrlBtnText}>{held ? 'Resume' : 'Hold'}</Text>
              </TouchableOpacity>
              {/* Speaker works during ringing too: for an outbound call the SDK
                  starts the audio session at call time, so routing can be flipped
                  before the other side answers. */}
              <TouchableOpacity
                style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnActive]}
                onPress={onToggleSpeaker}>
                <Text style={styles.ctrlBtnText}>
                  {speakerOn ? 'Speaker on' : 'Speaker'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.ctrlBtn, styles.hangupWide]}
              onPress={onHangup}>
              <Text style={styles.hangupText}>Hang up</Text>
            </TouchableOpacity>

            {callState === 'active' && (
              <View style={styles.keypad}>
                {DTMF_KEYS.map(k => (
                  <TouchableOpacity
                    key={k}
                    style={styles.keypadKey}
                    onPress={() => onDtmf(k)}>
                    <Text style={styles.keypadKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Outbound dialer (only when idle) */}
        {registered && callState === 'idle' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Make a call</Text>
            <TextInput
              style={styles.input}
              placeholder="Number to dial (E.164, e.g. 13158050050)"
              keyboardType="phone-pad"
              value={dialNumber}
              onChangeText={setDialNumber}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={onCall}>
              <Text style={styles.primaryBtnText}>Call</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Killed/locked-call capture — survives the cold-launch in storage */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Killed-call capture</Text>
          <Text style={styles.muted}>
            1. Tap Clear · 2. Kill the app + lock · 3. Receive & answer a call · 4.
            Unlock, then Share the captured push→register→INVITE→answer→audio
            sequence.
          </Text>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={onClearDebugCapture}>
              <Text style={styles.ctrlBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctrlBtn} onPress={onShareDebugLog}>
              <Text style={styles.ctrlBtnText}>Share capture</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Event log */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Event log</Text>
            <TouchableOpacity onPress={() => setLogs([])}>
              <Text style={styles.linkText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {logs.length === 0 ? (
            <Text style={styles.muted}>No events yet.</Text>
          ) : (
            logs.map((line, i) => (
              <Text key={`${i}-${line}`} style={styles.logLine}>
                {line}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b1f3a'},
  header: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16},
  headerTitle: {color: '#ffffff', fontSize: 22, fontWeight: '700'},
  headerStatus: {color: '#9fc1ff', fontSize: 14, marginTop: 4},
  body: {flex: 1, backgroundColor: '#f3f5f9'},
  bodyContent: {padding: 16, paddingBottom: 48},
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  cardTitle: {fontSize: 16, fontWeight: '700', color: '#1b2a4a'},
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muted: {color: '#6b7280', marginTop: 6},
  linkText: {color: '#2563eb', fontWeight: '600'},
  input: {
    borderWidth: 1,
    borderColor: '#d6dbe5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 10,
    color: '#111827',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnText: {color: '#ffffff', fontSize: 16, fontWeight: '700'},
  incomingCard: {backgroundColor: '#e8f7ee', borderWidth: 1, borderColor: '#34c759'},
  incomingLabel: {color: '#157a3a', fontWeight: '700', fontSize: 13},
  incomingFrom: {fontSize: 24, fontWeight: '800', color: '#0f5132', marginVertical: 10},
  callBtn: {flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6},
  answerBtn: {backgroundColor: '#34c759', marginLeft: 8},
  rejectBtn: {backgroundColor: '#ef4444', marginRight: 8},
  callBtnText: {color: '#ffffff', fontSize: 16, fontWeight: '700'},
  controlRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 14},
  ctrlBtn: {
    flex: 1,
    backgroundColor: '#e5e9f2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  ctrlBtnActive: {backgroundColor: '#c7d2fe'},
  hangupWide: {backgroundColor: '#ef4444', marginTop: 6},
  hangupText: {color: '#ffffff', fontWeight: '700'},
  ctrlBtnText: {color: '#1b2a4a', fontWeight: '700'},
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  keypadKey: {
    width: '30%',
    backgroundColor: '#f1f4fa',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  keypadKeyText: {fontSize: 20, fontWeight: '700', color: '#1b2a4a'},
  logLine: {
    fontSize: 12,
    color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 6,
  },
});
