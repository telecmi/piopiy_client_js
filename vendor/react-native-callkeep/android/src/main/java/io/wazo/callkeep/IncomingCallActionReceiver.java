package io.wazo.callkeep;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telecom.Connection;
import android.util.Log;

/**
 * Answer/Decline taps from the self-managed incoming-call notification.
 * Drives the Telecom connection exactly like the system call screen would:
 * onAnswer()/onReject() flow into the normal RNCallKeep JS events.
 */
public class IncomingCallActionReceiver extends BroadcastReceiver {

    private static final String TAG = "RNCallKeep";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String uuid = intent.getStringExtra(Constants.EXTRA_CALL_UUID);
        Log.d(TAG, "[IncomingCallActionReceiver] " + action + " uuid: " + uuid);
        if (uuid == null) return;

        IncomingCallNotification.cancel(context, uuid);

        Connection connection = VoiceConnectionService.getConnection(uuid);
        if (connection == null) {
            Log.w(TAG, "[IncomingCallActionReceiver] no connection for " + uuid);
            return;
        }

        try {
            if (IncomingCallNotification.ACTION_NOTIFICATION_ANSWER.equals(action)) {
                connection.onAnswer();
                // App UI focused: the call stays in the app. Otherwise open
                // the SDK's in-call screen (with an active self-managed call
                // the app is exempt from background-start restrictions).
                if (!RNCallKeepModule.isAppUiForeground()) {
                    Intent inCall = new Intent(context, IncomingCallActivity.class);
                    inCall.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    inCall.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                    inCall.putExtra(IncomingCallActivity.EXTRA_NAME, intent.getStringExtra(IncomingCallActivity.EXTRA_NAME));
                    inCall.putExtra(IncomingCallActivity.EXTRA_ANSWERED, true);
                    String comp = intent.getStringExtra(Constants.EXTRA_IN_CALL_COMPONENT);
                    if (comp != null) inCall.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, comp);
                    context.startActivity(inCall);
                }
            } else if (IncomingCallNotification.ACTION_NOTIFICATION_DECLINE.equals(action)) {
                connection.onReject();
            }
        } catch (Throwable t) {
            Log.e(TAG, "[IncomingCallActionReceiver] action failed", t);
        }
    }
}
