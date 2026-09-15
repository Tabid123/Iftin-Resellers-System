package com.iftin.resellers.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test


class Ussd870FlowTest {
    private val realMenu = """
        --Maamuus--
        1. ${'$'}0.15=Internet aan xadidnayn, 3 Saac
        2. ${'$'}0.5=Internet aan xadidnayn,20 Saac
        3. ${'$'}0.1=Internet aan xadidnayn, 1 Saac
        4. ${'$'}0.25=Internet aan xadidnayn, 8 Saac | Cancel | Send
    """.trimIndent()

    @Test
    fun matchesExactDurationFromSelectedPackageName() {
        assertEquals(1, Ussd870Flow.findNumberForKeywords(realMenu, listOf("Internet aan xadidnayn 3 Saac")))
        assertEquals(2, Ussd870Flow.findNumberForKeywords(realMenu, listOf("Internet aan xadidnayn 20 Saac")))
        assertEquals(4, Ussd870Flow.findNumberForKeywords(realMenu, listOf("Internet aan xadidnayn 8 Saac")))
    }

    @Test
    fun doesNotChooseAnotherDurationWhenRequestedDurationIsMissing() {
        assertNull(Ussd870Flow.findNumberForKeywords(realMenu, listOf("Internet aan xadidnayn 12 Saac")))
    }

    @Test
    fun parsesAccessibilityPipeSeparatedRows() {
        val flattened = "--Maamuus-- | 1. ${'$'}0.15=Internet aan xadidnayn, 3 Saac | 2. ${'$'}0.25=Internet aan xadidnayn, 8 Saac | Cancel | Send"
        assertEquals(2, Ussd870Flow.findNumberForKeywords(flattened, listOf("Internet aan xadidnayn 8 Saac")))
    }

    @Test
    fun matchesEnglishAdminLabelAgainstSomaliCarrierWording() {
        assertEquals(1, Ussd870Flow.findNumberForKeywords(realMenu, listOf("Unlimited Internet 3 Hours")))
        assertEquals(4, Ussd870Flow.findNumberForKeywords(realMenu, listOf("Unlimited 8 Saac")))
        assertEquals(2, Ussd870Flow.findNumberForKeywords(realMenu, listOf("20 Saac")))
    }

    // ==== Live logcat menus (order 59c6a231 — $0.25 / 8 Saac) ====

    private val liveRootMenu = "1.Data 2.Kuhadal 3.Data iyo Kuhadal | Cancel | Send"

    private val liveBundleMenu = """
        --Maamuus--
        1. ${'$'}0.15=Internet aan xadidnayn, 3 Saac
        2. ${'$'}0.5=Internet aan xadidnayn,20 Saac
        3. ${'$'}0.1=Internet aan xadidnayn, 1 Saac
        4. ${'$'}0.25=Internet aan xadidnayn, 8 Saac
        Cancel | Send
    """.trimIndent()

    @Test
    fun liveRootMenuIsNotTreatedAsPackageMenu() {
        assertTrue(Ussd870Flow.isUssdDialogText(liveRootMenu))
        assertFalse(Ussd870Flow.isPackageMenuDialog(liveRootMenu))
    }

    @Test
    fun liveBundleMenuIsRecognisedAsPackageMenu() {
        assertTrue(Ussd870Flow.isUssdDialogText(liveBundleMenu))
        assertTrue(Ussd870Flow.isPackageMenuDialog(liveBundleMenu))
        assertTrue(
            Ussd870Flow.isPackageMenuDialog(
                liveBundleMenu.replace("\n", " | ")
            )
        )
    }

    @Test
    fun liveBundleMenuResolvesEightHourRow() {
        assertEquals(
            4,
            Ussd870Flow.findNumberForKeywords(liveBundleMenu, listOf("Internet aan xadidnayn, 8 Saac"))
        )
        assertEquals(
            4,
            Ussd870Flow.findNumberForKeywords(
                liveBundleMenu.replace("\n", " | "),
                listOf("Internet aan xadidnayn, 8 Saac")
            )
        )
    }
}
