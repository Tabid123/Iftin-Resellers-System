package com.iftin.agents;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Keep the native shell intentionally thin. The customer UI remains web-driven,
 * while Android only owns platform behavior that WebView cannot reliably infer.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android WebView requires a user gesture for media by default. Tenant
        // voice prompts are part of the app experience and must behave the same
        // way as they do in the browser preview.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
