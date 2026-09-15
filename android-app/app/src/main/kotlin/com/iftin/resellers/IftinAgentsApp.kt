package com.iftin.resellers

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.work.*
import com.iftin.resellers.service.UssdDialerService
import com.iftin.resellers.worker.ServiceWatchdogWorker
import com.iftin.resellers.worker.UssdPollingWorker
import java.util.concurrent.TimeUnit

class IftinAgentsApp : Application() {
    
    companion object {
        private const val POLLING_WORK_NAME = "ussd_polling_work"
        private const val WATCHDOG_WORK_NAME = "service_watchdog_work"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // DO NOT start foreground service here - Android 12+ (especially 16) 
        // crashes when starting foreground services from Application.onCreate()
        // The service is started from MainActivity after permissions are granted
        
        android.util.Log.d("IftinApp", "✅ App started - service will be launched from MainActivity")
        
        try {
            scheduleReliablePolling()
        } catch (e: Throwable) {
            android.util.Log.e("IftinApp", "Worker scheduling failed: ${e.message}")
        }
        
        android.util.Log.d("IftinApp", "✅ All workers scheduled")
    }
    
    private fun scheduleReliablePolling() {
        val workManager = WorkManager.getInstance(this)
        
        val pollingConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        
        val pollingRequest = PeriodicWorkRequestBuilder<UssdPollingWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(pollingConstraints)
            .setInitialDelay(1, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            POLLING_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            pollingRequest
        )
        
        android.util.Log.d("IftinApp", "📅 UssdPollingWorker scheduled (every 15 min)")
        
        val watchdogRequest = PeriodicWorkRequestBuilder<ServiceWatchdogWorker>(
            15, TimeUnit.MINUTES
        )
            .setInitialDelay(2, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            WATCHDOG_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            watchdogRequest
        )
        
        android.util.Log.d("IftinApp", "🐕 ServiceWatchdogWorker scheduled (every 15 min)")
    }
}
