/*
 * Copyright (c) 2016-2019 The CallKeep Authors (see the AUTHORS file)
 * SPDX-License-Identifier: ISC, MIT
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

package io.wazo.callkeep;
import com.facebook.react.bridge.LifecycleEventListener;
import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.app.KeyguardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Icon;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import android.telecom.CallAudioState;
import android.telecom.Connection;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.TelephonyManager;
import android.telephony.TelephonyCallback;
import android.telephony.PhoneStateListener;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Dynamic;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter;
import com.facebook.react.modules.permissions.PermissionsModule;

import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;

import org.json.JSONObject;
import org.json.JSONException;

import static androidx.core.app.ActivityCompat.requestPermissions;

import static io.wazo.callkeep.Constants.EXTRA_CALLER_NAME;
import static io.wazo.callkeep.Constants.EXTRA_CALL_UUID;
import static io.wazo.callkeep.Constants.EXTRA_CALL_NUMBER;
import static io.wazo.callkeep.Constants.EXTRA_HAS_VIDEO;
import static io.wazo.callkeep.Constants.EXTRA_SELF_MANAGED;
import static io.wazo.callkeep.Constants.EXTRA_IN_CALL_COMPONENT;
import static io.wazo.callkeep.Constants.EXTRA_CALL_KIND;
import static io.wazo.callkeep.Constants.EXTRA_PAYLOAD;
import static io.wazo.callkeep.Constants.ACTION_END_CALL;
import static io.wazo.callkeep.Constants.ACTION_ANSWER_CALL;
import static io.wazo.callkeep.Constants.ACTION_MUTE_CALL;
import static io.wazo.callkeep.Constants.ACTION_UNMUTE_CALL;
import static io.wazo.callkeep.Constants.ACTION_DTMF_TONE;
import static io.wazo.callkeep.Constants.ACTION_HOLD_CALL;
import static io.wazo.callkeep.Constants.ACTION_UNHOLD_CALL;
import static io.wazo.callkeep.Constants.ACTION_ONGOING_CALL;
import static io.wazo.callkeep.Constants.ACTION_AUDIO_SESSION;
import static io.wazo.callkeep.Constants.ACTION_CHECK_REACHABILITY;
import static io.wazo.callkeep.Constants.ACTION_WAKE_APP;
import static io.wazo.callkeep.Constants.ACTION_SHOW_INCOMING_CALL_UI;
import static io.wazo.callkeep.Constants.ACTION_ON_SILENCE_INCOMING_CALL;
import static io.wazo.callkeep.Constants.ACTION_ON_CREATE_CONNECTION_FAILED;
import static io.wazo.callkeep.Constants.ACTION_DID_CHANGE_AUDIO_ROUTE;

// @see https://github.com/kbagchiGWC/voice-quickstart-android/blob/9a2aff7fbe0d0a5ae9457b48e9ad408740dfb968/exampleConnectionService/src/main/java/com/twilio/voice/examples/connectionservice/VoiceConnectionServiceActivity.java
public class RNCallKeepModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    public static final int REQUEST_READ_PHONE_STATE = 1337;
    public static final int REQUEST_REGISTER_CALL_PROVIDER = 394859;

    public static RNCallKeepModule instance = null;

    private static final String E_ACTIVITY_DOES_NOT_EXIST = "E_ACTIVITY_DOES_NOT_EXIST";
    private static final String REACT_NATIVE_MODULE_NAME = "RNCallKeep";
    private static String[] permissions = {
        Build.VERSION.SDK_INT < 30 ? Manifest.permission.READ_PHONE_STATE : Manifest.permission.READ_PHONE_NUMBERS,
        Manifest.permission.CALL_PHONE,
        Manifest.permission.RECORD_AUDIO
    };

    private static final String TAG = "RNCallKeep";
    private static TelecomManager telecomManager;
    private LegacyCallStateListener legacyCallStateListener;
    private CallStateListener callStateListener;
    private static TelephonyManager telephonyManager;
    private static Promise hasPhoneAccountPromise;
    private ReactApplicationContext reactContext;
    public static PhoneAccountHandle handle;
    public static PhoneAccountHandle handleSelfManaged;
    private boolean isReceiverRegistered = false;
    private VoiceBroadcastReceiver voiceBroadcastReceiver;
    private static WritableMap _settings;
    private WritableNativeArray delayedEvents;
    private boolean hasListeners = false;
    private boolean hasActiveCall = false;

    public static RNCallKeepModule getInstance(ReactApplicationContext reactContext, boolean realContext) {
        if (instance == null) {
            Log.d(TAG, "[RNCallKeepModule] getInstance : " + (reactContext == null ? "null" : "ok"));
            instance = new RNCallKeepModule(reactContext);
            instance.registerReceiver();
            instance.fetchStoredSettings(reactContext);
        }
        if (realContext) {
            instance.setContext(reactContext);
        }
        return instance;
    }

    public static WritableMap getSettings(@Nullable Context context) {
        if (_settings == null) {
            fetchStoredSettings(context);
        }

        return _settings;
    }

    private RNCallKeepModule(ReactApplicationContext reactContext) {
        super(reactContext);
        // This line for listening to the Activity Lifecycle Events so we can end the calls onDestroy
        reactContext.addLifecycleEventListener(this);
        Log.d(TAG, "[RNCallKeepModule] constructor");

        this.reactContext = reactContext;
        delayedEvents = new WritableNativeArray();
    }

    // TWO SDKs, ONE MODULE: setup() overwrites the settings wholesale, so in an
    private boolean isSelfManaged() {
        try {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && _settings != null && _settings.hasKey("selfManaged") && _settings.getBoolean("selfManaged");
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public String getName() {
        return REACT_NATIVE_MODULE_NAME;
    }

    public void setContext(ReactApplicationContext reactContext) {
        Log.d(TAG, "[RNCallKeepModule] updating react context");
        this.reactContext = reactContext;
    }

    public ReactApplicationContext getContext() {
        return this.reactContext;
    }

    public void reportNewIncomingCall(String uuid, String number, String callerName, boolean hasVideo, String payload) {
        Log.d(TAG, "[RNCallKeepModule] reportNewIncomingCall, uuid: " + uuid + ", number: " + number + ", callerName: " + callerName);

        this.displayIncomingCall(uuid, number, callerName, hasVideo);

        // Send event to JS
        WritableMap args = Arguments.createMap();
        args.putString("handle", number);
        args.putString("callUUID", uuid);
        args.putString("name", callerName);
        args.putString("hasVideo", String.valueOf(hasVideo));
        if (payload != null) {
            args.putString("payload", payload);
        }
        sendEventToJS("RNCallKeepDidDisplayIncomingCall", args);
    }

    public void startObserving() {
        int count = delayedEvents.size();
        Log.d(TAG, "[RNCallKeepModule] startObserving, event count: " + count);
        if (count > 0) {
            this.reactContext.getJSModule(RCTDeviceEventEmitter.class).emit("RNCallKeepDidLoadWithEvents", delayedEvents);
            delayedEvents = new WritableNativeArray();
        }
    }

    public void initializeTelecomManager() {
        Context context = this.getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][initializeTelecomManager] no react context found.");
            return;
        }
        ComponentName cName = new ComponentName(context, VoiceConnectionService.class);
        String appName = this.getApplicationName(context);

        handle = new PhoneAccountHandle(cName, appName);
        handleSelfManaged = new PhoneAccountHandle(cName, appName + "_team");
        telecomManager = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
    }



     /**
       * Monitors and logs phone call activities, and shows the phone state
       */
     private class LegacyCallStateListener extends PhoneStateListener {

         @Override
         public void onCallStateChanged(int state, String incomingNumber) {
             switch (state) {
                 case TelephonyManager.CALL_STATE_RINGING:
                     // Incoming call is ringing (not used for outgoing call).
                     break;
                 case TelephonyManager.CALL_STATE_OFFHOOK:
                     // Phone call is active -- off the hook.
                      // Check if there is active call in native
                      boolean isInManagedCall = RNCallKeepModule.this.checkIsInManagedCall();

                      // Only let the JS side know if there is active app call & active native call
                      if(RNCallKeepModule.this.hasActiveCall && isInManagedCall){
                         WritableMap args = Arguments.createMap();
                         RNCallKeepModule.this.sendEventToJS("RNCallKeepHasActiveCall",args);
                      }else if(VoiceConnectionService.currentConnections.size() > 0){
                        // Will enter here for the first time to mark the app has active call
                         RNCallKeepModule.this.hasActiveCall = true;
                      }
                     break;
                 case TelephonyManager.CALL_STATE_IDLE:
                     // Phone is idle before and after phone call.
                     // If running on version older than 19 (KitKat),
                     // restart activity when phone call ends.
                     break;
                 default:
                     break;
             }
         }
    }

    private class CallStateListener extends TelephonyCallback implements TelephonyCallback.CallStateListener {

          @Override
          public void onCallStateChanged(int state) {
              switch (state) {
                  case TelephonyManager.CALL_STATE_RINGING:
                      // Incoming call is ringing (not used for outgoing call).
                      break;
                  case TelephonyManager.CALL_STATE_OFFHOOK:
                      // Phone call is active -- off the hook.

                      // Check if there is active call in native
                      boolean isInManagedCall = RNCallKeepModule.this.checkIsInManagedCall();

                      // Only let the JS side know if there is active app call & active native call
                      if(RNCallKeepModule.this.hasActiveCall && isInManagedCall){
                          WritableMap args = Arguments.createMap();
                          RNCallKeepModule.this.sendEventToJS("RNCallKeepHasActiveCall",args);
                      }else if(VoiceConnectionService.currentConnections.size() > 0){
                        // Will enter here for the first time to mark the app has active call
                          RNCallKeepModule.this.hasActiveCall = true;
                      }
                      break;
                  case TelephonyManager.CALL_STATE_IDLE:
                      // Phone is idle before and after phone call.
                      // If running on version older than 19 (KitKat),
                      // restart activity when phone call ends.
                      break;
                  default:
                      break;
              }
          }
    }

    public void stopListenToNativeCallsState() {
        Log.d(TAG, "[RNCallKeepModule] stopListenToNativeCallsState");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && callStateListener !=null){
            telephonyManager.unregisterTelephonyCallback(callStateListener);
        } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && legacyCallStateListener != null){
            telephonyManager.listen(legacyCallStateListener, PhoneStateListener.LISTEN_NONE);
            Looper.myLooper().quit();
        }
    }

    public void listenToNativeCallsState() {
        Log.d(TAG, "[RNCallKeepModule] listenToNativeCallsState");
        Context context = this.getAppContext();
        int permissionCheck = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE);

        if (permissionCheck == PackageManager.PERMISSION_GRANTED) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                  callStateListener = new CallStateListener();
                  telephonyManager.registerTelephonyCallback(context.getMainExecutor(),callStateListener);
            } else {
                  if (Looper.myLooper() == null) {
                    Looper.prepare();
                  }
                  legacyCallStateListener  = new LegacyCallStateListener();
                  telephonyManager.listen(legacyCallStateListener, PhoneStateListener.LISTEN_CALL_STATE);
                  Looper.loop();
            }
        }
    }

    public boolean checkIsInManagedCall() {
        Context context = this.getAppContext();
        int permissionCheck = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE);

        if (permissionCheck == PackageManager.PERMISSION_GRANTED) {
                return telecomManager.isInManagedCall();
        }
        return false;
    }

    @ReactMethod
    public void checkIsInManagedCall(Promise promise) {
        boolean isInManagedCall = this.checkIsInManagedCall();
        promise.resolve(isInManagedCall);
    }

    @ReactMethod
    public void setSettings(ReadableMap options) {
        Log.d(TAG, "[RNCallKeepModule] setSettings : " + options);
        if (options == null) {
            return;
        }
        _settings = storeSettings(options);
    }

    @ReactMethod
    public void addListener(String eventName) {
      // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
      // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void setup(ReadableMap options) {
        Log.d(TAG, "[RNCallKeepModule] setup : " + options);

        VoiceConnectionService.setAvailable(false);
        this.setSettings(options);

        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (isSelfManaged()) {
                Log.d(TAG, "[RNCallKeepModule] API Version supports self managed, and is enabled in setup");
            }
            else {
                Log.d(TAG, "[RNCallKeepModule] API Version supports self managed, but it is not enabled in setup");
            }
        }

        // If we're running in self managed mode we need fewer permissions.
        if(isSelfManaged()) {
            Log.d(TAG, "[RNCallKeepModule] setup, adding RECORD_AUDIO in permissions in self managed");
            permissions = new String[]{ Manifest.permission.RECORD_AUDIO };
        }

        if (isConnectionServiceAvailable()) {
            this.registerPhoneAccount(options);
            this.registerEvents();
            this.startObserving();
            VoiceConnectionService.setAvailable(true);
        }
    }

    @ReactMethod
    public void registerPhoneAccount(ReadableMap options) {
        setSettings(options);

        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] registerPhoneAccount ignored due to no ConnectionService");
            return;
        }

        Log.d(TAG, "[RNCallKeepModule] registerPhoneAccount");
        Context context = this.getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][registerPhoneAccount] no react context found.");
            return;
        }

        this.registerPhoneAccount(context);
    }

    @ReactMethod
    public void registerEvents() {
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] registerEvents ignored due to no ConnectionService");
            return;
        }

        Log.d(TAG, "[RNCallKeepModule] registerEvents");

        this.hasListeners = true;
        this.startObserving();
        VoiceConnectionService.setPhoneAccountHandle(handle);
    }

    @ReactMethod
    public void unregisterEvents() {
        Log.d(TAG, "[RNCallKeepModule] unregisterEvents");

        this.hasListeners = false;
    }

    // Not exported: TurboModule interop forbids duplicate @ReactMethod names.
    public void displayIncomingCall(String uuid, String number, String callerName) {
        this.displayIncomingCall(uuid, number, callerName, false, null);
    }

    // Not exported: TurboModule interop forbids duplicate @ReactMethod names
    // (the exported one is the selfManaged overload below).
    public void displayIncomingCall(String uuid, String number, String callerName, boolean hasVideo) {
        this.displayIncomingCall(uuid, number, callerName, hasVideo, false, null);
    }

    /** Process-start zombie purge, callable without a React context (the
     *  SDK's ContentProvider runs it before ANYTHING else in the process).
     *  A crash/kill mid-ring leaves a RINGING call in Telecom that re-asserts
     *  its ring the moment the ConnectionService rebinds — BEFORE JS init can
     *  sweep — and the stale full-screen UI then hijacks the next answer.
     *  At process start no local connection can exist, so any Telecom call on
     *  our account is a zombie; unregistering the account discards them and
     *  the SDK re-registers during its normal setup. */
    public static void purgeZombieTelecomAccount(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            if (!VoiceConnectionService.currentConnections.isEmpty()) return; // live call in this process
            ComponentName cName = new ComponentName(context, VoiceConnectionService.class);
            String appName = context.getApplicationInfo().loadLabel(context.getPackageManager()).toString();
            PhoneAccountHandle h = new PhoneAccountHandle(cName, appName);
            TelecomManager tm = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null) {
                // SELF-MANAGED accounts only — cycling a CALL_PROVIDER
                // account destroys its user enablement (incoming calls fail
                // until the user re-enables it). When the account can't be
                // inspected, do nothing: no cycling when in doubt.
                PhoneAccount acct = tm.getPhoneAccount(h);
                if (acct == null || (acct.getCapabilities() & PhoneAccount.CAPABILITY_SELF_MANAGED) == 0) return;
                tm.unregisterPhoneAccount(h);
                Log.d(TAG, "[RNCallKeepModule] purgeZombieTelecomAccount: account cycled at process start");
            }
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] purgeZombieTelecomAccount failed", t);
        }
    }

    /** ColorOS and others cap concurrent calls per self-managed account; a
     *  crash/kill that leaves a RINGING call in Telecom (no matching local
     *  connection) then makes the NEXT incoming call fail with
     *  onCreateIncomingConnectionFailed. If we hold no live local connections,
     *  any Telecom-side call is a zombie — cycling the account discards them. */
    private void sweepZombieCalls() {
        if (VoiceConnectionService.currentConnections.isEmpty() && handleSelfManaged != null) {
            try {
                telecomManager.unregisterPhoneAccount(handleSelfManaged);
                Log.d(TAG, "[RNCallKeepModule] sweepZombieCalls: self-managed account cycled");
            } catch (Throwable t) {
                Log.w(TAG, "[RNCallKeepModule] sweepZombieCalls failed", t);
            }
            try { registerPhoneAccount(this.getAppContext()); } catch (Throwable ignored) { }
        }
    }

    public void displayIncomingCall(String uuid, String number, String callerName, boolean hasVideo, @Nullable Bundle payload) {
        this.displayIncomingCall(uuid, number, callerName, hasVideo, false, payload);
    }

    /** React component the ring/in-call surface mounts for this call type.
     *  Video → videoInCallComponent; self-managed voice → voiceInCallComponent;
     *  system-managed voice → null (no app surface). Configurable via setup(). */
    private static String inCallComponent(boolean hasVideo, boolean selfManaged) {
        if (hasVideo) return settingString("videoInCallComponent", "ConnleInCallShell");
        if (selfManaged) return settingString("voiceInCallComponent", "PiopiyInCallShell");
        return null;
    }

    private static String settingString(String key, String def) {
        try {
            if (_settings != null && _settings.hasKey(key)) {
                String v = _settings.getString(key);
                if (v != null && !v.isEmpty()) return v;
            }
        } catch (Throwable ignored) { }
        return def;
    }

    /**
     * Exported overload (unique name): the New Architecture interop rejects
     * method overloading AND a `Bundle` parameter type, so this is the single
     * JS-facing entry — a Bundle-free 5-arg wrapper over the internal helper.
     * @param selfManaged per-call self-managed flag, INDEPENDENT of hasVideo.
     */
    @ReactMethod
    public void displayIncomingCallWithOptions(String uuid, String number, String callerName, boolean hasVideo, boolean selfManaged) {
        this.displayIncomingCall(uuid, number, callerName, hasVideo, selfManaged, null);
    }

    /**
     * Same as {@link #displayIncomingCallWithOptions} plus how the ring surface
     * should label the call: "contact" (1:1/PSTN) also shows the number,
     * "team" keeps the plain generic label, "video" says video.
     *
     * A separate @ReactMethod on purpose: the New Architecture rejects two
     * exports with the same name (and a Bundle parameter type), so this is a
     * flat 6-arg method rather than another displayIncomingCall overload.
     */
    @ReactMethod
    public void displayIncomingCallWithOptionsAndKind(String uuid, String number, String callerName, boolean hasVideo, boolean selfManaged, @Nullable String callKind) {
        this.displayIncomingCall(uuid, number, callerName, hasVideo, selfManaged, null, callKind);
    }

    /**
     * @param selfManaged per-call self-managed flag, INDEPENDENT of hasVideo, so
     *  a voice call can be self-managed while video still keys off hasVideo.
     *  When either is true the call uses the self-managed account and the app's
     *  own ring/in-call surfaces; the component mounted is chosen per type.
     */
    public void displayIncomingCall(String uuid, String number, String callerName, boolean hasVideo, boolean selfManaged, @Nullable Bundle payload) {
        displayIncomingCall(uuid, number, callerName, hasVideo, selfManaged, payload, null);
    }

    public void displayIncomingCall(String uuid, String number, String callerName, boolean hasVideo, boolean selfManaged, @Nullable Bundle payload, @Nullable String callKind) {
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] displayIncomingCall ignored due to no ConnectionService");
            return;
        }

        boolean useSelfManaged = selfManaged || hasVideo;
        PhoneAccountHandle targetHandle = (useSelfManaged && handleSelfManaged != null) ? handleSelfManaged : handle;

        if (targetHandle == handle && !hasPhoneAccount()) {
            Log.w(TAG, "[RNCallKeepModule] displayIncomingCall ignored due to no phone account");
            return;
        }

        Connection existing = VoiceConnectionService.getConnection(uuid);
        if (existing != null && (existing.getState() == Connection.STATE_ACTIVE || (existing instanceof VoiceConnection && ((VoiceConnection) existing).isAnswered()))) {
            Log.d(TAG, "[RNCallKeepModule] displayIncomingCall ignored — call is already answered/active: " + uuid);
            return;
        }

        Log.d(TAG, "[RNCallKeepModule] displayIncomingCall, uuid: " + uuid + ", number: " + number + ", callerName: " + callerName + ", hasVideo: " + hasVideo + ", selfManaged: " + useSelfManaged + ", targetHandle: " + targetHandle);

        Bundle extras = new Bundle();
        Uri uri = Uri.fromParts(PhoneAccount.SCHEME_TEL, number, null);

        extras.putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, uri);
        extras.putString(EXTRA_CALLER_NAME, callerName);
        extras.putString(EXTRA_CALL_UUID, uuid);
        extras.putString(EXTRA_HAS_VIDEO, String.valueOf(hasVideo));
        extras.putString(EXTRA_SELF_MANAGED, String.valueOf(useSelfManaged));
        String component = inCallComponent(hasVideo, useSelfManaged);
        if (component != null) {
            extras.putString(EXTRA_IN_CALL_COMPONENT, component);
        }
        if (payload != null) {
            extras.putBundle(EXTRA_PAYLOAD, payload);
        }
        // How the ring surface labels this call (see displayIncomingCallWithOptionsAndKind).
        if (callKind != null && !callKind.isEmpty()) {
            extras.putString(EXTRA_CALL_KIND, callKind);
        }
        if (useSelfManaged) {
            sweepZombieCalls(); // clear any orphaned RINGING calls first
        }
        // A RINGING connection that lingers blocks EVERY later call: Android
        // refuses the new one with MAX_RINGING_CALLS ("createConnectionFailed"),
        // so the agent sees no incoming call at all. A leftover RINGING
        // connection is always stale (the platform rings one call at a time per
        // agent) — drop it before the new call is added.
        sweepStaleRingingCalls();
        this.listenToNativeCallsState();
        telecomManager.addNewIncomingCall(targetHandle, extras);
    }

    /**
     * Drop leftover RINGING/DIALING connections before a new call is added.
     * Android allows only a couple of simultaneous ringing calls per phone
     * account (often ONE for a self-managed account) and refuses the next one
     * with MAX_RINGING_CALLS — so a single stale connection left behind by a
     * cancelled call silences every later incoming call.
     */
    private void sweepStaleRingingCalls() {
        try {
            ArrayList<Map.Entry<String, VoiceConnection>> stale =
                new ArrayList<Map.Entry<String, VoiceConnection>>(VoiceConnectionService.currentConnections.entrySet());
            for (Map.Entry<String, VoiceConnection> entry : stale) {
                Connection conn = entry.getValue();
                if (conn == null) continue;
                int state = conn.getState();
                if (state == Connection.STATE_RINGING || state == Connection.STATE_DIALING) {
                    Log.w(TAG, "[RNCallKeepModule] sweepStaleRingingCalls: dropping stale call " + entry.getKey());
                    try {
                        conn.onDisconnect();
                    } catch (Throwable t) {
                        Log.w(TAG, "[RNCallKeepModule] sweepStaleRingingCalls: onDisconnect failed: " + t);
                    }
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] sweepStaleRingingCalls failed: " + t);
        }
    }

    @ReactMethod
    public void answerIncomingCall(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] answerIncomingCall, uuid: " + uuid);
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] answerIncomingCall ignored due to no ConnectionService");
            return;
        }

        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] answerIncomingCall ignored because no connection found, uuid: " + uuid);
            return;
        }

        conn.onAnswer();
    }

    // Not exported: see displayIncomingCall note above.
    public void startCall(String uuid, String number, String callerName) {
        this.startCall(uuid, number, callerName, false, null);
    }

    @ReactMethod
    public void startCall(String uuid, String number, String callerName, boolean hasVideo) {
        this.startCall(uuid, number, callerName, hasVideo, null);
    }

    public void startCall(String uuid, String number, String callerName, boolean hasVideo, @Nullable Bundle payload) {
        Log.d(TAG, "[RNCallKeepModule] startCall called, uuid: " + uuid + ", number: " + number + ", callerName: " + callerName + ", payload: " + payload);

        if (!isConnectionServiceAvailable() || !hasPermissions() || number == null) {
            Log.w(TAG, "[RNCallKeepModule] startCall ignored: " + isConnectionServiceAvailable() + ", " + hasPermissions() + ", " + number);
            return;
        }

        Bundle extras = new Bundle();
        Uri uri = Uri.fromParts(PhoneAccount.SCHEME_TEL, number, null);

        Bundle callExtras = new Bundle();
        callExtras.putString(EXTRA_CALLER_NAME, callerName);
        callExtras.putString(EXTRA_CALL_UUID, uuid);
        callExtras.putString(EXTRA_CALL_NUMBER, number);
        callExtras.putString(EXTRA_HAS_VIDEO, String.valueOf(hasVideo));
        if (payload != null) {
            callExtras.putBundle(EXTRA_PAYLOAD, payload);
        }

        PhoneAccountHandle targetHandle = (hasVideo && handleSelfManaged != null) ? handleSelfManaged : handle;
        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, targetHandle);
        extras.putParcelable(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, callExtras);

        Log.d(TAG, "[RNCallKeepModule] startCall, uuid: " + uuid + ", targetHandle: " + targetHandle);
        this.listenToNativeCallsState();
        telecomManager.placeCall(uri, extras);
    }

    @ReactMethod
    public void endCall(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] endCall called, uuid: " + uuid);
        // A live connection is ours to tear down — the managed "calling
        // account" toggle must NOT gate this. A SELF-MANAGED call (per-call
        // `selfManaged` / `selfManagedVoice`) works while the managed account
        // is still disabled in Settings, and this guard used to abort the
        // teardown: the Telecom connection stayed RINGING forever, and
        // Android then refused the NEXT call with MAX_RINGING_CALLS — the
        // agent saw no incoming call at all.
        Connection conn = (uuid != null) ? VoiceConnectionService.getConnection(uuid) : null;
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] endCall ignored because no connection found, uuid: " + uuid);
            return;
        }
        Context context = this.getAppContext();
        AudioManager audioManager = (AudioManager) context.getSystemService(context.AUDIO_SERVICE);
        audioManager.setMode(0);
        conn.onDisconnect();
        this.stopListenToNativeCallsState();
        this.hasActiveCall = false;
        Log.d(TAG, "[RNCallKeepModule] endCall executed, uuid: " + uuid);
    }

    @ReactMethod
    public void endAllCalls() {
        Log.d(TAG, "[RNCallKeepModule] endAllCalls called");
        // Same as endCall(): never let the managed-account toggle block the
        // teardown — a stale RINGING connection blocks every later call.
        ArrayList<Map.Entry<String, VoiceConnection>> connections =
            new ArrayList<Map.Entry<String, VoiceConnection>>(VoiceConnectionService.currentConnections.entrySet());
        for (Map.Entry<String, VoiceConnection> connectionEntry : connections) {
            Connection connectionToEnd = connectionEntry.getValue();
            try {
                connectionToEnd.onDisconnect();
            } catch (Throwable t) {
                Log.w(TAG, "[RNCallKeepModule] endAllCalls: onDisconnect failed: " + t);
            }
        }
        this.stopListenToNativeCallsState();
        this.hasActiveCall = false;
        Log.d(TAG, "[RNCallKeepModule] endAllCalls executed");
    }

    @ReactMethod
    public void checkPhoneAccountPermission(ReadableArray optionalPermissions, Promise promise) {
        Activity currentActivity = this.getCurrentReactActivity();

        if (!isConnectionServiceAvailable()) {
            String error = "ConnectionService not available for this version of Android.";
            Log.w(TAG, "[RNCallKeepModule] checkPhoneAccountPermission error " + error);
            promise.reject(E_ACTIVITY_DOES_NOT_EXIST, error);
            return;
        }
        if (currentActivity == null) {
            String error = "Activity doesn't exist";
            Log.w(TAG, "[RNCallKeepModule] checkPhoneAccountPermission error " + error);
            promise.reject(E_ACTIVITY_DOES_NOT_EXIST, error);
            return;
        }
        String[] optionalPermsArr = new String[optionalPermissions.size()];
        for (int i = 0; i < optionalPermissions.size(); i++) {
            optionalPermsArr[i] = optionalPermissions.getString(i);
        }

        final String[] allPermissions = Arrays.copyOf(permissions, permissions.length + optionalPermsArr.length);
        System.arraycopy(optionalPermsArr, 0, allPermissions, permissions.length, optionalPermsArr.length);

        hasPhoneAccountPromise = promise;

        if (!this.hasPermissions()) {
            WritableArray allPermissionaw = Arguments.createArray();
            for (String allPermission : allPermissions) {
               allPermissionaw.pushString(allPermission);
            }

            this.reactContext
                .getNativeModule(PermissionsModule.class)
                .requestMultiplePermissions(allPermissionaw, new Promise() {
                    @Override
                    public void resolve(@Nullable Object value) {
                        WritableMap grantedPermission = (WritableMap) value;
                        int[] grantedResult = new int[allPermissions.length];
                        for (int i=0; i<allPermissions.length; ++i) {
                            String perm = allPermissions[i];
                            grantedResult[i] = grantedPermission.getString(perm).equals("granted")
                                ? PackageManager.PERMISSION_GRANTED
                                : PackageManager.PERMISSION_DENIED;
                        }
                        RNCallKeepModule.onRequestPermissionsResult(REQUEST_READ_PHONE_STATE, allPermissions, grantedResult);
                    }

                    @Override
                    public void reject(String code, String message) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, Throwable throwable) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, String message, Throwable throwable) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(Throwable throwable) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(Throwable throwable, WritableMap userInfo) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, @NonNull WritableMap userInfo) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, Throwable throwable, WritableMap userInfo) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, String message, @NonNull WritableMap userInfo) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String code, String message, Throwable throwable, WritableMap userInfo) {
                        hasPhoneAccountPromise.resolve(false);
                    }

                    @Override
                    public void reject(String message) {
                        hasPhoneAccountPromise.resolve(false);
                    }
            });
            return;
        }

        promise.resolve(!hasPhoneAccount());
    }

    @ReactMethod
    public void checkDefaultPhoneAccount(Promise promise) {
        if (!isConnectionServiceAvailable() || !hasPhoneAccount()) {
            promise.resolve(true);
            return;
        }

        if (!Build.MANUFACTURER.equalsIgnoreCase("Samsung")) {
            promise.resolve(true);
            return;
        }

        boolean hasSim = telephonyManager.getSimState() != TelephonyManager.SIM_STATE_ABSENT;
        boolean hasDefaultAccount = telecomManager.getDefaultOutgoingPhoneAccount("tel") != null;

        promise.resolve(!hasSim || hasDefaultAccount);
    }

    @ReactMethod
    public void getInitialEvents(Promise promise) {
        promise.resolve(delayedEvents);
    }

    @ReactMethod
    public void clearInitialEvents() {
        delayedEvents = new WritableNativeArray();
    }

    @ReactMethod
    public void setOnHold(String uuid, boolean shouldHold) {
        Log.d(TAG, "[RNCallKeepModule] setOnHold, uuid: " + uuid + ", shouldHold: " + (shouldHold ? "true" : "false"));

        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] setOnHold ignored because no connection found, uuid: " + uuid);
            return;
        }

        if (shouldHold == true) {
            conn.onHold();
        } else {
            conn.onUnhold();
        }
    }

    @ReactMethod
    public void setActivityShowWhenLocked(boolean show) {
        android.app.Activity activity = getCurrentReactActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    activity.setShowWhenLocked(show);
                    activity.setTurnScreenOn(show);
                }
            } catch (Throwable t) {
                Log.w(TAG, "[RNCallKeepModule] setActivityShowWhenLocked failed", t);
            }
        });
    }

    @ReactMethod
    public void reportEndCallWithUUID(String uuid, int reason) {
        Log.d(TAG, "[RNCallKeepModule] reportEndCallWithUUID, uuid: " + uuid + ", reason: " + reason);
        IncomingCallNotification.cancel(getReactApplicationContext(), uuid);
        if (!isConnectionServiceAvailable()) {
            return;
        }

        VoiceConnection conn = (VoiceConnection) VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] reportEndCallWithUUID ignored because no connection found, uuid: " + uuid);
            return;
        }
        conn.reportDisconnect(reason);

        this.stopListenToNativeCallsState();
    }

   @Override
   public void onHostResume() {

   }

   @Override
   public void onHostPause() {

   }

   @Override
   public void onHostDestroy() {
       // When activity destroyed end all calls
       Log.d(TAG, "[RNCallKeepModule] onHostDestroy called");
       if (!isConnectionServiceAvailable()) {
           Log.w(TAG, "[RNCallKeepModule] onHostDestroy ignored — ConnectionService not available");
           return;
       }

       ArrayList<Map.Entry<String, VoiceConnection>> connections =
           new ArrayList<Map.Entry<String, VoiceConnection>>(VoiceConnectionService.currentConnections.entrySet());
       for (Map.Entry<String, VoiceConnection> connectionEntry : connections) {
           Connection connectionToEnd = connectionEntry.getValue();
           connectionToEnd.onDisconnect();
       }
       this.stopListenToNativeCallsState();
       Log.d(TAG, "[RNCallKeepModule] onHostDestroy executed");
       // Upstream killed the process here ("after ending all calls") — fatal
       // for a push-wake calling app: it tears down the FCM handler chain and
       // fires on ANY React host teardown (including our second in-call
       // surface). Calls are ended above; the OS reclaims the process itself.
   }

    @ReactMethod
    public void rejectCall(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] rejectCall, uuid: " + uuid);
        // The connection's presence is the real condition: a self-managed call
        // is live even while the managed calling account is switched off, and
        // blocking the reject left the Telecom call RINGING (which then made
        // Android refuse every later call with MAX_RINGING_CALLS).
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] rejectCall ignored because no connection found, uuid: " + uuid);
            return;
        }
        this.stopListenToNativeCallsState();
        conn.onReject();
    }

    @ReactMethod
    public void setConnectionState(String uuid, int state) {
        Log.d(TAG, "[RNCallKeepModule] setConnectionState, uuid: " + uuid + ", state :" + state);
        // setState() itself checks that the connection exists — no account
        // toggle may block it (a self-managed call has no managed account).
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] setConnectionState ignored — ConnectionService not available");
            return;
        }

        VoiceConnectionService.setState(uuid, state);
    }

    @ReactMethod
    public void setMutedCall(String uuid, boolean shouldMute) {
        Log.d(TAG, "[RNCallKeepModule] setMutedCall, uuid: " + uuid + ", shouldMute: " + (shouldMute ? "true" : "false"));
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] setMutedCall ignored because no connection found, uuid: " + uuid);
            return;
        }

        CallAudioState newAudioState = null;
        //if the requester wants to mute, do that. otherwise unmute
        if (shouldMute) {
            newAudioState = new CallAudioState(true, conn.getCallAudioState().getRoute(),
                    conn.getCallAudioState().getSupportedRouteMask());
        } else {
            newAudioState = new CallAudioState(false, conn.getCallAudioState().getRoute(),
                    conn.getCallAudioState().getSupportedRouteMask());
        }
        conn.onCallAudioStateChanged(newAudioState);
    }
    /**
     * toggle audio route for speaker via connection service function
     * @param uuid
     * @param routeSpeaker
     */
    @ReactMethod
    public void toggleAudioRouteSpeaker(String uuid, boolean routeSpeaker) {
        Log.d(TAG, "[RNCallKeepModule] toggleAudioRouteSpeaker, uuid: " + uuid + ", routeSpeaker: " + (routeSpeaker ? "true" : "false"));
        VoiceConnection conn = (VoiceConnection) VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] toggleAudioRouteSpeaker ignored because no connection found, uuid: " + uuid);
            return;
        }
        if (routeSpeaker) {
            conn.setAudioRoute(CallAudioState.ROUTE_SPEAKER);
        } else {
            conn.setAudioRoute(CallAudioState.ROUTE_EARPIECE);
        }
    }

    @ReactMethod
    public void setAudioRoute(String uuid, String audioRoute, Promise promise){
        try {
            VoiceConnection conn = (VoiceConnection) VoiceConnectionService.getConnection(uuid);
            if (conn == null) {
                return;
            }
            if(audioRoute.equals("Bluetooth")) {
                Log.d(TAG,"[RNCallKeepModule] setting audio route: Bluetooth");
                conn.setAudioRoute(CallAudioState.ROUTE_BLUETOOTH);
                promise.resolve(true);
                return;
            }
            if(audioRoute.equals("Headset")) {
                Log.d(TAG,"[RNCallKeepModule] setting audio route: Headset");
                conn.setAudioRoute(CallAudioState.ROUTE_WIRED_HEADSET);
                promise.resolve(true);
                return;
            }
            if(audioRoute.equals("Speaker")) {
                Log.d(TAG,"[RNCallKeepModule] setting audio route: Speaker");
                conn.setAudioRoute(CallAudioState.ROUTE_SPEAKER);
                promise.resolve(true);
                return;
            }
            Log.d(TAG,"[RNCallKeepModule] setting audio route: Wired/Earpiece");
            conn.setAudioRoute(CallAudioState.ROUTE_WIRED_OR_EARPIECE);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SetAudioRoute", e.getMessage());
        }
    }

    @ReactMethod
    public void getAudioRoutes(Promise promise){
        try {
            Context context = this.getAppContext();
            if (context == null) {
                Log.w(TAG, "[RNCallKeepModule][getAudioRoutes] no react context found.");
                promise.reject("No react context found to list audio routes");
                return;
            }
            AudioManager audioManager = (AudioManager) context.getSystemService(context.AUDIO_SERVICE);
            WritableArray devices = Arguments.createArray();
            ArrayList<String> typeChecker = new ArrayList<>();
            AudioDeviceInfo[] audioDeviceInfo = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS + AudioManager.GET_DEVICES_OUTPUTS);
            String selectedAudioRoute = getSelectedAudioRoute(audioManager);
            for (AudioDeviceInfo device : audioDeviceInfo){
                String type = getAudioRouteType(device.getType());
                if(type != null && !typeChecker.contains(type)) {
                    WritableMap deviceInfo = Arguments.createMap();
                    deviceInfo.putString("name",  type);
                    deviceInfo.putString("type",  type);
                    if(type.equals(selectedAudioRoute)) {
                        deviceInfo.putBoolean("selected",  true);
                    }
                    typeChecker.add(type);
                    devices.pushMap(deviceInfo);
                }
            }
            promise.resolve(devices);
        } catch(Exception e) {
            promise.reject("GetAudioRoutes Error", e.getMessage());
        }
    }

    private String getAudioRouteType(int type){
        switch (type){
            case(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP):
            case(AudioDeviceInfo.TYPE_BLUETOOTH_SCO):
                return "Bluetooth";
            case(AudioDeviceInfo.TYPE_WIRED_HEADPHONES):
            case(AudioDeviceInfo.TYPE_WIRED_HEADSET):
                return "Headset";
            case(AudioDeviceInfo.TYPE_BUILTIN_MIC):
                return "Phone";
            case(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER):
                return "Speaker";
            default:
                return null;
        }
    }

    private String getSelectedAudioRoute(AudioManager audioManager){
        if(audioManager.isBluetoothScoOn()){
            return "Bluetooth";
        }
        if(audioManager.isSpeakerphoneOn()){
            return "Speaker";
        }
        if(audioManager.isWiredHeadsetOn()){
            return "Headset";
        }
        return "Phone";
    }

    @ReactMethod
    public void sendDTMF(String uuid, String key) {
        Log.d(TAG, "[RNCallKeepModule] sendDTMF, uuid: " + uuid + ", key: " + key);
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] sendDTMF ignored because no connection found, uuid: " + uuid);
            return;
        }
        char dtmf = key.charAt(0);
        conn.onPlayDtmfTone(dtmf);
    }

    @ReactMethod
    public void updateDisplay(String uuid, String displayName, String uri) {
        Log.d(TAG, "[RNCallKeepModule] updateDisplay, uuid: " + uuid + ", displayName: " + displayName+ ", uri: " + uri);
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] updateDisplay ignored because no connection found, uuid: " + uuid);
            return;
        }

        conn.setAddress(Uri.parse(uri), TelecomManager.PRESENTATION_ALLOWED);
        conn.setCallerDisplayName(displayName, TelecomManager.PRESENTATION_ALLOWED);
    }

    @ReactMethod
    public void updateIncomingCallName(String uuid, String callerName) {
        Log.d(TAG, "[RNCallKeepModule] updateIncomingCallName, uuid: " + uuid + ", name: " + callerName);
        if (uuid == null || callerName == null || callerName.trim().isEmpty()) return;
        Context context = getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule] updateIncomingCallName ignored — no app context");
            return;
        }
        // The ring notification's title (updated in place: no new heads-up).
        IncomingCallNotification.updateCallerName(context, uuid, callerName);
        // ...and the full-screen ring surface, if it is showing: a broadcast
        // (NOT startActivity — that would launch the call screen on an
        // unlocked device, where the banner is the only ring UI).
        try {
            Intent update = new Intent(IncomingCallActivity.ACTION_UPDATE_NAME);
            update.setPackage(context.getPackageName());
            update.putExtra(IncomingCallActivity.EXTRA_NAME, callerName);
            update.putExtra(Constants.EXTRA_CALL_UUID, uuid);
            context.sendBroadcast(update);
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] updateIncomingCallName broadcast failed: " + t);
        }
        // ...and the OS call UI, when one is showing.
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn != null) {
            try {
                conn.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED);
            } catch (Throwable t) {
                Log.w(TAG, "[RNCallKeepModule] setCallerDisplayName failed: " + t);
            }
        }
    }

    /**
     * Route the app's call audio to the loudspeaker (true) or back to the
     * default route (false).
     *
     * On Android 12+ (API 31) the legacy {@code AudioManager.setSpeakerphoneOn()}
     * is deprecated and IGNORED for apps that are not the default dialer — the
     * app asks for the loudspeaker, the system logs "preferredCommunicationDevice:
     * speaker", and the WebRTC audio never leaves the earpiece. The modern way is
     * to set the COMMUNICATION DEVICE explicitly; "off" clears it, so a connected
     * headset wins again and the earpiece is the fallback.
     */
    @ReactMethod
    public void setSpeakerOn(boolean on) {
        Log.d(TAG, "[RNCallKeepModule] setSpeakerOn, on: " + on);
        try {
            Context context = getAppContext();
            if (context == null) {
                Log.w(TAG, "[RNCallKeepModule] setSpeakerOn ignored — no app context");
                return;
            }
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                Log.w(TAG, "[RNCallKeepModule] setSpeakerOn ignored — no audio service");
                return;
            }
            String before = describeCommunicationDevice(am);
            if (Build.VERSION.SDK_INT >= 31) {
                // Android 12+: the communication device has to be requested as
                // an AudioDeviceInfo. Look it up in the FULL output device list:
                // getAvailableCommunicationDevices() only lists the devices that
                // are currently available for communication and on many phones
                // (Samsung) it does NOT contain the built-in speaker — the
                // lookup came up empty and the call silently stayed on the
                // earpiece.
                if (on) {
                    AudioDeviceInfo speaker = findOutputDevice(am, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
                    if (speaker != null) {
                        am.setCommunicationDevice(speaker);
                        Log.d(TAG, "[RNCallKeepModule] setSpeakerOn: communication device -> " + speaker.getProductName());
                    } else {
                        Log.w(TAG, "[RNCallKeepModule] setSpeakerOn: no built-in speaker in the output devices");
                        am.setSpeakerphoneOn(true);
                    }
                } else {
                    // Clear the explicit choice: the system then routes to a
                    // connected headset, or the earpiece.
                    am.clearCommunicationDevice();
                }
            } else {
                am.setSpeakerphoneOn(on);
            }
            Log.d(TAG, "[RNCallKeepModule] setSpeakerOn done, route " + before + " -> " + describeCommunicationDevice(am));
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] setSpeakerOn failed: " + t);
        }
    }

    /** Find an output device by type in the FULL device list (the built-in
     *  speaker and earpiece are there; getAvailableCommunicationDevices() does
     *  not list them on every device). */
    private static AudioDeviceInfo findOutputDevice(AudioManager am, int type) {
        try {
            for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                if (d.getType() == type) return d;
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** The current communication device, for the logs ("speaker" / "earpiece" / …). */    private static String describeCommunicationDevice(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo info = am.getCommunicationDevice();
                if (info == null) return "default";
                switch (info.getType()) {
                    case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "speaker";
                    case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "earpiece";
                    case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                    case AudioDeviceInfo.TYPE_USB_HEADSET: return "headset";
                    case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "bluetooth";
                    default: return "type" + info.getType();
                }
            }
            return am.isSpeakerphoneOn() ? "speaker" : "earpiece";
        } catch (Throwable t) {
            return "unknown";
        }
    }

    @ReactMethod
    public void hasPhoneAccount(Promise promise) {
        if (telecomManager == null) {
            this.initializeTelecomManager();
        }

        promise.resolve(hasPhoneAccount());
    }

    @ReactMethod
    public void hasOutgoingCall(Promise promise) {
        promise.resolve(VoiceConnectionService.hasOutgoingCall);
    }

    @ReactMethod
    public void hasPermissions(Promise promise) {
        promise.resolve(this.hasPermissions());
    }

    @ReactMethod
    public void setAvailable(Boolean active) {
        VoiceConnectionService.setAvailable(active);
    }

    @ReactMethod
    public void setForegroundServiceSettings(ReadableMap foregroundServerSettings) {
        if (foregroundServerSettings == null) {
            return;
        }

        // Retrieve settings and set the `foregroundService` value
        WritableMap settings = getSettings(null);
        if (settings != null) {
            settings.putMap("foregroundService", MapUtils.readableToWritableMap(foregroundServerSettings));
        }

        setSettings(settings);
    }

    @ReactMethod
    public void canMakeMultipleCalls(Boolean allow) {
        VoiceConnectionService.setCanMakeMultipleCalls(allow);
    }

    @ReactMethod
    public void setReachable() {
        VoiceConnectionService.setReachable();
    }

    @ReactMethod
    public void setCurrentCallActive(String uuid) {
        Log.d(TAG, "[RNCallKeepModule] setCurrentCallActive, uuid: " + uuid);
        Connection conn = VoiceConnectionService.getConnection(uuid);
        if (conn == null) {
            Log.w(TAG, "[RNCallKeepModule] setCurrentCallActive ignored because no connection found, uuid: " + uuid);
            return;
        }

        conn.setConnectionCapabilities(conn.getConnectionCapabilities() | Connection.CAPABILITY_HOLD);
        conn.setActive();
    }

    @ReactMethod
    public void openPhoneAccounts() {
        Log.d(TAG, "[RNCallKeepModule] openPhoneAccounts");
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] openPhoneAccounts ignored due to no ConnectionService");
            return;
        }

        if (Build.MANUFACTURER.equalsIgnoreCase("Samsung") || Build.MANUFACTURER.equalsIgnoreCase("OnePlus")) {
            Intent intent = new Intent();
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
            intent.setComponent(new ComponentName("com.android.server.telecom",
                    "com.android.server.telecom.settings.EnableAccountPreferenceActivity"));

            Context context = this.getAppContext();
            if (context == null) {
                Log.w(TAG, "[RNCallKeepModule][openPhoneAccounts] no react context found.");
                return;
            }

            context.startActivity(intent);
            return;
        }

        openPhoneAccountSettings();
    }

    @ReactMethod
    public void openPhoneAccountSettings() {
        Log.d(TAG, "[RNCallKeepModule] openPhoneAccountSettings");
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] openPhoneAccountSettings ignored due to no ConnectionService");
            return;
        }

        Intent intent = new Intent(TelecomManager.ACTION_CHANGE_PHONE_ACCOUNTS);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        Context context = this.getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][openPhoneAccountSettings] no react context found.");
            return;
        }
        context.startActivity(intent);
    }

    public static Boolean isConnectionServiceAvailable() {
        // PhoneAccount is available since api level 23
        return Build.VERSION.SDK_INT >= 23;
    }

    @ReactMethod
    public void isConnectionServiceAvailable(Promise promise) {
        promise.resolve(isConnectionServiceAvailable());
    }

    @ReactMethod
    public void checkPhoneAccountEnabled(Promise promise) {
        promise.resolve(hasPhoneAccount());
    }

    /** Is the app's own UI what the user is looking at right now? (A resumed,
     *  focused React activity on an unlocked screen.) When true, the app UI
     *  owns the call; the SDK call screen is for every other state. */
    public static boolean isAppUiForeground() {
        try {
            if (instance == null) return false;
            Activity activity = instance.getCurrentReactActivity();
            if (activity == null || !activity.hasWindowFocus()) return false;
            KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
            return km == null || !km.isKeyguardLocked();
        } catch (Throwable t) {
            return false;
        }
    }

    /** Bring up the SDK's in-call screen for an answered call. The Connle app
     *  wants this native/default screen for every answered incoming call,
     *  including when the React app is already foregrounded. */
    @ReactMethod
    public void showInCallScreen(String uuid, String callerName) {
        Context context = getAppContext();
        if (context == null || uuid == null) return;
        try {
            Intent intent = new Intent(context, IncomingCallActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra(Constants.EXTRA_CALL_UUID, uuid);
            intent.putExtra(IncomingCallActivity.EXTRA_NAME, callerName);
            intent.putExtra(IncomingCallActivity.EXTRA_ANSWERED, true);
            try {
                Connection conn = VoiceConnectionService.getConnection(uuid);
                if (conn != null && conn.getExtras() != null) {
                    String comp = conn.getExtras().getString(EXTRA_IN_CALL_COMPONENT);
                    if (comp != null) intent.putExtra(EXTRA_IN_CALL_COMPONENT, comp);
                }
            } catch (Throwable ignored) { }
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] showInCallScreen failed", t);
        }
    }

    @ReactMethod
    public void closeInCallScreen() {
        Context context = getAppContext();
        if (context == null) return;
        try {
            Intent close = new Intent(IncomingCallActivity.ACTION_FORCE_CLOSE);
            close.setPackage(context.getPackageName());
            context.sendBroadcast(close);
        } catch (Throwable t) {
            Log.w(TAG, "[RNCallKeepModule] closeInCallScreen failed", t);
        }
    }

    @ReactMethod
    public void backToForeground() {
        Context context = getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][backToForeground] no react context found.");
            return;
        }
        // The SDK's in-call screen is THE call UI: while it is up, launching
        // the app would bury it — and resuming a ReactActivity while the
        // screen holds the React host's lifecycle crashes the process on that
        // activity's next pause ("Pausing an activity that is not the current
        // activity").
        if (IncomingCallActivity.isShellAnswering()) {
            Log.d(TAG, "[RNCallKeepModule] backToForeground skipped — in-call screen is up");
            return;
        }
        String packageName = context.getApplicationContext().getPackageName();
        Intent focusIntent = context.getPackageManager().getLaunchIntentForPackage(packageName).cloneFilter();
        Activity activity = getCurrentReactActivity();
        boolean isOpened = activity != null;
        Log.d(TAG, "[RNCallKeepModule] backToForeground, app isOpened ?" + (isOpened ? "true" : "false"));

        if (isOpened) {
            focusIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            activity.startActivity(focusIntent);
        } else {
            focusIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK +
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED +
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD +
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);

            getReactApplicationContext().startActivity(focusIntent);
        }
    }

    public static void onRequestPermissionsResult(int requestCode, String[] grantedPermissions, int[] grantResults) {
        int permissionsIndex = 0;
        List<String> permsList = Arrays.asList(permissions);
        for (int result : grantResults) {
            if (permsList.contains(grantedPermissions[permissionsIndex]) && result != PackageManager.PERMISSION_GRANTED) {
                hasPhoneAccountPromise.resolve(false);
                return;
            }
            permissionsIndex++;
        }
        hasPhoneAccountPromise.resolve(true);
    }

    public Activity getCurrentReactActivity() {
        return this.reactContext.getCurrentActivity();
    }

    private void registerPhoneAccount(Context appContext) {
        if (!isConnectionServiceAvailable()) {
            Log.w(TAG, "[RNCallKeepModule] registerPhoneAccount ignored due to no ConnectionService");
            return;
        }

        this.initializeTelecomManager();
        Context context = this.getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][registerPhoneAccount] no react context found.");
            return;
        }
        String appName = this.getApplicationName(context);

        // 1. Register Self-Managed PhoneAccount (for Internal Team Video/Voice Calls -> Custom notification / InCall activity)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (handleSelfManaged == null) {
                ComponentName cName = new ComponentName(context, VoiceConnectionService.class);
                handleSelfManaged = new PhoneAccountHandle(cName, appName + "_team");
            }
            if (VoiceConnectionService.currentConnections.isEmpty()) {
                try {
                    telecomManager.unregisterPhoneAccount(handleSelfManaged);
                } catch (Throwable ignored) { }
            }
            PhoneAccount.Builder selfManagedBuilder = new PhoneAccount.Builder(handleSelfManaged, appName);
            selfManagedBuilder.setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED | PhoneAccount.CAPABILITY_SUPPORTS_VIDEO_CALLING);
            if (_settings != null && _settings.hasKey("imageName")) {
                int identifier = appContext.getResources().getIdentifier(_settings.getString("imageName"), "drawable", appContext.getPackageName());
                Icon icon = Icon.createWithResource(appContext, identifier);
                selfManagedBuilder.setIcon(icon);
            }
            try {
                telecomManager.registerPhoneAccount(selfManagedBuilder.build());
                Log.d(TAG, "[RNCallKeepModule] Registered self-managed team phone account: " + handleSelfManaged);
            } catch (Throwable t) {
                Log.w(TAG, "[RNCallKeepModule] Failed to register self-managed team phone account", t);
            }
        }

        // 2. Register System-Managed PhoneAccount (for Contact Voice Calls -> Default Phone App)
        PhoneAccount.Builder managedBuilder = new PhoneAccount.Builder(handle, appName);
        managedBuilder.setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER);
        if (_settings != null && _settings.hasKey("imageName")) {
            int identifier = appContext.getResources().getIdentifier(_settings.getString("imageName"), "drawable", appContext.getPackageName());
            Icon icon = Icon.createWithResource(appContext, identifier);
            managedBuilder.setIcon(icon);
        }
        PhoneAccount managedAccount = managedBuilder.build();
        telephonyManager = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
        try {
            telecomManager.registerPhoneAccount(managedAccount);
            Log.d(TAG, "[RNCallKeepModule] Registered system-managed contact phone account: " + handle);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "[RNCallKeepModule] phone account kind changed — re-registering", e);
            try {
                telecomManager.unregisterPhoneAccount(handle);
                telecomManager.registerPhoneAccount(managedAccount);
            } catch (Throwable t) {
                Log.e(TAG, "[RNCallKeepModule] phone account re-registration failed", t);
            }
        }
    }

    public void sendEventToJS(String eventName, @Nullable WritableMap params) {
        boolean isBoundToJS = this.reactContext.hasActiveCatalystInstance();
        Log.v(TAG, "[RNCallKeepModule] sendEventToJS, eventName: " + eventName + ", bound: " + isBoundToJS + ", hasListeners: " + hasListeners + " args : " + (params != null ? params.toString() : "null"));

        if (isBoundToJS && hasListeners) {
            this.reactContext.getJSModule(RCTDeviceEventEmitter.class).emit(eventName, params);
        } else {
            WritableMap data = Arguments.createMap();
            if (params == null) {
                params = Arguments.createMap();
            }

            data.putString("name", eventName);
            data.putMap("data", params);
            delayedEvents.pushMap(data);
        }
    }

    private String getApplicationName(Context appContext) {
        ApplicationInfo applicationInfo = appContext.getApplicationInfo();
        int stringId = applicationInfo.labelRes;

        return stringId == 0 ? applicationInfo.nonLocalizedLabel.toString() : appContext.getString(stringId);
    }

    private Boolean hasPermissions() {
        ReactApplicationContext context = getContext();

        boolean hasPermissions = true;
        for (String permission : permissions) {
            int permissionCheck = ContextCompat.checkSelfPermission(context, permission);
            if (permissionCheck != PackageManager.PERMISSION_GRANTED) {
                hasPermissions = false;
            }
        }

        return hasPermissions;
    }

    private boolean hasPhoneAccount() {
        if (telecomManager == null) {
            this.initializeTelecomManager();
        }

        if (isSelfManaged()) {
            return true;
        }

        return isConnectionServiceAvailable() && telecomManager != null &&
            hasPermissions() && telecomManager.getPhoneAccount(handle) != null &&
            telecomManager.getPhoneAccount(handle).isEnabled();
    }

    /**
     * True when this app can still own and tear down a call.
     *
     * The managed "calling account" toggle (Settings → Calling accounts) must
     * NOT block a SELF-MANAGED call: self-managed accounts are enabled by
     * default and are what this SDK routes calls through (per-call
     * `selfManaged`, or `selfManagedVoice` for voice). Gating the teardown on
     * the MANAGED account left the Telecom connection — and the foreground
     * service it started — alive after hangup/decline, so Android kept showing
     * its own "&lt;app&gt; is running" notification in the shade.
     */
    private boolean hasUsablePhoneAccount() {
        if (isSelfManaged()) {
            return true;
        }
        if (hasPhoneAccount()) {
            return true;
        }
        // A self-managed account is registered by registerPhoneAccount() and is
        // ENABLED BY DEFAULT — it needs no user toggle. Do NOT query it with
        // getPhoneAccount(): that needs READ_PHONE_NUMBERS and throws a
        // SecurityException on apps that only hold READ_PHONE_STATE (which
        // used to make every teardown look "unavailable" and leave the Telecom
        // connection RINGING — Android then refused the next call with
        // MAX_RINGING_CALLS).
        try {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && handleSelfManaged != null;
        } catch (Throwable ignored) { }
        return false;
    }

    protected void registerReceiver() {
        if (!isReceiverRegistered) {
            isReceiverRegistered = true;
            voiceBroadcastReceiver = new VoiceBroadcastReceiver();
            IntentFilter intentFilter = new IntentFilter();
            intentFilter.addAction(ACTION_END_CALL);
            intentFilter.addAction(ACTION_ANSWER_CALL);
            intentFilter.addAction(ACTION_MUTE_CALL);
            intentFilter.addAction(ACTION_UNMUTE_CALL);
            intentFilter.addAction(ACTION_DTMF_TONE);
            intentFilter.addAction(ACTION_UNHOLD_CALL);
            intentFilter.addAction(ACTION_HOLD_CALL);
            intentFilter.addAction(ACTION_ONGOING_CALL);
            intentFilter.addAction(ACTION_AUDIO_SESSION);
            intentFilter.addAction(ACTION_CHECK_REACHABILITY);
            intentFilter.addAction(ACTION_SHOW_INCOMING_CALL_UI);
            intentFilter.addAction(ACTION_ON_SILENCE_INCOMING_CALL);
            intentFilter.addAction(ACTION_ON_CREATE_CONNECTION_FAILED);
            intentFilter.addAction(ACTION_DID_CHANGE_AUDIO_ROUTE);

            if (this.reactContext != null) {
                LocalBroadcastManager.getInstance(this.reactContext).registerReceiver(voiceBroadcastReceiver, intentFilter);


                VoiceConnectionService.startObserving();
            } else {
                isReceiverRegistered = false;
            }
        }
    }

    private Context getAppContext() {
        return this.reactContext != null ? this.reactContext.getApplicationContext() : null;
    }

    // Store all callkeep settings in JSON
    private WritableMap storeSettings(ReadableMap options) {
        Context context = getAppContext();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][storeSettings] no react context found.");
            return MapUtils.readableToWritableMap(options);
        }

        SharedPreferences sharedPref = context.getSharedPreferences("rn-callkeep", Context.MODE_PRIVATE);
        try {
            JSONObject jsonObject = MapUtils.convertMapToJson(options);
            String jsonString = jsonObject.toString();
            sharedPref.edit().putString("settings", jsonString).apply();
        } catch (JSONException e) {
            Log.w(TAG, "[RNCallKeepModule][storeSettings] exception: " + e);
        }
        return MapUtils.readableToWritableMap(options);
    }

    protected static void fetchStoredSettings(@Nullable Context fromContext) {
        if (instance == null && fromContext == null) {
            Log.w(TAG, "[RNCallKeepModule][fetchStoredSettings] no instance nor fromContext.");
            return;
        }
        Context context = fromContext != null ? fromContext : instance.getAppContext();
        _settings = new WritableNativeMap();
        if (context == null) {
            Log.w(TAG, "[RNCallKeepModule][fetchStoredSettings] no react context found.");
            return;
        }

        SharedPreferences sharedPref = context.getSharedPreferences("rn-callkeep", Context.MODE_PRIVATE);
        try {
            String jsonString = sharedPref.getString("settings", (new JSONObject()).toString());
            if (jsonString != null) {
                JSONObject jsonObject = new JSONObject(jsonString);

                _settings = MapUtils.convertJsonToMap(jsonObject);
            }
        } catch(JSONException e) {
        }
    }

    private class VoiceBroadcastReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            WritableMap args = Arguments.createMap();
            HashMap<String, String> attributeMap = (HashMap<String, String>)intent.getSerializableExtra("attributeMap");

            Log.d(TAG, "[RNCallKeepModule][onReceive] " + intent.getAction());

            switch (intent.getAction()) {
                case ACTION_END_CALL:
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepPerformEndCallAction", args);
                    break;
                case ACTION_ANSWER_CALL:
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putBoolean("withVideo", Boolean.valueOf(attributeMap.get(EXTRA_HAS_VIDEO)));
                    sendEventToJS("RNCallKeepPerformAnswerCallAction", args);
                    break;
                case ACTION_HOLD_CALL:
                    args.putBoolean("hold", true);
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepDidToggleHoldAction", args);
                    break;
                case ACTION_UNHOLD_CALL:
                    args.putBoolean("hold", false);
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepDidToggleHoldAction", args);
                    break;
                case ACTION_MUTE_CALL:
                    args.putBoolean("muted", true);
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepDidPerformSetMutedCallAction", args);
                    break;
                case ACTION_UNMUTE_CALL:
                    args.putBoolean("muted", false);
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepDidPerformSetMutedCallAction", args);
                    break;
                case ACTION_DTMF_TONE:
                    args.putString("digits", attributeMap.get("DTMF"));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    sendEventToJS("RNCallKeepDidPerformDTMFAction", args);
                    break;
                case ACTION_ONGOING_CALL:
                    args.putString("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putString("name", attributeMap.get(EXTRA_CALLER_NAME));
                    sendEventToJS("RNCallKeepDidReceiveStartCallAction", args);
                    break;
                case ACTION_AUDIO_SESSION:
                    sendEventToJS("RNCallKeepDidActivateAudioSession", null);
                    break;
                case ACTION_CHECK_REACHABILITY:
                    sendEventToJS("RNCallKeepCheckReachability", null);
                    break;
                case ACTION_SHOW_INCOMING_CALL_UI:
                    args.putString("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putString("name", attributeMap.get(EXTRA_CALLER_NAME));
                    args.putString("hasVideo", attributeMap.get(EXTRA_HAS_VIDEO));
                    sendEventToJS("RNCallKeepShowIncomingCallUi", args);
                    break;
                case ACTION_WAKE_APP:
                    Intent headlessIntent = new Intent(reactContext, RNCallKeepBackgroundMessagingService.class);
                    headlessIntent.putExtra("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    headlessIntent.putExtra("name", attributeMap.get(EXTRA_CALLER_NAME));
                    headlessIntent.putExtra("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    Log.d(TAG, "[RNCallKeepModule] wakeUpApplication: " + attributeMap.get(EXTRA_CALL_UUID) + ", number : " + attributeMap.get(EXTRA_CALL_NUMBER) + ", displayName:" + attributeMap.get(EXTRA_CALLER_NAME));

                    ComponentName name = reactContext.startService(headlessIntent);
                    if (name != null) {
                        HeadlessJsTaskService.acquireWakeLockNow(reactContext);
                    }
                    break;
                case ACTION_ON_SILENCE_INCOMING_CALL:
                    args.putString("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putString("name", attributeMap.get(EXTRA_CALLER_NAME));
                    sendEventToJS("RNCallKeepOnSilenceIncomingCall", args);
                    break;
                case ACTION_ON_CREATE_CONNECTION_FAILED:
                    args.putString("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putString("name", attributeMap.get(EXTRA_CALLER_NAME));
                    sendEventToJS("RNCallKeepOnIncomingConnectionFailed", args);
                    break;
                case ACTION_DID_CHANGE_AUDIO_ROUTE:
                    args.putString("handle", attributeMap.get(EXTRA_CALL_NUMBER));
                    args.putString("callUUID", attributeMap.get(EXTRA_CALL_UUID));
                    args.putString("output", attributeMap.get("output"));
                    sendEventToJS("RNCallKeepDidChangeAudioRoute", args);
                    break;
            }
        }
    }
}
