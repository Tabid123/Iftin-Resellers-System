-- Update M31's provider_name to match sim1_provider (Hormuud)
UPDATE android_devices 
SET provider_name = 'Hormuud'
WHERE device_id = 'd9ae55a4ef326228' 
AND archived_at IS NULL;