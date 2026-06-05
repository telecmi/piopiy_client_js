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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PIOPIY from 'piopiyjs';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'active';

const DEFAULT_REGION = 'sbcind.telecmi.com';
const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

async function requestMicPermission(): Promise<boolean> {
  // iOS prompts automatically on the first getUserMedia call, as long as
  // NSMicrophoneUsageDescription is present in Info.plist (it is).
  if (Platform.OS !== 'android') {
    return true;
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

  // Create the PIOPIY instance and wire all events exactly once.
  useEffect(() => {
    const piopiy = new PIOPIY({name: 'RN Test', debug: true, ringTime: 60});
    piopiyRef.current = piopiy;

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

    // ---- Authentication ----
    piopiy.on('login', () => {
      setRegistered(true);
      setStatus('Registered — ready for calls');
      log('login: registered with SBC');
    });
    piopiy.on('loginFailed', (d: any) => {
      setRegistered(false);
      setStatus(`Login failed (${d?.code}): ${d?.status}`);
      log(`loginFailed: ${JSON.stringify(d)}`);
    });
    piopiy.on('logout', () => {
      setRegistered(false);
      setStatus('Logged out');
      resetCall();
      log('logout');
    });
    piopiy.on('connected', () => log('connected: SBC socket up'));
    piopiy.on('disconnected', () => log('disconnected: SBC socket down'));

    // ---- INBOUND (the important part) ----
    piopiy.on('inComingCall', (d: any) => {
      setCallState('incoming');
      setIncomingFrom(d?.from ?? 'Unknown');
      setStatus(`Incoming call from ${d?.from ?? 'Unknown'}`);
      log(`inComingCall: ${JSON.stringify(d)}`);
    });

    // ---- Call lifecycle ----
    piopiy.on('trying', (d: any) => log(`trying: ${JSON.stringify(d)}`));
    piopiy.on('ringing', (d: any) => {
      if (d?.type === 'outgoing') {
        setStatus('Ringing…');
      }
      log(`ringing: ${JSON.stringify(d)}`);
    });
    piopiy.on('answered', () => {
      setCallState('active');
      setStatus('In call');
      log('answered: media connected');
    });
    piopiy.on('callStream', () => log('callStream: remote audio stream ready'));
    piopiy.on('mediaFailed', (d: any) => {
      Alert.alert('Microphone error', 'Could not access the microphone.');
      log(`mediaFailed: ${JSON.stringify(d)}`);
    });
    piopiy.on('hold', (d: any) => log(`hold: ${JSON.stringify(d)}`));
    piopiy.on('unhold', (d: any) => log(`unhold: ${JSON.stringify(d)}`));
    piopiy.on('dtmf', (d: any) => log(`dtmf: ${JSON.stringify(d)}`));
    piopiy.on('ended', (d: any) => {
      resetCall();
      readyStatus();
      log(`ended: ${JSON.stringify(d)}`);
    });
    piopiy.on('hangup', (d: any) => {
      resetCall();
      readyStatus();
      log(`hangup: ${JSON.stringify(d)}`);
    });
    piopiy.on('error', (d: any) => log(`error: ${JSON.stringify(d)}`));

    return () => {
      try {
        piopiy.removeAllListeners();
      } catch {
        // ignore
      }
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
    piopiyRef.current?.login(userId.trim(), password, region.trim());
  }, [userId, password, region, log]);

  const onLogout = useCallback(() => {
    log('logout pressed');
    piopiyRef.current?.logout();
  }, [log]);

  const onAnswer = useCallback(() => {
    log('answer pressed');
    piopiyRef.current?.answer();
  }, [log]);

  const onReject = useCallback(() => {
    log('reject pressed');
    piopiyRef.current?.reject();
  }, [log]);

  const onHangup = useCallback(() => {
    log('hangup pressed');
    piopiyRef.current?.terminate();
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
        {!registered ? (
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
              placeholder="Domain (e.g. sbcind.telecmi.com)"
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
