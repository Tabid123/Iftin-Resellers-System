-- Test WhatsApp notification by setting device offline
UPDATE android_devices 
SET last_ping_at = NOW() - INTERVAL '10 minutes'
WHERE id = '1d8ffd49-1b83-40b1-95bd-1236f46dfb34';