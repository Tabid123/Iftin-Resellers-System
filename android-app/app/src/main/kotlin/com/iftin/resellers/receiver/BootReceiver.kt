package com.iftin.resellers.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.iftin.resellers.service.UssdDialerService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || 
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            try {
                // Android 12+ forbids background FGS starts for most types; catch Throwable
                // so BOOT_COMPLETED never crashes the app on Android 14/15/16.
                val serviceIntent = Intent(context, UssdDialerService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                android.util.Log.d("BootReceiver", "✅ Service started on boot")
            } catch (e: Throwable) {
                android.util.Log.e("BootReceiver", "❌ Failed to start service on boot: ${e.message}")
            }
        }
    }
}
