package io.wazo.callkeep;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * The app's own incoming-call notification, used in SELF-MANAGED mode where
 * Android shows no system call UI at all (the WhatsApp model): a full-screen,
 * ringing, high-priority notification with Answer/Decline actions that drive
 * the Telecom connection exactly like the system screen would have.
 *
 * On Android 12+ this renders as the platform's CallStyle notification —
 * visually identical to how WhatsApp/Telegram ring.
 */
public class IncomingCallNotification {

    private static final String TAG = "RNCallKeep";
    private static final String CHANNEL_ID = "callkeep_incoming_v2";
    /**
     * Same ring, but IMPORTANCE_DEFAULT: it sounds and vibrates, yet can never
     * become a heads-up banner (that requires IMPORTANCE_HIGH). Used while the
     * app presents the full-screen call surface itself, so a locked device gets
     * ONE incoming-call UI instead of the call screen plus a popup on top of it.
     *
     * Must be a NEW id: Android ignores importance changes to a channel that
     * already exists (the user's/system's setting wins), so re-purposing
     * CHANNEL_ID would leave every installed device on HIGH.
     */
    private static final String CHANNEL_ID_CALL_SCREEN = "callkeep_incoming_callscreen_v1";

    public static final String ACTION_NOTIFICATION_ANSWER = "io.wazo.callkeep.NOTIFICATION_ANSWER";
    public static final String ACTION_NOTIFICATION_DECLINE = "io.wazo.callkeep.NOTIFICATION_DECLINE";

    private static final String NOTIF_TAG = "connle_incoming_call";

    // The ring currently on screen, kept so the caller name can be updated in
    // place later (an app that resolves the name from its own contacts DB).
    private static String lastUuid;
    private static String lastNumber;
    private static String lastLabel;
    private static String lastComponent;
    private static boolean lastWithCallScreen;
    private static boolean lastLocked;

    private static int notificationId(String uuid) {
        return uuid == null ? 0 : uuid.hashCode();
    }

    /** "mani kandan" -> "Mani Kandan" — server identities arrive lowercase. */
    static String titleCase(String s) {
        if (s == null || s.isEmpty()) return s;
        StringBuilder b = new StringBuilder(s.length());
        boolean up = true;
        for (char c : s.toCharArray()) {
            b.append(up && Character.isLetter(c) ? Character.toUpperCase(c) : c);
            up = (c == ' ' || c == '-' || c == '.');
        }
        return b.toString();
    }

    /** Remove EVERY incoming-call notification this library ever posted —
     *  they are ongoing (unswipeable), and a process death mid-ring orphans
     *  them until someone cleans up. Called before showing a new ring and at
     *  app start. */
    public static void cancelAll(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            // Close ANY showing IncomingCallActivity too (no uuid = global):
            // when a new ring replaces an old one, the old full-screen UI must
            // not stay on top or its Answer button answers a dead call.
            context.sendBroadcast(new Intent(IncomingCallActivity.ACTION_CLOSE)
                    .setPackage(context.getPackageName()));
        } catch (Throwable ignored) { }
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (NOTIF_TAG.equals(sbn.getTag())) {
                    nm.cancel(NOTIF_TAG, sbn.getId());
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "[IncomingCallNotification] cancelAll failed", t);
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(buildCallChannel(CHANNEL_ID, "Incoming calls",
                    NotificationManager.IMPORTANCE_HIGH));
        }
        // Created independently of the check above: on an already-installed app
        // CHANNEL_ID exists (HIGH), so this one has to be created fresh to get a
        // different importance — see CHANNEL_ID_CALL_SCREEN.
        if (nm.getNotificationChannel(CHANNEL_ID_CALL_SCREEN) == null) {
            nm.createNotificationChannel(buildCallChannel(CHANNEL_ID_CALL_SCREEN,
                    "Incoming calls (call screen)", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    /** Ring + vibration + lock-screen visibility, at the given importance. */
    private static NotificationChannel buildCallChannel(String id, String name, int importance) {
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription("Incoming call alerts");
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(ringtone, attrs);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 1000, 800, 1000, 800});
        // The ring must be fully visible ON the lock screen.
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        return channel;
    }

    public static boolean isDeviceLocked(Context context) {
        if (context == null) return false;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            boolean isInteractive = pm != null && pm.isInteractive();
            KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            boolean isKeyguardLocked = km != null && km.isKeyguardLocked();
            return !isInteractive || isKeyguardLocked;
        } catch (Throwable t) {
            return false;
        }
    }

    /** Wake the screen directly — no full-screen-intent permission involved.
     *  FSI is deny-by-default on several OEMs (and silently reset on uid
     *  changes); a call ring cannot depend on it. The deprecated flags remain
     *  fully functional on every OEM. */
    @SuppressWarnings("deprecation")
    private static void wakeScreen(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK
                            | PowerManager.ACQUIRE_CAUSES_WAKEUP
                            | PowerManager.ON_AFTER_RELEASE,
                    "callkeep:incoming_ring_wake");
            wl.acquire(8000);
        } catch (Throwable t) {
            Log.w(TAG, "[IncomingCallNotification] wakeScreen failed", t);
        }
    }

    /** Voice ring: notification only (no full-screen call surface). */
    public static void show(Context context, String uuid, String callerName, String number) {
        show(context, uuid, callerName, number, false, null, null);
    }

    public static void show(Context context, String uuid, String callerName, String number, boolean withCallScreen) {
        show(context, uuid, callerName, number, withCallScreen, null, null);
    }

    /** @param withCallScreen self-managed calls (video, or self-managed voice)
     *  also open the SDK's full-screen call surface (full-screen intent); the
     *  class name of the React component to mount is {@code inCallComponent}. */
    public static void show(Context context, String uuid, String callerName, String number, boolean withCallScreen, String inCallComponent) {
        show(context, uuid, callerName, number, withCallScreen, inCallComponent, null);
    }

    /**
     * The line under the caller on the ring surface. Who is calling is the
     * title; this says what KIND of call it is:
     *   video                      → "Incoming video call"
     *   contact (1:1 / PSTN)       → "Incoming call · <number>"
     *   team, or no kind given     → "Incoming call"
     * The kind is only known to the app (the SIP X-Team-Name header / the
     * push's `team` field); video also comes from the connection itself.
     */
    static String callSubtitle(boolean hasVideo, String callKind, String number) {
        if (hasVideo || "video".equalsIgnoreCase(callKind)) return "Incoming video call";
        if ("contact".equalsIgnoreCase(callKind)) {
            String n = number == null ? "" : number.trim();
            if (!n.isEmpty()) return "Incoming call · " + n;
        }
        return "Incoming call";
    }

    /** @param subtitle see {@link #callSubtitle}; null → "Incoming call". */
    public static void show(Context context, String uuid, String callerName, String number, boolean withCallScreen, String inCallComponent, String subtitle) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || uuid == null) return;
        final String label = (subtitle != null && !subtitle.isEmpty()) ? subtitle : "Incoming call";
        try {
            boolean locked = isDeviceLocked(context);
            if (withCallScreen && locked) wakeScreen(context); // screen ON only when locked/screen off
            cancelAll(context); // one incoming ring at a time — no stacking
            ensureChannel(context);

            String display = (callerName != null && !callerName.isEmpty()) ? callerName
                    : (number != null ? number : "Incoming call");
            display = titleCase(display);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

            // Full-screen intent: the library's own call screen (caller name,
            // Answer/Decline) — what a locked device shows, the WhatsApp
            // model. Unlocked devices get this notification as heads-up.
            Intent fsi = new Intent(context, IncomingCallActivity.class);
            fsi.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fsi.putExtra(Constants.EXTRA_CALL_UUID, uuid);
            fsi.putExtra(IncomingCallActivity.EXTRA_NAME, display);
            fsi.putExtra(IncomingCallActivity.EXTRA_SUBTITLE, label);
            if (inCallComponent != null) {
                fsi.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
            }
            PendingIntent fullScreen = PendingIntent.getActivity(
                    context, notificationId(uuid), fsi, piFlags);

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent openApp = null;
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                openApp = PendingIntent.getActivity(context, notificationId(uuid) + 3, launch, piFlags);
            }

            Intent answer = new Intent(ACTION_NOTIFICATION_ANSWER)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid)
                    .putExtra(IncomingCallActivity.EXTRA_NAME, display)
                    .putExtra(IncomingCallActivity.EXTRA_SUBTITLE, label);
            if (inCallComponent != null) {
                answer.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
            }
            PendingIntent answerPi = PendingIntent.getBroadcast(
                    context, notificationId(uuid) + 1, answer, piFlags);

            Intent decline = new Intent(ACTION_NOTIFICATION_DECLINE)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid);
            PendingIntent declinePi = PendingIntent.getBroadcast(
                    context, notificationId(uuid) + 2, decline, piFlags);

            // Screen locked or off: this app shows the full-screen call surface
            // itself (below), so the notification must not be able to appear as
            // a heads-up banner — otherwise the user gets the call screen AND a
            // popup. Unlocked: no call screen is launched, so the HIGH channel
            // gives the normal heads-up call banner.
            boolean fullScreenCall = withCallScreen && locked;
            String channelId = fullScreenCall ? CHANNEL_ID_CALL_SCREEN : CHANNEL_ID;

            // Remember the ring: the caller name can be updated in place later
            // (the platform only knows the number — the app resolves the real
            // name from its own contacts DB and asks for the update).
            lastUuid = uuid;
            lastNumber = number;
            lastLabel = label;
            lastComponent = inCallComponent;
            lastWithCallScreen = withCallScreen;
            lastLocked = locked;

            if (fullScreenCall) {
                // Fallback only: the direct launch below is what actually shows
                // the call screen (the FSI is deny-by-default on several OEMs
                // and can be silent-reset on uid changes), but keep it so a
                // failed direct launch still surfaces the call somewhere.
                try {
                    Intent directIntent = new Intent(context, IncomingCallActivity.class);
                    directIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    directIntent.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                    directIntent.putExtra(IncomingCallActivity.EXTRA_NAME, display);
                    directIntent.putExtra(IncomingCallActivity.EXTRA_SUBTITLE, label);
                    if (inCallComponent != null) {
                        directIntent.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                    }
                    context.startActivity(directIntent);
                } catch (Throwable directEx) {
                    Log.w(TAG, "[IncomingCallNotification] Direct startActivity failed, relying on FullScreenIntent", directEx);
                }
            }
            // Unlocked (withCallScreen but not locked): no direct launch — the
            // HIGH-channel notification IS the incoming-call UI, so the screen
            // is never hijacked while the user is using the phone.

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            PendingIntent screenIntent = fullScreenCall ? fullScreen : null;
            try {
                nm.notify(NOTIF_TAG, notificationId(uuid),
                        ringBuilder(context, channelId, display, label, openApp, screenIntent,
                                answerPi, declinePi, true).build());
            } catch (IllegalArgumentException callStyleRefused) {
                // Android 14+ rejects a CallStyle notification unless the app is
                // in the foreground-service state at post time ("CallStyle
                // notifications must be for a foreground service"), and the
                // JS-side foreground service is started asynchronously — it
                // races this native ring. The ring must never depend on that
                // race, so repost the same notification as a plain one: same
                // title/text, same Answer/Decline actions, still a heads-up
                // banner on the HIGH channel.
                Log.w(TAG, "[IncomingCallNotification] CallStyle refused — reposting as a plain call notification", callStyleRefused);
                nm.notify(NOTIF_TAG, notificationId(uuid),
                        ringBuilder(context, channelId, display, label, openApp, screenIntent,
                                answerPi, declinePi, false).build());
            }
            Log.d(TAG, "[IncomingCallNotification] shown for " + uuid);
        } catch (Throwable t) {
            Log.e(TAG, "[IncomingCallNotification] show failed", t);
        }
    }

    /** The ring notification itself.
     *
     *  The banner is drawn by the APP (custom content view) so its
     *  Answer/Decline buttons are the same red/green pills as the full-screen
     *  call surface. A platform `CallStyle` notification would replace the
     *  body with the system's own call chrome (and on Android 14+ it is
     *  refused outright outside the foreground-service state), so the app
     *  draws its own. */
    private static Notification.Builder ringBuilder(Context context, String channelId, String display,
            String label, PendingIntent contentIntent, PendingIntent fullScreenIntent,
            PendingIntent answerPi, PendingIntent declinePi, boolean callStyle) {
        Notification.Builder b = new Notification.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(display)
                .setContentText(label)
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false);
        if (contentIntent != null) b.setContentIntent(contentIntent);
        if (fullScreenIntent != null) b.setFullScreenIntent(fullScreenIntent, true);
        if (callStyle && Build.VERSION.SDK_INT >= 31) {
            Person caller = new Person.Builder().setName(display).setImportant(true).build();
            b.setStyle(Notification.CallStyle.forIncomingCall(caller, declinePi, answerPi));
        } else {
            // Plain fallback (Android 14+ refuses a CallStyle outside the
            // foreground-service state). Give the actions the SAME look as the
            // full-screen call surface: a red decline handset and a green
            // answer handset, instead of bare text buttons.
            b.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(context, R.drawable.ic_call_end_red),
                    "Decline", declinePi).build());
            b.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(context, R.drawable.ic_call_answer_green),
                    "Answer", answerPi).build());
        }
        return b;
    }

    /**
     * Update the caller name on an ALREADY posted ring notification.
     *
     * The platform only knows the caller's number; the app resolves the real
     * name from its own contacts DB and passes it here, so the ring banner
     * shows "Priya Sharma" instead of "+91 12031 34091". The notification is
     * re-posted with the SAME tag+id — an UPDATE, not a new notification: no
     * new heads-up, no second ringtone, and the Answer/Decline actions keep
     * working (they are rebuilt with the new name, so the full-screen call
     * surface and the answer action carry it too).
     */
    public static void updateCallerName(Context context, String uuid, String callerName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || uuid == null || context == null) return;
        if (callerName == null || callerName.trim().isEmpty()) return;
        if (!uuid.equals(lastUuid)) {
            Log.d(TAG, "[IncomingCallNotification] updateCallerName — not the current ring: " + uuid);
            return;
        }
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            boolean posted = false;
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (NOTIF_TAG.equals(sbn.getTag()) && sbn.getId() == notificationId(uuid)) {
                    posted = true;
                    break;
                }
            }
            if (!posted) {
                Log.d(TAG, "[IncomingCallNotification] updateCallerName — no ring notification for " + uuid);
                return;
            }

            final String display = titleCase(callerName.trim());
            final String label = (lastLabel != null && !lastLabel.isEmpty()) ? lastLabel : "Incoming call";
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

            Intent fsi = new Intent(context, IncomingCallActivity.class);
            fsi.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fsi.putExtra(Constants.EXTRA_CALL_UUID, uuid);
            fsi.putExtra(IncomingCallActivity.EXTRA_NAME, display);
            fsi.putExtra(IncomingCallActivity.EXTRA_SUBTITLE, label);
            if (lastComponent != null) {
                fsi.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, lastComponent);
            }
            PendingIntent fullScreen = PendingIntent.getActivity(context, notificationId(uuid), fsi, piFlags);

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent openApp = null;
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                openApp = PendingIntent.getActivity(context, notificationId(uuid) + 3, launch, piFlags);
            }

            Intent answer = new Intent(ACTION_NOTIFICATION_ANSWER)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid)
                    .putExtra(IncomingCallActivity.EXTRA_NAME, display)
                    .putExtra(IncomingCallActivity.EXTRA_SUBTITLE, label);
            if (lastComponent != null) {
                answer.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, lastComponent);
            }
            PendingIntent answerPi = PendingIntent.getBroadcast(context, notificationId(uuid) + 1, answer, piFlags);

            Intent decline = new Intent(ACTION_NOTIFICATION_DECLINE)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid);
            PendingIntent declinePi = PendingIntent.getBroadcast(context, notificationId(uuid) + 2, decline, piFlags);

            boolean fullScreenCall = lastWithCallScreen && lastLocked;
            String channelId = fullScreenCall ? CHANNEL_ID_CALL_SCREEN : CHANNEL_ID;
            PendingIntent screenIntent = fullScreenCall ? fullScreen : null;

            // setOnlyAlertOnce: updating the notification must NOT ring again.
            Notification.Builder builder = ringBuilder(context, channelId, display, label, openApp,
                    screenIntent, answerPi, declinePi, true).setOnlyAlertOnce(true);
            try {
                nm.notify(NOTIF_TAG, notificationId(uuid), builder.build());
            } catch (IllegalArgumentException callStyleRefused) {
                // Same as show(): Android 14+ refuses a CallStyle notification
                // outside the foreground-service state — post the plain form.
                Log.w(TAG, "[IncomingCallNotification] CallStyle refused on name update — posting the plain form", callStyleRefused);
                nm.notify(NOTIF_TAG, notificationId(uuid), ringBuilder(context, channelId, display, label, openApp,
                        screenIntent, answerPi, declinePi, false).setOnlyAlertOnce(true).build());
            }
            Log.d(TAG, "[IncomingCallNotification] caller name updated to " + display);
        } catch (Throwable t) {
            Log.w(TAG, "[IncomingCallNotification] updateCallerName failed: " + t);
        }
    }

    public static void cancel(Context context, String uuid) {
        if (uuid == null || context == null) return;
        try {
            Intent close = new Intent(IncomingCallActivity.ACTION_CLOSE)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid);
            context.sendBroadcast(close);
        } catch (Throwable ignored) { }
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(NOTIF_TAG, notificationId(uuid));
        } catch (Throwable t) {
            Log.e(TAG, "[IncomingCallNotification] cancel failed", t);
        }
    }
}
