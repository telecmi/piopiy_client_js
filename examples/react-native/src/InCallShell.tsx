/**
 * ConnleInCallShell — the app's own full-screen in-call UI.
 *
 * The bundled callkeep fork shows self-managed calls on a dedicated React
 * surface (a separate Activity over the keyguard) and mounts a component named
 * "ConnleInCallShell" by default. In a voice-only app the piopiy SDK/app must
 * provide it, otherwise React throws
 *   '"ConnleInCallShell" has not been registered'.
 *
 * It is registered in index.js and receives `{uuid, name}` from the native
 * surface. Controls drive the same public SDK API the main app uses.
 */
import React, {useEffect, useState} from 'react';
import {SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {piopiy} from './callService';

type Props = {uuid?: string; name?: string};

export default function ConnleInCallShell({name}: Props) {
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // This shell can mount AFTER the answer (the in-app screen is rendered on the
  // 'answered' event). Start in the connected state if the call already joined,
  // so the timer runs instead of waiting for an event it missed.
  const [connected, setConnected] = useState<boolean>(() =>
    typeof (piopiy as any).isCallAnswered === 'function' ? piopiy.isCallAnswered() : false,
  );

  useEffect(() => {
    setMuted(!!piopiy.onMute());
    setSpeaker(!!piopiy.onSpeaker());

    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    const onAnswered = () => setConnected(true);
    const onEnded = () => setConnected(false);

    piopiy.on('answered', onAnswered);
    piopiy.on('ended', onEnded);
    piopiy.on('hangup', onEnded);

    return () => {
      clearInterval(timer);
      piopiy.off('answered', onAnswered);
      piopiy.off('ended', onEnded);
      piopiy.off('hangup', onEnded);
    };
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) {
      piopiy.mute();
    } else {
      piopiy.unMute();
    }
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    piopiy.speaker(next);
  };

  return (
    <SafeAreaView style={s.root}>
      <Text style={s.label}>In call</Text>
      <Text style={s.name} numberOfLines={1}>
        {name || 'Call'}
      </Text>
      <Text style={s.timer}>{connected ? `${mm}:${ss}` : 'Connecting…'}</Text>

      <View style={s.controls}>
        <TouchableOpacity style={[s.btn, muted && s.btnOn]} onPress={toggleMute}>
          <Text style={s.btnText}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, speaker && s.btnOn]} onPress={toggleSpeaker}>
          <Text style={s.btnText}>Speaker</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[s.btn, s.end]} onPress={() => piopiy.terminate()}>
        <Text style={s.btnText}>Hang up</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1F3A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {color: '#9FC1FF', fontSize: 14, fontWeight: '700', letterSpacing: 1},
  name: {color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 14, maxWidth: '100%'},
  timer: {color: '#cfe3ff', fontSize: 18, marginTop: 10, fontVariant: ['tabular-nums']},
  controls: {flexDirection: 'row', gap: 14, marginTop: 48},
  btn: {
    minWidth: 120,
    backgroundColor: '#243b53',
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnOn: {backgroundColor: '#1f9d55'},
  end: {backgroundColor: '#d64545', marginTop: 22, minWidth: 240},
  btnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});
