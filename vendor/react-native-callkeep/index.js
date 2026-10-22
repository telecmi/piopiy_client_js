import { NativeModules, Platform, Alert } from 'react-native';

import { listeners, emit } from './actions';

const RNCallKeepModule = NativeModules.RNCallKeep;
const isIOS = Platform.OS === 'ios';
const supportConnectionService = !isIOS && Platform.Version >= 23;

const AudioSessionCategoryOption = {
  mixWithOthers: 0x1,
  duckOthers: 0x2,
  interruptSpokenAudioAndMixWithOthers: 0x11,
  allowBluetooth: 0x4,
  allowBluetoothA2DP: 0x20,
  allowAirPlay: 0x40,
  defaultToSpeaker: 0x8,
  overrideMutedMicrophoneInterruption: 0x80,
}

const AudioSessionMode = {
  default: 'AVAudioSessionModeDefault',
  gameChat: 'AVAudioSessionModeGameChat',
  measurement: 'AVAudioSessionModeMeasurement',
  moviePlayback: 'AVAudioSessionModeMoviePlayback',
  spokenAudio: 'AVAudioSessionModeSpokenAudio',
  videoChat: 'AVAudioSessionModeVideoChat',
  videoRecording: 'AVAudioSessionModeVideoRecording',
  voiceChat: 'AVAudioSessionModeVoiceChat',
  voicePrompt: 'AVAudioSessionModeVoicePrompt',
}

const CONSTANTS = {
  END_CALL_REASONS: {
    FAILED: 1,
    REMOTE_ENDED: 2,
    UNANSWERED: 3,
    ANSWERED_ELSEWHERE: 4,
    DECLINED_ELSEWHERE: isIOS ? 5 : 2, // make declined elsewhere link to "Remote ended" on android because that's kinda true
    MISSED: isIOS ? 2 : 6,
  },
};

export { emit, CONSTANTS, AudioSessionCategoryOption, AudioSessionMode };

class EventListener {
  constructor(type, listener, callkeep) {
    this._type = type;
    this._listener = listener;
    this._callkeep = callkeep;
  }

  remove = () => {
    this._callkeep.removeEventListener(this._type, this._listener);
  };
}

class RNCallKeep {
  constructor() {
    this._callkeepEventHandlers = new Map();
  }

  addEventListener = (type, handler) => {
    const listener = listeners[type](handler);

    const listenerSet = this._callkeepEventHandlers.get(type) ?? new Set();
    listenerSet.add(listener);

    this._callkeepEventHandlers.set(type, listenerSet);

    return new EventListener(type, listener, this);
  };

  removeEventListener = (type, listener = undefined) => {
    const listenerSet = this._callkeepEventHandlers.get(type);
    if (!listenerSet) {
      return;
    }

    if (listener) {
      listenerSet.delete(listener);
      listener.remove();
      if (listenerSet.size <= 0) {
        this._callkeepEventHandlers.delete(type);
      }
    } else {
      listenerSet.forEach((listener) => {
        listener.remove();
      });
      this._callkeepEventHandlers.delete(type);
    }
  };

  setup = async (options) => {
    if (!isIOS) {
      return this._setupAndroid(options.android);
    }

    return this._setupIOS(options.ios);
  };

  setSettings = (settings) => RNCallKeepModule.setSettings(settings[isIOS ? 'ios' : 'android']);

  registerPhoneAccount = (options) => {
    if (isIOS) {
      return;
    }
    RNCallKeepModule.registerPhoneAccount(options.android);
  };

  registerAndroidEvents = () => {
    if (isIOS) {
      return;
    }
    RNCallKeepModule.registerEvents();
  };

  unregisterAndroidEvents = () => {
    if (isIOS) {
      return;
    }
    RNCallKeepModule.unregisterEvents();
  };

  hasDefaultPhoneAccount = async (options) => {
    if (!isIOS) {
      return this._hasDefaultPhoneAccount(options);
    }

    return;
  };

  displayIncomingCall = (
    uuid,
    handle,
    localizedCallerName = '',
    handleType = 'number',
    hasVideo = false,
    options = null
  ) => {
    if (!isIOS) {
      // selfManaged (per call, independent of hasVideo) puts the call on the
      // self-managed account so the app shows its own ring/in-call surfaces.
      const selfManaged = !!(options && options.selfManaged);
      // How the ring surface labels the call ("contact" | "team" | "video").
      // Only the app knows team vs contact, so it rides the same options bag.
      const callKind = options && options.callKind ? String(options.callKind) : '';
      if (callKind && typeof RNCallKeepModule.displayIncomingCallWithOptionsAndKind === 'function') {
        RNCallKeepModule.displayIncomingCallWithOptionsAndKind(uuid, handle, localizedCallerName, hasVideo, selfManaged, callKind);
      } else {
        RNCallKeepModule.displayIncomingCallWithOptions(uuid, handle, localizedCallerName, hasVideo, selfManaged);
      }
      return;
    }

    // should be boolean type value
    let supportsHolding = !!(options?.ios?.supportsHolding ?? true);
    let supportsDTMF = !!(options?.ios?.supportsDTMF ?? true);
    let supportsGrouping = !!(options?.ios?.supportsGrouping ?? true);
    let supportsUngrouping = !!(options?.ios?.supportsUngrouping ?? true);

    RNCallKeepModule.displayIncomingCall(
      uuid,
      handle,
      handleType,
      hasVideo,
      localizedCallerName,
      supportsHolding,
      supportsDTMF,
      supportsGrouping,
      supportsUngrouping
    );
  };

  checkIsInManagedCall = async () => isIOS? false: RNCallKeepModule.checkIsInManagedCall();

  answerIncomingCall = (uuid) => {
    RNCallKeepModule.answerIncomingCall(uuid);
  };

  startCall = (uuid, handle, contactIdentifier, handleType = 'number', hasVideo = false) => {
    if (!isIOS) {
      RNCallKeepModule.startCall(uuid, handle, contactIdentifier, hasVideo);
      return;
    }

    RNCallKeepModule.startCall(uuid, handle, contactIdentifier, handleType, hasVideo);
  };

  checkPhoneAccountEnabled = async () => {
    if (isIOS) {
      return;
    }

    return RNCallKeepModule.checkPhoneAccountEnabled();
  };

  isConnectionServiceAvailable = async () => {
    if (isIOS) {
      return true;
    }

    return RNCallKeepModule.isConnectionServiceAvailable();
  };

  reportConnectingOutgoingCallWithUUID = (uuid) => {
    //only available on iOS
    if (isIOS) {
      RNCallKeepModule.reportConnectingOutgoingCallWithUUID(uuid);
    }
  };

  reportConnectedOutgoingCallWithUUID = (uuid) => {
    //only available on iOS
    if (isIOS) {
      RNCallKeepModule.reportConnectedOutgoingCallWithUUID(uuid);
    }
  };

  reportEndCallWithUUID = (uuid, reason) => RNCallKeepModule.reportEndCallWithUUID(uuid, reason);

  /*
   * Android explicitly states we reject a call
   * On iOS we just notify of an endCall
   */
  rejectCall = (uuid) => {
    if (!isIOS) {
      RNCallKeepModule.rejectCall(uuid);
    } else {
      RNCallKeepModule.endCall(uuid);
    }
  };

  isCallActive = async (uuid) => await RNCallKeepModule.isCallActive(uuid);

  getCalls = () => {
    if (isIOS) {
      return RNCallKeepModule.getCalls();
    }
  };

  endCall = (uuid) => RNCallKeepModule.endCall(uuid);

  endAllCalls = () => RNCallKeepModule.endAllCalls();

  supportConnectionService = () => supportConnectionService;

  hasPhoneAccount = async () => (isIOS ? true : await RNCallKeepModule.hasPhoneAccount());

  hasOutgoingCall = async () => (isIOS ? null : await RNCallKeepModule.hasOutgoingCall());

  setMutedCall = (uuid, shouldMute) => {
    RNCallKeepModule.setMutedCall(uuid, shouldMute);
  };

  sendDTMF = (uuid, key) => RNCallKeepModule.sendDTMF(uuid, key);
  /**
   * @description when Phone call is active, Android control the audio service via connection service. so this function help to toggle the audio to Speaker or wired/ear-piece or vice-versa
   * @param {*} uuid
   * @param {*} routeSpeaker
   * @returns Audio route state of audio service
   */
  toggleAudioRouteSpeaker = (uuid, routeSpeaker) => isIOS ? null : RNCallKeepModule.toggleAudioRouteSpeaker(uuid, routeSpeaker);

  getAudioRoutes = () => RNCallKeepModule.getAudioRoutes();

  setAudioRoute = (uuid, inputName) => RNCallKeepModule.setAudioRoute(uuid, inputName);

  checkIfBusy = () =>
    isIOS ? RNCallKeepModule.checkIfBusy() : Promise.reject('RNCallKeep.checkIfBusy was called from unsupported OS');

  checkSpeaker = () =>
    isIOS ? RNCallKeepModule.checkSpeaker() : Promise.reject('RNCallKeep.checkSpeaker was called from unsupported OS');

  setAvailable = (state) => {
    if (isIOS) {
      return;
    }

    // Tell android that we are able to make outgoing calls
    RNCallKeepModule.setAvailable(state);
  };

  setForegroundServiceSettings = (settings) => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.setForegroundServiceSettings(settings);
  };

  canMakeMultipleCalls = (state) => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.canMakeMultipleCalls(state);
  };

  setCurrentCallActive = (callUUID) => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.setCurrentCallActive(callUUID);
  };

  showInCallScreen = (uuid, callerName = 'In call') => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.showInCallScreen(uuid, callerName);
  };

  closeInCallScreen = () => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.closeInCallScreen();
  };

  setActivityShowWhenLocked = (show) => {
    if (isIOS) {
      return;
    }

    RNCallKeepModule.setActivityShowWhenLocked(show);
  };

  updateDisplay = (uuid, displayName, handle, options = null) => {
    if (!isIOS) {
      RNCallKeepModule.updateDisplay(uuid, displayName, handle);
      return;
    }

    let iosOptions = {};
    if (options && options.ios) {
      iosOptions = {
        ...options.ios,
      };
    }
    RNCallKeepModule.updateDisplay(uuid, displayName, handle, iosOptions);
  };

  /**
   * Update the caller name of a RINGING call — e.g. a name the app resolved
   * from its own contacts database, since the platform only knows the
   * caller's number. The ring notification is updated IN PLACE (same tag+id):
   * no new heads-up, no second ringtone, and the Answer/Decline actions keep
   * working. The OS call UI (when one is showing) is updated too.
   */
  updateIncomingCallName = (uuid, callerName) => {
    if (!uuid || !callerName) return;
    RNCallKeepModule.updateIncomingCallName(uuid, callerName);
  };

  /**
   * Route the app's call audio to the loudspeaker (true) or back to the
   * default route (false). On Android 12+ this sets the COMMUNICATION DEVICE
   * explicitly — the legacy setSpeakerphoneOn() is ignored for apps that are
   * not the default dialer, so the WebRTC audio would stay on the earpiece.
   */
  setSpeakerOn = (on) => {
    RNCallKeepModule.setSpeakerOn(!!on);
  };

  setOnHold = (uuid, shouldHold) => RNCallKeepModule.setOnHold(uuid, shouldHold);

  setConnectionState = (uuid, state) => isIOS ? null : RNCallKeepModule.setConnectionState(uuid, state);

  setReachable = () => RNCallKeepModule.setReachable();

  // @deprecated
  reportUpdatedCall = (uuid, localizedCallerName) => {
    console.warn('RNCallKeep.reportUpdatedCall is deprecated, use RNCallKeep.updateDisplay instead');

    return isIOS
      ? RNCallKeepModule.reportUpdatedCall(uuid, localizedCallerName)
      : Promise.reject('RNCallKeep.reportUpdatedCall was called from unsupported OS');
  };

  _setupIOS = async (options) =>
    new Promise((resolve, reject) => {
      if (!options.appName) {
        reject('RNCallKeep.setup: option "appName" is required');
      }
      if (typeof options.appName !== 'string') {
        reject('RNCallKeep.setup: option "appName" should be of type "string"');
      }

      resolve(RNCallKeepModule.setup(options));
    });

  _setupAndroid = async (options) => {
    RNCallKeepModule.setup(options);

    // Skip the managed-account "enable in Settings" prompt when the app uses
    // the self-managed account (globally, or for voice via selfManagedVoice):
    // self-managed accounts are enabled by default and need no toggle. Also
    // skipped on request (skipAccountAlert) for apps whose calls ALL go through
    // the self-managed account (e.g. per-call selfManaged by hasVideo): the
    // managed account stays registered but unused, so the prompt is only noise.
    if (options.selfManaged || options.selfManagedVoice || options.skipAccountAlert) {
      return false;
    }

    const showAccountAlert = await RNCallKeepModule.checkPhoneAccountPermission(options.additionalPermissions || []);
    const shouldOpenAccounts = await this._alert(options, showAccountAlert);

    if (shouldOpenAccounts) {
      RNCallKeepModule.openPhoneAccounts();
      return true;
    }

    return false;
  };

  _hasDefaultPhoneAccount = async (options) => {
    const hasDefault = await RNCallKeepModule.checkDefaultPhoneAccount();
    const shouldOpenAccounts = await this._alert(options, hasDefault);

    if (shouldOpenAccounts) {
      RNCallKeepModule.openPhoneAccountSettings();
    }
  };

  _alert = async (options, condition) =>
    new Promise((resolve, reject) => {
      if (!condition) {
        return resolve(false);
      }

      Alert.alert(
        options.alertTitle,
        options.alertDescription,
        [
          {
            text: options.cancelButton,
            onPress: reject,
            style: 'cancel',
          },
          { text: options.okButton, onPress: () => resolve(true) },
        ],
        { cancelable: true },
      );
    });

  backToForeground() {
    if (isIOS) {
      return;
    }

    NativeModules.RNCallKeep.backToForeground();
  }

  getInitialEvents() {
    return RNCallKeepModule.getInitialEvents();
  }

  clearInitialEvents() {
    return RNCallKeepModule.clearInitialEvents();
  }
}

export default new RNCallKeep();
