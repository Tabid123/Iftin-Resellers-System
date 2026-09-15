package com.iftin.agents;

import android.app.Application;

import com.onesignal.Continue;
import com.onesignal.OneSignal;

/**
 * Process-level push bootstrap for every tenant APK.
 *
 * The tenant slug is stamped by the Android build workflow and attached as a
 * OneSignal tag, so backend sends can target one tenant without leaking to
 * another tenant's installed apps.
 */
public class ApplicationClass extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        final String appId = getString(R.string.onesignal_app_id).trim();
        if (appId.isEmpty()) return;

        OneSignal.initWithContext(this, appId);

        final String tenantSlug = getString(R.string.tenant_slug).trim();
        if (!tenantSlug.isEmpty()) {
            OneSignal.getUser().addTag("tenant_slug", tenantSlug);
        }

        // Android 13+ requires runtime notification permission. OneSignal is
        // responsible for showing the platform prompt and tracking the choice.
        OneSignal.getNotifications().requestPermission(false, Continue.none());
    }
}
