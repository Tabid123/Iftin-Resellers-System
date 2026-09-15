package com.iftin.resellers.service

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Ussd870Flow — Qeyb cusub oo maamusha USSD flow *870*:
 *
 *   Dial:    *870*{receiverPhone}#
 *   Step 2:  Data menu       → keyword-match ama lambar literal
 *   Step 3:  Package/xirmo   → keyword-match ama package code (current_amount)
 *   Step 4:  Airtime submenu → keyword-match ama lambar literal
 *   Step 5:  PIN             → geli PIN (current_pin_code)
 *
 * FORMAT CUSUB ee template suffix (waxay ku dhammaataa "|<menu1>,<menu2>"):
 *   - `|1,1`                            → lambaro literal ah (backward compat)
 *   - `|Data;Xogta,Mudnaan;Unlimited`   → keywords (comma = step, ; = keyword multiple)
 *   - Waxaad isku dari kartaa: `|Data;Xogta,2`
 *
 * Marka lambarada dialog-ka is-bedelaan (tusaale "1. Voice / 2. Data" → "1. Data / 2. Voice"),
 * keyword-yada ayaa la scan gareynayaa liiska dialog-ka, oo lambarka sax ah ayaa la qorayaa.
 */
object Ussd870Flow {

    private const val TAG = "Ussd870Flow"

    const val PREFS_NAME = "iftin_ussd_prefs"
    const val KEY_FLOW_ACTIVE = "ussd_flow_active"
    const val KEY_COMPLETED_STEPS = "flow870_completed_steps"
    const val KEY_FLOW_FINISHED_TIME = "flow870_finished_time"
    // Hadda waxay kaydinaysaa string sida "Data;Xogta,Mudnaan;Unlimited" ama "1,1".
    const val KEY_MENU_PATH = "flow870_menu_path"
    const val KEY_PREFIX = "flow870_prefix"
    const val KEY_RECEIVER = "current_receiver"
    const val KEY_PACKAGE = "current_amount"
    const val KEY_PIN = "current_pin_code"

    const val FLOW_ID = "NEW870"

    // Prefix-yada USSD ee menu-flow-ka lagu shaqeeyo. Ku dar mid cusub markaad
    // rabtid in shabakad kale (tusaale Somnet *866*) ay isticmaasho isla logic-ka.
    val MENU_FLOW_PREFIXES = listOf("*870*", "*866*", "*212*", "*101*")

    // ===== DISCOVERY MODE =====
    // Marka discovery uu firfircoon yahay, flow-ku wuxuu kaliya dooranayaa Menu 1
    // (tusaale "Data"), kadibna menu-ga xirmooyinka WUU KAYDINAYAA oo dialog-ga wuu xiraa —
    // wax iibsi ah lama dhameystirayo.
    const val KEY_DISCOVERY_MODE = "flow870_discovery_mode"
    const val KEY_DISCOVERY_MENU = "flow870_discovery_menu"
    const val KEY_DISCOVERY_TIME = "flow870_discovery_time"

    const val KEY_DISCOVERY_START = "flow870_discovery_start"

    /** Lambarka helaha — loo isticmaalaa *101* (Somtel) halkaas oo uu tallaabo menu ah ka galayo. */
    const val KEY_RECEIVER_PHONE = "flow870_receiver_phone"

    /** Marka run ah, session-ka shirkadda LAMA xirayo kadib baarista (hold). */
    const val KEY_HOLD_SESSION = "flow870_hold_session"

    fun activateDiscovery(context: Context, menu1Label: String, prefix: String, hold: Boolean = false) {
        activate(context, listOf(menu1Label.ifBlank { "1" }), prefix)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_DISCOVERY_MODE, true)
            .putBoolean(KEY_HOLD_SESSION, hold)
            .putLong(KEY_DISCOVERY_START, System.currentTimeMillis())
            .remove(KEY_DISCOVERY_MENU)
            .remove(KEY_DISCOVERY_TIME)
            .apply()
    }

    /** True marka dialog-ga USSD la sii hayo (session hold) kadib baarista. */
    fun isHoldSession(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_HOLD_SESSION, false)

    fun clearHoldSession(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_HOLD_SESSION).apply()
    }

    /**
     * Session-ka furan (hold) ku sii wad: dooro xirmada uu user-ku doortay.
     * Menu 1 (step 2) waa la calaamadeeyay inuu dhammaaday, sidaas darteed accessibility-gu
     * wuxuu si toos ah u dooranayaa safka xirmada.
     */
    fun resumeHeldSelection(context: Context, label: String, prefix: String, row: Int? = null) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val safePrefix = if (MENU_FLOW_PREFIXES.contains(prefix)) prefix else "*212*"
        // Haddii safka horey loo xaqiijiyay, lambarkiisa TOOS ah ayaa la isticmaalayaa —
        // sidaas ayaan uga hortagaynaa in magaca dib loo raadiyo oo la waayo.
        val step2 = row?.toString() ?: label.replace(",", " ")
        prefs.edit()
            .putString(KEY_FLOW_ACTIVE, FLOW_ID)
            // Menu 1 (order 2) horey ayaa loo dhammeeyay session-kan furan.
            .putString(KEY_COMPLETED_STEPS, "2")
            .remove(KEY_FLOW_FINISHED_TIME)
            .putString(KEY_MENU_PATH, "1,$step2")
            .putString(KEY_PREFIX, safePrefix)
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_START)
            .remove(KEY_DISCOVERY_MENU)
            .apply()
        Log.d(TAG, "▶️ [Hold] Resume: menu path = 1,$step2")
    }



    /**
     * Discovery-gu waa firfircoon oo keliya 3 daqiiqo gudahood. Sidaas ayaan uga
     * hortagaynaa in flag hore uu joojiyo dalab rasmi ah (dialog-gu wuu xirmi jiray).
     */
    fun isDiscoveryMode(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_DISCOVERY_MODE, false)) return false
        val startedAt = prefs.getLong(KEY_DISCOVERY_START, 0L)
        if (startedAt > 0L && System.currentTimeMillis() - startedAt > 180_000L) {
            prefs.edit().remove(KEY_DISCOVERY_MODE).remove(KEY_DISCOVERY_START).apply()
            return false
        }
        return true
    }


    fun saveDiscoveryMenu(context: Context, text: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_DISCOVERY_MENU, text)
            .putLong(KEY_DISCOVERY_TIME, System.currentTimeMillis())
            .apply()
    }

    /** Soo qaado menu-ga la kaydiyay (hal mar keliya). */
    fun consumeDiscoveryMenu(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val text = prefs.getString(KEY_DISCOVERY_MENU, null)
        if (!text.isNullOrBlank()) {
            prefs.edit().remove(KEY_DISCOVERY_MENU).remove(KEY_DISCOVERY_TIME).apply()
        }
        return text
    }

    fun clearDiscovery(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_START)
            .remove(KEY_DISCOVERY_MENU)
            .remove(KEY_DISCOVERY_TIME)
            .remove(KEY_HOLD_SESSION)

            .apply()
    }

    /**
     * Ka soo saar safafka tirsan menu-ga xirmooyinka:
     *   "1. Unlimited Data 12 Saac $0.5" → index=1, label="Unlimited Data 12 Saac $0.5"
     */
    fun parseMenuItems(dialogText: String?): List<Pair<Int, String>> {
        if (dialogText.isNullOrBlank()) return emptyList()
        val normalized = dialogText.replace(Regex("""\s+\|\s+"""), "\n")
        val lineRegex = Regex("""^\s*(\d+)\s*(?:[\.\)\-:]\s*|\s+)(.+)$""")
        val out = LinkedHashMap<Int, String>()
        for (raw in normalized.split('\n')) {
            val m = lineRegex.matchEntire(raw.trim()) ?: continue
            val num = m.groupValues[1].toIntOrNull() ?: continue
            val label = m.groupValues[2].trim()
            if (label.length < 2) continue
            out.putIfAbsent(num, label)
        }
        return out.entries.map { it.key to it.value }
    }

    /**
     * Somtel *101*: template-ka waxaa laga yaabaa in loo keydiyo "*101#..." halkii
     * "*101*...". Kaliya flow-kan ayaa loo aqoonsanayaa labada qaab — flow-yada kale
     * (*870*, *866*, *212*) waxba lagama beddelin.
     */
    private fun isSomtel101(code: String): Boolean =
        code.startsWith("*101*") || code.startsWith("*101#")

    /** Ka soo saara prefix-ka USSD-ga (tusaale "*870*" ama "*866*") template-ka. */
    fun dialPrefix(ussdCode: String?): String {
        val c = ussdCode?.trim().orEmpty()
        if (isSomtel101(c)) return "*101*"
        return MENU_FLOW_PREFIXES.firstOrNull { c.startsWith(it) } ?: "*870*"
    }

    /**
     * Lambarka helaha oo loo beddelo qaabka maxalliga ah (9 lambar): "252629535029" -> "629535029".
     * Somtel *101* wuxuu diidayaa lambar leh horgale 252, sidaas darteed waa la jaraa.
     */
    fun normalizeLocalPhone(raw: String): String {
        var digits = raw.filter { it.isDigit() }
        if (digits.startsWith("252")) digits = digits.removePrefix("252")
        if (digits.startsWith("0")) digits = digits.removePrefix("0")
        if (digits.length > 9) digits = digits.takeLast(9)
        return digits
    }

    fun triggerCode(receiverPhone: String, prefix: String = "*870*"): String {
        val safePrefix = if (MENU_FLOW_PREFIXES.contains(prefix)) prefix else "*870*"
        // Somtel *101*: lambarka helaha lagama daro dial code-ka — waxaa la garaacayaa
        // *101# kadibna lambarka waxaa laga galiyaa tallaabo menu ah (dialog-ka).
        if (safePrefix == "*101*") return "*101#"
        val cleaned = receiverPhone.filter { it.isDigit() || it == '+' }
        return "$safePrefix$cleaned#"
    }

    fun isFlow870(ussdCode: String?): Boolean {
        val c = ussdCode?.trim() ?: return false
        if (isSomtel101(c)) return true
        return MENU_FLOW_PREFIXES.any { c.startsWith(it) }
    }


    /**
     * Ka soo saara menu suffix-ka. Wuxuu soo celiyaa liis fields ah (walxo kala ah).
     * Field kastaa waa string oo laga yaabo inuu yahay:
     *   - lambar sida "1", ama
     *   - kelmado kala jira ";" sida "Data;Xogta"
     */
    fun parseMenuPath(template: String?): List<String> {
        if (template.isNullOrBlank()) return listOf("1", "1")
        val raw = template.trim()
        val idx = raw.indexOf('|')
        // Accept both full USSD templates (`*870*phone#|Data,12 Saac`) and the already
        // extracted value saved in SharedPreferences (`Data,12 Saac`). Previously the
        // second form fell back to `1,1`, so admin menu1/menu2 were ignored on device.
        // A bare dial template with no '|' (e.g. "*101#") carries no menu path.
        val suffix = when {
            idx >= 0 -> raw.substring(idx + 1)
            raw.startsWith("*") -> ""
            else -> raw
        }
        // Strip any stray '#' inside the suffix — '#' belongs only in the dial part.
        val cleanedSuffix = suffix.replace("#", "").trim()
        if (cleanedSuffix.isEmpty()) return listOf("1", "1")
        val fields = cleanedSuffix.split(",").map { it.trim() }
        return if (fields.isEmpty()) listOf("1", "1") else fields
    }

    fun stripMenuSuffix(template: String): String {
        val idx = template.indexOf('|')
        return if (idx < 0) template else template.substring(0, idx)
    }

    data class Step(
        val order: Int,
        val name: String,
        val keywords: List<String>,
        val isPinField: Boolean,
        /** Hel input-ka la qorayo. dialogText waa nusqiga dialog-ka hadda muuqda (scan for numbered lines). */
        val getInput: (SharedPreferences, String?) -> String
    )

    /**
     * Ka raadi dialog-ga line-yada sida:
     *    "1. Data"   "2) Voice"   "3: SMS"   "4- Airtime"
     *
     * Matching:
     *   - `;` kala saara GROUPS (OR)  — tusaale "Data;Xogta" = "Data" AMA "Xogta"
     *   - Space kala saara TOKENS gudaha group (AND) — tusaale "Unlimited 24 saac"
     *     match uma dhaco haddii aan DHAMMAAN kelmedaha aan la helin line-kaas.
     *   - Punctuation (=, ,, /, -, iwm) waa la iska indho tirayaa marka la barbardhigo.
     */
    fun findNumberForKeywords(dialogText: String?, keywordGroups: List<String>): Int? {
        if (dialogText.isNullOrBlank() || keywordGroups.isEmpty()) return null
        val lineRegex = Regex("""^\s*(\d+)\s*(?:[\.\)\-:]\s*|\s+)(.+)$""")
        // Qiimaha shirkadda ee hore u socda ("$0.15=", "0.5 =") waa laga saarayaa ka hor
        // isbarbardhigga; haddii kale lambar sida "1" ee ku jira "$0.15" wuxuu keeni karaa
        // in saf khaldan la doorto.
        val pricePrefix = Regex("""^\s*\$?\s*\d+(?:[.,]\d+)?\s*=\s*""")
        // Normalize helper: lowercase + replace punctuation with space, then collapse spaces
        val normalize: (String) -> String = { raw ->
            raw.lowercase()
                .replace(Regex("""[=,;/\-–—_|\\\[\]()<>"']"""), " ")
                // Admin labels and Hormuud's live menu use equivalent Somali/English words.
                // Canonicalize them before scoring so e.g. "Unlimited Internet 3 Saac"
                // matches "Internet aan xadidnayn, 3 Saac" without weakening duration checks.
                .replace(Regex("""\baan\s+xadidnayn\b"""), " unlimited ")
                .replace(Regex("""\b(hours?|saacadood)\b"""), " saac ")
                .replace(Regex("""\s+"""), " ")
                .trim()
        }
        val tokenize: (String) -> List<String> = { raw ->
            normalize(pricePrefix.replace(raw.trim(), "")).split(' ').filter { it.isNotEmpty() }
        }
        val containsToken: (String, String) -> Boolean = { hay, tok ->
            // Match whole normalized tokens. Substring matching made "saac" useful, but it
            // could also match unrelated words and choose the wrong package when rows share
            // most of their wording. Exact tokens keep duration values such as 3/8/20 distinct.
            hay.split(' ').any { candidate -> candidate == tok }
        }
        // Prepare groups: each group -> list of tokens
        val prepared: List<List<String>> = keywordGroups
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { tokenize(it) }
            .filter { it.isNotEmpty() }
        if (prepared.isEmpty()) return null


        // Accessibility extraction sometimes joins every node with " | " instead of new lines.
        // Convert those separators back to line breaks so numbered menu rows can be parsed.
        val normalizedDialog = dialogText.replace(Regex("""\s+\|\s+"""), "\n")
        val lines = normalizedDialog.split('\n').toMutableList()

        // Some Android accessibility trees split menu rows into separate nodes like:
        // "1 | Unlimited Data 12 Saac | 2 | Unlimited Data 24 Saac".
        // Rebuild those adjacent number+label pairs so admin keyword menu2 still matches.
        val parts = normalizedDialog.split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        var i = 0
        while (i < parts.size) {
            if (parts[i].all { it.isDigit() }) {
                val number = parts[i]
                val labelParts = mutableListOf<String>()
                var j = i + 1
                while (j < parts.size && !parts[j].all { it.isDigit() }) {
                    labelParts.add(parts[j])
                    j++
                }
                if (labelParts.isNotEmpty()) {
                    lines.add("$number. ${labelParts.joinToString(" ")}")
                }
                i = j
            } else {
                i++
            }
        }

        // Marka hore raadi saf DHAMMAAN token-yada leh. Numeric tokens are mandatory:
        // a request for "3 Saac" must never fuzzy-match "8 Saac" or "20 Saac".
        var bestNum: Int? = null
        var bestScore = 0
        val durationCandidates = mutableSetOf<Int>()
        for (rawLine in lines) {
            val line = rawLine.trim()
            val m = lineRegex.matchEntire(line) ?: continue
            val num = m.groupValues[1].toIntOrNull() ?: continue
            val restNorm = normalize(pricePrefix.replace(m.groupValues[2].trim(), ""))
            for (tokens in prepared) {
                val matchedCount = tokens.count { tok -> containsToken(restNorm, tok) }
                if (matchedCount == tokens.size) return num
                val requiredNumbersMatch = tokens.filter { it.any(Char::isDigit) }
                    .all { tok -> containsToken(restNorm, tok) }
                val fuzzyOk = requiredNumbersMatch && tokens.size >= 4 && matchedCount >= tokens.size - 1
                if (fuzzyOk && matchedCount > bestScore) {
                    bestScore = matchedCount
                    bestNum = num
                }

                // A discovered package may have a shorter/custom admin label such as
                // "Unlimited 3 Saac" while the carrier row says
                // "Internet aan xadidnayn, 3 Saac". The duration+unit pair is stable and,
                // when unique in the live menu, is safer than refusing to select anything.
                val requestedNumbers = tokens.filter { it.any(Char::isDigit) }
                val requestedUnit = tokens.any { it in setOf("saac", "maalin", "week", "todobaad", "bil") }
                if (requestedNumbers.isNotEmpty() && requestedUnit && requiredNumbersMatch) {
                    val unitsMatch = tokens.filter { it in setOf("saac", "maalin", "week", "todobaad", "bil") }
                        .all { tok -> containsToken(restNorm, tok) }
                    if (unitsMatch) durationCandidates.add(num)
                }
            }
        }
        if (bestNum != null) return bestNum
        return durationCandidates.singleOrNull()
    }

    /**
     * SAXEEX MENU: qiimayaasha + magacyada la soo koobay, si loo barbardhigo laba menu
     * (kii baarista iyo kan session-ka cusub). Lambarka safka lama tixgelinayo maadaama
     * uu isbedeli karo.
     */
    fun menuSignature(dialogText: String?): Set<String> =
        parseMenuItems(dialogText)
            .map { (_, label) ->
                label.replace(Regex("""^\s*[^=]{0,20}=\s*"""), "")
                    .lowercase()
                    .replace(Regex("""[^a-z0-9]+"""), " ")
                    .trim()
            }
            .filter { it.isNotBlank() }
            .toSet()


    /** True marka labada menu ay isku xirmooyin yihiin. */
    fun menusMatch(a: String?, b: String?): Boolean {
        val sa = menuSignature(a)
        val sb = menuSignature(b)
        return sa.isNotEmpty() && sa == sb
    }

    /**
     * XAQIIJIN: ma ku jirtaa xirmadii user-ku doortay menu-ga tooska ah?
     * Marka hore magaca, kadibna qiimaha (lacagta la bixiyay).
     */
    fun verifySelection(dialogText: String?, label: String?): Int? {
        if (dialogText.isNullOrBlank() || label.isNullOrBlank()) return null
        val byName = resolveMenuField(label, dialogText, allowDefault = false).toIntOrNull()
        if (byName != null) {
            Log.d(TAG, "✅ Xaqiijin: '$label' → saf $byName (magac)")
            return byName
        }
        val byPrice = findNumberForPrice(dialogText, label)
        if (byPrice != null) {
            Log.w(TAG, "✅ Xaqiijin: '$label' → saf $byPrice (qiime)")
            return byPrice
        }
        Log.e(TAG, "❌ Xaqiijin fashilantay: '$label' menu-ga cusub kuma jirto")
        return null
    }



    /**
     * Xalli field-ka menu path ku jira:
     *   - lambar keliya → soo celi sida uu yahay
     *   - keywords → scan dialog-ga oo hel lambarka; haddii aan la helin, soo celi "1"
     */
    /**
     * FALLBACK QIIMAHA: haddii magaca xirmadu uusan menu-ga cusub ku jirin (shirkaddu
     * xirmooyinka way rogtaa), dooro safka isla QIIMAHA leh — waa lacagta user-ku bixiyay.
     * Waxaa la doortaa oo kaliya haddii hal saf oo keliya uu qiimahaas leeyahay.
     */
    fun findNumberForPrice(dialogText: String?, requestedLabel: String?): Int? {
        if (dialogText.isNullOrBlank() || requestedLabel.isNullOrBlank()) return null
        val priceRegex = Regex("""\$?\s*(\d+(?:[.,]\d+)?)\s*=""")
        val wanted = priceRegex.find(requestedLabel)?.groupValues?.get(1)
            ?.replace(',', '.')?.toDoubleOrNull() ?: return null

        val normalized = dialogText.replace(Regex("""\s+\|\s+"""), "\n")
        val lineRegex = Regex("""^\s*(\d+)\s*(?:[\.\)\-:]\s*|\s+)(.+)$""")
        val matches = mutableListOf<Int>()
        for (raw in normalized.split('\n')) {
            val m = lineRegex.matchEntire(raw.trim()) ?: continue
            val num = m.groupValues[1].toIntOrNull() ?: continue
            val price = priceRegex.find(m.groupValues[2])?.groupValues?.get(1)
                ?.replace(',', '.')?.toDoubleOrNull() ?: continue
            if (Math.abs(price - wanted) < 0.0001) matches.add(num)
        }
        val only = matches.distinct().singleOrNull()
        if (only != null) Log.w(TAG, "💲 Price-tier match: $wanted → saf $only")
        return only
    }

    fun resolveMenuField(field: String?, dialogText: String?, allowDefault: Boolean = true): String {

        val raw = (field ?: "").trim()
        if (raw.isEmpty()) return "1"
        if (raw.all { it.isDigit() }) return raw
        // Groups: kala saar ";" (OR). Tokens gudaha waxay ku kala jiraan space (AND).
        val groups = raw.split(";", "|").map { it.trim() }.filter { it.isNotEmpty() }
        val found = findNumberForKeywords(dialogText, groups)
        if (found != null) {
            Log.d(TAG, "🔎 Keyword match: [$raw] → $found")
            return found.toString()
        }
        if (allowDefault) {
            Log.w(TAG, "⚠️ No keyword match for [$raw]; falling back to '1'")
            return "1"
        }
        Log.e(TAG, "❌ No exact package match for [$raw]; refusing to select a wrong row")
        return ""
    }

    /** Tirinta safafka tirsan (1. .., 2) .., 3 - ..) kadib marka "|" loo beddelo line-break. */
    private fun countNumberedRows(dialogText: String): Int {
        val normalized = dialogText.replace(Regex("\\s+\\|\\s+"), "\n")
        return Regex("""(?m)(?:^|[|\r\n])\s*\d+\s*[\.)\-:]\s*\S""").findAll(normalized).count()
    }

    /**
     * Dialog-ga xulashada xirmada (Step 3). Waa inuu leeyahay ugu yaraan 2 safaf tirsan
     * IYO calaamado xirmo (qiimo $, "saac", "unlimited", MB/GB, "bundle") — sidaas ayaan
     * uga soocaynaa Menu 1 (oo iyaduna leedahay safaf tirsan sida "1. Data 2. Airtime").
     * "Mudnaan" kaligiis KUMA filna sababtoo ah cinwaanka ayaa dialog kasta ku jira.
     */
    fun isPackageMenuDialog(dialogText: String): Boolean {
        val lower = dialogText.lowercase()
        val hasPackageMarker = lower.contains('$') || lower.contains('¢') ||
            lower.contains("saac") || lower.contains("unlimited") ||
            Regex("""\b\d+\s?(mb|gb)\b""").containsMatchIn(lower) ||
            lower.contains("bundle")
        if (!hasPackageMarker) return false

        // Some Samsung USSD implementations expose the whole menu as one text node and
        // flatten/remove line breaks. Count numbered entries anywhere as a fallback.
        val rowCount = countNumberedRows(dialogText)
        if (rowCount >= 2) return true
        return Regex("""(?:^|\s)\d+\s*[\.)\-:]\s*\$?\s*\d""")
            .findAll(dialogText)
            .count() >= 2
    }

    /**
     * True kaliya marka qoraalku dhab ahaan yahay dialog USSD ah (input + Send/Cancel).
     * Tan la'aanteed launcher-ka iyo notification shade-ka ("… Iftin Resellers Active …")
     * waxay match-garayn karaan keyword-yada "Data"/"pin" oo flow-ku wuu qaldamaa.
     */
    fun isUssdDialogText(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val lower = dialogText.lowercase()
        // Notification shade / launcher content — marnaba maaha dialog USSD ah.
        if (lower.contains("notification:") || lower.contains("notification,") ||
            lower.contains(", folder") || lower.contains("play store")
        ) return false
        val hasSend = lower.contains("send") || lower.contains("dir") || lower.contains("ok")
        val hasCancel = lower.contains("cancel") || lower.contains("jooji")
        val hasMenuRow = countNumberedRows(dialogText) >= 1 ||
            Regex("""(?:^|\n)\s*\d+\s*[\.)\-:]\s*\S""").containsMatchIn(dialogText)
        val looksLikePrompt = lower.contains("ussd") || lower.contains("pin") ||
            lower.contains("furaha") || lower.contains("gali")
        return hasSend && hasCancel && (hasMenuRow || looksLikePrompt)
    }

    private fun isAirtimeDialog(dialogText: String): Boolean {
        val lower = dialogText.lowercase()
        return lower.contains("airtime") || lower.contains("credit") || lower.contains("waqti")
    }


    /** Liiska tallaabooyinka ee hardcode ah. Order 2..5. */
    val STEPS: List<Step> = listOf(
        Step(
            order = 2,
            name = "menu_data",
            keywords = listOf(
                "Data", "data", "DATA", "Xogta", "xogta",
                "Internet", "internet",
                "Somnet", "SOMNET", "Somtel", "SOMTEL", "Welcome",
                "Ku soo dhawoow", "menu", "Menu", "MENU"
            ),
            isPinField = false,
            // Field 0 = Menu 1
            getInput = { prefs, dialogText ->
                val path = parseMenuPath(prefs.getString(KEY_MENU_PATH, "1,1"))
                resolveMenuField(path.getOrNull(0), dialogText)
            }
        ),
        Step(
            order = 3,
            name = "package_select",
            keywords = listOf(
                "Mudnaan", "mudnaan", "Mudnaanta", "--Mudnaan--",
                "Unlimited", "unlimited", "UNLIMITED",
                "package", "Package", "PACKAGE",
                "xirmo", "Xirmo", "XIRMO", "xirmada", "Xirmada",
                "MB", "GB", "Bundle", "bundle", "Choose", "Dooro", "dooro",
                "$", "saac", "Voice", "voice", "hours", "Hours"
            ),
            isPinField = false,
            // Field 1 = Menu 2 (package dialog). Haddii keyword/lambar lagu qoray USSD Codes,
            // kaas ayaa mudnaan leh; package_code waxaa la isticmaalaa oo keliya haddii uu yahay
            // lambar nadiif ah (tusaale "3"), ma aha USSD template sida "*870*...#".
            getInput = { prefs, dialogText ->
                val path = parseMenuPath(prefs.getString(KEY_MENU_PATH, "1,1"))
                val menuField = path.getOrNull(1)?.trim().orEmpty()
                val rawPkg = (prefs.getString(KEY_PACKAGE, null) ?: "").trim()
                val pkgMenuNumber = rawPkg.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }

                // Dialog-ga package-ka (sawirka --Mudnaan--) waxaa laga dooranayaa lambarka safka.
                // Package-level Menu 2 (suffix field 1) ayaa mudnaan leh marka admin-ku buuxiyo.
                // package_code/current_amount waxaa loo isticmaalaa oo keliya legacy fallback ahaan.
                if (menuField.isNotEmpty()) {
                    // A named package must match its carrier row. Never silently buy row 1.
                    val byName = resolveMenuField(menuField, dialogText, allowDefault = false)
                    // Haddii magaca la waayo (menu-gu wuu bedelay), isku day qiimaha.
                    if (byName.isNotBlank()) byName
                    else findNumberForPrice(dialogText, menuField)?.toString() ?: ""
                } else if (pkgMenuNumber != null) {
                    pkgMenuNumber
                } else {
                    resolveMenuField("1", dialogText)
                }
            }
        ),
        Step(
            order = 4,
            name = "menu_airtime",
            keywords = listOf(
                "Airtime", "airtime", "AIRTIME",
                "Credit", "credit", "Waqti", "waqti"
            ),
            isPinField = false,
            // Field 1 = Menu 2 (airtime submenu — sida menu path 2-aad)
            getInput = { prefs, dialogText ->
                val path = parseMenuPath(prefs.getString(KEY_MENU_PATH, "1,1"))
                resolveMenuField(path.getOrNull(1), dialogText)
            }
        ),
        Step(
            order = 5,
            name = "pin",
            keywords = listOf(
                "PIN", "pin", "Pin", "password", "Password",
                "furaha", "Furaha", "sir", "Sir"
            ),
            isPinField = true,
            getInput = { prefs, _ ->
                // PIN always comes from the server (order.pinCode / device-config).
                val fallback = com.iftin.resellers.config.ApiConfig.DEFAULT_SIM_PIN
                val raw = prefs.getString(KEY_PIN, fallback) ?: fallback
                // Flow870 supports PIN 3-12 digits (e.g. an 8-digit SIM PIN).
                val digits = raw.filter { it.isDigit() }
                if (digits.length in 3..12) digits else fallback
            }
        ),
        // Somtel *101*: lambarka helaha waa tallaabo menu ah (dialog-ka), ka hor PIN-ka.
        // matchStep() wuxuu step-kan u ogolaanayaa KALIYA marka prefix = "*101*".
        Step(
            order = 6,
            name = "receiver_phone",
            keywords = listOf(
                "lambarka", "Lambarka", "LAMBARKA", "lambar", "Lambar",
                "number", "Number", "NUMBER", "phone", "Phone",
                "cinwaanka", "Cinwaanka", "mobile", "Mobile", "geli", "Geli"
            ),
            isPinField = false,
            getInput = { prefs, _ ->
                normalizeLocalPhone(prefs.getString(KEY_RECEIVER_PHONE, "") ?: "")
            }
        ),
        // Menu 3 (ikhtiyaari): dialog DHEERAAD ah oo ka dambeeya Menu 1 iyo xirmada.
        // Field 2 = Menu 3. matchStep() wuxuu u ogolaanayaa KALIYA marka field 2 la
        // qoray IYO menu_data (2) iyo package_select (3) ay dhammeeyeen — sidaas ayaan
        // uga hortagaynaa inuu dialog-ga 1aad ama package-ka si khaldan u qabsado.
        Step(
            order = 7,
            name = "menu_extra",
            keywords = listOf(
                "Dooro", "dooro", "DOORO",
                "Select", "select", "SELECT",
                "Choose", "choose", "CHOOSE",
                "Xulo", "xulo", "XULO"
            ),
            isPinField = false,
            // Field 2 = Menu 3
            getInput = { prefs, dialogText ->
                val path = parseMenuPath(prefs.getString(KEY_MENU_PATH, "1,1"))
                resolveMenuField(path.getOrNull(2), dialogText)
            }
        )
    )

    fun isActive(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_FLOW_ACTIVE, null) == FLOW_ID
    }

    /** Bilow flow-ka. menuPath waa liis field-yo string ah (tusaale ["Data;Xogta","Mudnaan"]). */
    fun activate(context: Context, menuPath: List<String> = listOf("1", "1")) {
        activate(context, menuPath, "*870*")
    }

    /** Bilow flow-ka + xaji prefix-ka (tusaale "*866*" ee Somnet). */
    fun activate(context: Context, menuPath: List<String>, prefix: String, receiverPhone: String? = null) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val path = menuPath.ifEmpty { listOf("1", "1") }
        val pathStr = path.joinToString(",") { it.replace(",", "") }
        val safePrefix = if (MENU_FLOW_PREFIXES.contains(prefix)) prefix else "*870*"
        val editor = prefs.edit()
            .putString(KEY_FLOW_ACTIVE, FLOW_ID)
            .putString(KEY_COMPLETED_STEPS, "")
            .remove(KEY_FLOW_FINISHED_TIME)
            .putString(KEY_MENU_PATH, pathStr)
            .putString(KEY_PREFIX, safePrefix)
            // Discovery-ga hore ha ku dhicin dalabka cusub.
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_START)
            .remove(KEY_DISCOVERY_MENU)
        // *101* (Somtel): lambarka helaha waa tallaabo menu ah; xafidi isaga.
        if (receiverPhone.isNullOrBlank()) editor.remove(KEY_RECEIVER_PHONE)
        else editor.putString(KEY_RECEIVER_PHONE, normalizeLocalPhone(receiverPhone))
        editor.apply()
    }

    /** Prefix-ka flow-ka hadda firfircoon (default "*870*"). */
    fun currentPrefix(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PREFIX, "*870*") ?: "*870*"
    }

    /** True marka flow-ka firfircoon uu yahay Somnet *866* (dhaqdhaqaaqiisu ka gaabis). */
    fun isSomnet866(context: Context): Boolean = currentPrefix(context) == "*866*"

    fun finish(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .remove(KEY_FLOW_ACTIVE)
            .remove(KEY_COMPLETED_STEPS)
            .remove(KEY_MENU_PATH)
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_START)
            .remove(KEY_RECEIVER_PHONE)
            .putLong(KEY_FLOW_FINISHED_TIME, System.currentTimeMillis())
            .apply()
    }

    fun wasRecentlyFinished(context: Context, windowMs: Long = 120_000L): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val finishedAt = prefs.getLong(KEY_FLOW_FINISHED_TIME, 0L)
        return finishedAt > 0L && System.currentTimeMillis() - finishedAt <= windowMs
    }

    fun deactivate(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .remove(KEY_FLOW_ACTIVE)
            .remove(KEY_COMPLETED_STEPS)
            .remove(KEY_FLOW_FINISHED_TIME)
            .remove(KEY_MENU_PATH)
            .remove(KEY_RECEIVER_PHONE)
            .apply()
    }

    private fun completedSteps(prefs: SharedPreferences): Set<Int> {
        val raw = prefs.getString(KEY_COMPLETED_STEPS, "") ?: ""
        if (raw.isBlank()) return emptySet()
        return raw.split(",").mapNotNull { it.trim().toIntOrNull() }.toSet()
    }

    fun markStepCompleted(context: Context, stepOrder: Int) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val current = completedSteps(prefs).toMutableSet()
        current.add(stepOrder)
        prefs.edit()
            .putString(KEY_COMPLETED_STEPS, current.joinToString(","))
            .apply()
    }

    fun matchStep(context: Context, dialogText: String?): Step? {
        if (dialogText.isNullOrBlank()) return null
        // Ha ka shaqayn window-yo aan dialog USSD ahayn (launcher / notification shade).
        if (!isUssdDialogText(dialogText)) return null
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val done = completedSteps(prefs)
        val lower = dialogText.lowercase()

        val pinStep = STEPS.firstOrNull { it.isPinField && it.order !in done }
        if (pinStep != null && pinStep.keywords.any { lower.contains(it.lowercase()) }) {
            return pinStep
        }

        // Dialog-ga package-ka wuxuu leeyahay "Data" line kasta; haddii Step 2 aan weli
        // completed loo calaamadayn (tusaale click hore ayaa fashilmay), Step 2 si khaldan
        // ayuu u qabsan karaa. Sidaas darteed Mudnaan/package menu-ga si gaar ah u dooro.
        val packageStep = STEPS.firstOrNull { it.name == "package_select" && it.order !in done }
        if (packageStep != null && isPackageMenuDialog(dialogText)) {
            return packageStep
        }

        val airtimeStep = STEPS.firstOrNull { it.name == "menu_airtime" && it.order !in done }
        if (airtimeStep != null && isAirtimeDialog(dialogText)) {
            return airtimeStep
        }

        val isPackageDialog = isPackageMenuDialog(dialogText)
        // Tallaabada lambarka helaha waa gaar u *101* (Somtel) — *870*/*866* receiver-ku
        // wuxuu ku darsamayaa dial code-ka, sidaas darteed ha ka dhigin inuu qabsado.
        val isSomtel101 = currentPrefix(context) == "*101*"
        // Menu 3 (ikhtiyaari): kaliya marka field 2 la qoray OO Menu 1 + xirmadu dhammeeyeen.
        val hasMenuExtra = parseMenuPath(prefs.getString(KEY_MENU_PATH, "1,1"))
            .getOrNull(2)?.isNotBlank() == true
        val allowMenuExtra = hasMenuExtra && done.contains(2) && done.contains(3) &&
            !isPackageDialog && !isAirtimeDialog(dialogText)
        return STEPS.firstOrNull { step ->
            !step.isPinField &&
                step.order !in done &&
                // menu_data (Step 2) waa lagu qaldi karaa dialog-ga xirmada; haddii dialog-gu
                // yahay package menu, ha u ogolaan Step 2 inuu qabsado.
                !(step.name == "menu_data" && isPackageDialog) &&
                (step.name != "receiver_phone" || isSomtel101) &&
                (step.name != "menu_extra" || allowMenuExtra) &&
                step.keywords.any { lower.contains(it.lowercase()) }
        }
    }


    /** Hel qiimaha la geliyo tallaabada la helay. dialogText waa loo baahan yahay keyword resolution. */
    fun inputFor(context: Context, step: Step, dialogText: String?): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return step.getInput(prefs, dialogText)
    }
}
