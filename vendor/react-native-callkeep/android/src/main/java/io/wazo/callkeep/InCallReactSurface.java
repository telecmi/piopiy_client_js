package io.wazo.callkeep;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactRootView;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.interfaces.fabric.ReactSurface;

/**
 * Hosts the SDK's React-rendered in-call screen ('ConnleInCallShell') inside
 * a plain Activity shown over the keyguard. The app's own activity cannot
 * appear above the lock screen, but the React runtime is process-wide — a
 * second surface attached to an over-keyguard activity renders full video +
 * call controls there.
 *
 * Kept in its own class so IncomingCallActivity never triggers loading
 * bridgeless classes (ReactHost exists only on RN >= 0.73); every entry point
 * is called under catch(Throwable), so consumers on older RN fall back to the
 * native timer shell.
 */
final class InCallReactSurface {

    private static final String TAG = "RNCallKeep";
    private static final String APP_KEY = "ConnleInCallShell";

    private ReactSurface surface;   // bridgeless
    private ReactHost host;
    private ReactRootView rootView; // legacy bridge
    private boolean claimedHost = false;
    private final Handler claimHandler = new Handler(Looper.getMainLooper());

    private InCallReactSurface() { }

    /** Claim the React host lifecycle when it is paused, such as a
     *  lock-screen answer. */
    private void claimHost(Activity activity) {
        claimHandler.removeCallbacksAndMessages(null);
        try {
            if (host != null && host.getLifecycleState() != LifecycleState.RESUMED) {
                host.onHostResume(activity);
                claimedHost = true;
                Log.d(TAG, "[InCallReactSurface] Resumed ReactHost for call UI");
            }
        } catch (Throwable t) {
            Log.w(TAG, "[InCallReactSurface] claimHost failed", t);
        }
    }

    /** Attach the React in-call screen to the activity. Returns null when the
     *  React runtime isn't reachable (fallback: native timer shell).
     *  @param appKey component name to mount (video vs self-managed voice);
     *                falls back to the default when null. */
    static InCallReactSurface attach(Activity activity, String appKey, String uuid, String name) {
        final String key = (appKey != null && !appKey.isEmpty()) ? appKey : APP_KEY;
        try {
            Object app = activity.getApplication();
            if (!(app instanceof ReactApplication)) return null;

            Bundle props = new Bundle();
            props.putString("uuid", uuid);
            props.putString("name", name);

            // Bridgeless (RN 0.76+ default): a ReactSurface on our activity.
            ReactHost reactHost = ((ReactApplication) app).getReactHost();
            if (reactHost != null) {
                ReactSurface s = reactHost.createSurface(activity, key, props);
                if (s != null) {
                    s.start();
                    ViewGroup view = s.getView();
                    if (view != null) {
                        activity.setContentView(view);
                        InCallReactSurface r = new InCallReactSurface();
                        r.surface = s;
                        r.host = reactHost;
                        r.claimHost(activity);
                        Log.d(TAG, "[InCallReactSurface] bridgeless surface attached");
                        return r;
                    }
                }
            }

            // Legacy bridge fallback.
            ReactNativeHost rnHost = ((ReactApplication) app).getReactNativeHost();
            if (rnHost != null) {
                ReactRootView root = new ReactRootView(activity);
                root.startReactApplication(rnHost.getReactInstanceManager(), key, props);
                activity.setContentView(root);
                InCallReactSurface r = new InCallReactSurface();
                r.rootView = root;
                if (rnHost.getReactInstanceManager().getLifecycleState() != LifecycleState.RESUMED) {
                    rnHost.getReactInstanceManager().onHostResume(activity);
                    r.claimedHost = true;
                }
                Log.d(TAG, "[InCallReactSurface] legacy root view attached");
                return r;
            }
        } catch (Throwable t) {
            Log.w(TAG, "[InCallReactSurface] attach failed — native shell fallback", t);
        }
        return null;
    }

    /** Re-assert host resume (e.g. from Activity.onResume). */
    void onResume(Activity activity) {
        if (host != null && host.getLifecycleState() != LifecycleState.RESUMED) {
            claimHost(activity);
        }
    }

    void detach() {
        try { claimHandler.removeCallbacksAndMessages(null); } catch (Throwable ignored) { }
        try {
            if (claimedHost && host != null) {
                host.onHostPause(null);
            }
        } catch (Throwable ignored) { }
        try {
            if (surface != null) {
                surface.stop();
                surface.detach();
                surface = null;
            }
        } catch (Throwable ignored) { }
        try {
            if (rootView != null) {
                rootView.unmountReactApplication();
                rootView = null;
            }
        } catch (Throwable ignored) { }
        host = null;
        claimedHost = false;
    }
}
