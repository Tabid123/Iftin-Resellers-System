-- Update M31 device_id to match the actual Android device
UPDATE android_devices 
SET device_id = 'feedb84a8a317b0d', last_ping_at = now() 
WHERE device_name = 'M31' AND device_id = 'manual-1766559781138';

-- Also update the devices table if it exists there
UPDATE devices 
SET device_id = 'feedb84a8a317b0d', last_seen = now() 
WHERE device_name = 'M31' AND device_id = 'manual-1766559781138';