package com.iftin.agents;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.WindowManager;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

/**
 * APK startup sequence:
 * Android native splash (1.5s) -> TenantGate web splash -> tenant app.
 *
 * Keep native startup intentionally small. The web TenantGate owns the second
 * branded stage, so there must not be another native overlay between them.
 */
public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1500L;

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
    }
}
