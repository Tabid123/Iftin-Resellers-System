-- Update M31's sim_number to the Hormuud number
UPDATE android_devices 
SET sim_number = '617195659'
WHERE device_id = 'd9ae55a4ef326228' 
AND archived_at IS NULL;