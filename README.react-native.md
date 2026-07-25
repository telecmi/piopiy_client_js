# PIOPIY SDK — React Native Setup

**Platforms:** 📱 iOS · 🤖 Android

This is the unified landing page for setting up the `@telecmi/piopiy-native` WebRTC voice SDK in a **bare React Native** application. 

Under the hood, the SDK uses WebRTC to register with the TeleCMI SBC (Session Border Controller), allowing you to make and receive high-quality voice calls to PSTN numbers, SIP extensions, and app-to-app configurations.

---

## 1. Install

```bash
npm install @telecmi/piopiy-native react-native-callkeep react-native-incall-manager
```

| Package | Purpose |
| :--- | :--- |
| `@telecmi/piopiy-native` | The PIOPIY SDK — ships its own native WebRTC engine. |
| `react-native-callkeep` | Native incoming-call UI (CallKit / ConnectionService). |
| `react-native-incall-manager` | Audio routing (speaker, ringback, earpiece). |

Create a `react-native.config.js` at your project root (registers the SDK's engine for autolinking):

```javascript
// react-native.config.js
module.exports = {
  dependencies: {
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
  },
};
```

Then install pods:

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
    piopiy.on('connected', () => console.log('SBC connected'));
    piopiy.on('login', () => console.log('Successfully registered with SBC'));
    piopiy.on('loginFailed', (err) => console.error('Registration failed:', err));
    
    piopiy.on('inComingCall', (data) => {
      console.log('Incoming call from:', data.from);
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

    // Connect to SBC (regional domain)
    piopiy.login('1001', 'password123', 'sbcind.telecmi.com');
  };

  const makeCall = () => {
    piopiy.call('13158050050'); // Place outgoing call (PSTN or extension)
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

## 5. Voice-Only Layouts (No `<RTCView>` Required)

Because this is a **voice-only** SDK, remote and local audio tracks are automatically handled and mixed by the device's audio layer. You **do not** need to include or render any `<RTCView>` elements from `react-native-webrtc` in your React Native component tree.

---

## Troubleshooting

| Problem | Solution |
| :--- | :--- |
| **`Unable to resolve module @telecmi/piopiy-native`** | Re-run `npm install`, then restart Metro with a cleared cache (`npx react-native start --reset-cache`). |
| **Native module errors at launch (LiveKit / WebRTC)** | Make sure `react-native.config.js` registers `@livekit/react-native` and `@livekit/react-native-webrtc` (Step 1), then re-run `pod install` and rebuild. |
| **No remote audio on iOS Simulator** | The iOS Simulator does not support WebRTC microphone capture. You **must** run and test voice calls on a physical iOS device. |
| **`mediaFailed` event triggers** | The user did not grant microphone permission. Ensure you prompt for permission at runtime (Android) or verify the `NSMicrophoneUsageDescription` configuration in Xcode/`Info.plist` (iOS). |

---

## License

Apache-2.0 © [TeleCMI](https://telecmi.com)
