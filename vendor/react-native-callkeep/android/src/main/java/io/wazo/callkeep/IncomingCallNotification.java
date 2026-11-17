package io.wazo.callkeep;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
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
    /** Silent channel used when the full-screen ring is shown over the keyguard:
     *  the activity IS the ring UI, so a heads-up banner would be a duplicate. */
    private static final String CHANNEL_ID_LOCKED = "callkeep_incoming_fullscreen_v2";
    /** Old IMPORTANCE_LOW locked channel: the system never launches a
     *  full-screen intent from a low-importance channel, so the lock-screen
     *  call UI depended on a background activity start (blocked on Android 17). */
    private static final String CHANNEL_ID_LOCKED_LEGACY = "callkeep_incoming_locked_v1";
    /** Low-importance, silent, hidden: posted on a locked device while the
     *  full-screen call screen is the ring, so no banner shows next to it. */
    private static final String CHANNEL_ID_QUIET = "callkeep_incoming_quiet_v1";
    /** How long the directly-started call screen gets to appear before the
     *  ring is escalated to a full-screen-intent notification. */
    private static final long ESCALATE_DELAY_MS = 900;

    public static final String ACTION_NOTIFICATION_ANSWER = "io.wazo.callkeep.NOTIFICATION_ANSWER";
    public static final String ACTION_NOTIFICATION_DECLINE = "io.wazo.callkeep.NOTIFICATION_DECLINE";

    private static final String NOTIF_TAG = "connle_incoming_call";

    // The ring currently on screen, kept so a late caller name can be
    // swapped in without re-posting (no second heads-up, no re-ring).
    private static volatile String lastUuid;
    private static volatile Notification.Builder lastBuilder;
    private static volatile PendingIntent lastDeclinePi;
    private static volatile PendingIntent lastAnswerPi;
    private static volatile boolean lastQuiet;
    // Names resolved by the app, by call uuid. The app's contacts lookup is
    // often FASTER than Telecom's round trip to onShowIncomingCallUi, so the
    // name can arrive before the ring is posted — keep it for post().
    private static final java.util.concurrent.ConcurrentHashMap<String, String> resolvedNames =
            new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * The caller's name was resolved after the ring started (the app's
     * contacts lookup): update the ring notification and the full-screen
     * ring UI in place.
     */
    public static void updateName(Context context, String uuid, String name) {
        if (context == null || uuid == null || name == null || name.isEmpty()) return;
        String display = titleCase(name);
        if (resolvedNames.size() > 20) resolvedNames.clear();
        resolvedNames.put(uuid, display);
        try {
            context.sendBroadcast(new Intent(IncomingCallActivity.ACTION_UPDATE_NAME)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid)
                    .putExtra(IncomingCallActivity.EXTRA_NAME, display));
        } catch (Throwable ignored) { }
        try {
            Notification.Builder b = lastBuilder;
            if (b == null || !uuid.equals(lastUuid) || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean active = false;
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (NOTIF_TAG.equals(sbn.getTag()) && sbn.getId() == notificationId(uuid)) { active = true; break; }
            }
            if (!active) return; // answered/declined meanwhile: never resurrect a ring
            b.setContentTitle(display).setOnlyAlertOnce(true);
            if (!lastQuiet && Build.VERSION.SDK_INT >= 31 && lastDeclinePi != null && lastAnswerPi != null) {
                Person caller = new Person.Builder().setName(display).setImportant(true).build();
                b.setStyle(Notification.CallStyle.forIncomingCall(caller, lastDeclinePi, lastAnswerPi));
            }
            nm.notify(NOTIF_TAG, notificationId(uuid), b.build());
            Log.d(TAG, "[IncomingCallNotification] name updated for " + uuid);
        } catch (Throwable t) {
            Log.w(TAG, "[IncomingCallNotification] updateName failed", t);
        }
    }

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
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
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
            nm.createNotificationChannel(channel);
        }

        try { nm.deleteNotificationChannel(CHANNEL_ID_LOCKED_LEGACY); } catch (Throwable ignored) { }

        // Full-screen-over-keyguard ring: silent (the activity is the ring UI)
        // but HIGH importance — the system only launches a notification's
        // full-screen intent from a high-importance channel, and that system
        // launch is the one way to open the call screen over the keyguard
        // that is never subject to background-activity-start restrictions.
        if (nm.getNotificationChannel(CHANNEL_ID_QUIET) == null) {
            NotificationChannel quiet = new NotificationChannel(
                    CHANNEL_ID_QUIET, "Incoming calls (call screen showing)", NotificationManager.IMPORTANCE_LOW);
            quiet.setDescription("Used while the full-screen call UI is already on screen");
            quiet.setSound(null, null);
            quiet.enableVibration(false);
            quiet.setShowBadge(false);
            quiet.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            nm.createNotificationChannel(quiet);
        }
        if (nm.getNotificationChannel(CHANNEL_ID_LOCKED) == null) {
            NotificationChannel silent = new NotificationChannel(
                    CHANNEL_ID_LOCKED, "Incoming calls (full screen)", NotificationManager.IMPORTANCE_HIGH);
            silent.setDescription("Used while the full-screen call UI is shown over the lock screen");
            silent.setSound(null, null);
            silent.enableVibration(false);
            silent.setShowBadge(false);
            silent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            silent.setBypassDnd(true);
            nm.createNotificationChannel(silent);
        }
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

    /** Android 14+: full-screen intents are a revocable special access. When
     *  it is not granted the system demotes the ring to a heads-up banner. */
    private static boolean canUseFullScreenIntent(Context context) {
        if (Build.VERSION.SDK_INT < 34) return true;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm.canUseFullScreenIntent();
        } catch (Throwable t) {
            return true;
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
        show(context, uuid, callerName, number, false);
    }

    /** @param withCallScreen video calls also open the SDK's full-screen call
     *  surface (full-screen intent); voice calls get the notification alone. */
    public static void show(Context context, String uuid, String callerName, String number, boolean withCallScreen) {
        show(context, uuid, callerName, number, withCallScreen, null);
    }

    public static void show(Context context, String uuid, String callerName, String number, boolean withCallScreen, String inCallComponent) {
        // The number arrives as the Telecom handle, percent-encoded
        // ("%2B9198…", "john%20doe") — decode it before it is shown.
        String shownNumber = number;
        try { if (number != null) shownNumber = Uri.decode(number); } catch (Throwable ignored) { }
        post(context, uuid, callerName, shownNumber, withCallScreen, inCallComponent, false);
    }

    /** Is this call still ringing (not answered, rejected or gone)? */
    private static boolean isStillRinging(String uuid) {
        try {
            android.telecom.Connection c = VoiceConnectionService.getConnection(uuid);
            return c != null && c.getState() == android.telecom.Connection.STATE_RINGING;
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * Locked device, two steps so the user sees ONE ring surface:
     *  1. start the full-screen call screen directly and post a quiet, hidden
     *     notification (no banner beside the call screen);
     *  2. only if the call screen did not appear (background activity start
     *     blocked — Android 17, some OEMs), re-post on the high-importance
     *     channel so the system launches it through the full-screen intent.
     * @param escalated step 2 of the above.
     */
    private static void post(final Context context, final String uuid, final String callerName, final String number,
                             final boolean withCallScreen, final String inCallComponent, final boolean escalated) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || uuid == null) return;
        try {
            boolean locked = escalated || isDeviceLocked(context);
            // Without full-screen-intent access the banner is the ring even on
            // the lock screen: use the audible channel.
            boolean fullScreenLocked = withCallScreen && locked && canUseFullScreenIntent(context);
            if (withCallScreen && locked && !fullScreenLocked) {
                Log.w(TAG, "[IncomingCallNotification] full-screen intent access not granted — ringing as a banner");
            }
            // Step 1 on a locked device: the call screen is started directly
            // and this notification stays quiet.
            final boolean quiet = fullScreenLocked && !escalated;
            if (!escalated) {
                if (withCallScreen && locked) wakeScreen(context); // screen ON only when locked/screen off
                cancelAll(context); // one incoming ring at a time — no stacking
            }
            ensureChannel(context);

            // A name the app already resolved for this call wins over the
            // one the call was reported with (usually just the number).
            String resolved = resolvedNames.get(uuid);
            String shownName = (resolved != null && !resolved.isEmpty()) ? resolved : callerName;
            String display = (shownName != null && !shownName.isEmpty()) ? shownName
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
            fsi.putExtra(IncomingCallActivity.EXTRA_NUMBER, number);
            fsi.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
            PendingIntent fullScreen = PendingIntent.getActivity(
                    context, notificationId(uuid), fsi, piFlags);

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent openApp = null;
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                openApp = PendingIntent.getActivity(context, notificationId(uuid) + 3, launch, piFlags);
            }

            // Answer. App UI in front: a broadcast — the call stays in the app.
            // Any other state (background, killed, locked): the Answer button
            // opens the call screen ITSELF (an activity PendingIntent) and the
            // screen answers on launch. The old broadcast -> startActivity hop
            // is a notification trampoline / background activity start, which
            // Android 17 blocks: the tap then did nothing visible and the JS
            // answer never ran.
            PendingIntent answerPi;
            if (withCallScreen && !RNCallKeepModule.isAppUiForeground()) {
                Intent answer = new Intent(context, IncomingCallActivity.class);
                answer.setAction(ACTION_NOTIFICATION_ANSWER);
                answer.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                answer.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                answer.putExtra(IncomingCallActivity.EXTRA_NAME, display);
            answer.putExtra(IncomingCallActivity.EXTRA_NUMBER, number);
                answer.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                answer.putExtra(IncomingCallActivity.EXTRA_ANSWER_NOW, true);
                answerPi = PendingIntent.getActivity(
                        context, notificationId(uuid) + 4, answer, piFlags);
            } else {
                Intent answer = new Intent(ACTION_NOTIFICATION_ANSWER)
                        .setPackage(context.getPackageName())
                        .putExtra(Constants.EXTRA_CALL_UUID, uuid)
                        .putExtra(IncomingCallActivity.EXTRA_NAME, display)
                        .putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                answerPi = PendingIntent.getBroadcast(
                        context, notificationId(uuid) + 1, answer, piFlags);
            }

            Intent decline = new Intent(ACTION_NOTIFICATION_DECLINE)
                    .setPackage(context.getPackageName())
                    .putExtra(Constants.EXTRA_CALL_UUID, uuid);
            PendingIntent declinePi = PendingIntent.getBroadcast(
                    context, notificationId(uuid) + 2, decline, piFlags);

            Notification.Builder builder = new Notification.Builder(context,
                    quiet ? CHANNEL_ID_QUIET : (fullScreenLocked ? CHANNEL_ID_LOCKED : CHANNEL_ID))
                    .setSmallIcon(android.R.drawable.sym_call_incoming)
                    .setContentTitle(display)
                    .setContentText("Incoming call")
                    .setCategory(Notification.CATEGORY_CALL)
                    .setPriority(quiet ? Notification.PRIORITY_LOW : Notification.PRIORITY_MAX)
                    .setVisibility(quiet ? Notification.VISIBILITY_SECRET : Notification.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setAutoCancel(false);

            if (withCallScreen) {
                builder.setFullScreenIntent(fullScreen, true);
                if (locked && !escalated) {
                    try {
                        Intent directIntent = new Intent(context, IncomingCallActivity.class);
                        directIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        directIntent.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                        directIntent.putExtra(IncomingCallActivity.EXTRA_NAME, display);
            directIntent.putExtra(IncomingCallActivity.EXTRA_NUMBER, number);
                        directIntent.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                        context.startActivity(directIntent);
                    } catch (Throwable directEx) {
                        // A blocked background start usually does NOT throw;
                        // either way the escalation below covers it.
                        Log.w(TAG, "[IncomingCallNotification] Direct startActivity failed, relying on FullScreenIntent", directEx);
                    }
                }
            }
            if (openApp != null) {
                builder.setContentIntent(openApp);
            }

            // Every visible ring notification carries Answer/Decline. The
            // quiet one is hidden behind the call screen and has none.
            if (quiet) {
                // no actions, no call style: nothing to show
            } else if (Build.VERSION.SDK_INT >= 31) {
                Person caller = new Person.Builder().setName(display).setImportant(true).build();
                builder.setStyle(Notification.CallStyle.forIncomingCall(caller, declinePi, answerPi));
            } else {
                builder.addAction(new Notification.Action.Builder(null, "Decline", declinePi).build());
                builder.addAction(new Notification.Action.Builder(null, "Answer", answerPi).build());
            }

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            // A posted notification cannot change channel: drop the quiet one first.
            if (escalated) nm.cancel(NOTIF_TAG, notificationId(uuid));
            nm.notify(NOTIF_TAG, notificationId(uuid), builder.build());
            lastUuid = uuid;
            lastBuilder = builder;
            lastDeclinePi = declinePi;
            lastAnswerPi = answerPi;
            lastQuiet = quiet;
            Log.d(TAG, "[IncomingCallNotification] shown for " + uuid
                    + (quiet ? " (quiet, call screen started directly)" : escalated ? " (escalated to full-screen intent)" : ""));

            if (quiet) {
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override public void run() {
                        if (IncomingCallActivity.isShowingFor(uuid) || !isStillRinging(uuid)) return;
                        Log.w(TAG, "[IncomingCallNotification] call screen did not appear — using the full-screen intent");
                        post(context, uuid, callerName, number, withCallScreen, inCallComponent, true);
                    }
                }, ESCALATE_DELAY_MS);
            }
        } catch (Throwable t) {
            Log.e(TAG, "[IncomingCallNotification] show failed", t);
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
