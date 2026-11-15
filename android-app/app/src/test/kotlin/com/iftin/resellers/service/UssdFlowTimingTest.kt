package com.iftin.resellers.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Safely match the fast, *verified* menu pacing in Iftin Internet. */
class UssdFlowTimingTest {
    @Test
    fun somtel101MenusUseFastVerifiedSendWindow() {
        assertEquals(250L, UssdFlowTiming.inputSettleDelay(isSomtel101 = true, isPinField = false))
    }

    @Test
    fun pinAndNonSomtelMenusKeepConservativeWindow() {
        assertEquals(700L, UssdFlowTiming.inputSettleDelay(isSomtel101 = true, isPinField = true))
        assertEquals(700L, UssdFlowTiming.inputSettleDelay(isSomtel101 = false, isPinField = false))
        assertEquals(700L, UssdFlowTiming.inputSettleDelay(isSomtel101 = false, isPinField = true))
    }

    @Test
    fun retryAndEarlyScanDoNotBypassInputVerification() {
        assertEquals(250L, UssdFlowTiming.RETRY_INPUT_SETTLE_MS)
        assertEquals(150L, UssdFlowTiming.FLOW_DIALOG_SCAN_MS)
        assertEquals(220L, UssdFlowTiming.FLOW_EVENT_DEBOUNCE_MS)
        assertEquals(200L, UssdFlowTiming.NEXT_FLOW_STEP_SCAN_MS)

        // The fast window is a responsiveness optimization, not a race
        // or a request to send twice. It always checks the current step.
        assertTrue(UssdFlowTiming.FLOW_DIALOG_SCAN_MS > 0)
        assertTrue(UssdFlowTiming.FLOW_EVENT_DEBOUNCE_MS > UssdFlowTiming.FLOW_DIALOG_SCAN_MS)
        assertTrue(UssdFlowTiming.RETRY_INPUT_SETTLE_MS > 0)
    }
}
