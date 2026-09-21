package com.iftin.resellers.api

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class DeliveryApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: DeliveryApiClient

    @Before fun setup() {
        server = MockWebServer()
        server.start()
        client = DeliveryApiClient(server.url("/functions/v1").toString(),
            server.url("/rest/v1").toString(), "test-anon-key")
    }

    @After fun teardown() { server.shutdown() }

    @Test fun waitingRequestSendsDeviceRequiredByTenantScopedRpc() = runBlocking {
        server.enqueue(MockResponse().setBody("true"))
        assertTrue(client.discoveryHasWaitingRequest("device-a"))
        val request = server.takeRequest(1, TimeUnit.SECONDS)!!
        assertEquals("/rest/v1/rpc/discovery_has_waiting_request", request.path)
        assertEquals("device-a", JSONObject(request.body.readUtf8()).getString("p_device_id"))
    }

    @Test fun emptyQueueDoesNotPreemptHeldSession() = runBlocking {
        server.enqueue(MockResponse().setBody("false"))
        assertFalse(client.discoveryHasWaitingRequest("device-a"))
    }

    @Test fun heartbeatUsesGatewayHeadersAndOnlyAcknowledgesSuccess() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"success\":true}"))
        assertTrue(client.devicePing("device-a", 72, false, 0))
        val request = server.takeRequest(1, TimeUnit.SECONDS)!!
        assertEquals("/functions/v1/activate-package/ping", request.path)
        assertEquals("test-anon-key", request.getHeader("apikey"))
        assertEquals("Bearer test-anon-key", request.getHeader("Authorization"))
        val body = JSONObject(request.body.readUtf8())
        assertEquals("device-a", body.getString("deviceId"))
        assertTrue(body.getBoolean("presenceOnly"))
        server.enqueue(MockResponse().setResponseCode(503))
        assertFalse(client.devicePing("device-a", 72, false, 0))
    }
}
