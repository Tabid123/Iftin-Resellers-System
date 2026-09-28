package com.iftin.agents;

import android.os.Bundle;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

/**
 * APK startup sequence:
 * Android native splash (1.5s) -> TenantGate web splash (1.5s) -> tenant app.
 *
 * Keep the native artwork over the WebView until the branded TenantGate
 * splash is painted. On a slow first visit the tenant lookup may exceed 1.5s;
 * revealing the WebView earlier would show a blank or unbranded placeholder.
 */
public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1500L;

    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private long launchStartedAt;
    private volatile boolean webSurfaceReady = false;

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
            bridge.getWebView().addJavascriptInterface(
                new NativeStorefrontSession(),
                "IftinNativeSession"
            );
        }

        signalTenantGateAfterNativeSplash();
    }

    private void signalTenantGateAfterNativeSplash() {
        long elapsed = SystemClock.uptimeMillis() - launchStartedAt;
        long delay = Math.max(0L, SYSTEM_SPLASH_MS - elapsed);

        startupHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (webSurfaceReady) return;
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) {
                    startupHandler.postDelayed(this, 100L);
                    return;
                }

                // Query the current document, including after localhost -> live
                // navigation. Only the real branded web splash or app surface
                // may release the native screen; an unresolved tenant renders null.
                webView.evaluateJavascript(
                    "(function(){var ready=!!(document.getElementById('tenant-web-splash')||" +
                    "document.getElementById('tenant-app-ready'));" +
                    "if(ready){window.__IFTIN_NATIVE_SPLASH_COMPLETE__=true;" +
                    "window.dispatchEvent(new Event('iftin-native-splash-complete'))}" +
                    "return ready})()",
                    result -> {
                        if ("true".equals(result)) {
                            webSurfaceReady = true;
                        } else {
                            startupHandler.postDelayed(this, 100L);
                        }
                    }
                );
            }
        }, delay);
    }

    private boolean isAllowedSessionKey(String key) {
        return "verifiedPhone".equals(key)
            || "offlineSenderPhone".equals(key)
            || "offlineReceiverPhone".equals(key)
            || "hasSkippedOfflineRegistration".equals(key)
            || "loggedOut".equals(key);
    }

    private class NativeStorefrontSession {
        private SharedPreferences prefs() {
            return getSharedPreferences("iftin_storefront_session", MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            if (!isAllowedSessionKey(key)) return "";
            return prefs().getString(key, "");
        }

        @JavascriptInterface
        public void set(String key, String value) {
            if (!isAllowedSessionKey(key)) return;
            prefs().edit().putString(key, value == null ? "" : value).apply();
        }

        @JavascriptInterface
        public void remove(String key) {
            if (!isAllowedSessionKey(key)) return;
            prefs().edit().remove(key).apply();
        }
    }

    @Override
    public void onDestroy() {
        startupHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
