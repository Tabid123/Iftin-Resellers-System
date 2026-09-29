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

import org.json.JSONObject;
import org.json.JSONTokener;

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
    private static final long SYSTEM_SPLASH_SAFETY_MS = 2200L;
    private static final long SESSION_SYNC_MS = 750L;

    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private long launchStartedAt;
    private volatile boolean webSurfaceReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        launchStartedAt = SystemClock.uptimeMillis();

        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> {
            long elapsed = SystemClock.uptimeMillis() - launchStartedAt;
            return elapsed < SYSTEM_SPLASH_MS
                || (!webSurfaceReady && elapsed < SYSTEM_SPLASH_SAFETY_MS);
        });

        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            bridge.getWebView().addJavascriptInterface(
                new NativeStorefrontSession(),
                "IftinNativeSession"
            );
        }

        watchForWebSurface();
        startStorefrontSessionSync();
    }

    private void watchForWebSurface() {
        long elapsed = SystemClock.uptimeMillis() - launchStartedAt;
        long delay = Math.max(0L, SYSTEM_SPLASH_MS - elapsed);

        startupHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (webSurfaceReady) return;
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) {
                    startupHandler.postDelayed(this, 50L);
                    return;
                }

                webView.evaluateJavascript(
                    "(function(){var ready=!!(document.getElementById('iftin-native-prehydrate-splash')||" +
                    "document.getElementById('tenant-web-splash')||" +
                    "document.getElementById('tenant-app-ready'));" +
                    "if(ready){window.__IFTIN_NATIVE_SPLASH_COMPLETE__=true;" +
                    "window.dispatchEvent(new Event('iftin-native-splash-complete'))}" +
                    "return ready})()",
                    result -> {
                        if ("true".equals(result)) {
                            webSurfaceReady = true;
                        } else if (SystemClock.uptimeMillis() - launchStartedAt < SYSTEM_SPLASH_SAFETY_MS) {
                            startupHandler.postDelayed(this, 50L);
                        }
                    }
                );
            }
        }, delay);
    }

    private void startStorefrontSessionSync() {
        startupHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) {
                    startupHandler.postDelayed(this, SESSION_SYNC_MS);
                    return;
                }

                webView.evaluateJavascript(
                    "(function(){try{return JSON.stringify({" +
                    "verifiedPhone:localStorage.getItem('verifiedPhone')||''," +
                    "offlineSenderPhone:localStorage.getItem('offlineSenderPhone')||''," +
                    "offlineReceiverPhone:localStorage.getItem('offlineReceiverPhone')||''," +
                    "hasSkippedOfflineRegistration:localStorage.getItem('hasSkippedOfflineRegistration')||''," +
                    "loggedOut:sessionStorage.getItem('iftin:loggedOut')||''" +
                    "})}catch(e){return ''}})()",
                    result -> {
                        applyWebSessionSnapshot(result);
                        startupHandler.postDelayed(this, SESSION_SYNC_MS);
                    }
                );
            }
        }, SESSION_SYNC_MS);
    }

    private void applyWebSessionSnapshot(String result) {
        if (result == null || result.isEmpty() || "null".equals(result)) return;
        try {
            Object decoded = new JSONTokener(result).nextValue();
            String jsonText = decoded instanceof String ? (String) decoded : result;
            if (jsonText == null || jsonText.isEmpty()) return;

            JSONObject data = new JSONObject(jsonText);
            SharedPreferences prefs = getSharedPreferences("iftin_storefront_session", MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            if ("1".equals(data.optString("loggedOut", ""))) {
                editor.remove("verifiedPhone");
                editor.remove("offlineSenderPhone");
                editor.remove("offlineReceiverPhone");
                editor.remove("hasSkippedOfflineRegistration");
                editor.putString("loggedOut", "1");
                editor.apply();
                return;
            }

            String verified = normalizeVerifiedPhone(data.optString("verifiedPhone", ""));
            if (!verified.isEmpty()) {
                editor.putString("verifiedPhone", verified);
                editor.putString("loggedOut", "0");
            }

            copyIfPresent(editor, data, "offlineSenderPhone");
            copyIfPresent(editor, data, "offlineReceiverPhone");
            copyIfPresent(editor, data, "hasSkippedOfflineRegistration");
            editor.apply();
        } catch (Exception ignored) {
            // Session sync is best-effort and must never interrupt startup.
        }
    }

    private void copyIfPresent(SharedPreferences.Editor editor, JSONObject data, String key) {
        String value = data.optString(key, "");
        if (value != null && !value.isEmpty()) editor.putString(key, value);
    }

    private String normalizeVerifiedPhone(String value) {
        String digits = value == null ? "" : value.replaceAll("\\D", "");
        if (digits.startsWith("252")) digits = digits.substring(3);
        return digits.matches("(61|77|62|68|71|64)\\d{7}") ? digits : "";
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
