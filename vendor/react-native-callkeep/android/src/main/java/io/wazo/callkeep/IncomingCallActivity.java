package io.wazo.callkeep;

import androidx.appcompat.app.AppCompatActivity;
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
 */
public class IncomingCallActivity extends AppCompatActivity {

    public static final String ACTION_CLOSE = "io.wazo.callkeep.INCOMING_UI_CLOSE";
    public static final String ACTION_FORCE_CLOSE = "io.wazo.callkeep.INCOMING_UI_FORCE_CLOSE";
    public static final String ACTION_UPDATE_NAME = "io.wazo.callkeep.INCOMING_UI_UPDATE_NAME";
    public static final String EXTRA_NAME = "displayName";
    public static final String EXTRA_ANSWERED = "alreadyAnswered";
    /** The caller's number, shown under the name when the two differ. */
    public static final String EXTRA_NUMBER = "displayNumber";
    /** Launched by the notification's Answer button: answer on arrival. */
    public static final String EXTRA_ANSWER_NOW = "answerNow";

    private String uuid;
    private String displayName;
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
                c.startActivity(front);
            } catch (Throwable ignored) { }
        }
    };
    private final Application.ActivityLifecycleCallbacks appLifecycleCallbacks = new Application.ActivityLifecycleCallbacks() {
        @Override
        public void onActivityResumed(Activity activity) {
            // Do not pull the call screen back over the main app. When the app
            // is opened on purpose (minimise, recents), the app stays on top;
            // the ongoing-call notification brings the call screen back.
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
    // The locked in-call shell (post-answer) is showing: backToForeground
    // must not bury it under an activity the keyguard would hide.
    private static volatile boolean shellAnswering = false;
    // The call this screen is currently showing (null when not on screen):
    // lets the ring notification know the screen really appeared.
    private static volatile String showingUuid = null;
    public static boolean isShowingFor(String callUuid) {
        String s = showingUuid;
        return s != null && (callUuid == null || s.equals(callUuid));
    }
    public static boolean isShellAnswering() { return shellAnswering; }

    private String callerDisplayName() {
        return (displayName == null || displayName.isEmpty()) ? "In call" : displayName;
    }
    private TextView subtitleView;
    private TextView titleView;
    private TextView avatarView;
    private TextView teamView;

    /** The team part of a caller line: "Sridhar A \u2014 Sales" -> "Sales" ("" when none). */
    private static String teamOf(String display) {
        if (display == null) return "";
        int cut = display.indexOf(" \u2014 ");
        return cut > 0 ? display.substring(cut + 3).trim() : "";
    }
    private String displayNumber;

    /** The app's avatar gradients (theme GRADS g1..g7). */
    private static final String[][] AVATAR_GRADS = {
            {"#8a7bf0", "#c14fd0"}, {"#14b884", "#0c9268"}, {"#f7a23b", "#ef6b3d"}, {"#4aa8f0", "#2563eb"},
            {"#f46ba2", "#d83a6c"}, {"#32c5b0", "#0e9488"}, {"#6c7bf0", "#4338ca"}};

    /** The person part of a caller line: "Sridhar A \u2014 Sales" -> "Sridhar A". */
    private static String personOf(String display) {
        if (display == null) return "";
        int cut = display.indexOf(" \u2014 ");
        return (cut > 0 ? display.substring(0, cut) : display).trim();
    }

    private static boolean looksLikeNumber(String s) {
        return s == null || s.isEmpty() || s.matches("[+\\d\\s().-]+");
    }

    /**
     * Avatar label, the same rule as the app's answered call screen
     * (initialsFromName): the first character of each of the first two words.
     *  - "Sridhar A" -> "SA", "Sridhar" -> "S";
     *  - an unknown caller is a single word, so one digit: "+91 98…" -> "9".
     */
    private static String avatarLabelOf(String display, String number) {
        String person = personOf(display);
        if (looksLikeNumber(person)) {
            String src = !person.isEmpty() ? person : (number == null ? "" : number);
            String digits = src.replaceAll("[^0-9]", "");
            return digits.isEmpty() ? "" : digits.substring(0, 1);
        }
        StringBuilder label = new StringBuilder(2);
        for (String w : person.split("\\s+")) {
            if (w.startsWith("+")) w = w.substring(1);
            if (w.isEmpty()) continue;
            label.append(Character.toUpperCase(w.charAt(0)));
            if (label.length() == 2) break;
        }
        return label.toString();
    }

    /** Gradient by first letter (A..Z cycles g1..g7), the app's colorCode rule. */
    private static String[] avatarGradOf(String label) {
        if (label != null && !label.isEmpty()) {
            int code = Character.toUpperCase(label.charAt(0)) - 64;
            if (code >= 1 && code <= 26) return AVATAR_GRADS[(code - 1) % 7];
        }
        return AVATAR_GRADS[0];
    }

    /** Show a caller on the ring screen: name line and avatar. */
    private void applyIdentity(String display) {
        try {
            // Row 1: the caller's name (or number). Row 2: the team.
            String person = personOf(display);
            if (titleView != null) titleView.setText(person.isEmpty() ? display : person);
            if (teamView != null) {
                String team = teamOf(display);
                teamView.setText(team);
                teamView.setVisibility(team.isEmpty() ? View.GONE : View.VISIBLE);
            }
            if (avatarView != null) {
                String label = avatarLabelOf(display, displayNumber);
                String[] g = avatarGradOf(label);
                avatarView.setText(label);
                GradientDrawable avaBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                        new int[]{Color.parseColor(g[0]), Color.parseColor(g[1])});
                avaBg.setShape(GradientDrawable.OVAL);
                avatarView.setBackground(avaBg);
            }
        } catch (Throwable ignored) { }
    }

    // The caller's name resolved from the app's contacts after the ring
    // started: swap it in (name + avatar) without restarting the ring.
    private final BroadcastReceiver nameReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String target = i.getStringExtra(Constants.EXTRA_CALL_UUID);
            if (target != null && uuid != null && !target.equals(uuid)) return;
            String name = i.getStringExtra(EXTRA_NAME);
            if (name == null || name.isEmpty()) return;
            displayName = IncomingCallNotification.titleCase(name);
            applyIdentity(displayName);
        }
    };

    /** "sridhar a" -> "SA": avatar initials, the same rule as the app's call screen. */
    private static String initialsOf(String name) {
        if (name == null) return "";
        StringBuilder b = new StringBuilder(2);
        for (String w : name.trim().split("\\s+")) {
            if (w.isEmpty()) continue;
            b.append(Character.toUpperCase(w.charAt(0)));
            if (b.length() == 2) break;
        }
        return b.toString();
    }
    private LinearLayout buttonsView;
    private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (ACTION_FORCE_CLOSE.equals(i.getAction())) {
                finishNoAnim();
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
        showingUuid = uuid;
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

        // ---- programmatic layout: mirrors the app's ANSWERED call screen
        // (same gradient, top pill, avatar, name, status line and pill
        // buttons) so the ring and the in-call screen read as one UI.
        String inCallComponent = getIntent().getStringExtra(Constants.EXTRA_IN_CALL_COMPONENT);
        boolean isVoiceCall = inCallComponent != null && !inCallComponent.isEmpty();
        String number = getIntent().getStringExtra(EXTRA_NUMBER);
        displayNumber = number;

        try {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        } catch (Throwable ignored) { }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setFitsSystemWindows(true);
        int[] bgColors = new int[]{Color.parseColor("#11503c"), Color.parseColor("#0a2f24"), Color.parseColor("#051a13")};
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, bgColors);
        if (Build.VERSION.SDK_INT >= 29) bg.setColors(bgColors, new float[]{0f, 0.45f, 1f});
        root.setBackground(bg);

        // top pill: "<App> Voice · Encrypted"
        LinearLayout pillBar = new LinearLayout(this);
        pillBar.setOrientation(LinearLayout.HORIZONTAL);
        pillBar.setGravity(Gravity.CENTER);
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setColor(Color.argb(23, 255, 255, 255));
        pillBg.setStroke(dp(1), Color.argb(38, 255, 255, 255));
        pillBg.setCornerRadius(dp(18));
        pillBar.setBackground(pillBg);
        pillBar.setPadding(dp(13), dp(8), dp(13), dp(8));
        try {
            android.widget.ImageView lock = new android.widget.ImageView(this);
            lock.setImageResource(android.R.drawable.ic_lock_lock);
            lock.setColorFilter(Color.parseColor("#7dffd0"));
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(dp(13), dp(13));
            llp.rightMargin = dp(7);
            pillBar.addView(lock, llp);
        } catch (Throwable ignored) { }
        TextView pillText = new TextView(this);
        String appLabel = "";
        try { appLabel = String.valueOf(getApplicationInfo().loadLabel(getPackageManager())); } catch (Throwable ignored) { }
        pillText.setText((appLabel.isEmpty() ? "" : appLabel + " ") + (isVoiceCall ? "Voice" : "Video") + " \u00B7 Encrypted");
        pillText.setTextColor(Color.parseColor("#d7efe5"));
        pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        pillText.setTypeface(Typeface.DEFAULT_BOLD);
        pillText.setSingleLine(true);
        pillBar.addView(pillText);
        LinearLayout.LayoutParams pbl = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pbl.topMargin = dp(8);
        pbl.leftMargin = dp(66);
        pbl.rightMargin = dp(66);
        root.addView(pillBar, pbl);

        // centre identity: avatar, name, number, status
        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);

        TextView avatar = new TextView(this);
        avatarView = avatar;
        avatar.setTextColor(Color.WHITE);
        avatar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 36);
        avatar.setTypeface(Typeface.DEFAULT_BOLD);
        avatar.setGravity(Gravity.CENTER);
        avatar.setElevation(dp(8));
        center.addView(avatar, new LinearLayout.LayoutParams(dp(116), dp(116)));

        TextView title = new TextView(this);
        titleView = title;
        title.setText(name);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setLetterSpacing(-0.015f);
        title.setGravity(Gravity.CENTER);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(dp(20), 0, dp(20), 0);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(22);
        center.addView(title, tlp);

        // second row: the team the call came in on (hidden when there is none)
        TextView sub = new TextView(this);
        teamView = sub;
        sub.setTextColor(Color.argb(179, 234, 255, 246));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        sub.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        sub.setGravity(Gravity.CENTER);
        sub.setSingleLine(true);
        sub.setEllipsize(android.text.TextUtils.TruncateAt.END);
        sub.setPadding(dp(20), 0, dp(20), 0);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = dp(5);
        center.addView(sub, nlp);

        TextView subtitle = new TextView(this);
        subtitleView = subtitle;
        subtitle.setText(isVoiceCall ? "Incoming call" : "Incoming video call");
        subtitle.setAllCaps(true);
        subtitle.setTextColor(Color.parseColor("#7dffd0"));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        subtitle.setTypeface(Typeface.DEFAULT_BOLD);
        subtitle.setLetterSpacing(0.11f);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(16);
        center.addView(subtitle, slp);

        root.addView(center, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout buttons = new LinearLayout(this);
        buttonsView = buttons;
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        blp.bottomMargin = dp(24);
        root.addView(buttons, blp);

        buttons.addView(makeButton("Decline", "#f87171", "#dc2626", v -> act(false)), pill());
        View gap = new View(this);
        buttons.addView(gap, new LinearLayout.LayoutParams(dp(20), 1));
        buttons.addView(makeButton("Answer", "#34d399", "#10b981", v -> act(true)), pill());

        applyIdentity(name);
        setContentView(root);

        try {
            IntentFilter nf = new IntentFilter(ACTION_UPDATE_NAME);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(nameReceiver, nf, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(nameReceiver, nf);
        } catch (Throwable ignored) { }

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
            } else {
                answerFromNotification(getIntent());
            }
        } catch (Throwable ignored) { }
    }

    /** The notification's Answer button opened this screen: answer the ringing
     *  call exactly like the on-screen Answer button. One-shot per intent. */
    private void answerFromNotification(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_ANSWER_NOW, false)) return;
        intent.removeExtra(EXTRA_ANSWER_NOW); // a recreate must not re-answer
        Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
        if (conn == null || conn.getState() == Connection.STATE_DISCONNECTED) {
            // The call ended between the ring and the tap.
            IncomingCallNotification.cancel(this, uuid);
            finishNoAnim();
            return;
        }
        act(true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        String nextUuid = intent.getStringExtra(Constants.EXTRA_CALL_UUID);
        if (nextUuid != null && !nextUuid.isEmpty()) uuid = nextUuid;
        showingUuid = uuid;

        String name = intent.getStringExtra(EXTRA_NAME);
        if (name != null && !name.isEmpty()) {
            displayName = IncomingCallNotification.titleCase(name);
        }

        try {
            Connection conn = uuid == null ? null : VoiceConnectionService.getConnection(uuid);
            boolean answeredExtra = intent.getBooleanExtra(EXTRA_ANSWERED, false);
            boolean isConnAnswered = (conn instanceof VoiceConnection && ((VoiceConnection) conn).isAnswered());
            if (answering || shellAnswering || answeredExtra || isConnAnswered || (conn != null && conn.getState() == Connection.STATE_ACTIVE)) {
                enterInCallUi();
            } else {
                answerFromNotification(intent);
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
        return new LinearLayout.LayoutParams(dp(150), dp(54));
    }

    private Button makeButton(String label, String colorFrom, String colorTo, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setAllCaps(false);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.parseColor(colorFrom), Color.parseColor(colorTo)});
        bg.setCornerRadius(dp(28));
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setStateListAnimator(null);
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
        buttonsView.addView(makeButton("Hang up", "#f87171", "#dc2626", v -> {
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
            String inCallComponent = getIntent().getStringExtra(Constants.EXTRA_IN_CALL_COMPONENT);
            if (inCallComponent == null || inCallComponent.isEmpty()) {
                inCallComponent = "ConnleInCallShell";
            }
            reactShell = InCallReactSurface.attach(this, uuid, callerDisplayName(), inCallComponent);
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

    @Override
    protected void onDestroy() {
        showingUuid = null;
        shellAnswering = false;
        if (reactShell != null) { reactShell.detach(); reactShell = null; }
        try { timerHandler.removeCallbacksAndMessages(null); } catch (Throwable ignored) { }
        try { unregisterReceiver(closeReceiver); } catch (Throwable ignored) { }
        try { unregisterReceiver(nameReceiver); } catch (Throwable ignored) { }
        try { unregisterReceiver(refrontReceiver); } catch (Throwable ignored) { }
        try { getApplication().unregisterActivityLifecycleCallbacks(appLifecycleCallbacks); } catch (Throwable ignored) { }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
