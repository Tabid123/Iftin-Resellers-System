package com.iftin.agents;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

/**
 * APK startup sequence:
 * Android native splash (1.5s) -> TenantGate web splash (1.5s) -> tenant app.
 *
 * There is deliberately no second native overlay. Native only signals the
 * WebView when its 1.5s stage is complete; TenantGate owns the next stage.
 */
public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1500L;
    private static final int HANDOFF_SIGNAL_ATTEMPTS = 40;

    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private long launchStartedAt;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        launchStartedAt = SystemClock.uptimeMillis();

        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(
            () -> SystemClock.uptimeMillis() - launchStartedAt < SYSTEM_SPLASH_MS
        );

        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }

        signalTenantGateAfterNativeSplash();
    }

    private void signalTenantGateAfterNativeSplash() {
        long elapsed = SystemClock.uptimeMillis() - launchStartedAt;
        long delay = Math.max(0L, SYSTEM_SPLASH_MS - elapsed);

        startupHandler.postDelayed(new Runnable() {
            private int attempts = 0;

            @Override
            public void run() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function(){window.__IFTIN_NATIVE_SPLASH_COMPLETE__=true;" +
                        "window.dispatchEvent(new Event('iftin-native-splash-complete'));return true;})()",
                        null
                    );
                }

                attempts += 1;
                // Online tenant APKs may be navigating from localhost to the live
                // /t/<slug> URL at the handoff moment. Re-signal briefly so the
                // final document always receives the native-complete event.
                if (attempts < HANDOFF_SIGNAL_ATTEMPTS) {
                    startupHandler.postDelayed(this, 100L);
                }
            }
        }, delay);
    }

    @Override
    protected void onDestroy() {
        startupHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
