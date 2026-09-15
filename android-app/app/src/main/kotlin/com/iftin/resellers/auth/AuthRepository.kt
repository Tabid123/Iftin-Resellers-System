package com.iftin.resellers.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.config.ApiConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Tenant login for the delivery APK.
 *
 * 1. Supabase Auth (email + password) — the same accounts used on the web dashboard.
 * 2. `register-device` binds this phone to the tenant the user belongs to
 *    (`tenant_members`) and returns the `tenantId`.
 *
 * Session + tenantId are stored in EncryptedSharedPreferences.
 */
class AuthRepository(context: Context) {

    companion object {
        private const val PREFS_NAME = "iftin_auth_secure"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_TENANT_ID = "tenant_id"
        private const val KEY_TENANT_NAME = "tenant_name"

        private val JSON = "application/json; charset=utf-8".toMediaType()
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val http = DeliveryApiClient.sharedHttpClient
    private val api = DeliveryApiClient()
    private val anonKey: String = ApiConfig.ANON_KEY

    data class LoginResult(
        val success: Boolean,
        val errorMessage: String? = null,
        val tenantId: String? = null
    )

    /** Returns true if a valid (non-expired) session with a tenant is stored. */
    fun isLoggedIn(): Boolean {
        val token = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return false
        val tenantId = prefs.getString(KEY_TENANT_ID, null)
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        return token.isNotBlank() && !tenantId.isNullOrBlank() &&
            expiresAt > (System.currentTimeMillis() / 1000) + 30
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)
    fun getEmail(): String? = prefs.getString(KEY_EMAIL, null)
    fun getTenantId(): String? = prefs.getString(KEY_TENANT_ID, null)
    fun getTenantName(): String? = prefs.getString(KEY_TENANT_NAME, null)

    /**
     * Sign in, then register/bind this device to the caller's tenant.
     */
    suspend fun login(
        email: String,
        password: String,
        deviceId: String,
        deviceName: String,
        sim1Number: String? = null,
        sim2Number: String? = null
    ): LoginResult = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("email", email)
                put("password", password)
            }.toString().toRequestBody(JSON)

            val req = Request.Builder()
                .url("${ApiConfig.AUTH_URL}/token?grant_type=password")
                .addHeader("apikey", anonKey)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()

            val session = http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    val msg = try {
                        val j = JSONObject(text)
                        j.optString("error_description", j.optString("msg", ""))
                    } catch (_: Exception) { "" }
                    return@withContext LoginResult(
                        false,
                        if (msg.isNotBlank()) msg
                        else "Email ama password khaldan (${resp.code})"
                    )
                }
                JSONObject(text)
            }

            val accessToken = session.getString("access_token")
            val refreshToken = session.optString("refresh_token", "")
            val expiresIn = session.optLong("expires_in", 3600L)
            val user = session.optJSONObject("user")
            val userId = user?.optString("id").orEmpty()
            val userEmail = user?.optString("email").orEmpty().ifBlank { email }

            // Bind this device to the user's tenant
            val reg = api.registerDevice(
                deviceId = deviceId,
                deviceName = deviceName,
                sim1Number = sim1Number,
                sim2Number = sim2Number,
                email = email,
                password = password
            )

            if (!reg.success || reg.tenantId.isNullOrBlank()) {
                val msg = when (reg.httpCode) {
                    401 -> "Email ama password khaldan."
                    403 -> "Akoonkan reseller (tenant) ma laha. La xidhiidh maamulaha."
                    409 -> "Qalabkan waxaa hore u isticmaalay reseller kale."
                    else -> reg.errorMessage ?: "Diiwaangelinta qalabku waa fashilantay."
                }
                return@withContext LoginResult(false, msg)
            }

            prefs.edit()
                .putString(KEY_ACCESS_TOKEN, accessToken)
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putString(KEY_USER_ID, userId)
                .putString(KEY_EMAIL, userEmail)
                .putString(KEY_TENANT_ID, reg.tenantId)
                .putString(KEY_TENANT_NAME, reg.tenantName ?: "")
                .putLong(KEY_EXPIRES_AT, (System.currentTimeMillis() / 1000) + expiresIn)
                .apply()

            LoginResult(true, null, reg.tenantId)
        } catch (e: Exception) {
            LoginResult(false, e.message ?: "Khalad shabakad ah")
        }
    }

    /** Clears the session. The device id itself lives outside these prefs and is kept. */
    fun logout() {
        prefs.edit().clear().apply()
    }
}
