package com.iftin.agents;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

/**
 * Native startup owns only the handoff surface. The customer UI stays web-driven.
 *
 * Startup invariant:
 * Android system splash (1.5s) -> one branded handoff surface -> live TenantGate/app.
 * The handoff surface covers localhost/bootstrap/live navigation so no local login,
 * blank frame, or second differently-branded splash can flash in between.
 */
public class MainActivity extends BridgeActivity {
    private static final long SYSTEM_SPLASH_MS = 1500L;
    private static final long STARTUP_OVERLAY_MAX_MS = 15000L;

    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private long launchStartedAt;
    private View startupOverlay;

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

        showStartupOverlay();
        pollUntilWebSurfaceReady();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showStartupOverlay() {
        if (!(getWindow().getDecorView() instanceof ViewGroup)) return;
        ViewGroup decor = (ViewGroup) getWindow().getDecorView();

        FrameLayout overlay = new FrameLayout(this);
        overlay.setClickable(true);
        overlay.setFocusable(true);
        overlay.setBackgroundColor(getResources().getColor(R.color.splash_background, getTheme()));
        overlay.setElevation(dp(40));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);

        ImageView logo = new ImageView(this);
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        try {
            Drawable icon = getPackageManager().getApplicationIcon(getApplicationInfo());
            logo.setImageDrawable(icon);
        } catch (Exception ignored) {
            // Keep the branded background/spinner even if the launcher icon is unavailable.
        }
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        content.addView(logo, logoParams);

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE));
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(38), dp(38));
        spinnerParams.topMargin = dp(26);
        content.addView(spinner, spinnerParams);

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        overlay.addView(content, contentParams);

        decor.addView(
            overlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        startupOverlay = overlay;
    }

    private void pollUntilWebSurfaceReady() {
        startupHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (startupOverlay == null) return;

                long elapsed = SystemClock.uptimeMillis() - launchStartedAt;
                WebView webView = bridge != null ? bridge.getWebView() : null;

                if (elapsed >= STARTUP_OVERLAY_MAX_MS) {
                    hideStartupOverlay();
                    return;
                }

                if (elapsed < SYSTEM_SPLASH_MS || webView == null) {
                    startupHandler.postDelayed(this, 100L);
                    return;
                }

                String url = webView.getUrl();
                boolean liveTenant = url != null && url.startsWith("https://iftinagents.com/t/");
                boolean packagedFallback = url != null && url.contains("/packaged-app.html");

                if ((liveTenant || packagedFallback) && webView.getProgress() >= 85) {
                    webView.evaluateJavascript(
                        "(function(){return !!document.getElementById('tenant-web-splash') || document.readyState === 'complete';})()",
                        value -> {
                            if ("true".equals(value)) {
                                hideStartupOverlay();
                            } else if (startupOverlay != null) {
                                startupHandler.postDelayed(this, 100L);
                            }
                        }
                    );
                    return;
                }

                startupHandler.postDelayed(this, 100L);
            }
        }, 100L);
    }

    private void hideStartupOverlay() {
        if (startupOverlay == null) return;
        View overlay = startupOverlay;
        startupOverlay = null;
        overlay.animate()
            .alpha(0f)
            .setDuration(80L)
            .withEndAction(() -> {
                if (overlay.getParent() instanceof ViewGroup) {
                    ((ViewGroup) overlay.getParent()).removeView(overlay);
                }
            })
            .start();
    }

    @Override
    protected void onDestroy() {
        startupHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
