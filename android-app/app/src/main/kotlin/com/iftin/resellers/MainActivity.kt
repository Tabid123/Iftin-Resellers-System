package com.iftin.resellers

import android.Manifest
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.core.view.WindowCompat
import com.google.accompanist.systemuicontroller.rememberSystemUiController
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.data.DeliveryDatabase
import com.iftin.resellers.service.UssdDialerService
import com.iftin.resellers.ui.theme.IftinAgentsTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {
    private val PERMISSION_REQUEST_CODE = 100
    private lateinit var database: DeliveryDatabase
    private val apiClient = DeliveryApiClient()
    private var nativeFeaturesInitialized = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        database = DeliveryDatabase.getInstance(this)
        
        // Enable edge-to-edge display
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        // Show version toast on startup
        Toast.makeText(
            this,
            "Iftin Resellers v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) ⚡",
            Toast.LENGTH_LONG
        ).show()
        
        // Request permissions first, then start native features after user responds
        requestPermissions()
        
        // Some OEM Settings implementations can reject/throw on this intent.
        // Setup guidance must never be able to crash the delivery dashboard.
        try {
            ensureBatteryOptimizationExempted()
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "Battery optimization setup unavailable", e)
        }
        
        setContent {
            IftinAgentsTheme {
                // Control system bars with edge-to-edge
                val systemUiController = rememberSystemUiController()
                
                SideEffect {
                    systemUiController.setNavigationBarColor(
                        color = Color(0xFF006F00),
                        darkIcons = false
                    )
                    systemUiController.setStatusBarColor(
                        color = Color(0xFF006F00),
                        darkIcons = false
                    )
                }
                
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .navigationBarsPadding(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(
                        onRequestBatteryOptimization = { requestBatteryOptimization() },
                        onOpenAccessibilitySettings = { openAccessibilitySettings() },
                        checkServiceRunning = { isServiceRunning() }
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-check after upgrades and after returning from Android settings. Android may
        // revoke SMS permissions or disable Accessibility when a new APK is installed.
        if (::database.isInitialized) requestPermissions()
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS,
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.WAKE_LOCK,
            Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS  // OTP SMS sending permission
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val permissionsToRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        } else {
            initializeNativeFeatures()
        }
    }

    private fun initializeNativeFeatures() {
        if (nativeFeaturesInitialized) return
        nativeFeaturesInitialized = true

        registerDevice()
        startDeliveryService()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode != PERMISSION_REQUEST_CODE) return

        val deniedPermissions = permissions.filterIndexed { index, _ ->
            grantResults.getOrNull(index) != PackageManager.PERMISSION_GRANTED
        }

        if (deniedPermissions.isNotEmpty()) {
            Toast.makeText(
                this,
                "Qaar ka mid ah rukhsadaha lama oggolaan — SMS/USSD waxay u baahan yihiin dhammaan permissions-ka muhiimka ah.",
                Toast.LENGTH_LONG
            ).show()
        }

        initializeNativeFeatures()
    }

    private fun requestBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                intent.data = Uri.parse("package:$packageName")
                startActivity(intent)
            }
        }
    }
    
    /**
     * CRITICAL: Force battery optimization exemption on startup.
     * Without this, WorkManager and foreground service will be killed in Doze mode.
     */
    private fun ensureBatteryOptimizationExempted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                // Show critical dialog explaining importance
                AlertDialog.Builder(this)
                    .setTitle("⚠️ Muhiim - Important!")
                    .setMessage(
                        "Si service-ka uu u shaqeeyo 24/7 marka phone-ka lock yahay, " +
                        "WAXAAD QABATAA inaad ka saarto battery optimization.\n\n" +
                        "For 24/7 reliable operation when phone is locked, " +
                        "you MUST disable battery optimization."
                    )
                    .setPositiveButton("OK - Ka Saar") { _, _ ->
                        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        intent.data = Uri.parse("package:$packageName")
                        startActivity(intent)
                    }
                    .setCancelable(false)
                    .show()
            }
        }
    }
    
    private fun openAccessibilitySettings() {
        try {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "Accessibility settings could not be opened", e)
            Toast.makeText(this, "Accessibility settings lama furi karo qalabkan.", Toast.LENGTH_LONG).show()
        }
    }

    private fun startDeliveryService() {
        try {
            val intent = Intent(this, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            android.util.Log.d("MainActivity", "✅ Foreground service started successfully")
        } catch (e: Throwable) {
            android.util.Log.e("MainActivity", "❌ Failed to start foreground service: ${e.message}")
            Toast.makeText(
                this,
                "Service start failed - retrying...",
                Toast.LENGTH_SHORT
            ).show()
            // Retry after a short delay (app will be in foreground by then)
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    val retryIntent = Intent(this, UssdDialerService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(retryIntent)
                    } else {
                        startService(retryIntent)
                    }
                } catch (e2: Throwable) {
                    android.util.Log.e("MainActivity", "❌ Retry also failed: ${e2.message}")
                }
            }, 1000)
        }
    }
    
    /**
     * Check if UssdDialerService is actually running using ActivityManager
     */
    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
            if (UssdDialerService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }

    private fun registerDevice() {
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
        
        // Get SIM card numbers
        val sim1Number = getSimNumber(0)
        val sim2Number = getSimNumber(1)
        
        kotlinx.coroutines.GlobalScope.launch {
            try {
                val result = apiClient.registerDevice(deviceId, deviceName, sim1Number, sim2Number)
                if (result.needsLogin) {
                    Handler(Looper.getMainLooper()).post { forceRelogin() }
                } else {
                    println("✅ Device registered successfully (tenant=${result.tenantId})")
                }
            } catch (e: Exception) {
                println("❌ Device registration failed: ${e.message}")
            }
        }
    }

    /** Server says the device is not bound to a tenant: clear session and ask for login again. */
    private fun forceRelogin() {
        try {
            com.iftin.resellers.auth.AuthRepository(applicationContext).logout()
            stopService(Intent(this, UssdDialerService::class.java))
        } catch (_: Exception) { }
        Toast.makeText(this, "Fadlan mar kale gal akoonkaaga.", Toast.LENGTH_LONG).show()
        startActivity(Intent(this, LoginActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        finish()
    }

    private fun getSimNumber(slotIndex: Int): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    return subscriptionInfoList[slotIndex].number
                }
            } catch (e: SecurityException) {
                println("⚠️ Permission denied for reading SIM info")
            }
        }
        return null
    }
}

@Composable
fun MainScreen(
    onRequestBatteryOptimization: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit,
    checkServiceRunning: () -> Boolean
) {
    var isServiceRunning by remember { mutableStateOf(true) } // Assume running initially
    var totalDeliveries by remember { mutableStateOf(0) }
    var successfulDeliveries by remember { mutableStateOf(0) }
    var failedDeliveries by remember { mutableStateOf(0) }
    var pendingDeliveries by remember { mutableStateOf(0) }

    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val db = remember(context) { com.iftin.resellers.data.DeliveryDatabase.getInstance(context) }
    // Header shows the reseller (tenant) this phone is bound to.
    val tenantLabel = remember(context) {
        val auth = com.iftin.resellers.auth.AuthRepository(context.applicationContext)
        auth.getTenantName()?.takeIf { it.isNotBlank() }
            ?: auth.getEmail()?.takeIf { it.isNotBlank() }
            ?: "Iftin Resellers"
    }

    // Continuously check actual service state
    LaunchedEffect(Unit) {
        while (true) {
            // Check actual service state
            isServiceRunning = checkServiceRunning()
            
            // Read counters from SharedPreferences (updated by service)
            val prefs = context.getSharedPreferences("iftin_data", Context.MODE_PRIVATE)
            totalDeliveries = prefs.getInt("total_deliveries", 0)
            successfulDeliveries = prefs.getInt("successful_deliveries", 0)
            failedDeliveries = prefs.getInt("failed_deliveries", 0)

            // Pending = tasks currently processing in local queue
            try {
                pendingDeliveries = db.deliveryTaskDao().getProcessingCount()
            } catch (e: Exception) {
                pendingDeliveries = 0
            }

            delay(2000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
    ) {
        // Header
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xFF006F00),
            shadowElevation = 4.dp
        ) {
            Column(
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            ) {
                Text(
                    text = tenantLabel.uppercase(),
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(
                                if (isServiceRunning) Color(0xFF00FF00) else Color.Red,
                                CircleShape
                            )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isServiceRunning) "ALWAYS ON ♾️" else "RESTARTING...",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Stats Cards
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatCard(
                    title = "Total",
                    value = totalDeliveries.toString(),
                    color = Color(0xFF006F00),
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Success",
                    value = successfulDeliveries.toString(),
                    color = Color(0xFF00C853),
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatCard(
                    title = "Failed",
                    value = failedDeliveries.toString(),
                    color = Color(0xFFFF3D00),
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Pending",
                    value = pendingDeliveries.toString(),
                    color = Color(0xFFFFA726),
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Status Card (instead of control buttons)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isServiceRunning) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (isServiceRunning) "✅" else "🔄",
                    fontSize = 24.sp
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = if (isServiceRunning) "Service Running" else "Service Restarting",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isServiceRunning) Color(0xFF2E7D32) else Color(0xFFE65100)
                    )
                    Text(
                        text = "Service runs automatically 24/7",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Setup Buttons
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        ) {
            OutlinedButton(
                onClick = onRequestBatteryOptimization,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "DISABLE BATTERY OPTIMIZATION",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
            
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = onOpenAccessibilitySettings,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color(0xFFFFF3E0)
                )
            ) {
                Text(
                    text = "ENABLE USSD ACCESSIBILITY SERVICE",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFFF6F00)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            val logoutCtx = LocalContext.current
            val authRepo = remember { com.iftin.resellers.auth.AuthRepository(logoutCtx.applicationContext) }
            val accountEmail = remember { authRepo.getEmail() }
            if (!accountEmail.isNullOrBlank()) {
                Text(
                    text = "👤 $accountEmail",
                    fontSize = 12.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
            }
            OutlinedButton(
                onClick = {
                    authRepo.logout()
                    val i = Intent(logoutCtx, LoginActivity::class.java)
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    logoutCtx.startActivity(i)
                    if (logoutCtx is android.app.Activity) logoutCtx.finish()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0xFFFFEBEE))
            ) {
                Text(
                    text = "Ka bax (Logout)",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFC62828)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Instructions
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "📱 Setup Instructions",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF006F00)
                )
                Spacer(modifier = Modifier.height(12.dp))
                InstructionItem("1. Insert Hormuud SIM in Slot 1")
                InstructionItem("2. Insert Somnet SIM in Slot 2")
                InstructionItem("3. Enable USSD Accessibility Service")
                InstructionItem("4. Disable battery optimization")
                InstructionItem("5. Keep phone charging 24/7")
                InstructionItem("6. Service runs automatically ♾️")
            }
        }
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = title,
                fontSize = 14.sp,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

@Composable
fun InstructionItem(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Text(
            text = text,
            fontSize = 14.sp,
            color = Color.DarkGray
        )
    }
}
