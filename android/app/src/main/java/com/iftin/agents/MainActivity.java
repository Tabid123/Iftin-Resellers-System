package com.iftin.agents;

import com.getcapacitor.BridgeActivity;

/**
 * Keep WebView inset ownership in one place.
 *
 * Capacitor 8 SystemBars inset handling is disabled in capacitor.config.json,
 * and @capawesome/capacitor-android-edge-to-edge-support owns Android WebView
 * insets. Do not attach another WindowInsets listener here or manually mutate
 * WebView margins, because that duplicates native inset handling and can make
 * the bottom navigation jump when Android system bars change visibility.
 */
public class MainActivity extends BridgeActivity {
}
