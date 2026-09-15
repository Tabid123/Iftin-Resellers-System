package com.iftin.resellers

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iftin.resellers.auth.AuthRepository
import com.iftin.resellers.ui.theme.IftinAgentsTheme
import kotlinx.coroutines.launch

class LoginActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            IftinAgentsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF5F5F5)
                ) {
                    LoginScreen(onLoggedIn = {
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginScreen(onLoggedIn: () -> Unit) {
    val ctx = LocalContext.current
    val auth = remember { AuthRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    
    val passwordFocus = remember { FocusRequester() }

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showPassword by remember { mutableStateOf(false) }

    // Built once: rebuilding the colour set on every keystroke recomposition
    // was needless work while typing.
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.Black,
        unfocusedTextColor = Color.Black,
        disabledTextColor = Color.Black,
        cursorColor = Color(0xFF1656D6),
        focusedBorderColor = Color(0xFF1656D6),
        unfocusedBorderColor = Color(0xFFBDBDBD),
        focusedLabelColor = Color(0xFF1656D6),
        unfocusedLabelColor = Color.Gray,
    )

    fun submit() {
        if (email.isBlank() || password.isBlank()) {
            error = "Geli email iyo password"
            return
        }
        
        loading = true
        error = null
        scope.launch {
            val deviceId = android.provider.Settings.Secure.getString(
                ctx.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
            val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
            val res = auth.login(
                email = email.trim(),
                password = password,
                deviceId = deviceId,
                deviceName = deviceName,
                sim1Number = readSimNumber(ctx, 0),
                sim2Number = readSimNumber(ctx, 1)
            )
            loading = false
            if (res.success) onLoggedIn() else error = res.errorMessage ?: "Login failed"
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.login_logo),
                contentDescription = "Iftin Resellers logo",
                modifier = Modifier.size(140.dp)
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Gal Akoonkaaga Reseller",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF333333)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Isticmaal isla email-ka aad ku gasho web-ka",
                fontSize = 12.sp,
                color = Color.Gray
            )

            Spacer(Modifier.height(20.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it; if (error != null) error = null },
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
                enabled = !loading,
                colors = fieldColors
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it; if (error != null) error = null },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(passwordFocus),
                enabled = !loading,
                colors = fieldColors,
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            imageVector = if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (showPassword) "Qari password-ka" else "Muuji password-ka",
                            tint = Color(0xFF1656D6)
                        )
                    }
                }
            )

            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = error ?: "",
                    color = Color(0xFFD32F2F),
                    fontSize = 13.sp
                )
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = { submit() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1656D6)),
                enabled = !loading
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp)
                    )
                } else {
                    Text("Gal", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

/** Best-effort SIM number lookup; returns null when unavailable or not permitted. */
private fun readSimNumber(context: android.content.Context, slot: Int): String? {
    return try {
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.READ_PHONE_STATE
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return null
        val sm = context.getSystemService(android.content.Context.TELEPHONY_SUBSCRIPTION_SERVICE)
            as? android.telephony.SubscriptionManager ?: return null
        @Suppress("MissingPermission")
        val info = sm.activeSubscriptionInfoList?.firstOrNull { it.simSlotIndex == slot }
        info?.number?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
        null
    }
}
