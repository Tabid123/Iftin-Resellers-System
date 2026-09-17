package com.iftin.agents;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Keeps the Capacitor WebView geometry stable when Android transiently reveals
 * its gesture/navigation bar after a tap. The edge-to-edge plugin normally uses
 * visible system-bar insets, which makes its WebView bottom margin alternate
 * between zero and the navigation-bar height. That native resize cannot be
 * corrected reliably in CSS because it occurs before the web page is painted.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets stableBars = windowInsets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            boolean keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            int stableBottom = keyboardVisible ? 0 : stableBars.bottom;

            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            if (
                params.leftMargin != stableBars.left ||
                params.topMargin != stableBars.top ||
                params.rightMargin != stableBars.right ||
                params.bottomMargin != stableBottom
            ) {
                params.leftMargin = stableBars.left;
                params.topMargin = stableBars.top;
                params.rightMargin = stableBars.right;
                params.bottomMargin = stableBottom;
                view.setLayoutParams(params);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
