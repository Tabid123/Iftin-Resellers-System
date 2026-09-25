package com.iftin.resellers.service

import android.Manifest
import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.iftin.resellers.MainActivity
import com.iftin.resellers.R
import com.iftin.resellers.receiver.HeartbeatAlarmReceiver
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.api.DeliveryApiClient.DeviceSimConfig
import com.iftin.resellers.data.DeliveryDatabase
import com.iftin.resellers.data.DeliveryTask
import com.iftin.resellers.util.PaymentReceiptDedup
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.*
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

class UssdDialerService : Service() {
    companion object {
        private const val MAX_RETRIES = 3
        private const val CHANNEL_ID = "iftin_data_service"
        private const val NOTIFICATION_ID = 1001
        private const val SMS_PREFS_NAME = "sms_inbox_prefs"
        private const val PROCESSED_SMS_IDS_KEY = "processed_sms_ids"
        private const val SMS_POLL_INTERVAL_MS = 5000L // 5 seconds
        private const val SMS_MAX_LOOKBACK_MS = 30 * 60 * 1000L // 30 minutes max lookback for offline recovery
        private const val SMS_DEFAULT_LOOKBACK_MS = 60000L // 1 minute for normal polling
        private const val SMS_COUNT_KEY = "last_sms_count" // Smart SMS polling
        private const val LAST_SMS_POLL_TIME_KEY = "last_sms_poll_time" // Track last successful poll
        private const val DAYTIME_POLL_INTERVAL_MS = 12000L  // fallback when Realtime is disconnected
        private const val NIGHT_POLL_INTERVAL_MS = 20000L   // fallback when Realtime is disconnected
        private const val BUSY_POLL_INTERVAL_MS = 3000L     // drain queue quickly after work is found
        private const val REALTIME_FALLBACK_POLL_INTERVAL_MS = 120000L // 2 min safety poll while Realtime is healthy
        private const val REALTIME_DISCONNECTED_DISCOVERY_POLL_MS = 5000L
        private const val HEARTBEAT_INTERVAL_MS = 60000L     // presence safety margin; server uses a 90s online window
        private const val JITTER_MAX_MS = 2000L             // 1-2s random jitter
        private val API_URL = com.iftin.resellers.config.ApiConfig.FUNCTIONS_URL + "/process-payment-receipt"
    }
    
    // Reuse shared connection-pooled OkHttpClient from DeliveryApiClient (saves ~35% data)
    private val httpClient = DeliveryApiClient.sharedHttpClient
    
    private var serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var discoveryPollingJob: Job? = null
    private var heartbeatJob: Job? = null
    private val ussdMutex = Mutex()
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var wifiLock: WifiManager.WifiLock
    private lateinit var apiClient: DeliveryApiClient
    private lateinit var database: DeliveryDatabase
    private var isRunning = false
    private var lastWakeLockRenewal = 0L
    private var lastSessionCheck = 0L
    
    // Device SIM configuration from server (dynamic per-device routing)
    @Volatile
    private var deviceSimConfig: DeviceSimConfig? = null
    
    // Single-flight order lock: only one order processed at a time
    @Volatile
    private var isProcessingOrder = false
    @Volatile
    private var activeQueueId: String? = null
    private val ORDER_COOLDOWN_MS = 8000L // 8 seconds between orders
    @Volatile
    private var lastOrderCompletedAt = 0L
    private val recentlyProcessedIds = Collections.synchronizedSet(mutableSetOf<String>())
    
    
    // USSD completion detection
    @Volatile
    private var ussdClickReceived = false
    @Volatile
    private var ussdClickCount = 0
    
    private val ussdClickReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == UssdAccessibilityService.ACTION_USSD_CLICK_COMPLETE) {
                ussdClickReceived = true
                ussdClickCount = intent.getIntExtra("click_count", 1)
                android.util.Log.d("UssdDialer", "📢 Received USSD_CLICK_COMPLETE broadcast (click #$ussdClickCount)")
            }
        }
    }
    
    private val deviceId by lazy {
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
    }

    override fun onCreate() {
        super.onCreate()
        
        // Ensure fresh coroutine scope if previously cancelled
        if (!serviceScope.isActive) {
            serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
        }
        
        // Acquire wake lock with 24-hour timeout to keep CPU running when screen is off
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "IftinAgents::UssdDialerLock"
        )
        wakeLock.acquire(24 * 60 * 60 * 1000L)  // 24 hours
        lastWakeLockRenewal = System.currentTimeMillis()
        
        // Acquire WiFi lock to keep WiFi active when screen is off (prevents Doze WiFi sleep)
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "IftinAgents::WifiLock")
        wifiLock.acquire()
        android.util.Log.d("UssdDialer", "📶 WiFi lock acquired — WiFi stays active during screen lock")
        
        apiClient = DeliveryApiClient()
        database = DeliveryDatabase.getInstance(this)
        
        // Alarm is a recovery fallback; the independent service loop sends regular heartbeats.
        HeartbeatAlarmReceiver.schedule(this)
        
        // Register broadcast receiver for USSD click completion
        registerUssdClickReceiver()
        
        // Create notification channel FIRST (required before startForeground)
        createNotificationChannel()
        
        // CRITICAL: Call startForeground IMMEDIATELY to avoid Android 16 crash
        // Must happen within 5 seconds of startForegroundService() call
        val prefs = getSharedPreferences("iftin_data", Context.MODE_PRIVATE)
        val savedSuccessful = prefs.getInt("successful_deliveries", 0)
        val savedFailed = prefs.getInt("failed_deliveries", 0)
        val initText = if (savedSuccessful > 0 || savedFailed > 0) {
            "Active - $savedSuccessful successful, $savedFailed failed"
        } else {
            "Active - Ready for orders"
        }
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // Android 14+ requires explicit foreground service type.
                // NOTE: phoneCall type is NOT allowed unless the app owns an active call —
                // on Android 15/16 it throws SecurityException and kills the app.
                startForeground(NOTIFICATION_ID, createNotification(initText, savedSuccessful, savedFailed),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, createNotification(initText, savedSuccessful, savedFailed))
            }
            android.util.Log.d("UssdDialer", "✅ startForeground called successfully")
        } catch (e: Throwable) {
            android.util.Log.e("UssdDialer", "❌ startForeground failed: ${e.message}")
            // Fallback: dataSync only, then give up cleanly (never let the app crash-loop)
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    startForeground(NOTIFICATION_ID, createNotification(initText, savedSuccessful, savedFailed),
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                } else {
                    startForeground(NOTIFICATION_ID, createNotification(initText, savedSuccessful, savedFailed))
                }
            } catch (e2: Throwable) {
                android.util.Log.e("UssdDialer", "❌ Fallback startForeground also failed: ${e2.message}")
                stopSelf()
                return
            }
        }
        
        // Auto-register device on service start (after foreground is established)
        registerDevice()
        
        // Fetch device SIM configuration from server
        fetchDeviceSimConfig()
    }
    
    private fun registerUssdClickReceiver() {
        try {
            val filter = IntentFilter(UssdAccessibilityService.ACTION_USSD_CLICK_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(ussdClickReceiver, filter, RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(ussdClickReceiver, filter)
            }
            android.util.Log.d("UssdDialer", "✅ Registered USSD click receiver")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Failed to register USSD click receiver: ${e.message}")
        }
    }
    
    private fun registerDevice() {
        serviceScope.launch {
            try {
                val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
                val sim1Number = getSimNumber(0)
                val sim2Number = getSimNumber(1)
                
                android.util.Log.d("UssdDialer", "🔄 Auto-registering device: $deviceId")
                android.util.Log.d("UssdDialer", "📱 Device: $deviceName")
                android.util.Log.d("UssdDialer", "📞 SIM1: $sim1Number, SIM2: $sim2Number")
                
                val result = apiClient.registerDevice(deviceId, deviceName, sim1Number, sim2Number)
                
                if (result.success) {
                    android.util.Log.d("UssdDialer", "✅ Device auto-registered (tenant=${result.tenantId})")
                } else if (result.needsLogin) {
                    android.util.Log.e("UssdDialer", "🔒 Device not bound to a tenant — login required")
                } else {
                    android.util.Log.e("UssdDialer", "❌ Device registration failed: ${result.errorMessage}")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Device registration error: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    /**
     * Fetch device SIM configuration from server for dynamic SIM slot routing
     * This allows admin to configure which provider uses which SIM slot per device
     */
    private fun fetchDeviceSimConfig() {
        serviceScope.launch {
            try {
                android.util.Log.d("UssdDialer", "🔄 Fetching SIM config for device: $deviceId")
                
                val config = apiClient.getDeviceSimConfig(deviceId)
                
                if (config != null) {
                    deviceSimConfig = config
                    android.util.Log.d("UssdDialer", "✅ SIM config loaded: SIM1=${config.sim1Provider}, SIM2=${config.sim2Provider}")
                } else {
                    android.util.Log.w("UssdDialer", "⚠️ No SIM config returned from server, using fallback defaults")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Failed to fetch SIM config: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    private fun getSimNumber(slotIndex: Int): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                    return null
                }
                
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    return subscriptionInfoList[slotIndex].number
                }
            } catch (e: SecurityException) {
                android.util.Log.w("UssdDialer", "⚠️ Permission denied for reading SIM info")
            }
        }
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            isRunning = true
            startPolling()
        } else {
            ensureDiscoveryPollingLoop()
        }
        ensureHeartbeatLoop()
        if (intent?.getBooleanExtra("TRIGGER_IMMEDIATE_POLL", false) == true) {
            // Force immediate poll even if already running (triggered by SMS payment)
            serviceScope.launch {
                pollPendingOrders()
            }
        }
        return START_STICKY
    }

    /**
     * Get base polling interval based on time of day
     * Daytime (05:01-23:59): 12s, Nighttime (00:00-05:00): 20s
     */
    private fun getBaseInterval(): Long {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return if (hour in 0..4) NIGHT_POLL_INTERVAL_MS else DAYTIME_POLL_INTERVAL_MS
    }

    /**
     * Add random jitter (0-2s) to prevent multiple devices hitting DB simultaneously
     */
    private fun addJitter(interval: Long): Long {
        return interval + (Random().nextDouble() * JITTER_MAX_MS).toLong()
    }

    // Presence must not wait for USSD, a held menu, order cooldown, or offline sync.
    private fun ensureHeartbeatLoop() {
        if (heartbeatJob?.isActive == true) return
        heartbeatJob = serviceScope.launch(Dispatchers.IO) {
            while (isRunning && isActive) {
                try {
                    if (!apiClient.devicePing(deviceId, getBatteryLevel(), isCharging(), 0)) {
                        android.util.Log.w("UssdDialer", "Heartbeat was not acknowledged; retrying")
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    android.util.Log.w("UssdDialer", "Heartbeat failed: ${e.message}")
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private fun ensureDiscoveryPollingLoop() {
        if (discoveryPollingJob?.isActive == true) return
        discoveryPollingJob = serviceScope.launch {
            android.util.Log.d("UssdDialer", "🔎 Discovery loop started/recovered")
            while (isRunning && isActive) {
                var claimed = false
                try {
                    claimed = pollDiscoveryJobs()
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ Discovery loop: ${e.message}")
                }
                delay(
                    when {
                        claimed -> 500L
                        realtimeConnected -> REALTIME_FALLBACK_POLL_INTERVAL_MS
                        else -> REALTIME_DISCONNECTED_DISCOVERY_POLL_MS
                    }
                )
            }
        }
    }

    private fun startPolling() {
        // Main order polling loop with dynamic interval + jitter
        serviceScope.launch {
            while (isRunning) {
                try {
                    ensureDiscoveryPollingLoop()

                    // Wake lock renewal: every 12 hours, release and re-acquire to prevent expiry
                    if (System.currentTimeMillis() - lastWakeLockRenewal > 12 * 60 * 60 * 1000L) {
                        try {
                            if (wakeLock.isHeld) wakeLock.release()
                            wakeLock.acquire(24 * 60 * 60 * 1000L)
                            lastWakeLockRenewal = System.currentTimeMillis()
                            android.util.Log.d("UssdDialer", "🔄 Wake lock renewed for another 24h")
                        } catch (e: Exception) {
                            android.util.Log.e("UssdDialer", "❌ Wake lock renewal failed: ${e.message}")
                        }
                    }
                    
                    // Keep the Supabase session alive like Riyokaab.
                    // Without this, a long-running foreground service can stay "active"
                    // while authenticated polling silently stops after the access token expires.
                    if (System.currentTimeMillis() - lastSessionCheck > 10 * 60 * 1000L) {
                        lastSessionCheck = System.currentTimeMillis()
                        try {
                            com.iftin.resellers.auth.AuthRepository(applicationContext).ensureValidSession()
                        } catch (e: Exception) {
                            android.util.Log.w("UssdDialer", "⚠️ Session refresh check failed: ${e.message}")
                        }
                    }

                    // Sync any pending offline updates first
                    syncOfflineQueue()
                    
                    // Poll for pending orders - battery info included in URL (replaces separate /ping)
                    val battery = getBatteryLevel()
                    val charging = isCharging()
                    val foundOrders = pollPendingOrders(battery, charging)
                    
                    
                    // Update notification with current stats when idle
                    if (!foundOrders) {
                        val statsPrefs = getSharedPreferences("iftin_data", Context.MODE_PRIVATE)
                        val s = statsPrefs.getInt("successful_deliveries", 0)
                        val f = statsPrefs.getInt("failed_deliveries", 0)
                        updateNotification("Active - $s successful, $f failed", s, f)
                    }
                    
                    // Realtime is primary. Polling is only a safety net while the socket is healthy.
                    // If Realtime drops, temporarily fall back to the old fast polling cadence.
                    val baseInterval = when {
                        foundOrders -> BUSY_POLL_INTERVAL_MS
                        realtimeConnected -> REALTIME_FALLBACK_POLL_INTERVAL_MS
                        else -> getBaseInterval()
                    }
                    delay(addJitter(baseInterval))
                } catch (e: Exception) {
                    e.printStackTrace()
                    delay(addJitter(getBaseInterval()))
                }
            }
        }
        
        // DISCOVERY (*212*) — Realtime-first with a slow safety poll; fast fallback only if Realtime disconnects.
        ensureDiscoveryPollingLoop()


        // SMS INBOX POLLING - runs every 5 seconds, 24/7
        // This catches ALL SMS including duplicates that BroadcastReceiver misses
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📨 Starting SMS inbox polling (every 5s - FAST MODE)")
            while (isRunning) {
                try {
                    val foundNew = pollSmsInbox()
                    // Fallback retry: if poll returned 0 new SMS but count changed,
                    // wait 5s and re-poll once to catch timing-gap SMS (~1% miss rate fix)
                    if (!foundNew) {
                        // Check if SMS count changed since last successful poll
                        val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
                        val countBefore = prefs.getInt(SMS_COUNT_KEY, -1)
                        delay(5000L)
                        val countCursor = contentResolver.query(
                            Telephony.Sms.Inbox.CONTENT_URI,
                            arrayOf("count(*) AS count"),
                            null, null, null
                        )
                        val countAfter = countCursor?.use {
                            if (it.moveToFirst()) it.getInt(0) else -1
                        } ?: -1
                        if (countAfter > countBefore && countBefore != -1) {
                            android.util.Log.d("UssdDialer", "📨 SMS count changed ($countBefore → $countAfter), retry poll")
                            pollSmsInbox()
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ SMS poll error: ${e.message}")
                }
                delay(SMS_POLL_INTERVAL_MS)
            }
        }
        
        // BULK SMS - Supabase Realtime WebSocket + fallback polling
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📤 Starting Bulk SMS Realtime listener (WebSocket)")
            startBulkSmsRealtimeListener()
        }
        
        // Bulk SMS safety polling. Realtime handles normal delivery; fast fallback is used only while disconnected.
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📤 Starting Bulk SMS adaptive fallback polling")
            while (isRunning) {
                val fallbackDelay = if (realtimeConnected) {
                    REALTIME_FALLBACK_POLL_INTERVAL_MS
                } else {
                    30000L + (Random().nextDouble() * 15000).toLong()
                }
                delay(fallbackDelay)
                try {
                    processPendingBulkSms()
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ Bulk SMS fallback poll error: ${e.message}")
                }
            }
        }
    }
    
    // ==================== BULK SMS via SUPABASE REALTIME ====================
    
    @Volatile
    private var realtimeConnected = false
    private var bulkSmsWebSocket: okhttp3.WebSocket? = null
    private val realtimeClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // Keep alive indefinitely
        .pingInterval(30, TimeUnit.SECONDS)     // Keep connection alive
        .build()
    
    /**
     * Connect to Supabase Realtime WebSocket and listen for bulk_sms_queue INSERTs.
     * Automatically reconnects on disconnect with exponential backoff.
     */
    private suspend fun startBulkSmsRealtimeListener() {
        var retryDelay = 3000L

        while (isRunning) {
            try {
                val authRepo = com.iftin.resellers.auth.AuthRepository(applicationContext)
                if (!authRepo.ensureValidSession()) {
                    realtimeConnected = false
                    android.util.Log.w("UssdDialer", "⚠️ Realtime auth session unavailable; using polling fallback")
                    delay(retryDelay)
                    retryDelay = (retryDelay * 2).coerceAtMost(60000L)
                    continue
                }

                val accessToken = authRepo.getAccessToken()
                val tenantId = authRepo.getTenantId()
                if (accessToken.isNullOrBlank() || tenantId.isNullOrBlank()) {
                    realtimeConnected = false
                    delay(retryDelay)
                    retryDelay = (retryDelay * 2).coerceAtMost(60000L)
                    continue
                }

                android.util.Log.d("UssdDialer", "🔌 Connecting unified Supabase Realtime listener...")

                // Catch up once before relying on events.
                processPendingBulkSms()
                try { pollPendingOrders() } catch (_: Exception) {}
                try { pollDiscoveryJobs() } catch (_: Exception) {}

                val wsUrl = "${com.iftin.resellers.config.ApiConfig.REALTIME_URL}?apikey=${apiClient.getAnonKey()}&vsn=1.0.0"
                val request = Request.Builder().url(wsUrl).build()
                val connected = CompletableDeferred<Boolean>()
                val topic = "realtime:delivery-agent-$deviceId"

                bulkSmsWebSocket = realtimeClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        retryDelay = 3000L

                        val postgresChanges = org.json.JSONArray().apply {
                            // Delivery order assigned to this physical device.
                            put(JSONObject().apply {
                                put("event", "*")
                                put("schema", "public")
                                put("table", "delivery_queue")
                                put("filter", "android_device_id=eq.$deviceId")
                            })
                            // Discovery starts before a device is claimed, so subscribe at tenant level.
                            put(JSONObject().apply {
                                put("event", "*")
                                put("schema", "public")
                                put("table", "ussd_package_discoveries")
                                put("filter", "tenant_id=eq.$tenantId")
                            })
                            put(JSONObject().apply {
                                put("event", "INSERT")
                                put("schema", "public")
                                put("table", "bulk_sms_queue")
                                put("filter", "device_id=eq.$deviceId")
                            })
                        }

                        val subscribePayload = JSONObject().apply {
                            put("topic", topic)
                            put("event", "phx_join")
                            put("payload", JSONObject().apply {
                                put("access_token", accessToken)
                                put("config", JSONObject().apply {
                                    put("broadcast", JSONObject().apply {
                                        put("ack", false)
                                        put("self", false)
                                    })
                                    put("presence", JSONObject().apply {
                                        put("enabled", false)
                                        put("key", "")
                                    })
                                    put("postgres_changes", postgresChanges)
                                    put("private", false)
                                })
                            })
                            put("ref", "2")
                            put("join_ref", "2")
                        }
                        webSocket.send(subscribePayload.toString())
                        connected.complete(true)
                    }

                    override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                        try {
                            val msg = JSONObject(text)
                            val event = msg.optString("event", "")
                            val ref = msg.optString("ref", "")

                            if (event == "phx_reply" && ref == "2") {
                                val status = msg.optJSONObject("payload")?.optString("status", "")
                                realtimeConnected = status == "ok"
                                android.util.Log.d("UssdDialer", "📡 Realtime subscription status=$status")
                                return
                            }
                            if (event == "phx_close") {
                                realtimeConnected = false
                                return
                            }

                            if (msg.optString("topic", "").startsWith("realtime:") && event == "postgres_changes") {
                                val data = msg.optJSONObject("payload")?.optJSONObject("data")
                                val table = data?.optString("table", "").orEmpty()
                                val record = data?.optJSONObject("record")

                                when (table) {
                                    "delivery_queue" -> {
                                        if (record?.optString("android_device_id") == deviceId &&
                                            record.optString("status") == "pending") {
                                            serviceScope.launch {
                                                try { pollPendingOrders() } catch (_: Exception) {}
                                            }
                                        }
                                    }
                                    "ussd_package_discoveries" -> {
                                        if (record?.optString("tenant_id") == tenantId &&
                                            record.optString("status") == "pending") {
                                            serviceScope.launch {
                                                try { pollDiscoveryJobs() } catch (_: Exception) {}
                                            }
                                        }
                                    }
                                    "bulk_sms_queue" -> {
                                        if (record?.optString("device_id") == deviceId &&
                                            record.optString("status") == "pending") {
                                            serviceScope.launch { processPendingBulkSms() }
                                        }
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("UssdDialer", "❌ Realtime message parse error: ${e.message}")
                        }
                    }

                    override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                        realtimeConnected = false
                        bulkSmsWebSocket = null
                        android.util.Log.e("UssdDialer", "❌ Realtime WebSocket failed: ${t.message}")
                        connected.complete(false)
                    }

                    override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                        realtimeConnected = false
                        bulkSmsWebSocket = null
                        android.util.Log.w("UssdDialer", "🔌 Realtime WebSocket closed: $reason")
                        connected.complete(false)
                    }
                })

                val success = connected.await()
                if (success) {
                    while (isRunning && bulkSmsWebSocket != null) {
                        delay(25000L)
                        try {
                            // Refresh Realtime authorization without reconnecting after JWT refresh.
                            val freshToken = com.iftin.resellers.auth.AuthRepository(applicationContext).getAccessToken()
                            if (!freshToken.isNullOrBlank()) {
                                val authUpdate = JSONObject().apply {
                                    put("topic", topic)
                                    put("event", "access_token")
                                    put("payload", JSONObject().put("access_token", freshToken))
                                    put("ref", System.currentTimeMillis().toString())
                                    put("join_ref", "2")
                                }
                                bulkSmsWebSocket?.send(authUpdate.toString())
                            }

                            val heartbeat = JSONObject().apply {
                                put("topic", "phoenix")
                                put("event", "heartbeat")
                                put("payload", JSONObject())
                                put("ref", System.currentTimeMillis().toString())
                            }
                            val heartbeatSent = bulkSmsWebSocket?.send(heartbeat.toString()) ?: false
                            if (!heartbeatSent) break
                        } catch (e: Exception) {
                            android.util.Log.e("UssdDialer", "❌ Realtime heartbeat failed: ${e.message}")
                            break
                        }
                    }
                }

                realtimeConnected = false
                bulkSmsWebSocket?.close(1000, "Reconnecting")
                bulkSmsWebSocket = null
            } catch (e: Exception) {
                realtimeConnected = false
                android.util.Log.e("UssdDialer", "❌ Realtime listener error: ${e.message}")
            }

            if (isRunning) {
                delay(retryDelay)
                retryDelay = (retryDelay * 2).coerceAtMost(60000L)
            }
        }
    }

    /**
     * Process all pending bulk SMS items for this device.
     * Runs in a while(true) loop until queue is empty.
     * Maintains 2-3s delay between sends to avoid carrier throttling.
     * Uses mutex to prevent concurrent processing.
     */
    @Volatile
    private var isProcessingBulkSms = false
    
    private suspend fun processPendingBulkSms() {
        if (isProcessingBulkSms) {
            android.util.Log.d("UssdDialer", "⏳ Bulk SMS already processing, skipping")
            return
        }
        isProcessingBulkSms = true
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                return
            }
            
            // Batch loop: keep processing until queue is empty
            while (isRunning) {
                val tasks = apiClient.getPendingBulkSms(deviceId)
                if (tasks.isEmpty()) {
                    android.util.Log.d("UssdDialer", "📤 Bulk SMS queue empty, stopping batch loop")
                    break
                }
                
                android.util.Log.d("UssdDialer", "📤 Processing ${tasks.size} pending bulk SMS (batch)")
                
                for (task in tasks) {
                    try {
                        val message = apiClient.getBulkSmsCampaignMessage(task.campaignId)
                        if (message == null) {
                            apiClient.updateBulkSmsStatus(task.id, task.campaignId, "failed", "Campaign message not found")
                            continue
                        }
                        
                        val formattedPhone = task.phoneNumber
                            .replace("+252", "0")
                            .replace("+", "")
                            .let { if (!it.startsWith("0") && it.length == 9) "0$it" else it }
                        
                        val simSlotIndex = (task.simSlot ?: 1) - 1
                        val subscriptionId = getSubscriptionIdForSlot(simSlotIndex)
                        
                        val smsManager: SmsManager = if (subscriptionId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                getSystemService(SmsManager::class.java).createForSubscriptionId(subscriptionId)
                            } else {
                                @Suppress("DEPRECATION")
                                SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                            }
                        } else {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                getSystemService(SmsManager::class.java)
                            } else {
                                @Suppress("DEPRECATION")
                                SmsManager.getDefault()
                            }
                        }
                        
                        val parts = smsManager.divideMessage(message)
                        if (parts.size > 1) {
                            smsManager.sendMultipartTextMessage(formattedPhone, null, parts, null, null)
                        } else {
                            smsManager.sendTextMessage(formattedPhone, null, message, null, null)
                        }
                        
                        android.util.Log.d("UssdDialer", "✅ Bulk SMS sent to $formattedPhone from SIM${simSlotIndex + 1}")
                        apiClient.updateBulkSmsStatus(task.id, task.campaignId, "sent", null)
                        
                        // 2-3s delay between sends to avoid carrier throttling
                        val throttleDelay = 2000L + (Random().nextDouble() * 1000).toLong()
                        delay(throttleDelay)
                        
                    } catch (e: Exception) {
                        android.util.Log.e("UssdDialer", "❌ Bulk SMS send error: ${e.message}")
                        apiClient.updateBulkSmsStatus(task.id, task.campaignId, "failed", e.message)
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Bulk SMS process error: ${e.message}")
        } finally {
            isProcessingBulkSms = false
        }
    }
    
    // ==================== OTP SMS SENDING ====================
    
    /**
     * Poll for pending OTP tasks and send SMS directly from device
     */
    private suspend fun pollAndSendOtpSms() {
        try {
            // Check SEND_SMS permission
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.w("UssdDialer", "📱 No SEND_SMS permission for OTP sending")
                return
            }
            
            // Fetch pending OTP tasks from server
            val tasks = apiClient.getPendingOtpTasks(deviceId)
            
            if (tasks.isEmpty()) {
                return // No pending OTP tasks
            }
            
            android.util.Log.d("UssdDialer", "📱 Found ${tasks.size} pending OTP tasks")
            
            for (task in tasks) {
                try {
                    // Pass provider to sendOtpSms for SIM slot selection
                    val success = sendOtpSms(task.phoneNumber, task.otpCode, task.provider)
                    
                    if (success) {
                        android.util.Log.d("UssdDialer", "✅ OTP SMS sent to ${task.phoneNumber} via ${task.provider}")
                        apiClient.updateOtpStatus(task.id, "sent", null)
                    } else {
                        android.util.Log.e("UssdDialer", "❌ Failed to send OTP to ${task.phoneNumber}")
                        apiClient.updateOtpStatus(task.id, "failed", "SMS send failed")
                    }
                    
                    // Small delay between multiple SMS sends
                    delay(1000)
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ OTP send error: ${e.message}")
                    apiClient.updateOtpStatus(task.id, "failed", e.message)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ OTP poll error: ${e.message}")
        }
    }
    
    /**
     * Get subscription ID for a specific SIM slot
     * @param slotIndex 0 for SIM1, 1 for SIM2
     * @return subscriptionId or -1 if not found
     */
    private fun getSubscriptionIdForSlot(slotIndex: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) 
                    != PackageManager.PERMISSION_GRANTED) {
                    android.util.Log.w("UssdDialer", "📱 No READ_PHONE_STATE permission for SIM selection")
                    return -1
                }
                
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) 
                    as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    val subId = subscriptionInfoList[slotIndex].subscriptionId
                    android.util.Log.d("UssdDialer", "📱 SIM slot $slotIndex → subscriptionId: $subId")
                    return subId
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Error getting subscription ID: ${e.message}")
            }
        }
        return -1
    }

    /**
     * Get SIM slot for provider based on device config
     * DYNAMIC: Uses database config fetched from server
     * Fallback: M31-style defaults (Hormuud=SIM1, others=SIM2)
     * @param provider Provider name (hormuud, somnet, somtel, amtel)
     * @return 0 for SIM1, 1 for SIM2
     */
    private fun getSimSlotForProvider(provider: String): Int {
        val config = deviceSimConfig
        val providerLower = provider.lowercase()
        
        // Dynamic config from database (preferred) - per-device routing
        if (config != null) {
            // Check if provider matches SIM1
            if (config.sim1Provider?.lowercase() == providerLower) {
                android.util.Log.d("UssdDialer", "📱 $provider → SIM1 (from database config)")
                return 0
            }
            // Check if provider matches SIM2
            if (config.sim2Provider?.lowercase() == providerLower) {
                android.util.Log.d("UssdDialer", "📱 $provider → SIM2 (from database config)")
                return 1
            }
            android.util.Log.w("UssdDialer", "⚠️ Provider '$provider' not in config (SIM1=${config.sim1Provider}, SIM2=${config.sim2Provider}), using fallback")
        } else {
            android.util.Log.w("UssdDialer", "⚠️ No SIM config loaded for device, using hardcoded fallback")
        }
        
        // Fallback to M31-style defaults (maintains backward compatibility)
        return when (providerLower) {
            "hormuud" -> 0   // SIM1 - default primary
            else -> 1        // SIM2 - default secondary
        }
    }

    /**
     * Send OTP verification SMS using SmsManager with SIM slot selection
     * @param phoneNumber Full phone number with country code (+252XXXXXXXXX)
     * @param otpCode The 6-digit OTP code
     * @param provider Provider name for SIM routing (hormuud, somnet, etc.)
     * @return true if SMS was sent successfully
     */
    private fun sendOtpSms(phoneNumber: String, otpCode: String, provider: String): Boolean {
        return try {
            // Format phone number: remove +252 prefix, add 0
            val formattedPhone = phoneNumber
                .replace("+252", "0")
                .replace("+", "")
                .let { if (!it.startsWith("0") && it.length == 9) "0$it" else it }
            
            // Build SMS message in Somali
            val message = "Iftin Resellers: Code-kaagu waa $otpCode. Wuxuu dhacayaa 5 daqiiqo kadib."
            
            // Determine which SIM slot to use based on provider
            val simSlot = getSimSlotForProvider(provider)
            val subscriptionId = getSubscriptionIdForSlot(simSlot)
            
            android.util.Log.d("UssdDialer", "📱 Sending OTP SMS to: $formattedPhone")
            android.util.Log.d("UssdDialer", "📱 Provider: $provider → SIM${simSlot + 1} (subscriptionId: $subscriptionId)")
            
            val smsManager: SmsManager = if (subscriptionId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                // ✅ Use specific SIM based on provider
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java).createForSubscriptionId(subscriptionId)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                }
            } else {
                // Fallback to default SIM if subscription ID not found
                android.util.Log.w("UssdDialer", "⚠️ Falling back to default SIM (subscriptionId not found)")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
            }
            
            smsManager.sendTextMessage(
                formattedPhone,  // Destination phone number
                null,            // Service center address (null = default)
                message,         // SMS message
                null,            // Sent intent
                null             // Delivery intent
            )
            
            android.util.Log.d("UssdDialer", "✅ OTP SMS dispatched from SIM${simSlot + 1} to $formattedPhone")
            true
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ SMS send error: ${e.message}")
            e.printStackTrace()
            false
        }
    }
    
    // ==================== SMS INBOX POLLING ====================
    
    /**
     * Read SMS inbox directly using Content Provider.
     * Each SMS has a unique _id, so we track by _id to catch ALL messages
     * including duplicates with identical body content.
     */
    private fun pollSmsInbox(): Boolean {
        var foundNewSms = false
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.w("UssdDialer", "📨 No READ_SMS permission")
                return false
            }
            
            // ==================== SMART SMS POLLING ====================
            // Check total SMS count FIRST — if no new SMS arrived, skip full inbox scan.
            // This saves ~25% battery by avoiding unnecessary ContentResolver queries.
            val countCursor = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf("count(*) AS count"),
                null, null, null
            )
            val currentSmsCount = countCursor?.use {
                if (it.moveToFirst()) it.getInt(0) else -1
            } ?: -1
            
            val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
            val lastSmsCount = prefs.getInt(SMS_COUNT_KEY, -1)
            
            if (currentSmsCount == lastSmsCount && lastSmsCount != -1) {
                // No new SMS — skip full inbox parse
                return false
            }
            
            // Save new count
            prefs.edit().putInt(SMS_COUNT_KEY, currentSmsCount).apply()
            // ==================== END SMART SMS POLLING ====================
            
            // Use last-poll-timestamp instead of fixed 1-minute cutoff
            // This catches ALL SMS that arrived while device was offline
            val now = System.currentTimeMillis()
            val lastPollTime = prefs.getLong(LAST_SMS_POLL_TIME_KEY, 0L)
            val cutoffTime = if (lastPollTime > 0L) {
                // Don't look back more than 30 minutes to avoid processing ancient SMS
                maxOf(lastPollTime, now - SMS_MAX_LOOKBACK_MS)
            } else {
                // First run ever - use default 1 minute
                now - SMS_DEFAULT_LOOKBACK_MS
            }
            
            val cursor: Cursor? = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.SUBSCRIPTION_ID
                ),
                "${Telephony.Sms.DATE} > ?",
                arrayOf(cutoffTime.toString()),
                "${Telephony.Sms.DATE} DESC"
            )
            
            cursor?.use {
                var newCount = 0
                while (it.moveToNext()) {
                    val smsId = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID))
                    val address = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: ""
                    val body = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
                    val subscriptionId = it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.SUBSCRIPTION_ID))
                    
                    // Create TRIPLE unique key: _id + timestamp + bodyHash
                    val uniqueKey = "${smsId}_${date}_${body.hashCode()}"
                    
                    // Check if we already processed this SMS by unique key
                    if (!isSmsPreviouslyProcessed(uniqueKey)) {
                        // Mark as processed FIRST to prevent duplicates
                        markSmsAsProcessed(uniqueKey)
                        
                        // Parse and process
                        val receiverSim = getSimNameBySubscriptionId(subscriptionId)
                        val paymentInfo = parsePaymentSms(body, address, receiverSim)
                        
                        if (paymentInfo != null) {
                            val receiptFingerprint = PaymentReceiptDedup.buildReceiptFingerprint(
                                paymentInfo.senderPhone,
                                paymentInfo.amount,
                                paymentInfo.smsBody,
                                date
                            )

                            if (!PaymentReceiptDedup.tryMarkFingerprint(applicationContext, receiptFingerprint)) {
                                android.util.Log.d("UssdDialer", "⏭️ Duplicate payment SMS skipped locally: $receiptFingerprint")
                                continue
                            }

                            val stableTxId = PaymentReceiptDedup.buildStableReceiptTxId(
                                paymentInfo.senderPhone,
                                paymentInfo.amount,
                                paymentInfo.smsBody,
                                date
                            )

                            android.util.Log.d("UssdDialer", "📨 NEW PAYMENT SMS (ID: $smsId, tx: $stableTxId): sender=${paymentInfo.senderPhone}, amount=${paymentInfo.amount}")
                            sendPaymentToApi(paymentInfo, stableTxId, date)
                            newCount++
                        }
                    }
                }
                
                if (newCount > 0) {
                    android.util.Log.d("UssdDialer", "📨 Processed $newCount new payment SMS from inbox (lookback: ${(now - cutoffTime) / 1000}s)")
                    foundNewSms = true
                }
            }
            
            // Save last successful poll time — next poll will use this as cutoff
            prefs.edit().putLong(LAST_SMS_POLL_TIME_KEY, now).apply()
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ SMS inbox read error: ${e.message}")
            e.printStackTrace()
        }
        return foundNewSms
    }
    
    private fun isSmsPreviouslyProcessed(uniqueKey: String): Boolean {
        val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
        val processedIds = prefs.getStringSet(PROCESSED_SMS_IDS_KEY, emptySet()) ?: emptySet()
        return processedIds.contains(uniqueKey)
    }
    
    private fun markSmsAsProcessed(uniqueKey: String) {
        val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
        val processedIds = prefs.getStringSet(PROCESSED_SMS_IDS_KEY, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
        processedIds.add(uniqueKey)
        
        // Keep only last 1000 IDs to avoid memory issues
        val trimmedIds = if (processedIds.size > 1000) {
            processedIds.toList().takeLast(1000).toMutableSet()
        } else {
            processedIds
        }
        
        prefs.edit().putStringSet(PROCESSED_SMS_IDS_KEY, trimmedIds).apply()
    }
    
    /**
     * Get actual SIM phone number by subscription ID, falling back to provider name
     */
    private fun getSimNameBySubscriptionId(subscriptionId: Int): String {
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val info = subscriptionManager.getActiveSubscriptionInfo(subscriptionId)
                val slotIndex = info?.simSlotIndex ?: 0
                
                // Try to get actual phone number first
                val simNumber = getSimNumber(slotIndex)
                if (!simNumber.isNullOrEmpty() && simNumber.length >= 7) {
                    android.util.Log.d("UssdDialer", "📱 Using actual SIM number for receiver_sim: $simNumber (slot $slotIndex)")
                    return simNumber
                }
                
                // Fallback to provider name
                return if (slotIndex == 0) "hormuud" else "somnet"
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "Error getting SIM name: ${e.message}")
        }
        return "hormuud"
    }
    
    private fun parsePaymentSms(body: String, sender: String, receiverSim: String): PaymentInfo? {
        val bodyLower = body.lowercase()
        
        // Ignore SEND confirmations
        if (bodyLower.contains("uwareejisay") || 
            bodyLower.contains("you have sent") || 
            bodyLower.contains("sent to")) {
            return null
        }
        
        // Ignore SubAccount/internal transfers
        if (bodyLower.contains("subaccount") || 
            bodyLower.contains("sub account") ||
            bodyLower.contains("ku shubashada")) {
            return null
        }
        
        // CRITICAL: Only process SMS with "ka heshay" or "received from" patterns
        val hasKaHeshay = bodyLower.contains("ka heshay")
        val hasReceivedFrom = bodyLower.contains("received from")
        val hasLacagKaHeshay = bodyLower.contains("lacag ayaad ka heshay")
        
        if (!hasKaHeshay && !hasReceivedFrom && !hasLacagKaHeshay) {
            return null
        }
        
        val amount = extractAmount(body) ?: return null
        val actualSender = extractSenderPhone(body) ?: return null
        
        return PaymentInfo(
            senderPhone = actualSender,
            receiverSim = receiverSim,
            amount = amount,
            smsBody = body
        )
    }
    
    private fun extractAmount(body: String): Double? {
        val patterns = listOf(
            """\$(\d+\.?\d*)""".toRegex(),
            """(\d+\.?\d*)\s*USD""".toRegex(RegexOption.IGNORE_CASE),
            """(\d+\.?\d*)\s*DOLLAR""".toRegex(RegexOption.IGNORE_CASE),
            """lacag.*?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)
        )
        
        for (pattern in patterns) {
            val match = pattern.find(body)
            if (match != null) {
                return match.groupValues[1].toDoubleOrNull()
            }
        }
        return null
    }
    
    /**
     * Scan inbox SMS for a recent deduction message ("ugu shubtay" / "haraagaagu waa")
     * matching the receiver phone. Used as fallback when USSD callback times out.
     * Returns the matched SMS body, or null if not found.
     */
    private fun findRecentDeductionSms(receiverPhone: String, simSlot: Int): String? {
        try {
            val normalizedReceiver = normalizeSomaliPhone(receiverPhone)
            if (normalizedReceiver.length < 9) return null
            
            // Look back 60 seconds
            val cutoffTime = System.currentTimeMillis() - 60_000L
            
            val cursor = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms.DATE} > ?",
                arrayOf(cutoffTime.toString()),
                "${Telephony.Sms.DATE} DESC"
            )
            
            cursor?.use {
                while (it.moveToNext()) {
                    val body = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: continue
                    val bodyLower = body.lowercase()
                    
                    // Must be a deduction/success SMS
                    val isDeduction = bodyLower.contains("ugu shubtay") ||
                                      bodyLower.contains("haraagaagu waa") ||
                                      bodyLower.contains("u wareejisay") ||
                                      bodyLower.contains("ku guulaysatay")
                    
                    if (!isDeduction) continue
                    
                    // Must reference the receiver phone (any format)
                    val bodyDigitsOnly = body.replace(Regex("\\D"), "")
                    if (bodyDigitsOnly.contains(normalizedReceiver)) {
                        android.util.Log.d("UssdDialer", "📨 Matched deduction SMS for $normalizedReceiver: ${body.take(120)}")
                        return body
                    }
                }
            }
            return null
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ findRecentDeductionSms error: ${e.message}")
            return null
        }
    }
    /**
     * Normalize Somali phone to canonical 9-digit local format
     * 252685837139 -> 685837139, 0685837139 -> 685837139, 685837139 -> 685837139
     */
    private fun normalizeSomaliPhone(phone: String): String {
        var digits = phone.replace(Regex("\\D"), "")
        if (digits.startsWith("252") && digits.length >= 12) {
            digits = digits.substring(3)
        }
        if (digits.startsWith("0") && digits.length == 10) {
            digits = digits.substring(1)
        }
        return if (digits.length >= 9) digits.takeLast(9) else digits
    }

    private fun extractSenderPhone(body: String): String? {
        // Captures 9, 10, or 12 digit Somali phone numbers
        val phoneCapture = """(\+?252\d{9}|0\d{9}|\d{9})"""
        
        // Pattern 1: "ka heshay 252685837139"
        val kaHeshayPattern = """ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        kaHeshayPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 2: "waxaad...ka heshay"
        val waxaadKaPattern = """waxaad.*?ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        waxaadKaPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 3: "received from"
        val receivedFromPattern = """received\s+from\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedFromPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 4: "lacag ayaad ka heshay"
        val lacagPattern = """lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        lacagPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Fallback
        val fallbackPattern = """ka.*?heshay.*?$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        fallbackPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Amtel: "received Airtime from 252710000040"
        val receivedAirtimePattern = """received\s+airtime\s+from\s+$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedAirtimePattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        return null
    }
    
    private fun sendPaymentToApi(paymentInfo: PaymentInfo, txId: String, smsTimestamp: Long) {
        serviceScope.launch(Dispatchers.IO) {
            try {
                val json = JSONObject().apply {
                    put("sender_phone", paymentInfo.senderPhone)
                    put("receiver_sim", paymentInfo.receiverSim)
                    put("amount", paymentInfo.amount)
                    put("sms_body", paymentInfo.smsBody)
                    put("tx_id", txId)  // Unique transaction ID
                    put("sms_timestamp", smsTimestamp)  // Exact SMS timestamp
                }
                
                android.util.Log.d("UssdDialer", "⚡ Sending to API with tx_id: $txId")
                
                val requestBody = json.toString().toRequestBody("application/json".toMediaType())
                
                val request = Request.Builder()
                    .url(API_URL)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", apiClient.getAnonKey())
                    .addHeader("Authorization", "Bearer ${apiClient.getAnonKey()}")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""
                
                if (response.isSuccessful) {
                    android.util.Log.d("UssdDialer", "📨 Payment sent to API: $responseBody")
                    
                    // Set flag for AccessibilityService
                    setExpectingUssdDialogs()
                    
                    // Trigger immediate order poll
                    pollPendingOrders()
                } else {
                    android.util.Log.e("UssdDialer", "📨 API error: ${response.code} - $responseBody")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "📨 Error sending to API: ${e.message}")
            }
        }
    }
    
    private fun setExpectingUssdDialogs() {
        try {
            val prefs = getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("expecting_ussd_dialogs", true)
                .putLong("last_ussd_time", System.currentTimeMillis())
                .apply()
            android.util.Log.d("UssdDialer", "🚩 Set expecting_ussd_dialogs = true")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "Failed to set USSD flag: ${e.message}")
        }
    }
    
    data class PaymentInfo(
        val senderPhone: String,
        val receiverSim: String,
        val amount: Double,
        val smsBody: String
    )
    
    // ==================== END SMS INBOX POLLING ====================

    private suspend fun pollPendingOrders(batteryLevel: Int = -1, charging: Boolean = false): Boolean {
        if (!ussdMutex.tryLock()) return false
        try {
            return pollPendingOrdersLocked(batteryLevel, charging)
        } finally {
            ussdMutex.unlock()
        }
    }

    private suspend fun pollPendingOrdersLocked(batteryLevel: Int, charging: Boolean): Boolean {
        // Single-flight: skip if already processing an order
        if (isProcessingOrder) {
            android.util.Log.d("UssdDialer", "⏳ Order already processing (queueId=$activeQueueId), skipping poll")
            return false
        }
        
        // Cooldown: wait between orders
        val timeSinceLastOrder = System.currentTimeMillis() - lastOrderCompletedAt
        if (timeSinceLastOrder < ORDER_COOLDOWN_MS && lastOrderCompletedAt > 0) {
            android.util.Log.d("UssdDialer", "⏳ Order cooldown (${ORDER_COOLDOWN_MS - timeSinceLastOrder}ms remaining)")
            return false
        }
        
        try {
            val orders = apiClient.getPendingOrders(deviceId, batteryLevel, charging)
            if (orders.orders.isNotEmpty()) {
                val order = orders.orders.first() // Process only one at a time
                
                // Skip recently processed orders
                if (recentlyProcessedIds.contains(order.id)) {
                    android.util.Log.d("UssdDialer", "⏳ Order ${order.id} recently processed, skipping")
                    return false
                }
                
                processOrder(order, order.provider)
                return true
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }

    // ==================== USSD PACKAGE DISCOVERY ====================
    /**
     * Qabo codsi baaris ah (*212*{lambar}#), dooro Menu 1 (tusaale "Data"),
     * kadib menu-ga xirmooyinka akhri oo server-ka ku celi. Iibsi lama dhameystirayo.
     */
    private suspend fun pollDiscoveryJobs(): Boolean {
        if (!ussdMutex.tryLock()) return false
        try {
            return pollDiscoveryJobsLocked()
        } finally {
            ussdMutex.unlock()
        }
    }

    private suspend fun pollDiscoveryJobsLocked(): Boolean {
        if (isProcessingOrder) return false

        val job = try {
            apiClient.claimNextDiscovery(deviceId)
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Discovery claim failed: ${e.message}")
            null
        } ?: return false

        isProcessingOrder = true
        try {
            android.util.Log.d("UssdDialer", "🔎 [Discovery] Job ${job.id} phone=${job.phoneNumber} menu1=${job.menu1Label}")

            val prefix = Ussd870Flow.dialPrefix(job.ussdCode)
            val provider = when (prefix) {
                "*866*" -> "Somnet"
                "*101*" -> "Somtel"
                else -> "Hormuud"
            }

            getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE).edit()
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME)
                .putString("current_receiver", job.phoneNumber)
                .putString("current_amount", "")
                .apply()

            Ussd870Flow.activateDiscovery(this, job.menu1Label, prefix, hold = true)
            val dialCode = Ussd870Flow.triggerCode(job.phoneNumber, prefix)
            android.util.Log.d("UssdDialer", "🔎 [Discovery] Dialing $dialCode")

            val dialed = dialUssdCode(dialCode, job.phoneNumber, null, provider, null)

            // Sug ilaa 45s in menu-ga xirmooyinka la qabto.
            // Discovery dial-ku hadda isla markiiba ayuu kusoo laabtaa watcher-kan, sidaas darteed
            // 45s waa carrier-response window dhab ah (ma aha 60s wait + watcher). Tani waxay
            // ka hortagtaa false timeout-yada shabakadda gaabiska ah iyadoo backend 90s lease-ka
            // weli si ammaan ah uga dheer yahay.
            // Fallback: haddii accessibility-gu uusan step-ka match gareyn, dialog kasta
            // waa la kaydiyaa KEY_LAST_USSD_RESPONSE — halkaas ka akhri menu-ga xirmooyinka.
            val ussdPrefs = getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
            var menuText: String? = null
            var waited = 0
            while (waited < 45000 && menuText.isNullOrBlank()) {
                // Hubi isla markiiba (ha sugin 200ms marka hore)
                menuText = Ussd870Flow.consumeDiscoveryMenu(this)
                if (menuText.isNullOrBlank()) {
                    val last = ussdPrefs.getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, null)
                    if (!last.isNullOrBlank() && Ussd870Flow.isPackageMenuDialog(last)) {
                        android.util.Log.d("UssdDialer", "🔎 [Discovery] Menu laga helay last-response fallback")
                        menuText = last
                    }
                }
                if (!menuText.isNullOrBlank()) break
                delay(100)
                waited += 100
            }

            // ⚡ Isla markii menu-ga la helo, server-ka u dir HORAY inta aan la nadiifin dialog-ga
            if (menuText.isNullOrBlank()) {
                Ussd870Flow.deactivate(this)
                UssdAccessibilityService.closeUssdSession()
                delay(1500)
                Ussd870Flow.clearDiscovery(this)
                val reason = if (!dialed) "USSD lama wacin" else "Menu lama helin"
                android.util.Log.w("UssdDialer", "⚠️ [Discovery] Failed: $reason")
                apiClient.completeDiscovery(deviceId, job.id, null, emptyList(), reason)
            } else {
                val items = Ussd870Flow.parseMenuItems(menuText)
                android.util.Log.d("UssdDialer", "✅ [Discovery] ${items.size} xirmo la helay — server loo dirayaa isla markiiba")
                if (items.isEmpty()) {
                    apiClient.completeDiscovery(deviceId, job.id, menuText, emptyList(), "Xirmooyin lama akhrin")
                    Ussd870Flow.deactivate(this)
                    UssdAccessibilityService.closeUssdSession()
                    delay(1500)
                    Ussd870Flow.clearDiscovery(this)
                } else {
                    // SESSION HOLD: dialog-ga shirkadda waa la sii hayaa (lama xirayo)
                    // ilaa user-ku lacagta bixiyo oo xirmo doorto.
                    var uploaded = false
                    var uploadAttempt = 0
                    val uploadDeadline = System.currentTimeMillis() + 150_000L

                    // Network-ga taleefanka mararka qaar 20-60s ayuu DNS/HTTPS luminayaa
                    // iyadoo USSD menu-gu horey u qabsoomay. Ha lumin menu-ga kadib 3 retries;
                    // sii hay carrier session-ka oo dib u dir ilaa 150s, si reconnect gaaban
                    // uusan discovery-ga u burburin.
                    while (!uploaded && System.currentTimeMillis() < uploadDeadline) {
                        uploadAttempt += 1
                        uploaded = apiClient.completeDiscovery(
                            deviceId,
                            job.id,
                            menuText,
                            items,
                            null,
                            holdSession = true
                        )
                        if (!uploaded) {
                            val remaining = ((uploadDeadline - System.currentTimeMillis()).coerceAtLeast(0L) / 1000L)
                            android.util.Log.w(
                                "UssdDialer",
                                "⚠️ [Discovery] Menu upload failed; retry #$uploadAttempt (remaining=${remaining}s)"
                            )
                            // Give Android DNS/mobile-data time to recover. Each HTTP call already
                            // has its own 10s timeout via the shared Riyokaab-style client.
                            delay(2_000L)
                        }
                    }

                    if (!uploaded) {
                        android.util.Log.e("UssdDialer", "❌ [Discovery] Menu server-ka 150s kadib ma gaarin; session waa la xirayaa")
                        closeHeldSession()
                        try { apiClient.completeDiscovery(deviceId, job.id, null, emptyList(), "Menu server-ka ma gaarin 150s kadib") } catch (_: Exception) {}
                    } else {
                        android.util.Log.d("UssdDialer", "✅ [Discovery] Menu server-ku xaqiijiyay — xulasho la sugayo")
                        holdSessionUntilSelection(job.id, prefix, job.phoneNumber, menuText, job.menu1Label)
                    }
                }
            }


            return true
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ [Discovery] error: ${e.message}")
            Ussd870Flow.deactivate(this)
            Ussd870Flow.clearDiscovery(this)
            try {
                apiClient.completeDiscovery(deviceId, job.id, null, emptyList(), e.message ?: "Cilad")
            } catch (_: Exception) {}
            return true
        } finally {
            isProcessingOrder = false
            lastOrderCompletedAt = System.currentTimeMillis()
        }
    }

    /**
     * SESSION HOLD + KEEP-ALIVE — dialog-ga shirkadda waa furan yahay kadib baarista.
     *  1) Keep-alive: accessibility-gu 2.5s kasta dialog-ga wuu dib u akhrinayaa si uu u
     *     sii firfircoonaado, wuxuuna kaydinayaa menu-ga tooska ah.
     *  2) Renewal: haddii shirkaddu session-ka xirto (menu-gii wuu baaba'ay), *212* dib
     *     ayaa loo garaacayaa oo menu cusub la qabanayaa — hold-ku wuu socdaa.
     *  3) Xaqiijin: kahor inta aan la dirin, xirmadii user-ku doortay waa lagu xaqiijinayaa
     *     menu-ga TOOSKA AH (magac → qiime). Haddii aan la helin, dirista lama sameynayo.
     */
    private suspend fun holdSessionUntilSelection(
        discoveryId: String,
        prefix: String,
        phoneNumber: String,
        originalMenu: String,
        menu1Label: String
    ) {
        val ussdPrefs = getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
        var waited = 0L
        // Soft: 5 daqiiqo. Hard: 8 daqiiqo — inta dialog-gu SHAASHADDA ku jiro session-ka
        // lama xirayo, maadaama garaac cusub uu keenayo menu gebi ahaan kala duwan.
        val holdSoftTimeoutMs = 90_000L
        val holdHardTimeoutMs = 180_000L
        var selection: DeliveryApiClient.DiscoverySelection? = null
        var liveMenu = originalMenu

        UssdAccessibilityService.startHoldKeepAlive()
        android.util.Log.d("UssdDialer", "⏸️ [Hold] Session furan — keep-alive shidan, xulasho la sugayo")

        try {
            while (waited < holdHardTimeoutMs) {
                selection = try { apiClient.claimDiscoverySelection(deviceId) } catch (_: Exception) { null }
                if (selection != null && selection.id == discoveryId) break
                selection = null

                // KEEP-ALIVE CHECK: haddii payment app/lock-screen uu dialog-ga qariyo,
                // menu-gii ugu dambeeyay sii hay. Inta user-ku aanu wax dooran HA redial-gareyn:
                // visibility loss ma caddeyneyso in carrier session-ku xirmay.
                val live = UssdAccessibilityService.heldMenuLive
                val dialogVisible = !live.isNullOrBlank()
                if (dialogVisible) {
                    liveMenu = live!!
                }

                // Soft timeout: kaliya jooji haddii dialog-gu runtii shaashadda ka baxay.
                if (waited >= holdSoftTimeoutMs && !dialogVisible) {
                    android.util.Log.w("UssdDialer", "⏸️ [Hold] Soft timeout & dialog ma muuqdo — hold waa la joojinayaa")
                    break
                }

                // PREEMPTION: macaamiil kale ayaa baaris sugaya — hold-ka jooji si
                // taleefanku codsiga cusub u qabsado (ha timeout gaarin).
                if (apiClient.discoveryHasWaitingRequest(deviceId)) {
                    android.util.Log.w("UssdDialer", "⏭️ [Hold] Codsi baaris cusub ayaa sugaya — hold waa la joojinayaa")
                    break
                }

                delay(1500)
                waited += 1500
            }

            if (selection == null) {
                android.util.Log.w("UssdDialer", "⚠️ [Hold] Xulasho lama helin — session waa la xirayaa")
                closeHeldSession()
                try { apiClient.discoverySessionLost(deviceId, discoveryId) } catch (_: Exception) {}
                return
            }


            // Menu-ga ugu dambeeyay ee tooska ah
            UssdAccessibilityService.heldMenuLive?.let { if (it.isNotBlank()) liveMenu = it }

            // XAQIIJIN: xirmadu ma weli menu-ga ku jirtaa?
            val verifiedRow = Ussd870Flow.verifySelection(liveMenu, selection.label)
            if (verifiedRow == null) {
                android.util.Log.e(
                    "UssdDialer",
                    "❌ [Hold] Xirmada '${selection.label}' menu-ga tooska ah kuma jirto — dirista waa la joojiyay"
                )
                closeHeldSession()
                try { apiClient.completeDiscoverySelection(deviceId, selection.id, false, "Xirmadu menu-ga kuma jirto (menu changed)") } catch (_: Exception) {}
                return
            }

            android.util.Log.d("UssdDialer", "▶️ [Hold] Xirmada la xaqiijiyay: ${selection.label} → saf $verifiedRow")
            ussdPrefs.edit()
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME)
                .putString("current_amount", verifiedRow.toString())
                .apply()

            UssdAccessibilityService.stopHoldKeepAlive()
            // Session-ka furan ku sii wad: safkii la xaqiijiyay ayaa TOOS loo gelinayaa.
            Ussd870Flow.resumeHeldSelection(this, selection.label, prefix, verifiedRow)
            delay(300)
            UssdAccessibilityService.resumeFlowNow()


            var result: String? = null
            var elapsed = 0
            while (elapsed < 60000) {
                val final = ussdPrefs.getString(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT, null)
                if (!final.isNullOrBlank()) { result = final; break }
                delay(500)
                elapsed += 500
            }

            closeHeldSession()

            val lower = (result ?: "").lowercase()
            val success = !result.isNullOrBlank() &&
                !lower.contains("fail") && !lower.contains("error") &&
                !lower.contains("invalid") && !lower.contains("khalad")

            try {
                apiClient.completeDiscoverySelection(deviceId, selection.id, success, result)
            } catch (_: Exception) {}

            if (!success) {
                android.util.Log.w("UssdDialer", "⚠️ [Hold] Dirista lama xaqiijin — dib-u-garaacis ayaa la abuurayaa")
            }
        } finally {
            UssdAccessibilityService.stopHoldKeepAlive()
        }
    }

    /** Xir session-ka furan oo nadiifi flow-ga. */
    private suspend fun closeHeldSession() {
        UssdAccessibilityService.stopHoldKeepAlive()
        Ussd870Flow.deactivate(this)
        UssdAccessibilityService.closeUssdSession()
        delay(1500)
        Ussd870Flow.clearDiscovery(this)
    }

    /**
     * RENEWAL: session-kii wuu xirmay inta lacag-bixintu socotay — *212* dib u garaac
     * oo menu-ga cusub qabo, si hold-ku u sii socdo.
     */
    private suspend fun renewHeldSession(prefix: String, phoneNumber: String, menu1Label: String): String? {
        return try {
            UssdAccessibilityService.closeUssdSession()
            delay(1200)
            Ussd870Flow.activateDiscovery(this, menu1Label, prefix, hold = true)
            val dialCode = Ussd870Flow.triggerCode(phoneNumber, prefix)
            dialUssdCode(dialCode, phoneNumber, null, "hormuud", null)

            var waitedMs = 0
            var menu: String? = null
            while (waitedMs < 25000 && menu.isNullOrBlank()) {
                menu = Ussd870Flow.consumeDiscoveryMenu(this)
                    ?: UssdAccessibilityService.heldMenuLive
                if (!menu.isNullOrBlank()) break
                delay(200)
                waitedMs += 200
            }
            if (!menu.isNullOrBlank()) UssdAccessibilityService.startHoldKeepAlive()
            menu
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ [Renewal] error: ${e.message}")
            null
        }
    }



    private suspend fun processOrder(order: DeliveryApiClient.DeliveryOrder, provider: String) {
        // Single-flight guard
        if (isProcessingOrder) {
            android.util.Log.d("UssdDialer", "⏳ Already processing order, rejecting ${order.id}")
            return
        }
        isProcessingOrder = true
        activeQueueId = order.id
        
        try {
            // Save to local database
            val task = DeliveryTask(
                id = order.id,
                orderId = order.orderId,
                providerName = provider,
                ussdCode = order.ussdCode,
                receiverPhone = order.receiverPhone,
                packageCode = order.packageCode,
                status = "processing",
                attempts = order.attempts,
                createdAt = System.currentTimeMillis()
            )
            database.deliveryTaskDao().insert(task)
            
            // Update notification with current stats + processing indicator
            val statsPrefs = getSharedPreferences("iftin_data", Context.MODE_PRIVATE)
            val curSuccessful = statsPrefs.getInt("successful_deliveries", 0)
            val curFailed = statsPrefs.getInt("failed_deliveries", 0)
            updateNotification("Processing order... ($curSuccessful successful, $curFailed failed)", curSuccessful, curFailed)
            
            // Save PIN to SharedPreferences for AccessibilityService to use.
            // For Flow *870* we accept full-length PIN (3-12 digits) — user's SIM PIN
            // may be 8 digits. For other flows we keep the legacy 4-digit truncation.
            // There is no PIN compiled into the app — it comes from the server.
            val rawDigits = order.pinCode.filter { it.isDigit() }
            val isFlow870 = Ussd870Flow.isFlow870(order.ussdCode)
            val serverPinFallback = com.iftin.resellers.config.ApiConfig.DEFAULT_SIM_PIN
            val pinToUse = if (isFlow870) {
                if (rawDigits.length in 3..12) rawDigits else serverPinFallback
            } else {
                val four = rawDigits.take(4)
                if (four.length == 4) four else serverPinFallback
            }
            if (isFlow870 && pinToUse.isBlank()) {
                val reason = "Tenant SIM PIN missing from server configuration"
                android.util.Log.e("UssdDialer", "❌ $reason; refusing to dial queue ${order.id}")
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = "failed",
                    errorMessage = reason,
                    providerResponse = null
                )
                database.deliveryTaskDao().updateStatus(order.id, "failed")
                if (!statusUpdated) saveToOfflineQueue(order.id, "failed", reason, null)
                return
            }
            getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
                .edit()
                // Never let a previous order's menu/result be reused for this delivery.
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME)
                .putString("current_pin_code", pinToUse)
                .putString("current_receiver", order.receiverPhone)
                .putString("current_amount", order.packageCode ?: "")
                .apply()
            android.util.Log.d("UssdDialer", "🔐 PIN saved (flow870=$isFlow870, len=${pinToUse.length}): ${pinToUse.take(2)}***")
            
            // Quick 500ms settle time - lightning fast!
            android.util.Log.d("UssdDialer", "⚡ Quick 0.5s settle time before USSD...")
            delay(500)
            
            // Dial USSD code using simplified Intent.ACTION_CALL approach
            // Use order.provider if available, otherwise fallback to loop provider
            val orderProvider = order.provider.ifEmpty { provider }

            // ===== ONE-SEND LOCK =====
            // Tell server we're about to dial USSD. After this point, server will NEVER
            // auto-retry this row on ambiguous responses (timeout, MMI, connection error).
            // Failure here is non-fatal — server sweep also flags dispatched rows.
            try {
                apiClient.markDeliveryDispatched(order.id, deviceId)
                android.util.Log.d("UssdDialer", "📤 Marked dispatched on server: ${order.id}")
            } catch (e: Exception) {
                android.util.Log.w("UssdDialer", "Dispatch mark failed (non-fatal): ${e.message}")
            }

            // ===== NEW: Flow870 — auto-detect trigger *870*{receiver}#|menu,path =====
            // Haddii order-ka USSD code-kiisu uu ku bilaabmo "*870*", isticmaal flow-ka cusub.
            // Template-ku wuxuu qaadan karaa suffix `|1,2` — menu path oo package kastaa u gaar ah.
            val ussdToDial: String
            if (Ussd870Flow.isFlow870(order.ussdCode)) {
                val menuPath = Ussd870Flow.parseMenuPath(order.ussdCode)
                Ussd870Flow.activate(this, menuPath, Ussd870Flow.dialPrefix(order.ussdCode), order.receiverPhone)
                ussdToDial = Ussd870Flow.triggerCode(
                    order.receiverPhone,
                    Ussd870Flow.dialPrefix(order.ussdCode)
                )
                android.util.Log.d("UssdDialer", "🆕 [Flow870] Activated. menuPath=$menuPath, dialing: $ussdToDial")
            } else {
                ussdToDial = order.ussdCode
            }

            val success = dialUssdCode(ussdToDial, order.receiverPhone, order.packageCode, orderProvider, order.simSlot)
            
            if (success) {
                // Get the captured USSD response from AccessibilityService
                var ussdResponse = getLastUssdResponse(preferFinalResult = isFlow870)
                var providerResponse = ussdResponse ?: ""
                
                android.util.Log.d("UssdDialer", "📝 Captured USSD response: ${ussdResponse?.take(100) ?: "none"}")
                
                // Client-side keyword detection before reporting status
                var responseText = providerResponse.lowercase()
                val successKeywords = listOf(
                    "ugu shubtay", "ku guulaysatay", "u wareejiso", "u dirto",
                    "haraagaagu waa", "transcation id", "transaction id", "jeeb",
                    "dhammays", "abaal", "e-voucher"
                )
                val failureKeywords = listOf(
                    "error", "failed", "khalad", "service error", "try again",
                    "insufficient", "invalid", "unavailable", "waxba kama dhicin"
                )
                
                var hasSuccess = successKeywords.any { responseText.contains(it) }
                var hasFailure = failureKeywords.any { responseText.contains(it) }
                
                // ===== LATE-CALLBACK RECHECK =====
                // If response is empty after silent timeout, wait extra 5s for late AccessibilityService capture
                if (responseText.isEmpty()) {
                    android.util.Log.d("UssdDialer", "⏳ No USSD response yet - waiting extra 5s for late callback...")
                    delay(5000)
                    ussdResponse = getLastUssdResponse(preferFinalResult = isFlow870)
                    providerResponse = ussdResponse ?: ""
                    responseText = providerResponse.lowercase()
                    hasSuccess = successKeywords.any { responseText.contains(it) }
                    hasFailure = failureKeywords.any { responseText.contains(it) }
                    if (responseText.isNotEmpty()) {
                        android.util.Log.d("UssdDialer", "✅ Late USSD response captured: ${responseText.take(100)}")
                    }
                }
                
                // ===== SMS DEDUCTION FALLBACK =====
                // If still no response, scan inbox for matching deduction SMS (ugu shubtay)
                if (responseText.isEmpty()) {
                    val deductionSms = findRecentDeductionSms(order.receiverPhone, order.simSlot)
                    if (deductionSms != null) {
                        android.util.Log.d("UssdDialer", "✅ Found deduction SMS - reclassifying timeout as success: ${deductionSms.take(100)}")
                        providerResponse = deductionSms
                        responseText = providerResponse.lowercase()
                        hasSuccess = true
                    }
                }
                
                val detectedStatus: String
                val detectedError: String?
                
                when {
                    hasSuccess -> {
                        detectedStatus = "completed"
                        detectedError = null
                        android.util.Log.d("UssdDialer", "✅ Success keywords detected in response")
                    }
                    hasFailure -> {
                        detectedStatus = "failed"
                        detectedError = "Provider error detected: ${responseText.take(100)}"
                        android.util.Log.d("UssdDialer", "❌ Failure keywords detected - server will auto-retry")
                    }
                    responseText.isEmpty() && isFlow870 && !Ussd870Flow.wasRecentlyFinished(this) -> {
                        // The interactive menu has not reached its final carrier response yet.
                        // Do not turn an in-progress *870*/*866*/*212* order into Failed merely
                        // because the Android dialog is still waiting for a menu submission.
                        detectedStatus = "processing"
                        detectedError = "Interactive USSD flow is still in progress"
                        android.util.Log.d("UssdDialer", "⏳ Interactive USSD unfinished - keeping order processing")
                    }
                    responseText.isEmpty() -> {
                        detectedStatus = "timeout"
                        detectedError = "No USSD response received"
                        android.util.Log.d("UssdDialer", "⏱ No response after retries - reporting timeout")
                    }
                    isMmiErrorResponse(responseText) -> {
                        detectedStatus = "failed"
                        detectedError = "MMI/connection error: ${responseText.take(100)}"
                        android.util.Log.w("UssdDialer", "❌ MMI/connection error - marking failed for retry")
                    }
                    isSystemNoiseResponse(responseText) -> {
                        detectedStatus = "timeout"
                        detectedError = "System dialog captured instead of carrier response"
                        android.util.Log.w("UssdDialer", "⚠️ System noise captured - not a carrier response")
                    }
                    else -> {
                        detectedStatus = "completed"
                        detectedError = null
                        android.util.Log.d("UssdDialer", "✅ Unknown response text - assuming success")
                    }
                }
                
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = detectedStatus,
                    errorMessage = detectedError,
                    providerResponse = providerResponse
                )
                database.deliveryTaskDao().updateStatus(order.id, detectedStatus)
                if (statusUpdated && detectedStatus != "processing") {
                    updateStats(success = detectedStatus == "completed")
                } else {
                    saveToOfflineQueue(order.id, detectedStatus, detectedError, providerResponse)
                }
                android.util.Log.d("UssdDialer", "📊 Order ${order.orderId} reported as $detectedStatus")
            } else {
                // Dial failed (permission issue or no SIM) - mark as failed
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = "failed",
                    errorMessage = "USSD dial failed - check permissions and SIM",
                    providerResponse = null
                )
                database.deliveryTaskDao().updateStatus(order.id, "failed")
                if (statusUpdated) {
                    updateStats(success = false)
                } else {
                    saveToOfflineQueue(order.id, "failed", "USSD dial failed", null)
                }
                android.util.Log.e("UssdDialer", "❌ Order ${order.orderId} failed - could not dial USSD")
            }
            
        } catch (e: Exception) {
            e.printStackTrace()
            // Report error with retry
            updateDeliveryStatusWithRetry(
                queueId = order.id,
                status = "failed",
                errorMessage = e.message ?: "Unknown error",
                providerResponse = null
            )
        } finally {
            // ===== RELEASE SINGLE-FLIGHT LOCK + START COOLDOWN =====
            recentlyProcessedIds.remove(order.id) // allow scheduled retries for the same queue row
            android.util.Log.d("UssdDialer", "🔓 Order lock RELEASED: ${order.id} (cooldown ${ORDER_COOLDOWN_MS}ms)")
            lastOrderCompletedAt = System.currentTimeMillis()
            activeQueueId = null
            isProcessingOrder = false
            // Do not tear down an unfinished interactive flow. Accessibility still needs the
            // active menu path to submit a late-rendering package/PIN dialog and capture result.
            if (Ussd870Flow.wasRecentlyFinished(this)) {
                Ussd870Flow.deactivate(this)
            }
        }
    }

    /**
     * Update delivery status with exponential backoff retry (3 attempts)
     * Returns true if update succeeded, false if all retries failed
     */
    private suspend fun updateDeliveryStatusWithRetry(
        queueId: String,
        status: String,
        errorMessage: String?,
        providerResponse: String?
    ): Boolean {
        val delays = listOf(2000L, 4000L, 8000L, 16000L, 32000L) // Exponential backoff: 2s, 4s, 8s, 16s, 32s (62s total)
        
        for ((attempt, delayMs) in delays.withIndex()) {
            try {
                android.util.Log.d("UssdDialer", "📡 Updating status (attempt ${attempt + 1}/5): $queueId -> $status")
                
                val success = apiClient.updateDeliveryStatus(queueId, deviceId, status, errorMessage, providerResponse)
                
                if (success) {
                    android.util.Log.d("UssdDialer", "✅ Status update succeeded on attempt ${attempt + 1}")
                    return true
                } else {
                    android.util.Log.w("UssdDialer", "⚠️ Status update returned false, retrying...")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Status update error (attempt ${attempt + 1}): ${e.message}")
            }
            
            if (attempt < delays.size - 1) {
                android.util.Log.d("UssdDialer", "⏳ Waiting ${delayMs}ms before retry...")
                delay(delayMs)
            }
        }
        
        android.util.Log.e("UssdDialer", "❌ All 3 status update attempts failed for $queueId")
        return false
    }

    /**
     * Save failed API updates to offline queue for later sync
     */
    private fun saveToOfflineQueue(
        queueId: String,
        status: String,
        errorMessage: String?,
        providerResponse: String?
    ) {
        try {
            val prefs = getSharedPreferences("iftin_offline_queue", Context.MODE_PRIVATE)
            val existingQueue = prefs.getString("pending_updates", "") ?: ""
            
            // Format: queueId|status|errorMessage|providerResponse;
            val newEntry = "$queueId|$status|${errorMessage ?: ""}|${providerResponse ?: ""};"
            val updatedQueue = existingQueue + newEntry
            
            prefs.edit().putString("pending_updates", updatedQueue).apply()
            
            android.util.Log.d("UssdDialer", "💾 Saved to offline queue: $queueId -> $status")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Failed to save to offline queue: ${e.message}")
        }
    }

    /**
     * Sync offline queue to server (called when network is available)
     */
    private suspend fun syncOfflineQueue() {
        try {
            val prefs = getSharedPreferences("iftin_offline_queue", Context.MODE_PRIVATE)
            val queue = prefs.getString("pending_updates", "") ?: ""
            
            if (queue.isEmpty()) return
            
            android.util.Log.d("UssdDialer", "🔄 Syncing offline queue...")
            
            val entries = queue.split(";").filter { it.isNotBlank() }
            val failedEntries = mutableListOf<String>()
            
            for (entry in entries) {
                val parts = entry.split("|")
                if (parts.size >= 2) {
                    val queueId = parts[0]
                    val status = parts[1]
                    val errorMessage = parts.getOrNull(2)?.takeIf { it.isNotBlank() }
                    val providerResponse = parts.getOrNull(3)?.takeIf { it.isNotBlank() }
                    
                    val success = apiClient.updateDeliveryStatus(queueId, deviceId, status, errorMessage, providerResponse)
                    
                    if (!success) {
                        failedEntries.add(entry)
                    } else {
                        android.util.Log.d("UssdDialer", "✅ Synced offline update: $queueId -> $status")
                    }
                }
            }
            
            // Save failed entries back to queue
            prefs.edit().putString("pending_updates", failedEntries.joinToString(";")).apply()
            
            android.util.Log.d("UssdDialer", "🔄 Offline sync complete. ${entries.size - failedEntries.size} synced, ${failedEntries.size} remaining")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Offline sync error: ${e.message}")
        }
    }
    
    /**
     * Get the last USSD response captured by AccessibilityService
     * Waits up to 2 seconds with retries for response to be captured
     * Only returns response if captured within last 30 seconds
     */
    private suspend fun getLastUssdResponse(preferFinalResult: Boolean = false): String? {
        try {
            val prefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            
            // Wait 1 second for AccessibilityService to capture response
            android.util.Log.d("UssdDialer", "⏳ Waiting 1s for USSD response capture...")
            delay(1000)
            
            // Retry up to 3 times with 500ms delay
            repeat(3) { attempt ->
                val finalResult = prefs.getString(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT, null)
                val finalResultTime = prefs.getLong(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME, 0)
                val finalResultAgeMs = System.currentTimeMillis() - finalResultTime
                if (finalResultAgeMs < 30000 && !finalResult.isNullOrBlank()) {
                    android.util.Log.d("UssdDialer", "📥 Retrieved FINAL carrier result (age: ${finalResultAgeMs}ms, attempt: ${attempt+1})")
                    android.util.Log.d("UssdDialer", "📝 Final result content: ${finalResult.take(150)}")
                    prefs.edit()
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_FINAL_RESULT_TIME)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                        .apply()
                    return finalResult
                }

                // Interactive *870*/*866* flows must not report an intermediate menu or PIN
                // prompt as the provider result. If no dedicated final result exists yet,
                // keep waiting and let the caller use its SMS fallback instead.
                if (preferFinalResult) {
                    if (attempt < 2) {
                        android.util.Log.d("UssdDialer", "⏳ Final carrier result not ready, retrying in 500ms")
                        delay(500)
                    }
                    return@repeat
                }

                val response = prefs.getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, null)
                val responseTime = prefs.getLong(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME, 0)
                
                // Only use response if it was captured within the last 30 seconds
                val ageMs = System.currentTimeMillis() - responseTime
                if (ageMs < 30000 && !response.isNullOrBlank()) {
                    android.util.Log.d("UssdDialer", "📥 Retrieved USSD response (age: ${ageMs}ms, attempt: ${attempt+1})")
                    android.util.Log.d("UssdDialer", "📝 Response content: ${response.take(150)}")
                    
                    // Clear the response after reading to prevent reuse
                    prefs.edit()
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                        .apply()
                        
                    return response
                }
                
                if (attempt < 2) {
                    android.util.Log.d("UssdDialer", "⏳ No response yet, retrying in 500ms (attempt ${attempt+1}/3)")
                    delay(500)
                }
            }
            
            android.util.Log.d("UssdDialer", "⚠️ No USSD response captured after 3 attempts")
            return null
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Error reading USSD response: ${e.message}")
            return null
        }
    }

    private fun findSubscriptionIdByCarrierName(providerName: String, fallbackSlot: Int? = null): Int? {
        try {
            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                return null
            }
            
            val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
            if (subscriptionInfoList.isNullOrEmpty()) {
                return null
            }
            
            // Server/database sim_slot is 1-based (SIM1/SIM2), while Android simSlotIndex is 0-based.
            // When the server already selected a slot, treat it as authoritative instead of guessing
            // from carrier/display names. This prevents a Somtel order from leaking onto the other SIM.
            if (fallbackSlot != null) {
                val requestedSlotIndex = fallbackSlot - 1
                val exactSlotInfo = subscriptionInfoList.find { it.simSlotIndex == requestedSlotIndex }
                if (exactSlotInfo != null) {
                    android.util.Log.d(
                        "UssdDialer",
                        "🎯 Server slot SIM$fallbackSlot -> Android slot $requestedSlotIndex (subId=${exactSlotInfo.subscriptionId})"
                    )
                    return exactSlotInfo.subscriptionId
                }
                android.util.Log.w(
                    "UssdDialer",
                    "⚠️ Server requested SIM$fallbackSlot but Android slot $requestedSlotIndex is not active; falling back to carrier lookup"
                )
            }

            val searchName = providerName.lowercase(Locale.getDefault())
            
            // Define flexible patterns for each provider
            val patterns = when (searchName) {
                "hormuud" -> listOf("hormuud", "hor", "hmd", "hormud")
                "somnet" -> listOf("somnet", "som", "somalink")
                "somtel" -> listOf("somtel", "tel")
                "amtel" -> listOf("amtel", "amt")
                else -> listOf(searchName)
            }
            
            android.util.Log.d("UssdDialer", "🔍 Searching with patterns: ${patterns.joinToString()} among ${subscriptionInfoList.size} SIMs")
            
            for (info in subscriptionInfoList) {
                val carrierName = info.carrierName?.toString()?.lowercase(Locale.getDefault()) ?: ""
                val displayName = info.displayName?.toString()?.lowercase(Locale.getDefault()) ?: ""
                
                android.util.Log.d("UssdDialer", "📱 Slot ${info.simSlotIndex}: carrier='$carrierName', display='$displayName', subId=${info.subscriptionId}")
                
                // Check if ANY pattern matches
                for (pattern in patterns) {
                    if (carrierName.contains(pattern) || displayName.contains(pattern)) {
                        android.util.Log.d("UssdDialer", "✅ MATCHED pattern '$pattern' in slot ${info.simSlotIndex}")
                        return info.subscriptionId
                    }
                }
            }
            
            // If no carrier match and we have a fallback slot from database, use it
            if (fallbackSlot != null) {
                android.util.Log.w("UssdDialer", "⚠️ No carrier match for '$providerName', using database fallback slot: $fallbackSlot")
                val fallbackInfo = subscriptionInfoList.find { it.simSlotIndex == fallbackSlot }
                if (fallbackInfo != null) {
                    android.util.Log.d("UssdDialer", "✅ Using fallback SIM slot $fallbackSlot (subId=${fallbackInfo.subscriptionId})")
                    return fallbackInfo.subscriptionId
                }
            }
            
            // If no match, log ALL available SIMs for debugging
            android.util.Log.e("UssdDialer", "❌ NO SIM MATCH for '$providerName'")
            return null
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Error finding SIM: ${e.message}")
            e.printStackTrace()
            return null
        }
    }

    /**
     * USSD dialing with Silent mode (TelephonyManager) first, Intent fallback
     * Silent mode works on Android 8.0+ and doesn't show dialer UI
     */
    /** Run haddii API-ga silent USSD uusan gebi ahaanba shaqayn (permission/exception). */
    @Volatile private var silentUssdUnsupported = false

    private suspend fun dialUssdCode(
        ussdCode: String,
        receiverPhone: String,
        packageCode: String?,
        provider: String,
        simSlot: Int? = null
    ): Boolean {
        try {
            // BADBAADO: waxa ka dambeeya "|" waa menu path (tus. "*101#|Menu1,Menu2") —
            // waligeed lama dialin, haddii kale radio-gu wuxuu soo celiyaa "invalid MMI code".
            val finalUssd = ussdCode.trim().substringBefore("|").trim()
            
            android.util.Log.d("UssdDialer", "========== USSD DIAL ==========")
            android.util.Log.d("UssdDialer", "Provider: $provider")
            android.util.Log.d("UssdDialer", "Final USSD: $finalUssd")
            android.util.Log.d("UssdDialer", "Database simSlot: $simSlot")

            // Check permissions
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED ||
                ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.e("UssdDialer", "❌ Missing permissions")
                return false
            }

            // Find SIM for provider with fallback to database slot
            val subscriptionId = findSubscriptionIdByCarrierName(provider, simSlot)
            if (subscriptionId == null) {
                android.util.Log.e("UssdDialer", "❌ No SIM found for: $provider (even with fallback slot $simSlot)")
                return false
            }
            
            android.util.Log.d("UssdDialer", "🎯 Using subscriptionId: $subscriptionId")
            
            // 🔇 TRY SILENT USSD FIRST (Android 8.0+)
            // Flow *870* waa interactive menu flow; silent USSD ma geli karo menu-yada,
            // sidaas darteed mar walba u isticmaal dialog fallback si AccessibilityService u doorto menu-ga admin-ka.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !Ussd870Flow.isActive(this)) {
                android.util.Log.d("UssdDialer", "🔇 Trying SILENT USSD via TelephonyManager...")
                
                silentUssdUnsupported = false
                val silentSuccess = trySilentUssd(finalUssd, subscriptionId)
                if (silentSuccess) {
                    android.util.Log.d("UssdDialer", "✅ Silent USSD completed successfully!")

                    // Samsung dual-SIM builds can return this Somtel failure from the wrong
                    // subscription even though the same code succeeds when dialed manually on
                    // the server-selected SIM. Retry this one clear failure once via ACTION_CALL.
                    val silentResponse = getSharedPreferences(
                        UssdAccessibilityService.PREFS_NAME,
                        Context.MODE_PRIVATE
                    ).getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, "").orEmpty()
                    val retrySomtelOnExactSim = simSlot != null &&
                        provider.equals("somtel", ignoreCase = true) &&
                        silentResponse.contains("unrecognized mobile number", ignoreCase = true)

                    if (retrySomtelOnExactSim) {
                        android.util.Log.w(
                            "UssdDialer",
                            "🔁 Somtel silent USSD returned Unrecognized mobile number; retrying once on explicit SIM$simSlot via ACTION_CALL"
                        )
                        getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                            .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                            .apply()
                        return dialUssdViaIntent(finalUssd, subscriptionId, provider)
                    }

                    return true
                }

                // Dalabyada aan flow interactive ahayn WAA IN AAN LA MUUJIN dialer-ka.
                // Marka telefoonku taageero silent USSD, ha furin Intent.ACTION_CALL —
                // jawaabta madhan server-ku wuxuu u qaadanayaa verification_required.
                if (!silentUssdUnsupported) {
                    android.util.Log.w("UssdDialer", "🔇 Silent USSD did not confirm; staying silent (no dialer UI)")
                    return true
                }

                android.util.Log.d("UssdDialer", "⚠️ Silent USSD unsupported, trying Intent fallback...")
            } else if (Ussd870Flow.isActive(this)) {
                android.util.Log.d("UssdDialer", "🆕 [Flow870] Skipping silent USSD; using interactive dialog fallback")
            }
            
            // FALLBACK: Use Intent.ACTION_CALL (shows dialer)
            return dialUssdViaIntent(finalUssd, subscriptionId, provider)
            
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Exception: ${e.message}")
            e.printStackTrace()
            return false
        }
    }
    
    /**
     * Silent USSD using TelephonyManager.sendUssdRequest()
     * Works on Android 8.0+ and doesn't show dialer UI
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private suspend fun trySilentUssd(ussdCode: String, subscriptionId: Int): Boolean {
        return suspendCancellableCoroutine { continuation ->
            try {
                val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                val managerForSim = telephonyManager.createForSubscriptionId(subscriptionId)
                
                val callback = object : android.telephony.TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(
                        tm: android.telephony.TelephonyManager,
                        request: String,
                        response: CharSequence
                    ) {
                        android.util.Log.d("UssdDialer", "🔇 SILENT USSD Success! Response: $response")
                        
                        // Save response for delivery notes
                        saveUssdResponse(response.toString())
                        
                        if (continuation.isActive) {
                            continuation.resume(true)
                        }
                    }
                    
                    override fun onReceiveUssdResponseFailed(
                        tm: android.telephony.TelephonyManager,
                        request: String,
                        failureCode: Int
                    ) {
                        val reason = when(failureCode) {
                            android.telephony.TelephonyManager.USSD_RETURN_FAILURE -> "USSD_RETURN_FAILURE"
                            android.telephony.TelephonyManager.USSD_ERROR_SERVICE_UNAVAIL -> "SERVICE_UNAVAILABLE"
                            else -> "UNKNOWN ($failureCode)"
                        }
                        android.util.Log.e("UssdDialer", "🔇 SILENT USSD Failed: $reason")
                        
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
                }
                
                // Keep # at end - Hormuud requires it for silent USSD!
                val cleanUssd = ussdCode
                android.util.Log.d("UssdDialer", "🔇 Sending silent USSD: $cleanUssd")
                
                managerForSim.sendUssdRequest(
                    cleanUssd,
                    callback,
                    android.os.Handler(android.os.Looper.getMainLooper())
                )
                
                // Timeout after 15 seconds (increased from 10s to catch slow provider callbacks)
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    if (continuation.isActive) {
                        android.util.Log.w("UssdDialer", "⏱️ Silent USSD timeout (15s)")
                        continuation.resume(false)
                    }
                }, 15000)
                
            } catch (e: SecurityException) {
                android.util.Log.e("UssdDialer", "🔒 Silent USSD permission denied: ${e.message}")
                silentUssdUnsupported = true
                if (continuation.isActive) continuation.resume(false)
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Silent USSD exception: ${e.message}")
                silentUssdUnsupported = true
                if (continuation.isActive) continuation.resume(false)
            }
        }
    }
    
    private fun saveUssdResponse(response: String) {
        val prefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, response)
            .putLong(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
            .apply()
    }
    
    /**
     * Fallback USSD dialing using Intent.ACTION_CALL
     * Shows dialer UI - used when silent mode fails
     */
    private suspend fun dialUssdViaIntent(
        finalUssd: String,
        subscriptionId: Int,
        provider: String
    ): Boolean {
        try {
            android.util.Log.d("UssdDialer", "📞 Using Intent.ACTION_CALL fallback...")
            
            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList ?: return false
            
            val selectedSubscription = subscriptionInfoList.find { it.subscriptionId == subscriptionId }
                ?: run {
                    android.util.Log.e("UssdDialer", "❌ Selected subscriptionId $subscriptionId is no longer active")
                    return false
                }
            val simSlot = selectedSubscription.simSlotIndex
            android.util.Log.d("UssdDialer", "🎯 Using physical Android SIM slot $simSlot (subscriptionId: $subscriptionId)")
            
            val encodedUssd = finalUssd.replace("#", Uri.encode("#"))
            
            // Build PhoneAccountHandle for automatic SIM selection (prevents SIM chooser dialog)
            val phoneAccountHandle = resolvePhoneAccountHandle(subscriptionId, simSlot)

            fun launch() {
                val intent = Intent(Intent.ACTION_CALL).apply {
                    data = Uri.parse("tel:$encodedUssd")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("simSlot", simSlot)
                    putExtra("com.android.phone.extra.slot", simSlot)
                    putExtra("subscription", subscriptionId)
                    // Critical: This is the standard Android extra for auto-selecting SIM
                    if (phoneAccountHandle != null) {
                        putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", phoneAccountHandle)
                    }
                }
                startActivity(intent)
            }

            // Set expecting_ussd flag for AccessibilityService
            val ussdPrefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            ussdPrefs.edit()
                .putBoolean(UssdAccessibilityService.KEY_EXPECTING_USSD, true)
                .putLong(UssdAccessibilityService.KEY_LAST_USSD_TIME, System.currentTimeMillis())
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                .apply()

            // Radio-ku wuxuu diidaa dial cusub haddii session USSD hore furan yahay —
            // taasi waa sababta "Connection problem or invalid MMI code".
            try { UssdAccessibilityService.closeUssdSession() } catch (_: Exception) {}
            delay(700)

            launch()
            android.util.Log.d("UssdDialer", "📞 USSD dialed via Intent.ACTION_CALL")

            // ===== MMI ERROR AUTO-RETRY =====
            // Haddii shirkaddu/radio-gu soo celiyo "Connection problem or invalid MMI code",
            // xir session-ka kadib hal jeer dib u dial garee (gacanta way shaqeysaa markaas).
            delay(4000)
            if (isMmiErrorResponse(ussdPrefs.getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, ""))) {
                android.util.Log.w("UssdDialer", "🔁 MMI/connection error detected — closing session and re-dialing once")
                try { UssdAccessibilityService.closeUssdSession() } catch (_: Exception) {}
                delay(2500)
                ussdPrefs.edit().remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE).apply()
                launch()
                delay(1500)
            }

            // Discovery (*212* / dynamic package lookup) must NOT wait for the normal
            // interactive-flow completion timeout here. The caller owns the live menu watcher
            // and needs to start polling consumeDiscoveryMenu()/KEY_LAST_USSD_RESPONSE
            // immediately. Waiting here for up to 60s caused the server's 90s processing
            // lease to expire before the fallback watcher even got a chance to read the menu.
            if (Ussd870Flow.isDiscoveryMode(this)) {
                android.util.Log.d(
                    "UssdDialer",
                    "🔎 [Discovery] Dial launched; returning to live menu watcher without waiting for flow completion"
                )
                return true
            }

            // Show toast message on main thread while in USSD dialer
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(
                    this@UssdDialerService,
                    "WAX HAKA BEDELIN 😊",
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
            
            // Reset click detection
            ussdClickReceived = false
            ussdClickCount = 0
            
            
            // Wait for completion
            var waitedMs = 0
            val isFlow870Session = Ussd870Flow.isActive(this)
            val maxWaitMs = if (isFlow870Session) 60000 else 15000
            
            while (waitedMs < maxWaitMs) {
                delay(500)
                waitedMs += 500

                if (isFlow870Session && Ussd870Flow.wasRecentlyFinished(this)) {
                    android.util.Log.d("UssdDialer", "✅ [Flow870] Interactive menu flow finished")
                    // Give the carrier's final result dialog time to render AND be
                    // auto-OK'd by the accessibility service before advancing to the
                    // next order (fixes: final dialog left on screen, OK not tapped).
                    delay(8000)
                    return true
                }
                
                if (ussdClickReceived && !isFlow870Session) {
                    android.util.Log.d("UssdDialer", "✅ USSD menu completed — waiting for carrier's final result")
                    // Status-ka ha loo gudbin server-ka ka hor inta jawaabta dhabta ah
                    // ee shirkaddu soo gelin. Sug ilaa 8 ilbiriqsi.
                    var extra = 0
                    while (extra < 8000) {
                        delay(500)
                        extra += 500
                        val latest = ussdPrefs.getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, "").orEmpty()
                        if (latest.isNotBlank() && !isSystemNoiseResponse(latest) && !isMmiErrorResponse(latest)) {
                            android.util.Log.d("UssdDialer", "📩 Final carrier response captured after ${extra}ms")
                            break
                        }
                    }
                    delay(1000)
                    return true
                }
            }
            
            android.util.Log.d("UssdDialer", "⚠️ USSD timeout - assuming success")
            return true
            
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Intent fallback failed: ${e.message}")
            return false
        }
    }

    /** Farriimo nidaamka (Android) ah — ma aha jawaab shirkadeed. */
    private fun isSystemNoiseResponse(text: String?): Boolean {
        val t = text?.lowercase().orEmpty()
        if (t.isBlank()) return false
        return t.contains("using your microphone") || t.contains("using your camera") ||
            t.contains("applications are using") || t.contains("screen overlay") ||
            t.contains("battery") && t.contains("optimi")
    }

    /** Waa "Connection problem or invalid MMI code" iyo kuwa la mid ah. */
    private fun isMmiErrorResponse(text: String?): Boolean {
        val t = text?.lowercase().orEmpty()
        if (t.isBlank()) return false
        return t.contains("mmi code") || t.contains("mmi") && t.contains("invalid") ||
            t.contains("connection problem") || t.contains("connection error")
    }

    /**
     * Hel PhoneAccountHandle-ka SAXDA AH ee subscription-ka. Hore waxaa la isticmaali jiray
     * index-ka liiska (accounts[simSlot]) — taas oo SIM khaldan dooran karta oo keenta
     * "Connection problem or invalid MMI code".
     */
    private fun resolvePhoneAccountHandle(subscriptionId: Int, simSlot: Int): android.telecom.PhoneAccountHandle? {
        try {
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
            val accounts = telecomManager.callCapablePhoneAccounts
            android.util.Log.d("UssdDialer", "📱 Available phone accounts: ${accounts.size}")

            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val iccId = try {
                subscriptionManager.activeSubscriptionInfoList
                    ?.firstOrNull { it.subscriptionId == subscriptionId }?.iccId
            } catch (e: Exception) { null }

            for (handle in accounts) {
                val id = handle.id ?: continue
                if (id == subscriptionId.toString() || (!iccId.isNullOrBlank() && id == iccId)) {
                    android.util.Log.d("UssdDialer", "✅ PhoneAccountHandle matched by subscription: $handle")
                    return handle
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    try {
                        val tm = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                        if (tm.getSubscriptionId(handle) == subscriptionId) {
                            android.util.Log.d("UssdDialer", "✅ PhoneAccountHandle matched via TelephonyManager: $handle")
                            return handle
                        }
                    } catch (_: Exception) {}
                }
            }

            // Never fall back to accounts[simSlot]: Telecom account ordering is not
            // guaranteed to match physical SIM ordering. Use explicit subscription/slot extras.
            android.util.Log.w(
                "UssdDialer",
                "⚠️ No exact PhoneAccountHandle for subscriptionId=$subscriptionId; using explicit subscription/slot extras only"
            )
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "⚠️ Failed to get PhoneAccountHandle: ${e.message}")
        }
        return null
    }



    private fun buildFinalUssd(template: String, receiverPhone: String, packageCode: String?): String {
        val phone = sanitizePhoneNumber(receiverPhone)
        // Iska saar menu-path suffix ("|1,2") — waa metadata Flow870 kaliya, ma tahay dial digits
        var ussd = Ussd870Flow.stripMenuSuffix(template.trim()).trim()

        // Prepare a safe package code (digits only)
        val pkgCode = packageCode?.filter { it.isDigit() } ?: ""

        val hasPlaceholders = listOf("{phone}", "{receiver}", "{number}", "{code}", "{package}", "{pkg}", "{receiver_phone}", "{data_amount}", "{sim_password}")
            .any { ph -> ussd.contains(ph, ignoreCase = true) }

        if (hasPlaceholders) {
            if (phone.isNotBlank()) {
                ussd = ussd.replace("{phone}", phone, true)
                    .replace("{receiver}", phone, true)
                    .replace("{number}", phone, true)
                    .replace("{receiver_phone}", phone, true)
            }
            if (pkgCode.isNotBlank()) {
                ussd = ussd.replace("{code}", pkgCode, true)
                    .replace("{package}", pkgCode, true)
                    .replace("{pkg}", pkgCode, true)
                    .replace("{data_amount}", pkgCode, true)
            }
            // Remove unresolved placeholders
            ussd = ussd.replace("*{code}", "", true)
                .replace("{code}", "", true)
                .replace("*{package}", "", true)
                .replace("{package}", "", true)
                .replace("*{pkg}", "", true)
                .replace("{pkg}", "", true)
                .replace("*{data_amount}", "", true)
                .replace("{data_amount}", "", true)
                .replace("*{sim_password}", "", true)
                .replace("{sim_password}", "", true)
        } else {
            val parts = mutableListOf<String>()
            val phoneAlreadyIncluded = phone.isNotBlank() && ussd.contains(phone)
            if (phone.isNotBlank() && !phoneAlreadyIncluded) parts.add(phone)
            if (pkgCode.isNotBlank()) parts.add(pkgCode)

            if (parts.isNotEmpty()) {
                ussd = if (ussd.contains("#")) {
                    val idx = ussd.lastIndexOf('#')
                    ussd.substring(0, idx).trimEnd('*') + "*" + parts.joinToString("*") + "#"
                } else {
                    ussd.trimEnd('*') + "*" + parts.joinToString("*") + "#"
                }
            }
        }

        // Sanitize: collapse consecutive asterisks and remove stray asterisk before '#'
        ussd = ussd.replace(" ", "")
            .replace(Regex("\\*+"), "*")
            .replace("*#", "#")
        return ussd
    }

    private fun sanitizePhoneNumber(raw: String): String {
        var digits = raw.filter { it.isDigit() }
        if (digits.startsWith("252")) digits = digits.removePrefix("252")
        if (digits.startsWith("0")) digits = digits.removePrefix("0")
        if (digits.length > 9) digits = digits.takeLast(9)
        return digits
    }

    // Battery helpers - used by startPolling() to include battery in /pending URL
    private fun getBatteryLevel(): Int {
        return try {
            val bm = getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) { -1 }
    }

    private fun isCharging(): Boolean {
        return try {
            val batteryIntent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val status = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == android.os.BatteryManager.BATTERY_STATUS_CHARGING || status == android.os.BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) { false }
    }

    private fun updateStats(success: Boolean) {
        val prefs = getSharedPreferences("iftin_data", Context.MODE_PRIVATE)
        val totalKey = "total_deliveries"
        val successKey = "successful_deliveries"
        val failedKey = "failed_deliveries"
        
        val total = prefs.getInt(totalKey, 0) + 1
        val successful = prefs.getInt(successKey, 0) + if (success) 1 else 0
        val failed = prefs.getInt(failedKey, 0) + if (!success) 1 else 0
        
        prefs.edit()
            .putInt(totalKey, total)
            .putInt(successKey, successful)
            .putInt(failedKey, failed)
            .apply()
        
        updateNotification("Active - $successful successful, $failed failed", successful, failed)
    }

    private fun updateNotification(text: String, successful: Int, failed: Int) {
        val notification = createNotification(text, successful, failed)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotification(text: String, successful: Int, failed: Int): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Iftin Resellers Active")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Delivery Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Iftin Resellers background service"
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * Restart service immediately when app is removed from recent apps
     * This ensures the service keeps running even if user swipes away the app
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        android.util.Log.d("UssdDialer", "🔄 Task removed - restarting service immediately")
        
        // Immediate restart instead of AlarmManager (more reliable on Android 12+)
        val restartIntent = Intent(applicationContext, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("UssdDialer", "🔄 Service onDestroy - will restart")
        
        // Close Realtime WebSocket
        try {
            bulkSmsWebSocket?.close(1000, "Service destroyed")
            bulkSmsWebSocket = null
        } catch (e: Exception) { }
        
        // Unregister broadcast receiver
        try {
            unregisterReceiver(ussdClickReceiver)
        } catch (e: Exception) { }
        
        // Release WiFi lock (will be re-acquired on restart)
        try {
            if (::wifiLock.isInitialized && wifiLock.isHeld) wifiLock.release()
        } catch (e: Exception) { }
        
        // Reset worker state before restart so the new Service instance always
        // starts fresh polling loops instead of inheriting a "running" flag with dead jobs.
        isRunning = false
        discoveryPollingJob?.cancel()
        discoveryPollingJob = null
        heartbeatJob?.cancel()
        heartbeatJob = null
        serviceScope.cancel()
        
        // Immediately restart service to keep it running
        val restartIntent = Intent(applicationContext, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
