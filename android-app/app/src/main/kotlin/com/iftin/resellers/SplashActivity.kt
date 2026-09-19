package com.iftin.resellers

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.iftin.resellers.auth.AuthRepository

/**
 * Single startup screen. The system splash (white + Iftin Resellers mark)
 * stays on screen until the session check finishes, so there is no second
 * splash, no white flash and no blank frame before Login/Main.
 */
class SplashActivity : ComponentActivity() {

    /** Minimum time the brand stays visible so it never just "flashes". */
    private val minVisibleMs = 900L
    private var ready = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { !ready }
        super.onCreate(savedInstanceState)

        val startedAt = System.currentTimeMillis()
        // Never let an OEM Keystore/backup problem kill the launcher activity.
        // If secure session state is unreadable, recover by showing Login.
        val loggedIn = try {
            AuthRepository(applicationContext).isLoggedIn()
        } catch (e: Throwable) {
            android.util.Log.e("SplashActivity", "Session bootstrap failed; opening Login safely", e)
            false
        }
        val next = if (loggedIn) {
            Intent(this, MainActivity::class.java)
        } else {
            Intent(this, LoginActivity::class.java)
        }

        val wait = (minVisibleMs - (System.currentTimeMillis() - startedAt)).coerceAtLeast(0L)
        window.decorView.postDelayed({
            ready = true
            startActivity(next)
            finish()
            @Suppress("DEPRECATION")
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                overrideActivityTransition(
                    OVERRIDE_TRANSITION_CLOSE,
                    android.R.anim.fade_in,
                    android.R.anim.fade_out
                )
            } else {
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            }
        }, wait)
    }
}
