# PIOPIY SDK — React Native Setup

**Platforms:** 📱 iOS · 🤖 Android

This is the unified landing page for setting up the `@telecmi/piopiy-native` React Native voice SDK in a **bare React Native** application. 

It connects your app to TeleCMI so you can make and receive high-quality voice calls — to real phone numbers, to other agent extensions, or app-to-app.

---

## 1. Install

```bash
npm install @telecmi/piopiy-native
```

| Package | Purpose |
| :--- | :--- |
| `@telecmi/piopiy-native` | The PIOPIY SDK — ships its own native WebRTC engine. |
| `react-native-callkeep` | Native incoming-call UI (CallKit / ConnectionService). |
| `react-native-incall-manager` | Audio routing (speaker, ringback, earpiece). |

### Register the SDK's engine for autolinking (required)

The SDK ships its own audio/WebRTC engine. React Native's autolinking only scans
your app's **direct** dependencies, so it will not find an engine that lives
inside the SDK — you must list it once. Create `react-native.config.js` at your
project root:

```javascript
// react-native.config.js
module.exports = {
  dependencies: {
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    '@telecmi/react-native-callkeep': {},
    'react-native-incall-manager': {},
    'react-native-voip-push-notification': {},
  },
};
```

> [!WARNING]
> Skip this and the app builds, but the native WebRTC module is missing — calls
> fail at runtime with *"WebRTC engine could not be loaded"*. You don't install
> these packages yourself; they arrive with the SDK. This file only tells
> autolinking they exist.

Then install the iOS pods:

```bash
cd ios && bundle exec pod install && cd ..
```

---

## 2. Complete Platform-Specific Native Setup

WebRTC and audio routing require native permissions and platform-specific configurations. Follow the guide for each platform you support:

* 📱 **[iOS Native Setup Guide](README.react-native-ios.md)**: Details CocoaPods configuration, Xcode capabilities, `Info.plist` permissions, and Xcode compiler fixes.
* 🤖 **[Android Native Setup Guide](README.react-native-android.md)**: Details `AndroidManifest.xml` permissions, runtime mic checks, ProGuard rules, and Gradle SDK requirements.
* 🔔 **[Push Notifications Setup Guide](README.push-notifications.md)**: Explains how to integrate APNs (PushKit/CallKit) and FCM to receive calls when the app is backgrounded or completely killed.

---

## 3. Shared Quick Start (React Native)

The call API is identical for both platforms. Here is a complete React Native example demonstrating runtime permissions, initialization, and basic call management.

```javascript
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, PermissionsAndroid, Platform } from 'react-native';
import PIOPIY from '@telecmi/piopiy-native';

// 1. Initialize the client
const piopiy = new PIOPIY({
  name: 'Mobile Agent',
  debug: true,
  ringTime: 40,
});

export default function App() {

  useEffect(() => {
    // 2. Attach Event Listeners
    piopiy.on('connected', () => console.log('connected'));
    piopiy.on('login', () => console.log('Signed in — ready for calls'));
    piopiy.on('loginFailed', (err) => console.error('Registration failed:', err));
    
    piopiy.on('inComingCall', (data) => {
      // data.from      — caller's number (always present)
      // data.name      — caller's display name, when the platform resolves one
      // data.team_name — team/queue that routed the call, when applicable
      const caller = data.name || data.from;
      console.log('Incoming call from:', data.team_name ? `${caller} — ${data.team_name}` : caller);
      // Answer or Reject the call:
      // piopiy.answer();
    });

    piopiy.on('ringing', (data) => console.log('Call ringing...', data));
    piopiy.on('answered', () => console.log('Call connected & active'));
    piopiy.on('ended', () => console.log('Call ended'));
    piopiy.on('error', (err) => console.error('Call error:', err));

    return () => {
      piopiy.removeAllListeners();
    };
  }, []);

  // 3. Request permissions & authenticate
  const handleLogin = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Voice calls require microphone access.',
          buttonPositive: 'OK',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('Microphone permission denied');
        return;
      }
    }

    // Sign in (see the regional endpoints table)
    piopiy.login('1001', 'password123', 'sbcind.telecmi.com');
  };

  const makeCall = () => {
    piopiy.call('13158050050'); // Place outgoing call (phone number or extension)
  };

  const endCall = () => {
    piopiy.terminate(); // Terminate current call
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleLogin} style={styles.button}>
        <Text style={styles.text}>1. Login</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={makeCall} style={styles.button}>
        <Text style={styles.text}>2. Call Number</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={endCall} style={[styles.button, styles.hangup]}>
        <Text style={styles.text}>3. Hang Up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  button: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 8, width: 200, alignItems: 'center' },
  hangup: { backgroundColor: '#f44336' },
  text: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
```

---

## 4. Speaker & Audio Routing

The SDK automatically integrates with `react-native-incall-manager` if installed. You can control speaker behavior dynamically using:

```javascript
piopiy.speaker(true);    // Route call audio to the device loudspeaker
piopiy.speaker(false);   // Route call audio to the earpiece/default output
const isSpeakerOn = piopiy.onSpeaker(); // Check current speaker state (boolean)
```

## 5. In-Call Controls

On React Native, **outgoing** calls are carried over SIP and **incoming** calls
are delivered by push and connected on answer. Most controls work on both;
a few act on the SIP session only and are currently no-ops on an incoming call:

| Control | Outgoing call | Incoming call |
| :--- | :---: | :---: |
| `answer()` / `reject()` | — | ✅ |
| `terminate()` (hang up) | ✅ | ✅ |
| `mute()` / `unMute()` / `onMute()` | ✅ | ✅ |
| `speaker(on)` / `onSpeaker()` | ✅ | ✅ |
| `sendDtmf(tone)` | ✅ | ⛔ not yet |
| `hold()` / `unHold()` / `onHold()` | ✅ | ⛔ not yet |
| `transfer()` / `teamTransfer()` / `merge()` | ✅ | ⛔ not yet |

Also note: `reject()` declines locally — the native call screen is dismissed and
the call is discarded on this device, but the caller keeps ringing until the
platform's no-answer timeout routes the call onward.

## 6. Voice-Only Layouts (No `<RTCView>` Required)

Because this is a **voice-only** SDK, remote and local audio tracks are automatically handled and mixed by the device's audio layer. You **do not** need to include or render any `<RTCView>` elements from `react-native-webrtc` in your React Native component tree.

---

## Troubleshooting

| Problem | Solution |
| :--- | :--- |
| **`Unable to resolve module @telecmi/piopiy-native`** | Re-run `npm install`, then restart Metro with a cleared cache (`npx react-native start --reset-cache`). |
| **Native module / WebRTC not found at launch** | The `react-native.config.js` from Step 1 is missing or incomplete. Add it, then re-run `pod install` (iOS) and rebuild. |
| **No remote audio on iOS Simulator** | The iOS Simulator does not support WebRTC microphone capture. You **must** run and test voice calls on a physical iOS device. |
| **`mediaFailed` event triggers** | The user did not grant microphone permission. Ensure you prompt for permission at runtime (Android) or verify the `NSMicrophoneUsageDescription` configuration in Xcode/`Info.plist` (iOS). |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
