package com.iftin.resellers.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Telephony
import android.telephony.SmsMessage
import android.telephony.SubscriptionManager
import android.util.Log
import com.iftin.resellers.service.UssdDialerService
import com.iftin.resellers.util.PaymentReceiptDedup
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SmsReceiver : BroadcastReceiver() {
    private val TAG = "SmsReceiver"
    private val API_URL = com.iftin.resellers.config.ApiConfig.FUNCTIONS_URL + "/process-payment-receipt"
    private val BALANCE_API_URL = com.iftin.resellers.config.ApiConfig.FUNCTIONS_URL + "/update-sim-balance"
    private val SMS_LOG_URL = com.iftin.resellers.config.ApiConfig.FUNCTIONS_URL + "/activate-package/log-sms"
    private val SUPABASE_ANON_KEY = com.iftin.resellers.config.ApiConfig.ANON_KEY
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    override fun onReceive(context: Context, intent: Intent) {
        // IMMEDIATELY acquire wake lock - FIRST LINE! Keep CPU awake for all processing
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "IftinAgents::SmsReceive"
        )
        wakeLock.acquire(120000L) // 2 minutes - covers all processing
        
        Log.d(TAG, "📨 RAW SMS RECEIVED - timestamp: ${System.currentTimeMillis()}")
        
        try {
            if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
                val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                
                Log.d(TAG, "📨 Total messages in bundle: ${messages.size}")
                
                for (smsMessage in messages) {
                    val messageBody = smsMessage.messageBody
                    val senderPhone = smsMessage.originatingAddress ?: ""
                    val smsTimestamp = smsMessage.timestampMillis
                    
                    Log.d(TAG, "SMS received from: $senderPhone")
                    Log.d(TAG, "SMS body: $messageBody")
                    
                    // Get which SIM received this SMS
                    val simSlot = getSimSlot(context, intent)
                    
                    // Get actual SIM phone number or fallback to provider name
                    val receiverSim = getReceiverSimIdentifier(context, messageBody, senderPhone, simSlot)
                    
                    Log.d(TAG, "Received on SIM slot: $simSlot, detected provider: $receiverSim")
                    
                    // Parse payment information
                    val paymentInfo = parsePaymentSms(messageBody, senderPhone, receiverSim)
                    
                    // Log every incoming SMS. Payment/balance parsing remains selective,
                    // but the admin SMS log must show the raw carrier message even when
                    // a new carrier wording is not recognised yet.
                    val bodyLower = messageBody.lowercase()
                    val isEvcSms = bodyLower.contains("evcplus") || bodyLower.contains("evc plus") || 
                                   bodyLower.contains("[-evcplus-]") || bodyLower.contains("evc-plus") ||
                                   bodyLower.contains("haraag")
                    val isEvoucherSms = bodyLower.contains("voucher") || bodyLower.contains("evoucher") || 
                                        bodyLower.contains("e-voucher") || bodyLower.contains("xirmo") || 
                                        bodyLower.contains("xirmada") || bodyLower.contains("dhammays")
                    
                    val txType = when {
                        isEvoucherSms -> "evoucher"
                        isEvcSms -> "evc_plus"
                        else -> "carrier_sms"
                    }
                    val smsType = when {
                        bodyLower.contains("uwareejisay") || bodyLower.contains("you have sent") ||
                            bodyLower.contains("sent to") -> "outgoing"
                        else -> "incoming"
                    }
                    forwardSmsLog(
                        deviceId = getDeviceId(context),
                        simSlot = simSlot + 1,
                        simNumber = getSimNumber(context, simSlot),
                        smsType = smsType,
                        smsSender = senderPhone,
                        smsBody = messageBody,
                        amount = extractAmount(messageBody),
                        txType = txType,
                        counterpartPhone = extractSenderPhone(messageBody)
                    )
                    
                    if (paymentInfo != null) {
                        val receiptFingerprint = PaymentReceiptDedup.buildReceiptFingerprint(
                            paymentInfo.senderPhone,
                            paymentInfo.amount,
                            paymentInfo.smsBody,
                            smsTimestamp
                        )

                        if (!PaymentReceiptDedup.tryMarkFingerprint(context, receiptFingerprint)) {
                            Log.d(TAG, "⏭️ Duplicate payment SMS skipped locally: $receiptFingerprint")
                            continue
                        }

                        val stableTxId = PaymentReceiptDedup.buildStableReceiptTxId(
                            paymentInfo.senderPhone,
                            paymentInfo.amount,
                            paymentInfo.smsBody,
                            smsTimestamp
                        )

                        Log.d(TAG, "⚡ Payment detected - sending once with stable tx_id: $stableTxId")
                        sendToApi(context, paymentInfo, stableTxId, smsTimestamp)
                        
                        // ✅ ALSO extract balance from payment SMS (e.g., "haraagagu waa $0.18")
                        val balanceFromPayment = extractBalanceFromPaymentSms(messageBody)
                        if (balanceFromPayment != null) {
                            Log.d(TAG, "💰 Balance extracted from payment SMS: ${balanceFromPayment.balanceType} = $${balanceFromPayment.amount}")
                            val simNumber = getSimNumber(context, simSlot)
                            sendBalanceToApi(context, balanceFromPayment, simNumber, receiverSim, simSlot)
                        }
                    } else {
                        // ✅ NEW: Also extract balance from SEND confirmation SMS (Somtel: "Haraagaagu waa: $21.80")
                        val balanceFromSendSms = extractBalanceFromPaymentSms(messageBody)
                        if (balanceFromSendSms != null) {
                            Log.d(TAG, "💰 Balance extracted from non-payment SMS (possibly SEND): ${balanceFromSendSms.balanceType} = $${balanceFromSendSms.amount}")
                            val simNumber = getSimNumber(context, simSlot)
                            sendBalanceToApi(context, balanceFromSendSms, simNumber, receiverSim, simSlot)
                        } else {
                            // Check if it's a balance SMS (EVC Plus or E-Voucher)
                            val balanceInfo = parseBalanceSms(messageBody, receiverSim)
                            if (balanceInfo != null) {
                                Log.d(TAG, "💰 Balance SMS detected: ${balanceInfo.balanceType} = $${balanceInfo.amount}")
                                val simNumber = getSimNumber(context, simSlot)
                                sendBalanceToApi(context, balanceInfo, simNumber, receiverSim, simSlot)
                            } else {
                                Log.d(TAG, "Not a payment or balance SMS, ignoring")
                            }
                        }
                    }
                }
            }
        } finally {
            // Release at the very end
            if (wakeLock.isHeld) {
                wakeLock.release()
                Log.d(TAG, "📨 WakeLock released")
            }
        }
    }

    private fun getSimSlot(context: Context, intent: Intent): Int {
        return try {
            val subscriptionId = intent.getIntExtra("subscription", -1)
            if (subscriptionId != -1) {
                val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val subscriptionInfo = subscriptionManager.getActiveSubscriptionInfo(subscriptionId)
                subscriptionInfo?.simSlotIndex ?: 0
            } else {
                0
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting SIM slot: ${e.message}")
            0
        }
    }
    
    /**
     * Dynamically detect provider from SMS content
     * Supports: Hormuud, Somtel, Amtel, Somnet
     * This replaces hardcoded SIM slot mapping with smart content detection
     */
    /**
     * Get the actual SIM phone number for the slot that received the SMS.
     * Falls back to provider name detection if phone number unavailable.
     */
    private fun getReceiverSimIdentifier(context: Context, body: String, sender: String, simSlot: Int): String {
        // FIRST: Try to get the actual SIM phone number
        val simNumber = getSimNumber(context, simSlot)
        if (simNumber.isNotEmpty() && simNumber.length >= 7) {
            Log.d(TAG, "📱 Using actual SIM phone number for receiver_sim: $simNumber (slot $simSlot)")
            return simNumber
        }
        
        // FALLBACK: Detect provider from SMS content
        val bodyLower = body.lowercase()
        val senderLower = sender.lowercase()
        
        val provider = when {
            bodyLower.contains("[-evcplus-]") || bodyLower.contains("evc plus") ||
            bodyLower.contains("evc-plus") || bodyLower.contains("hormuud") ||
            bodyLower.contains("sahal") -> "hormuud"
            
            bodyLower.contains("somtel") || bodyLower.contains("e-dahab") ||
            bodyLower.contains("edahab") || bodyLower.contains("zaad") ||
            bodyLower.contains("dhammays") || bodyLower.contains("saabir") -> "somtel"
            
            bodyLower.contains("amtel") || bodyLower.contains("defaultaccount") ||
            bodyLower.contains("mfsuser") || bodyLower.contains("e-maal") ||
            bodyLower.contains("emaal") || bodyLower.contains("mycash") ||
            bodyLower.contains("premier wallet") ||
            (bodyLower.contains("airtime") && bodyLower.contains("received")) ||
            senderLower == "913" -> "amtel"
            
            bodyLower.contains("somnet") || bodyLower.contains("telesom") -> "somnet"
            
            else -> if (simSlot == 0) "hormuud" else "somnet"
        }
        
        Log.d(TAG, "🔍 Could not get SIM number, falling back to provider name: $provider (slot $simSlot)")
        return provider
    }

    private fun parsePaymentSms(body: String, sender: String, receiverSim: String): PaymentInfo? {
        // ONLY process RECEIVE messages with CLEAR sender identification
        // Valid patterns that clearly show WHO sent money:
        // - "ka heshay 0617195659" (EVC Plus - "received FROM")
        // - "received from 0617195659" (English)
        // - "lacag ayaad ka heshay 0617195659" (Premier)
        
        // IMPORTANT: "heshay" alone (without "ka") is just a balance update
        // e.g., "Waxaad heshay 0.1 Dollars 619535029" = balance notification, NOT sender ID
        
        val bodyLower = body.lowercase()
        
        // Check if this is a SEND confirmation (ignore it)
        if (bodyLower.contains("uwareejisay") || 
            bodyLower.contains("you have sent") || 
            bodyLower.contains("sent to")) {
            Log.d(TAG, "Ignoring SEND confirmation SMS")
            return null
        }
        
        // Ignore SubAccount/internal transfers
        if (bodyLower.contains("subaccount") || 
            bodyLower.contains("sub account") ||
            bodyLower.contains("ku shubashada")) {
            Log.d(TAG, "Ignoring SubAccount/internal transfer SMS")
            return null
        }
        
        // CRITICAL: Only process SMS with payment receive patterns
        // These patterns reliably identify the SENDER
        val hasKaHeshay = bodyLower.contains("ka heshay")
        val hasReceivedFrom = bodyLower.contains("received from")
        val hasLacagKaHeshay = bodyLower.contains("lacag ayaad ka heshay")
        // Amtel pattern: "You received Airtime from 252710000040"
        val hasReceivedAirtime = bodyLower.contains("received airtime from")
        
        if (!hasKaHeshay && !hasReceivedFrom && !hasLacagKaHeshay && !hasReceivedAirtime) {
            // "heshay" alone without "ka" is a balance update, not a payment receipt
            Log.d(TAG, "Ignoring SMS: No payment pattern found - cannot identify sender")
            return null
        }
        
        val amount = extractAmount(body) ?: return null
        
        // Extract sender phone - MUST come AFTER "ka heshay" or "received from"
        val actualSender = extractSenderPhone(body)
        
        if (actualSender == null) {
            Log.d(TAG, "Ignoring SMS: Could not extract sender phone after pattern")
            return null
        }
        
        Log.d(TAG, "✅ Valid payment SMS detected: sender=$actualSender, amount=$amount")
        
        return PaymentInfo(
            senderPhone = actualSender,
            receiverSim = receiverSim,
            amount = amount,
            smsBody = body
        )
    }

    private fun extractAmount(body: String): Double? {
        // Match patterns like: $1.00, $+1.00 (Amtel), 1.00 USD, $1, 1.00
        val patterns = listOf(
            """\$\+?(\d+\.?\d*)""".toRegex(),  // $1.00 or $+1.00 (Amtel format) or $1
            """(\d+\.?\d*)\s*USD""".toRegex(RegexOption.IGNORE_CASE),  // 1.00 USD
            """(\d+\.?\d*)\s*DOLLAR""".toRegex(RegexOption.IGNORE_CASE),  // 1.00 DOLLAR
            """lacag.*?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // lacag: 1.00
            """amount\s+is\s+\$\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)  // Amtel: Amount is $+50.00
        )
        
        for (pattern in patterns) {
            val match = pattern.find(body)
            if (match != null) {
                val amountStr = match.groupValues[1]
                return amountStr.toDoubleOrNull()
            }
        }
        
        return null
    }

    /**
     * Normalize Somali phone to canonical 9-digit local format
     * 252685837139 -> 685837139, 0685837139 -> 685837139, 685837139 -> 685837139
     */
    private fun normalizeSomaliPhone(phone: String): String {
        var digits = phone.replace(Regex("\\D"), "")
        // Remove 252 country code
        if (digits.startsWith("252") && digits.length >= 12) {
            digits = digits.substring(3)
        }
        // Remove leading 0
        if (digits.startsWith("0") && digits.length == 10) {
            digits = digits.substring(1)
        }
        // Return last 9 digits
        return if (digits.length >= 9) digits.takeLast(9) else digits
    }

    private fun extractSenderPhone(body: String): String? {
        // CRITICAL: Extract phone number that comes AFTER "ka heshay" or "received from"
        // Must handle 9, 10, and 12 digit formats (e.g., 685837139, 0685837139, 252685837139)
        
        Log.d(TAG, "🔍 Extracting sender from SMS body: ${body.take(150)}")
        
        // Regex captures: optional +, optional 252, optional 0, then 9 digits
        // This handles: 252685837139, +252685837139, 0685837139, 685837139
        val phoneCapture = """(\+?252\d{9}|0\d{9}|\d{9})"""
        
        // Pattern 1: "ka heshay 252685837139" or "ka heshay 0617195659" or "ka heshay 617195659"
        val kaHeshayPattern = """ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        kaHeshayPattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from 'ka heshay' pattern: $sender")
            return sender
        }
        
        // Pattern 1b: "waxaad $X ka heshay 252685837139"
        val waxaadKaPattern = """waxaad.*?ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        waxaadKaPattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from 'waxaad...ka heshay' pattern: $sender")
            return sender
        }
        
        // Pattern 2: "received from 252685837139"
        val receivedFromPattern = """received\s+from\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedFromPattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from 'received from' pattern: $sender")
            return sender
        }
        
        // Pattern 3: "lacag ayaad ka heshay 252685837139"
        val lacagPattern = """lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        lacagPattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from 'lacag ayaad ka heshay' pattern: $sender")
            return sender
        }
        
        // Pattern 4: Fallback - "ka...heshay...phone"
        val fallbackPattern = """ka.*?heshay.*?$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        fallbackPattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from fallback 'ka...heshay' pattern: $sender")
            return sender
        }
        
        // Pattern 5: Amtel - "received Airtime from 252710000040"
        val receivedAirtimePattern = """received\s+airtime\s+from\s+$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedAirtimePattern.find(body)?.let {
            val sender = normalizeSomaliPhone(it.groupValues[1])
            Log.d(TAG, "✅ Extracted sender from Amtel 'received Airtime from' pattern: $sender")
            return sender
        }
        
        Log.d(TAG, "❌ Cannot extract sender - no matching pattern found in: ${body.take(150)}")
        return null
    }

    private fun sendToApi(context: Context, paymentInfo: PaymentInfo, txId: String, smsTimestamp: Long) {
        val deviceId = getDeviceId(context)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val json = JSONObject().apply {
                    put("sender_phone", paymentInfo.senderPhone)
                    put("receiver_sim", paymentInfo.receiverSim)
                    put("amount", paymentInfo.amount)
                    put("sms_body", paymentInfo.smsBody)
                    put("tx_id", txId)  // Unique transaction ID
                    put("sms_timestamp", smsTimestamp)  // Exact SMS timestamp
                    if (deviceId.isNotEmpty()) put("device_id", deviceId)
                }

                Log.d(TAG, "⚡ Sending to API with tx_id: $txId, device: $deviceId")

                val requestBody = json.toString()
                    .toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url(API_URL)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    .addHeader("x-device-id", deviceId)
                    .build()

                
                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""
                
                if (response.isSuccessful) {
                    Log.d(TAG, "✅ Payment sent to API successfully: $responseBody")
                    
                    // ✅ SET FLAG: Tell AccessibilityService we're expecting USSD dialogs
                    setExpectingUssdDialogs(context)
                    
                    // ✅ START USSD SERVICE to process the queued delivery
                    startUssdService(context)
                } else {
                    Log.e(TAG, "API error: ${response.code} - $responseBody")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending to API: ${e.message}", e)
            }
        }
    }
    
    /**
     * Set SharedPreferences flag to tell AccessibilityService we're expecting USSD dialogs
     * This makes the AccessibilityService more aggressive in auto-clicking
     */
    private fun setExpectingUssdDialogs(context: Context) {
        try {
            val prefs = context.getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("expecting_ussd_dialogs", true)
                .putLong("last_ussd_time", System.currentTimeMillis())
                .apply()
            
            Log.d(TAG, "🚩 Set expecting_ussd_dialogs = true")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set USSD flag: ${e.message}")
        }
    }

    private fun startUssdService(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            // Acquire wake lock to keep CPU awake during service start
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "IftinAgents::SmsWake"
            )
            wakeLock.acquire(60000L) // 1 minute max
            
            try {
                // Lightning fast - 100ms only!
                Log.d(TAG, "⚡ Starting USSD service in 100ms...")
                kotlinx.coroutines.delay(100)
                
                val serviceIntent = Intent(context, UssdDialerService::class.java).apply {
                    putExtra("TRIGGER_IMMEDIATE_POLL", true)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                
                Log.d(TAG, "📞 USSD service started instantly!")
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to start USSD service: ${e.message}")
            } finally {
                if (wakeLock.isHeld) {
                    wakeLock.release()
                }
            }
        }
    }

    /**
     * Extract balance from a PAYMENT SMS that also contains balance info
     * e.g., "[-EVCPLUS-] waxaad $0.09 ka heshay 0619535029, Tar: 25/12/25 12:17:45 haraagagu waa $0.18."
     * 
     * SMART DETECTION: Automatically detects if balance is EVC Plus or E-Voucher based on SMS content
     */
    private fun extractBalanceFromPaymentSms(body: String): BalanceInfo? {
        Log.d(TAG, "🔍 Extracting balance from payment SMS: ${body.take(100)}...")
        
        val bodyLower = body.lowercase()
        
        // SMART BALANCE TYPE DETECTION based on SMS content
        val balanceType = when {
            // E-Voucher indicators (including Somtel data package keywords)
            bodyLower.contains("voucher") ||
            bodyLower.contains("evoucher") ||
            bodyLower.contains("e-voucher") ||
            bodyLower.contains("xirmo") ||
            bodyLower.contains("xirmada") ||
            bodyLower.contains("e-xirmada") ||
            bodyLower.contains("dhammays") -> "evoucher"
            
            // EVC Plus indicators (or default)
            bodyLower.contains("evcplus") ||
            bodyLower.contains("evc plus") ||
            bodyLower.contains("[-evcplus-]") ||
            bodyLower.contains("evc-plus") -> "evc_plus"
            
            // Default to evoucher for non-Hormuud providers (Somtel, Amtel, Somnet)
            // Only Hormuud has evc_plus, others use evoucher for data credit
            else -> "evoucher"
        }
        
        Log.d(TAG, "🔍 Detected balance type from SMS content: $balanceType")
        
        // Patterns for balance at end of payment SMS
        // "haraagagu waa $0.18" or "haraagaagu waa $5.50" or "haraag waa $10"
        // Amtel: "Now your balance is $+71.90" or "Available balance: $+11.90"
        val patterns = listOf(
            // Somtel format: "Haraagaagu waa: $7.80" (colon + space + dollar)
            """haraag\w*\s+waa:?\s+\$(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
            // Hormuud format: "haraagagu waa $0.18" (no colon, optional dollar)
            """haraag\w*\s+waa:?\s+\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
            // Generic haraag pattern
            """haraag.*?waa:?\s*\$(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
            """xirmadaada.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // E-Voucher: "xirmadaada waa $X"
            """xirmada.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // E-Voucher: "xirmada $X"
            """xirmo.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // E-Voucher: "xirmo waa $X"
            """balance.*?is\s*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // Generic + Amtel
            """your\s+balance.*?\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
            """now\s+your\s+balance\s+is\s*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // Amtel: "Now your balance is $+71.90"
            """available\s+balance[:\s]*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)  // Amtel: "Available balance: $+11.90"
        )
        
        for (pattern in patterns) {
            val match = pattern.find(body)
            if (match != null) {
                val amount = match.groupValues[1].toDoubleOrNull()
                if (amount != null) {
                    // ✅ Skip data size numbers (MB, GB, mins, etc.) - NOT currency!
                    val matchEnd = match.range.last + 1
                    val textAfterMatch = if (matchEnd < body.length) {
                        body.substring(matchEnd).take(5).lowercase().trim()
                    } else ""
                    
                    if (textAfterMatch.startsWith("mb") || 
                        textAfterMatch.startsWith("gb") ||
                        textAfterMatch.startsWith("mins") ||
                        textAfterMatch.startsWith("min ") ||
                        textAfterMatch.startsWith("sms")) {
                        Log.d(TAG, "⚠️ Skipping data size number: $amount ($textAfterMatch)")
                        continue  // Skip this match, try next pattern
                    }
                    
                    // ✅ Reasonable balance validation (max $200 for telecom balance)
                    if (amount > 200) {
                        Log.d(TAG, "⚠️ Skipping unreasonable balance: $$amount (too high, likely data size)")
                        continue
                    }
                    
                    Log.d(TAG, "💵 Balance found in payment SMS: $balanceType = $$amount")
                    return BalanceInfo(balanceType, amount)  // ✅ Smart type detection!
                }
            }
        }
        
        Log.d(TAG, "❌ No balance found in payment SMS")
        return null
    }

    /**
     * Parse balance SMS messages for EVC Plus and E-Voucher balances
     * Supports Hormuud, Somtel, and other Somali telecom providers
     */
    private fun parseBalanceSms(body: String, receiverSim: String): BalanceInfo? {
        val bodyLower = body.lowercase()
        
        // Skip if this looks like a payment SMS
        if (bodyLower.contains("ka heshay") || bodyLower.contains("received from")) {
            return null
        }
        
        // E-Voucher balance patterns (check first - more specific)
        // "E-Voucher haraagaagu waa $12.50" or "Xirmadaada waa $5.00" or "Xirmo: $5.00"
        if (bodyLower.contains("e-voucher") || bodyLower.contains("evoucher") || 
            bodyLower.contains("xirmada") || bodyLower.contains("voucher") ||
            bodyLower.contains("xirmo") || bodyLower.contains("e-xirmada") ||
            bodyLower.contains("e- voucher") || bodyLower.contains("e -voucher")) {
            
            Log.d(TAG, "🎫 Detected E-Voucher SMS pattern, parsing...")
            
            val evoucherPatterns = listOf(
                """e-?\s*voucher.*?haraag.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """e-?\s*voucher.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """e-?\s*xirmada.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """xirmadaada.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """xirmada.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """xirmo.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """xirmo.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """voucher.*?balance.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """voucher.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)
            )
            
            for (pattern in evoucherPatterns) {
                val match = pattern.find(body)
                if (match != null) {
                    val amount = match.groupValues[1].toDoubleOrNull()
                    if (amount != null && amount > 0) {
                        // ✅ Skip data size numbers (MB, GB, mins, etc.)
                        val matchEnd = match.range.last + 1
                        val textAfterMatch = if (matchEnd < body.length) {
                            body.substring(matchEnd).take(5).lowercase().trim()
                        } else ""
                        
                        if (textAfterMatch.startsWith("mb") || 
                            textAfterMatch.startsWith("gb") ||
                            textAfterMatch.startsWith("mins") ||
                            textAfterMatch.startsWith("sms")) {
                            Log.d(TAG, "⚠️ Skipping E-Voucher data size: $amount ($textAfterMatch)")
                            continue
                        }
                        
                        // ✅ Reasonable balance validation
                        if (amount > 200) {
                            Log.d(TAG, "⚠️ Skipping unreasonable E-Voucher: $$amount")
                            continue
                        }
                        
                        Log.d(TAG, "💳 E-Voucher balance detected: $$amount")
                        return BalanceInfo("evoucher", amount)
                    }
                }
            }
        }
        
        // Amtel balance patterns (check before generic EVC patterns)
        // "The balance of DefaultAccount ... Available balance: $+11.90"
        // "Now your balance is $+71.90"
        if (bodyLower.contains("defaultaccount") || bodyLower.contains("amtel") ||
            bodyLower.contains("mfsuser") || (bodyLower.contains("airtime") && !bodyLower.contains("received"))) {
            
            Log.d(TAG, "🔶 Detected Amtel SMS pattern, parsing...")
            
            val amtelPatterns = listOf(
                """available\s+balance[:\s]*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // Available balance: $+11.90
                """current\s+balance[:\s]*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """now\s+your\s+balance\s+is\s*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // Now your balance is $+71.90
                """balance\s+is\s*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)
            )
            
            for (pattern in amtelPatterns) {
                val match = pattern.find(body)
                if (match != null) {
                    val amount = match.groupValues[1].toDoubleOrNull()
                    if (amount != null && amount >= 0) {
                        // ✅ Skip data size numbers
                        val matchEnd = match.range.last + 1
                        val textAfterMatch = if (matchEnd < body.length) {
                            body.substring(matchEnd).take(5).lowercase().trim()
                        } else ""
                        
                        if (textAfterMatch.startsWith("mb") || 
                            textAfterMatch.startsWith("gb") ||
                            textAfterMatch.startsWith("mins") ||
                            textAfterMatch.startsWith("sms")) {
                            Log.d(TAG, "⚠️ Skipping Amtel data size: $amount ($textAfterMatch)")
                            continue
                        }
                        
                        // ✅ Reasonable balance validation
                        if (amount > 200) {
                            Log.d(TAG, "⚠️ Skipping unreasonable Amtel balance: $$amount")
                            continue
                        }
                        
                        Log.d(TAG, "🔶 Amtel balance detected: $$amount")
                        return BalanceInfo("evoucher", amount)  // Amtel uses evoucher only (no evc_plus)
                    }
                }
            }
        }
        
        // EVC Plus balance patterns (Hormuud)
        // "Haraagaagu waa $25.00" or "EVC Plus balance: $10.50" or "Your balance is $15.00"
        if (bodyLower.contains("haraag") || bodyLower.contains("balance") || 
            bodyLower.contains("evc") || bodyLower.contains("haraagaagu")) {
            
            val evcPatterns = listOf(
                """haraag\w*\s+waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),  // Matches haraagagu, haraagaagu, haraag, etc.
                """haraag.*?waa\s*\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """evc.*?plus.*?balance.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """evc.*?balance.*?\$?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """your\s+balance.*?\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """balance.*?is\s*\$?\+?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE),
                """waa\s*\$(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)
            )
            
            for (pattern in evcPatterns) {
                val match = pattern.find(body)
                if (match != null) {
                    val amount = match.groupValues[1].toDoubleOrNull()
                    if (amount != null && amount >= 0) {
                        // ✅ Skip data size numbers (MB, GB, mins, etc.)
                        val matchEnd = match.range.last + 1
                        val textAfterMatch = if (matchEnd < body.length) {
                            body.substring(matchEnd).take(5).lowercase().trim()
                        } else ""
                        
                        if (textAfterMatch.startsWith("mb") || 
                            textAfterMatch.startsWith("gb") ||
                            textAfterMatch.startsWith("mins") ||
                            textAfterMatch.startsWith("sms")) {
                            Log.d(TAG, "⚠️ Skipping EVC data size: $amount ($textAfterMatch)")
                            continue
                        }
                        
                        // ✅ Reasonable balance validation
                        if (amount > 200) {
                            Log.d(TAG, "⚠️ Skipping unreasonable EVC balance: $$amount")
                            continue
                        }
                        
                        Log.d(TAG, "💵 EVC Plus balance detected: $$amount")
                        return BalanceInfo("evc_plus", amount)
                    }
                }
            }
        }
        
        return null
    }
    
    /**
     * Get SIM phone number from slot index
     */
    private fun getSimNumber(context: Context, simSlot: Int): String {
        return try {
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
            
            if (subscriptionInfoList != null && simSlot < subscriptionInfoList.size) {
                val subscriptionInfo = subscriptionInfoList[simSlot]
                var number = subscriptionInfo.number ?: ""
                
                // Clean up the number - remove country code prefix
                number = number.replace("+252", "").replace("252", "")
                if (number.startsWith("0")) {
                    number = number.substring(1)
                }
                
                Log.d(TAG, "📱 SIM $simSlot number: $number")
                number
            } else {
                Log.d(TAG, "📱 Could not get SIM number for slot $simSlot")
                ""
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting SIM number: ${e.message}")
            ""
        }
    }
    
    /**
     * Send balance update to the update-sim-balance API
     * Now includes sim_slot parameter for accurate SIM identification
     */
    private fun sendBalanceToApi(context: Context, balanceInfo: BalanceInfo, simNumber: String, providerName: String, simSlot: Int) {
        val deviceId = getDeviceId(context)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val json = JSONObject().apply {
                    put("sim_number", simNumber)
                    put("provider_name", providerName)
                    put("balance_type", balanceInfo.balanceType)
                    put("balance", balanceInfo.amount)
                    put("source", "sms")
                    put("sim_slot", simSlot + 1)  // ✅ Convert 0-indexed to 1-indexed (SIM 1 or SIM 2)
                    if (deviceId.isNotEmpty()) put("device_id", deviceId)
                }
                
                Log.d(TAG, "💰 Sending balance update to API: ${balanceInfo.balanceType} = $${balanceInfo.amount}, SIM slot: ${simSlot + 1}, device: $deviceId")

                
                val requestBody = json.toString()
                    .toRequestBody("application/json".toMediaType())
                
                val request = Request.Builder()
                    .url(BALANCE_API_URL)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    .build()
                
                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""
                
                if (response.isSuccessful) {
                    Log.d(TAG, "✅ Balance updated successfully: $responseBody")
                } else {
                    Log.e(TAG, "❌ Balance API error: ${response.code} - $responseBody")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error sending balance to API: ${e.message}", e)
            }
        }
    }

    /** Use the same stable Android ID used by registration and order polling. */
    private fun getDeviceId(context: Context): String {
        return android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ).orEmpty()
    }

    /**
     * Forward EVC Plus / E-Voucher SMS to sms_logs table via Supabase REST API
     */
    private fun forwardSmsLog(
        deviceId: String,
        simSlot: Int,
        simNumber: String,
        smsType: String,
        smsSender: String,
        smsBody: String,
        amount: Double?,
        txType: String,
        counterpartPhone: String?
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (deviceId.isBlank()) {
                    Log.e(TAG, "❌ SMS log blocked locally: Android device ID unavailable")
                    return@launch
                }
                val json = JSONObject().apply {
                    put("device_id", deviceId)
                    put("sim_slot", simSlot)
                    put("sim_number", simNumber)
                    put("sms_type", smsType)
                    put("sms_sender", smsSender)
                    put("sms_body", smsBody)
                    if (amount != null) put("amount", amount)
                    put("tx_type", txType)
                    if (counterpartPhone != null) put("counterpart_phone", counterpartPhone)
                }

                val requestBody = json.toString()
                    .toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url(SMS_LOG_URL)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    .build()

                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.d(TAG, "📝 SMS log forwarded: $txType $smsType $$amount")
                } else {
                    Log.e(TAG, "❌ SMS log error: ${response.code} - ${response.body?.string()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ SMS log forward error: ${e.message}", e)
            }
        }
    }

    data class PaymentInfo(
        val senderPhone: String,
        val receiverSim: String,
        val amount: Double,
        val smsBody: String
    )
    
    data class BalanceInfo(
        val balanceType: String,  // "evc_plus" or "evoucher"
        val amount: Double
    )
}
