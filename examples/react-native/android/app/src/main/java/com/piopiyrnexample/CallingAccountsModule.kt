package com.piopiyrnexample

import android.content.ComponentName
import android.content.Intent
import android.telecom.TelecomManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Opens the system "Calling accounts" screen so the user can enable this app's
 * PhoneAccount. Needed on Realme / OPPO (ODialer), where the generic
 * ACTION_CHANGE_PHONE_ACCOUNTS intent is swallowed and the Settings entry is
 * hidden. The explicit Telecom activity is what `adb shell am start -n` uses,
 * and it is also what react-native-callkeep targets — but only for
 * Samsung/OnePlus. This module makes it available on every OEM from the app.
 *
 * The SDK (callkeep.native.js) detects this module by name and routes its own
 * openPhoneAccounts()/first-run prompt through it when present. Apps that do
 * not add it keep the previous behaviour.
 */
class CallingAccountsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun open(promise: Promise) {
    val context = reactApplicationContext
    // Try the explicit Telecom activity first (works on Realme/OPPO/vivo where
    // the generic action does nothing), then the documented generic action.
    val attempts: List<Intent> = listOf(
      Intent().setComponent(
        ComponentName(
          "com.android.server.telecom",
          "com.android.server.telecom.settings.EnableAccountPreferenceActivity",
        ),
      ),
      Intent(TelecomManager.ACTION_CHANGE_PHONE_ACCOUNTS),
    )
    for (intent in attempts) {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        promise.resolve(true)
        return
      } catch (_: Throwable) {
        // Not exported / not found / not permitted — try the next attempt.
      }
    }
    promise.resolve(false)
  }

  companion object {
    const val NAME = "PiopiyCallingAccounts"
  }
}
