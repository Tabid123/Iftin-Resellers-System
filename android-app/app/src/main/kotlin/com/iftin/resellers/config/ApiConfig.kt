package com.iftin.resellers.config

import com.iftin.resellers.BuildConfig

/**
 * Single source of truth for all Supabase endpoints.
 * Values come from BuildConfig so GitHub Actions (or a local build) can point
 * the APK at a different Supabase project without touching Kotlin code.
 */
object ApiConfig {
    val SUPABASE_URL: String = BuildConfig.SUPABASE_URL.trimEnd('/')
    val FUNCTIONS_URL: String = "$SUPABASE_URL/functions/v1"
    val REST_URL: String = "$SUPABASE_URL/rest/v1"
    val AUTH_URL: String = "$SUPABASE_URL/auth/v1"
    val REALTIME_URL: String =
        SUPABASE_URL.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") +
            "/realtime/v1/websocket"
    val ANON_KEY: String = BuildConfig.SUPABASE_ANON_KEY

    /**
     * No SIM PIN ships inside the APK. The PIN always comes from the server
     * (order.pinCode / device-config). This is an empty string unless a build
     * explicitly overrides it.
     */
    val DEFAULT_SIM_PIN: String = BuildConfig.DEFAULT_SIM_PIN
}
