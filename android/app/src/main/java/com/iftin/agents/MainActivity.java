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
import androidx.core.content.pm.PackageInfoCompat;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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
    private static final long LIVE_UPDATE_CHECK_DELAY_MS = 4500L;
    private static final String LIVE_UPDATE_PREFS = "iftin_live_update";
    private static final String LIVE_UPDATE_VERSION_KEY = "version";
    private static final String LIVE_UPDATE_PATH_KEY = "path";
    private static final String LIVE_UPDATE_MANIFEST_URL =
        "https://bpkddmxpyeyxvjyebull.supabase.co/storage/v1/object/public/apks/live-updates/manifest.json";

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
        startBackgroundLiveUpdateCheck();
    }

    private void startBackgroundLiveUpdateCheck() {
        startupHandler.postDelayed(() -> new Thread(() -> {
            try {
                checkAndStageLiveUpdate();
            } catch (Exception ignored) {
                // OTA failure must never affect the running packaged app.
            }
        }, "iftin-live-update").start(), LIVE_UPDATE_CHECK_DELAY_MS);
    }

    private void checkAndStageLiveUpdate() throws Exception {
        JSONObject manifest = readRemoteJson(LIVE_UPDATE_MANIFEST_URL);
        String version = manifest.optString("version", "").trim();
        String bundleUrl = manifest.optString("url", "").trim();
        String expectedSha256 = manifest.optString("sha256", "").trim().toLowerCase(Locale.US);
        long requiredNativeVersion = manifest.optLong("nativeVersionCode", 0L);

        if (version.isEmpty() || bundleUrl.isEmpty()) return;
        if (requiredNativeVersion > 0 && requiredNativeVersion != currentNativeVersionCode()) return;

        SharedPreferences livePrefs = getSharedPreferences(LIVE_UPDATE_PREFS, MODE_PRIVATE);
        SharedPreferences capPrefs = getSharedPreferences(
            com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME,
            MODE_PRIVATE
        );

        String installedVersion = livePrefs.getString(LIVE_UPDATE_VERSION_KEY, "");
        String installedPath = livePrefs.getString(LIVE_UPDATE_PATH_KEY, "");
        if (
            version.equals(installedVersion) &&
            installedPath != null &&
            !installedPath.isEmpty() &&
            new File(installedPath, "index.html").isFile() &&
            installedPath.equals(
                capPrefs.getString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, "")
            )
        ) {
            return;
        }

        File updateRoot = new File(getFilesDir(), "iftin_live_updates");
        if (!updateRoot.exists() && !updateRoot.mkdirs()) return;

        String safeVersion = version.replaceAll("[^A-Za-z0-9._-]", "_");
        File finalDir = new File(updateRoot, safeVersion);
        File tempDir = new File(updateRoot, safeVersion + ".tmp");
        File zipFile = new File(getCacheDir(), "iftin-live-update-" + safeVersion + ".zip");

        deleteRecursively(tempDir);
        if (tempDir.exists() || (!tempDir.mkdirs() && !tempDir.isDirectory())) return;

        downloadFile(bundleUrl, zipFile);
        if (!expectedSha256.isEmpty() && !expectedSha256.equals(sha256(zipFile))) {
            zipFile.delete();
            deleteRecursively(tempDir);
            return;
        }

        unzipSafely(zipFile, tempDir);
        zipFile.delete();

        if (!new File(tempDir, "index.html").isFile()) {
            deleteRecursively(tempDir);
            return;
        }

        deleteRecursively(finalDir);
        if (!tempDir.renameTo(finalDir)) {
            deleteRecursively(tempDir);
            return;
        }

        // Capacitor reads this preference on the next process launch and serves
        // the downloaded bundle locally through the same localhost origin.
        capPrefs.edit()
            .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, finalDir.getAbsolutePath())
            .apply();

        livePrefs.edit()
            .putString(LIVE_UPDATE_VERSION_KEY, version)
            .putString(LIVE_UPDATE_PATH_KEY, finalDir.getAbsolutePath())
            .apply();

        cleanupOldLiveUpdates(updateRoot, finalDir);
    }

    private long currentNativeVersionCode() {
        try {
            return PackageInfoCompat.getLongVersionCode(
                getPackageManager().getPackageInfo(getPackageName(), 0)
            );
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private JSONObject readRemoteJson(String urlText) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally {
            connection.disconnect();
        }
    }

    private void downloadFile(String urlText, File destination) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(30000);
        connection.setUseCaches(false);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream fileOutput = new FileOutputStream(destination);
                 BufferedOutputStream output = new BufferedOutputStream(fileOutput)) {
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format(Locale.US, "%02x", b));
        return out.toString();
    }

    private void unzipSafely(File zipFile, File destination) throws Exception {
        String destinationPath = destination.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[16 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                File out = new File(destination, entry.getName());
                String outPath = out.getCanonicalPath();
                if (!outPath.startsWith(destinationPath)) {
                    throw new SecurityException("Blocked zip path");
                }

                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) throw new Exception("mkdir failed");
                } else {
                    File parent = out.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        throw new Exception("mkdir failed");
                    }
                    try (FileOutputStream fileOutput = new FileOutputStream(out);
                         BufferedOutputStream output = new BufferedOutputStream(fileOutput)) {
                        int read;
                        while ((read = zip.read(buffer)) != -1) output.write(buffer, 0, read);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void cleanupOldLiveUpdates(File root, File keep) {
        File[] entries = root.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            if (!entry.equals(keep)) deleteRecursively(entry);
        }
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        file.delete();
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
