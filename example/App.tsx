/**
 * PiopiyFresh — a clean app built by following the SDK docs only.
 *
 * Notice what is NOT here: no push-token code. The SDK fetches and registers
 * the device token itself (autoPushToken) and re-registers on rotation.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  piopiy,
  onEvent,
  login,
  DEFAULT_REGION,
  type CallState,
  loadCreds,
  clearCreds,
  signOut,
} from './src/callService';

export default function App() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('');
  const [dial, setDial] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [call, setCall] = useState<CallState>('idle');
  const [peer, setPeer] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const scroller = useRef<ScrollView>(null);

  const log = useCallback((line: string) => {
    const ts = new Date().toTimeString().slice(0, 8);
    setLines(prev => [...prev.slice(-200), `${ts}  ${line}`]);
  }, []);

  useEffect(() => {
    const off = onEvent(log, st => {
      if (st.signedIn !== undefined) setSignedIn(st.signedIn);
      if (st.call !== undefined) setCall(st.call);
      if (st.peer !== undefined) setPeer(st.peer);
    });
    // Restore saved sign-in details so you don't retype them every launch.
    loadCreds().then(c => {
      if (c) {
        setUser(c.user);
        setPassword(c.password);
        setRegion(c.region);
        log(`restored saved details for ${c.user} @ ${c.region}`);
      } else {
        log('ready — sign in to start');
      }
    });
    return off;
  }, [log]);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>PIOPIY · fresh integration</Text>
        <View style={[s.badge, signedIn ? s.badgeOn : s.badgeOff]}>
          <Text style={s.badgeText}>{signedIn ? 'SIGNED IN' : 'SIGNED OUT'}</Text>
        </View>
      </View>
      {call !== 'idle' && (
        <View style={s.callBar}>
          <Text style={s.callBarText}>
            {call === 'incoming' && `📞 Incoming — ${peer ?? 'unknown'}`}
            {call === 'outgoing' && '📱 Calling…'}
            {call === 'active' && `🔊 In call${peer ? ` — ${peer}` : ''}`}
          </Text>
        </View>
      )}

      <View style={s.row}>
        <TextInput
          style={s.input}
          placeholder="user id"
          autoCapitalize="none"
          value={user}
          onChangeText={setUser}
          placeholderTextColor="#888"
        />
        <TextInput
          style={s.input}
          placeholder="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#888"
        />
      </View>
      <TextInput
        style={s.regionInput}
        placeholder={`SBC / region (default ${DEFAULT_REGION})`}
        autoCapitalize="none"
        autoCorrect={false}
        value={region}
        onChangeText={setRegion}
        placeholderTextColor="#6b7280"
      />
      <View style={s.row}>
        {signedIn ? (
          <TouchableOpacity
            style={[s.btn, s.signOut, {flex: 3}]}
            onPress={() => signOut(log)}>
            <Text style={s.btnText}>Sign out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.btn, {flex: 3}]}
            onPress={() =>
              login(user, password, region).catch(e => log(String(e)))
            }>
            <Text style={s.btnText}>Sign in</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.btn, s.forget]}
          onPress={() => {
            clearCreds();
            setUser('');
            setPassword('');
            setRegion('');
            log('saved details cleared');
          }}>
          <Text style={s.btnText}>Forget</Text>
        </TouchableOpacity>
      </View>

      {call === 'idle' && (
        <View style={s.row}>
          <TextInput
            style={[s.input, {flex: 2}]}
            placeholder="number to call"
            keyboardType="phone-pad"
            value={dial}
            onChangeText={setDial}
            placeholderTextColor="#888"
          />
          <TouchableOpacity style={[s.btn, s.call]} onPress={() => piopiy.call(dial)}>
            <Text style={s.btnText}>Call</Text>
          </TouchableOpacity>
        </View>
      )}

      {call === 'incoming' && (
        // In-app incoming-call controls. answer() joins the call (through the
        // native call screen when it is showing); reject() declines and
        // dismisses the native call screen too.
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, s.small, s.call]} onPress={() => piopiy.answer()}>
            <Text style={s.btnText}>Answer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.small, s.end]} onPress={() => piopiy.reject()}>
            <Text style={s.btnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {(call === 'outgoing' || call === 'active') && (
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, s.small, s.end]} onPress={() => piopiy.terminate()}>
            <Text style={s.btnText}>Hang up</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.small]}
            onPress={() => piopiy.speaker(!piopiy.onSpeaker())}>
            <Text style={s.btnText}>Speaker</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scroller}
        style={s.logBox}
        onContentSizeChange={() => scroller.current?.scrollToEnd({animated: false})}>
        {lines.map((l, i) => (
          <Text key={i} style={s.logLine}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#12141a', padding: 14},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  title: {color: '#fff', fontSize: 16, fontWeight: '700'},
  badge: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10},
  badgeOn: {backgroundColor: '#1f9d55'},
  badgeOff: {backgroundColor: '#4b5563'},
  badgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
  callBar: {backgroundColor: '#243b53', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8},
  callBarText: {color: '#cfe3ff', fontSize: 13, fontWeight: '600'},
  row: {flexDirection: 'row', gap: 8, marginBottom: 8},
  input: {
    flex: 1,
    backgroundColor: '#1d212b',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  regionInput: {
    backgroundColor: '#1d212b',
    color: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  small: {flex: 1, paddingVertical: 10},
  forget: {flex: 1, backgroundColor: '#4b5563'},
  signOut: {backgroundColor: '#b45309'},
  call: {flex: 1, backgroundColor: '#1f9d55', marginBottom: 8},
  end: {backgroundColor: '#d64545'},
  btnText: {color: '#fff', fontWeight: '600'},
  logBox: {
    flex: 1,
    backgroundColor: '#0c0e13',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  logLine: {color: '#9fe6a0', fontSize: 11, fontFamily: 'Menlo'},
});
