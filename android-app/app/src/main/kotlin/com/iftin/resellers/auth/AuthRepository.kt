package com.iftin.resellers.auth

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
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
import java.io.File
import java.security.KeyStore

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

    private val appContext = context.applicationContext

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

    /**
     * Some OEM/device-transfer flows can restore the encrypted preference XML
     * without restoring the Android Keystore key that encrypted it. In that
     * state EncryptedSharedPreferences throws during app startup. Never allow a
     * corrupt/stale auth backup to crash the delivery agent: delete only the
     * local auth session/key and recreate it once. Worst case the user logs in
     * again; credentials are never stored in plain SharedPreferences.
     */
    private val prefs: SharedPreferences? = createSecurePrefsSafely(appContext)

    private fun createSecurePrefsSafely(context: Context): SharedPreferences? {
        fun create(): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            return EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }

        return try {
            create()
        } catch (first: Throwable) {
            Log.e("AuthRepository", "Secure auth storage was unreadable; resetting local session", first)
            clearBrokenSecureStorage(context)
            try {
                create()
            } catch (second: Throwable) {
                // Keep the app alive even on a broken OEM Keystore. Login will
                // report secure-storage unavailable instead of crashing launch.
                Log.e("AuthRepository", "Secure auth storage could not be recreated", second)
                null
            }
        }
    }

    private fun clearBrokenSecureStorage(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                context.deleteSharedPreferences(PREFS_NAME)
            } else {
                @Suppress("DEPRECATION")
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()
                File(context.applicationInfo.dataDir, "shared_prefs/$PREFS_NAME.xml").delete()
            }
        } catch (e: Throwable) {
            Log.w("AuthRepository", "Failed clearing encrypted auth preferences", e)
        }

        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (keyStore.containsAlias(MasterKey.DEFAULT_MASTER_KEY_ALIAS)) {
                keyStore.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            }
        } catch (e: Throwable) {
            Log.w("AuthRepository", "Failed clearing stale auth master key", e)
        }
    }

    private val http = DeliveryApiClient.sharedHttpClient
    private val api = DeliveryApiClient()
    private val anonKey: String = ApiConfig.ANON_KEY

    data class LoginResult(
        val success: Boolean,
        val errorMessage: String? = null,
        val tenantId: String? = null
    )

    /** Returns true if a valid (non-expired) session with a tenant is stored. */
    fun isLoggedIn(): Boolean = try {
        val securePrefs = prefs ?: return false
        val token = securePrefs.getString(KEY_ACCESS_TOKEN, null) ?: return false
        val tenantId = securePrefs.getString(KEY_TENANT_ID, null)
        val expiresAt = securePrefs.getLong(KEY_EXPIRES_AT, 0L)
        token.isNotBlank() && !tenantId.isNullOrBlank() &&
            expiresAt > (System.currentTimeMillis() / 1000) + 30
    } catch (e: Throwable) {
        Log.e("AuthRepository", "Session read failed; treating device as logged out", e)
        false
    }

    fun getAccessToken(): String? = try { prefs?.getString(KEY_ACCESS_TOKEN, null) } catch (_: Throwable) { null }
    fun getEmail(): String? = try { prefs?.getString(KEY_EMAIL, null) } catch (_: Throwable) { null }
    fun getTenantId(): String? = try { prefs?.getString(KEY_TENANT_ID, null) } catch (_: Throwable) { null }
    fun getTenantName(): String? = try { prefs?.getString(KEY_TENANT_NAME, null) } catch (_: Throwable) { null }

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

            val securePrefs = prefs
                ?: return@withContext LoginResult(false, "Secure storage-ka qalabkan ma shaqeynayo. Dib u bilow app-ka oo isku day mar kale.")

            securePrefs.edit()
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
        try {
            prefs?.edit()?.clear()?.apply()
        } catch (e: Throwable) {
            Log.w("AuthRepository", "Logout cleanup failed", e)
        }
    }
}
