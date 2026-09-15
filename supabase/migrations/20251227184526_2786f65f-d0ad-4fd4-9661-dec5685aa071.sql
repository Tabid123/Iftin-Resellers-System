-- Fix device ID mismatch: Update old device ID to correct M31 device ID
UPDATE delivery_queue 
SET android_device_id = 'd9ae55a4ef326228' 
WHERE android_device_id = 'feedb84a8a317b0d';