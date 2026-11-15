package com.iftin.resellers.service

/**
 * Verified menu pacing, matched to the Iftin Internet delivery agent.
 *
 * Fast means we check whether the intended USSD input is present sooner,
 * NOT that we click Send before verifying the live carrier prompt.
 * Each callback still re-checks current step and input before submission.
 */
object UssdFlowTiming {
    // Iftin Internet: *101# menus 250ms; other menus/PIN 700ms.
    const val SOMTEL_MENU_SETTLE_MS = 250L
    const val DEFAULT_INPUT_SETTLE_MS = 700L

    // Earlier versions used a full 1000ms second wait when Samsung did not
    // immediately reflect ACTION_SET_TEXT. Re-check promptly without sending
    // unverified input.
    const val RETRY_INPUT_SETTLE_MS = 250L

    // Only the active menu-flow uses these faster readiness checks. Existing
    // legacy PIN, discovery, SMS and ordinary dialogs retain their delays.
    const val FLOW_DIALOG_SCAN_MS = 150L
    const val FLOW_EVENT_DEBOUNCE_MS = 220L
    const val NEXT_FLOW_STEP_SCAN_MS = 200L

    fun inputSettleDelay(isSomtel101: Boolean, isPinField: Boolean): Long =
        if (isSomtel101 && !isPinField) SOMTEL_MENU_SETTLE_MS
        else DEFAULT_INPUT_SETTLE_MS
}
