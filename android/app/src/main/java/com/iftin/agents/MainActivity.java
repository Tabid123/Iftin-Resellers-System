package com.iftin.agents;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Keep WebView inset ownership in one place.
 *
 * Capacitor/SystemBars own Android insets. This activity only applies the
 * media-playback behavior required by the tenant voice prompts.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
