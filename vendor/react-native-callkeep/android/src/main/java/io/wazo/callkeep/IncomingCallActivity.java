package io.wazo.callkeep;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;

import android.app.Activity;
import android.app.Application;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.telecom.Connection;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen incoming-call UI for the locked device — the WhatsApp model:
 * on the keyguard the ring is a dedicated call screen, not a notification.
 * Launched by the ring notification's full-screen intent; Answer/Decline
 * drive the Telecom connection exactly like the notification actions.
 * Dismissed automatically when the call stops ringing (cancel/timeout/
 * answered elsewhere).
 *
 * Implements PermissionAwareActivity: the post-answer in-call surface is a
 * React surface hosted on THIS activity (see InCallReactSurface), so every
 * PermissionsAndroid.request() made from that UI (phone state, microphone,
 * camera, Bluetooth) is routed through here. Without it React Native throws
 * "Tried to use permissions API but the host Activity doesn't implement
 * PermissionAwareActivity." and the request is dropped.
 */
public class IncomingCallActivity extends AppCompatActivity implements PermissionAwareActivity {

    public static final String ACTION_CLOSE = "io.wazo.callkeep.INCOMING_UI_CLOSE";
    public static final String ACTION_FORCE_CLOSE = "io.wazo.callkeep.INCOMING_UI_FORCE_CLOSE";
    /** The caller name changed (the app resolved it from its contacts DB
     *  after the ring started) — refresh the name on the ring surface. */
    public static final String ACTION_UPDATE_NAME = "io.wazo.callkeep.INCOMING_UI_UPDATE_NAME";
    public static final String EXTRA_NAME = "displayName";
    public static final String EXTRA_ANSWERED = "alreadyAnswered";
    // The line under the caller, computed by IncomingCallNotification from the
    // call kind: "Incoming call", "Incoming call · <number>" for a contact
    // (1:1/PSTN) call, "Incoming video call" for video.
    public static final String EXTRA_SUBTITLE = "incomingSubtitle";

    private String uuid;
    private String displayName;
    // React component the in-call surface mounts (video vs self-managed voice),
    // chosen natively per call type and carried through on every (re)launch.
    private String inCallComponent;
    private boolean answering = false;
    // Unlock restores the pre-lock task order (the app comes forward, hiding
    // the live call) — bring the call screen back on top.
    private final BroadcastReceiver refrontReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (!answering) return;
            try {
                Intent front = new Intent(c, IncomingCallActivity.class);
                front.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                front.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                front.putExtra(EXTRA_ANSWERED, true);
                if (inCallComponent != null) front.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                c.startActivity(front);
            } catch (Throwable ignored) { }
        }
    };
    private final Application.ActivityLifecycleCallbacks appLifecycleCallbacks = new Application.ActivityLifecycleCallbacks() {
        @Override
        public void onActivityResumed(Activity activity) {
            if (isFinishing() || isDestroyed()) return;
            if (!answering || !shellAnswering) return;
            if (!isConnectionLive()) return;
            if (activity != IncomingCallActivity.this) {
                try {
                    Intent front = new Intent(activity, IncomingCallActivity.class);
                    front.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    front.putExtra(Constants.EXTRA_CALL_UUID, uuid);
                    front.putExtra(EXTRA_ANSWERED, true);
                    if (inCallComponent != null) front.putExtra(Constants.EXTRA_IN_CALL_COMPONENT, inCallComponent);
                    activity.startActivity(front);
                } catch (Throwable ignored) { }
            }
        }
        @Override public void onActivityCreated(Activity a, Bundle b) {}
        @Override public void onActivityStarted(Activity a) {}
        @Override public void onActivityPaused(Activity a) {}
        @Override public void onActivityStopped(Activity a) {}
        @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
        @Override public void onActivityDestroyed(Activity a) {}
    };
    private boolean ignoreNextClose = false;
    private InCallReactSurface reactShell;
    // Registered by React Native's PermissionsModule (PermissionsAndroid) and
    // notified from onRequestPermissionsResult.
    private PermissionListener rnPermissionListener;
    // The locked in-call shell (post-answer) is showing: backToForeground
    // must not bury it under an activity the keyguard would hide.
    private static volatile boolean shellAnswering = false;
    public static boolean isShellAnswering() { return shellAnswering; }

    private String callerDisplayName() {
        return (displayName == null || displayName.isEmpty()) ? "In call" : displayName;
    }
    private TextView subtitleView;
    private TextView titleView;
    private LinearLayout buttonsView;

    /** Show a (new) caller name on the ring surface. */
    private void applyDisplayName(String raw) {
        if (raw == null || raw.isEmpty()) return;
        String pretty = IncomingCallNotification.titleCase(raw);
        displayName = pretty;
        try {
            if (titleView != null) titleView.setText(pretty);
        } catch (Throwable ignored) { }
    }
    private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (ACTION_FORCE_CLOSE.equals(i.getAction())) {
                finishNoAnim();
                return;
            }
            if (ACTION_UPDATE_NAME.equals(i.getAction())) {
                // The app resolved the caller's real name (contacts DB) after
                // the ring had already started — show it on the ring surface.
                applyDisplayName(i.getStringExtra(EXTRA_NAME));
                return;
            }
            String target = i.getStringExtra(Constants.EXTRA_CALL_UUID);
            if (target != null && !target.equals(uuid)) return;
            if (answering) {
                // In-call shell: cancel broadcasts also fire as answer-path
                // cleanup (notification teardown from onAnswer, global ring
                // purges) — only a genuinely dead connection may close us.
                if (isConnectionLive()) return;
                finishNoAnim();
                return;
            }
            if (ignoreNextClose) { ignoreNextClose = false; return; } // our own answer-cancel
            finishNoAnim(); // ring cancelled, or the call ended
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        uuid = getIntent().getStringExtra(Constants.EXTRA_CALL_UUID);
        inCallComponent = getIntent().getStringExtra(Constants.EXTRA_IN_CALL_COMPONENT);
        String name = getIntent().getStringExtra(EXTRA_NAME);
        if (name == null || name.isEmpty()) name = "Incoming call";
        name = IncomingCallNotification.titleCase(name);
        displayName = name;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);

        // ---- programmatic layout: dark call screen, name, two round buttons
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        // The app's call screen palette (the answered call screen gradient:
        // #11503c -> #0a2f24 -> #051a13) — the ring surface used to be blue
        // while the in-call screen was green.
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{
                        Color.parseColor("#11503c"),
                        Color.parseColor("#0a2f24"),
                        Color.parseColor("#051a13")
                });
        root.setBackground(background);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText(name);
        titleView = title;
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 32);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(120);
        root.addView(title, tlp);

        TextView subtitle = new TextView(this);
        subtitleView = subtitle;
        // Who is calling is the big line above; this line says what KIND of
        // call it is. Set by IncomingCallNotification from the call kind the
        // JS bridge passes down ("Incoming call" / "Incoming call · <number>"
        // / "Incoming video call"). Older/other launchers leave it unset, and
        // an untyped call must never be announced as video, so fall back to
        // the generic wording.
        String subtitleText = getIntent().getStringExtra(EXTRA_SUBTITLE);
        subtitle.setText(subtitleText == null || subtitleText.isEmpty() ? "Incoming call" : subtitleText);
        subtitle.setTextColor(Color.parseColor("#d7efe5"));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(8);
        root.addView(subtitle, slp);

        View spacer = new View(this);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(0, 0, 1f);
        sp.width = LinearLayout.LayoutParams.MATCH_PARENT;
        root.addView(spacer, sp);

        LinearLayout buttons = new LinearLayout(this);
        buttonsView = buttons;
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        blp.bottomMargin = dp(96);
        root.addView(buttons, blp);

        // The app's button colours: red end (#FF4A4A) and green (#34d399).
        buttons.addView(makeButton("Decline", "#FF4A4A", v -> act(false)), pill());
        View gap = new View(this);
        buttons.addView(gap, new LinearLayout.LayoutParams(dp(40), 1));
        buttons.addView(makeButton("Answer", "#34d399", v -> act(true)), pill());

        setContentView(root);

        IntentFilter f = new IntentFilter();
        f.addAction(ACTION_CLOSE);
        f.addAction(ACTION_FORCE_CLOSE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closeReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(closeReceiver, f);

        try {
            getApplication().registerActivityLifecycleCallbacks(appLifecycleCallbacks);
        } catch (Throwable ignored) { }

        // Launched for an ALREADY-ANSWERED call (notification answer, in-app
        // answer, media connect) or recreated mid-call by the system: showing
        // the ring UI would offer Answer on a live call — go straight to the
        // in-call UI.
        try {
            Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
            boolean answeredExtra = getIntent().getBooleanExtra(EXTRA_ANSWERED, false);
            boolean isConnAnswered = (conn instanceof VoiceConnection && ((VoiceConnection) conn).isAnswered());
            if (answering || shellAnswering || answeredExtra || isConnAnswered || (conn != null && conn.getState() == Connection.STATE_ACTIVE)) {
                enterInCallUi();
            }
        } catch (Throwable ignored) { }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        String nextUuid = intent.getStringExtra(Constants.EXTRA_CALL_UUID);
        if (nextUuid != null && !nextUuid.isEmpty()) uuid = nextUuid;

        String nextComponent = intent.getStringExtra(Constants.EXTRA_IN_CALL_COMPONENT);
        if (nextComponent != null && !nextComponent.isEmpty()) inCallComponent = nextComponent;

        String name = intent.getStringExtra(EXTRA_NAME);
        if (name != null && !name.isEmpty()) {
            applyDisplayName(name);
        }

        try {
            Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
            boolean answeredExtra = intent.getBooleanExtra(EXTRA_ANSWERED, false);
            boolean isConnAnswered = (conn instanceof VoiceConnection && ((VoiceConnection) conn).isAnswered());
            if (answering || shellAnswering || answeredExtra || isConnAnswered || (conn != null && conn.getState() == Connection.STATE_ACTIVE)) {
                enterInCallUi();
            }
        } catch (Throwable ignored) { }
    }

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);
    }

    private LinearLayout.LayoutParams pill() {
        return new LinearLayout.LayoutParams(dp(130), dp(56));
    }

    private Button makeButton(String label, String color, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setAllCaps(false);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(color));
        bg.setCornerRadius(dp(28));
        b.setBackground(bg);
        b.setOnClickListener(l);
        return b;
    }

    /** Is the Telecom connection for this call still alive? The in-call shell
     *  lives exactly as long as the connection does. */
    private boolean isConnectionLive() {
        try {
            Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
            return conn != null && conn.getState() != Connection.STATE_DISCONNECTED;
        } catch (Throwable t) { return false; }
    }

    private boolean isLocked() {
        try {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            return km != null && km.isKeyguardLocked();
        } catch (Throwable t) { return false; }
    }

    private void launchApp() {
        try {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            }
        } catch (Throwable ignored) { }
    }

    private void act(boolean answer) {
        if (!answer) {
            try {
                IncomingCallNotification.cancel(this, uuid);
                Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
                if (conn != null) conn.onReject();
            } catch (Throwable ignored) { }
            finishNoAnim();
            return;
        }

        // ---- Answer ----
        ignoreNextClose = true; // our own notification-cancel broadcast
        // Attach the React in-call surface FIRST so the ReactHost is resumed
        // (claimHost) BEFORE the answer broadcast fires. When the app was in
        // the foreground, MainActivity paused the host when this screen opened;
        // answering while the host is paused queues/drops the answerCall event,
        // so the LiveKit room join never runs until the app is reopened.
        // Resuming first makes the JS answer() fire immediately.
        enterInCallUi();
        try {
            IncomingCallNotification.cancel(this, uuid);
            Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
            if (conn != null) conn.onAnswer();
        } catch (Throwable ignored) { }
    }

    /** Switch this activity from ring UI to in-call UI. Used at answer AND
     *  when the activity is recreated mid-call (the system can relaunch it;
     *  the call survives in the ConnectionService — the UI must follow). */
    private void enterInCallUi() {
        answering = true;
        subtitleView.setText("Connecting…");
        buttonsView.removeAllViews();
        buttonsView.addView(makeButton("Hang up", "#EF4444", v -> {
            try {
                Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
                if (conn != null) conn.onDisconnect();
            } catch (Throwable ignored) { }
            finishNoAnim();
        }), pill());

        // THE call screen — locked or unlocked, one UI for every answered
        // incoming call (no handoff to a second app-rendered screen).
        // Preferred: the SDK's React-rendered in-call screen (full video +
        // controls) on a second React surface; fallback when the React
        // runtime isn't reachable: the native timer shell.
        if (reactShell == null) {
            shellAnswering = true;
            reactShell = InCallReactSurface.attach(this, inCallComponent, uuid, callerDisplayName());
            startCallTimer(); // doubles as the connection-liveness watchdog
        }
        // Unlocking dismisses the keyguard this screen was overlaying and the
        // system restores the pre-lock task to the front (usually the app) —
        // re-front the call screen so the call stays the visible UI.
        try {
            IntentFilter unlock = new IntentFilter(Intent.ACTION_USER_PRESENT);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(refrontReceiver, unlock, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(refrontReceiver, unlock);
        } catch (Throwable ignored) { }
    }

    private long callStartMs = 0L;
    private final android.os.Handler timerHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!answering) return;
            if (!isConnectionLive()) { finishNoAnim(); return; } // call ended, broadcast or not
            if (reactShell == null) { // native fallback shell shows the timer itself
                long secs = (System.currentTimeMillis() - callStartMs) / 1000L;
                subtitleView.setText(String.format(java.util.Locale.US, "%02d:%02d", secs / 60, secs % 60));
            }
            timerHandler.postDelayed(this, 1000);
        }
    };

    private void startCallTimer() {
        // Brief 'Connecting…' then the running timer.
        timerHandler.postDelayed(() -> {
            if (!answering) return;
            callStartMs = System.currentTimeMillis();
            timerHandler.post(tick);
        }, 2000);
    }

    private void finishNoAnim() {
        answering = false;
        shellAnswering = false;
        try { getApplication().unregisterActivityLifecycleCallbacks(appLifecycleCallbacks); } catch (Throwable ignored) { }
        finish();
        overridePendingTransition(0, 0);
    }

    @Override
    public void onBackPressed() {
        if (answering || shellAnswering || isConnectionLive()) {
            // Block hardware back button press completely while call is active
            return;
        }
        return;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (reactShell != null) reactShell.onResume(this);
    }

    // ---- PermissionAwareActivity -------------------------------------------
    // Mirrors ReactActivity / ReactActivityDelegate: hand the request to the
    // platform, then forward the result to the listener React Native registered
    // (it returns true when it can be dropped).

    @Override
    public int checkPermission(String permission, int pid, int uid) {
        return ContextCompat.checkSelfPermission(this, permission);
    }

    @Override
    public int checkSelfPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission);
    }

    @Override
    public boolean shouldShowRequestPermissionRationale(String permission) {
        return ActivityCompat.shouldShowRequestPermissionRationale(this, permission);
    }

    @Override
    public void requestPermissions(String[] permissions, int requestCode, PermissionListener listener) {
        rnPermissionListener = listener;
        ActivityCompat.requestPermissions(this, permissions, requestCode);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (rnPermissionListener != null
                && rnPermissionListener.onRequestPermissionsResult(requestCode, permissions, grantResults)) {
            rnPermissionListener = null;
        }
    }

    @Override
    protected void onDestroy() {
        shellAnswering = false;
        if (reactShell != null) { reactShell.detach(); reactShell = null; }
        try { timerHandler.removeCallbacksAndMessages(null); } catch (Throwable ignored) { }
        try { unregisterReceiver(closeReceiver); } catch (Throwable ignored) { }
        try { unregisterReceiver(refrontReceiver); } catch (Throwable ignored) { }
        try { getApplication().unregisterActivityLifecycleCallbacks(appLifecycleCallbacks); } catch (Throwable ignored) { }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
