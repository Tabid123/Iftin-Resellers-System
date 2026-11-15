package com.iftin.resellers.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class Ussd101FlowTest {

    @Test
    fun triggerCodeIs101OnlyNoReceiverInDialString() {
        assertEquals("*101#", Ussd870Flow.triggerCode("612345678", "*101*"))
        assertEquals("*101#", Ussd870Flow.triggerCode("+252612345678", "*101*"))
        assertEquals("*101#", Ussd870Flow.triggerCode("", "*101*"))
    }

    @Test
    fun otherPrefixesKeepReceiverInDialString() {
        assertEquals("*870*612345678#", Ussd870Flow.triggerCode("612345678", "*870*"))
        assertEquals("*866*612345678#", Ussd870Flow.triggerCode("612345678", "*866*"))
    }

    @Test
    fun prefix101IsRegisteredAsMenuFlow() {
        assertTrue(Ussd870Flow.MENU_FLOW_PREFIXES.contains("*101*"))
        assertTrue(Ussd870Flow.isFlow870("*101#"))
        assertEquals("*101*", Ussd870Flow.dialPrefix("*101#"))
    }

    @Test
    fun defaultMenuPathUsedWhenNoSuffix() {
        assertEquals(listOf("1", "1"), Ussd870Flow.parseMenuPath("*101#"))
        assertEquals(listOf("2"), Ussd870Flow.parseMenuPath("*101#|2"))
    }

    @Test
    fun receiverStepExistsAfterPin() {
        val pin = Ussd870Flow.STEPS.first { it.name == "pin" }
        val receiver = Ussd870Flow.STEPS.first { it.name == "receiver_phone" }
        assertTrue(receiver.order > pin.order)
        assertFalse(receiver.isPinField)
    }

    @Test
    fun selectsSomtelSocialGiftMenuByExactRowNotByGenericDooroLabel() {
        val path = Ussd870Flow.parseMenuPath("*101#|Xulmo-Social Bundle,Daily,Ugu Shub Qof Kale")
        val menu = """
            Somtel Social Media Bundles
            1. Isku Shub
            2. Ugu Shub Qof Kale
            Cancel | Send
        """.trimIndent()
        assertEquals("2", Ussd870Flow.somtelMenu3Choice(path, menu))
        assertEquals("2", Ussd870Flow.somtelMenu3Choice(path, menu.replace("\n", " | ")))
    }

    @Test
    fun doesNotGuessWrongThirdMenuItemOrTypeReceiverInMenu() {
        val path = listOf("Xulmo-Social Bundle", "Daily", "Ugu Shub Qof Kale")
        val changedMenu = "1. Isku Shub | 2. Ugu Shub Qof Kale oo xirnaa | Cancel | Send"
        val noOptions = "Geli lambarka qaataha | Cancel | Send"
        assertNull(Ussd870Flow.somtelMenu3Choice(path, "1. Isku Shub | 2. Ka noqo | Cancel | Send"))
        assertNull(Ussd870Flow.somtelMenu3Choice(path, noOptions))
        assertNull(Ussd870Flow.somtelMenu3Choice(path.take(2), changedMenu))
    }

}
