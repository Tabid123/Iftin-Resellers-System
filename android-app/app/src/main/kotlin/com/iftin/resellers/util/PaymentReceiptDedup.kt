package com.iftin.resellers.util

import android.content.Context
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.roundToLong

object PaymentReceiptDedup {
    private const val PREFS_NAME = "iftin_payment_receipts"
    private const val PROCESSED_FINGERPRINTS_KEY = "processed_payment_fingerprints"
    private const val MAX_TRACKED_FINGERPRINTS = 2000

    /**
     * Build a STABLE tx_id that is deterministic for the same SMS content.
     * CRITICAL: smsTimestamp is NOT included — both SmsReceiver and UssdDialerService
     * may report slightly different timestamps for the same SMS, so we exclude it
     * to guarantee both paths produce the SAME tx_id.
     *
     * Priority:
     * 1. Extract provider transaction reference from SMS body (if present)
     * 2. Fall back to hash of normalized(sender + amount + smsBody)
     */
    fun buildStableReceiptTxId(
        senderPhone: String,
        amount: Double,
        smsBody: String,
        @Suppress("UNUSED_PARAMETER") smsTimestamp: Long = 0L // kept for API compat, NOT used
    ): String {
        // 1. Try to extract provider reference from SMS body
        val providerRef = extractTransactionReference(smsBody)
        if (providerRef != null) {
            return "ref_$providerRef"
        }

        // 2. Deterministic hash WITHOUT timestamp
        val payload = listOf(
            normalizeSomaliPhone(senderPhone),
            normalizeAmount(amount),
            normalizeSmsBody(smsBody)
        ).joinToString("|")

        return "sms_${sha256Hex(payload).take(24)}"
    }

    /**
     * Fingerprint = same as stableTxId (no timestamp).
     * Used by tryMarkFingerprint to prevent the SAME SMS from being sent twice.
     */
    fun buildReceiptFingerprint(
        senderPhone: String,
        amount: Double,
        smsBody: String,
        @Suppress("UNUSED_PARAMETER") smsTimestamp: Long = 0L
    ): String = buildStableReceiptTxId(senderPhone, amount, smsBody, 0L)

    @Synchronized
    fun tryMarkFingerprint(context: Context, fingerprint: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tracked = prefs
            .getStringSet(PROCESSED_FINGERPRINTS_KEY, emptySet())
            ?.toMutableSet()
            ?: mutableSetOf()

        if (tracked.contains(fingerprint)) {
            return false
        }

        tracked.add(fingerprint)
        while (tracked.size > MAX_TRACKED_FINGERPRINTS) {
            tracked.remove(tracked.first())
        }

        prefs.edit().putStringSet(PROCESSED_FINGERPRINTS_KEY, tracked).commit()
        return true
    }

    /**
     * Extract provider-supplied transaction reference from SMS body.
     * Patterns: "Transaction ID: ABC123", "Ref: 12345", "Tixraac: XYZ"
     */
    private fun extractTransactionReference(smsBody: String): String? {
        if (smsBody.isBlank()) return null

        val patterns = listOf(
            Regex("""(?:transaction|trans(?:action)?|trx|tx)\s*(?:id|ref|reference|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})""", RegexOption.IGNORE_CASE),
            Regex("""(?:ref|reference|tixraac)\s*(?:id|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            val match = pattern.find(smsBody)
            if (match != null) {
                return match.groupValues[1].trim().uppercase()
            }
        }
        return null
    }

    private fun normalizeSmsBody(body: String): String {
        return body.lowercase(Locale.ROOT).replace(Regex("\\s+"), " ").trim()
    }

    private fun normalizeAmount(amount: Double): String {
        return (amount * 100.0).roundToLong().toString()
    }

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

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
