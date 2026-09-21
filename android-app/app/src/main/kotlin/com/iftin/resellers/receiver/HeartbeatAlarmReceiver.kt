package com.iftin.resellers.receiver

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.service.UssdDialerService
import kotlinx.coroutines.*

/**
 * HeartbeatAlarmReceiver — Sends a ping/self-heal check to the server every 1 minute using AlarmManager
 * alarms as a recovery fallback. Android may throttle alarms in Doze; the foreground
 * service owns the regular heartbeat independently of USSD work.
 */
class HeartbeatAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val HEARTBEAT_INTERVAL_MS = 60 * 1000L // 1 minute self-heal heartbeat
        private const val ACTION_HEARTBEAT = "com.iftin.resellers.HEARTBEAT_PING"

        /**
         * Schedule the first heartbeat alarm. Call from UssdDialerService.onCreate().
         */
        fun schedule(context: Context) {
          try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, HeartbeatAlarmReceiver::class.java).apply {
                action = ACTION_HEARTBEAT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerAt = System.currentTimeMillis() + HEARTBEAT_INTERVAL_MS

            // Android 12+ requires SCHEDULE_EXACT_ALARM to be granted; on 14/15/16 an
            // ungranted exact alarm throws SecurityException and crashes the app.
            val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else true

            if (canExact) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent
                )
            } else {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent
                )
            }
            android.util.Log.d("HeartbeatAlarm", "⏰ Next heartbeat scheduled in 1 minute (exact=$canExact)")
          } catch (e: Throwable) {
            android.util.Log.e("HeartbeatAlarm", "❌ Failed to schedule heartbeat: ${e.message}")
          }
        }

        /**
         * Cancel the heartbeat alarm (e.g. when service is permanently stopped).
         */
        fun cancel(context: Context) {
          try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, HeartbeatAlarmReceiver::class.java).apply {
                action = ACTION_HEARTBEAT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
          } catch (e: Throwable) {
            android.util.Log.e("HeartbeatAlarm", "❌ Failed to cancel heartbeat: ${e.message}")
          }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_HEARTBEAT) return

        android.util.Log.d("HeartbeatAlarm", "💓 Recovery alarm fired — reviving delivery service")

        // IMPORTANT: BroadcastReceiver must return immediately. The foreground
        // UssdDialerService already owns the regular network heartbeat loop.
        // Doing devicePing() under goAsync() here caused Samsung to hold this
        // broadcast for 60s when DNS/network stalled, leading to ANRs exactly
        // while Maamuus discovery was trying to upload its captured menu.
        try {
            val serviceIntent = Intent(context, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Throwable) {
            android.util.Log.e("HeartbeatAlarm", "❌ Could not revive delivery service: ${e.message}")
        } finally {
            // Schedule next recovery alarm before returning; no network work here.
            schedule(context)
        }
    }

    private fun getBatteryLevel(context: Context): Int {
        return try {
            val batteryIntent = context.registerReceiver(
                null,
                android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            val level = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100) ?: 100
            if (level >= 0) (level * 100 / scale) else -1
        } catch (e: Exception) { -1 }
    }

    private fun isCharging(context: Context): Boolean {
        return try {
            val batteryIntent = context.registerReceiver(
                null,
                android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            val status = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == android.os.BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) { false }
    }
}
