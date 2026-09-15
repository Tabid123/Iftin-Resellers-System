package com.iftin.resellers.worker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.iftin.resellers.service.UssdDialerService

/**
 * Watchdog worker that monitors UssdDialerService and restarts it if stopped.
 * This runs independently of the main polling worker as a safety net.
 * Runs every 15 minutes even in Doze mode.
 */
class ServiceWatchdogWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        android.util.Log.d("ServiceWatchdog", "🐕 Watchdog checking service health...")
        
        try {
            val isRunning = isServiceRunning()
            val prefs = context.getSharedPreferences("iftin_watchdog", Context.MODE_PRIVATE)
            
            var consecutiveFailures = prefs.getInt("consecutive_failures", 0)
            
            if (!isRunning) {
                consecutiveFailures++
                prefs.edit().putInt("consecutive_failures", consecutiveFailures).apply()
                
                android.util.Log.w("ServiceWatchdog", "⚠️ Service NOT running! Failure #$consecutiveFailures - Restarting...")
                
                restartService()
                
                if (consecutiveFailures >= 3) {
                    android.util.Log.e("ServiceWatchdog", "🚨 CRITICAL: Service failed $consecutiveFailures times in a row!")
                }
            } else {
                if (consecutiveFailures > 0) {
                    android.util.Log.d("ServiceWatchdog", "✅ Service recovered after $consecutiveFailures failures")
                    prefs.edit().putInt("consecutive_failures", 0).apply()
                } else {
                    android.util.Log.d("ServiceWatchdog", "✅ Service healthy")
                }
            }
            
            prefs.edit().putLong("last_watchdog_check", System.currentTimeMillis()).apply()
            
            return Result.success()
            
        } catch (e: Throwable) {
            android.util.Log.e("ServiceWatchdog", "❌ Watchdog error: ${e.message}")
            e.printStackTrace()
            return Result.retry()
        }
    }
    
    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
            if (UssdDialerService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }
    
    private fun restartService() {
        try {
            val stopIntent = Intent(context, UssdDialerService::class.java)
            context.stopService(stopIntent)
            
            Thread.sleep(500)
            
            val startIntent = Intent(context, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(startIntent)
            } else {
                context.startService(startIntent)
            }
            
            android.util.Log.d("ServiceWatchdog", "✅ Service restarted by watchdog")
        } catch (e: Throwable) {
            android.util.Log.e("ServiceWatchdog", "❌ Failed to restart service: ${e.message}")
        }
    }
}
