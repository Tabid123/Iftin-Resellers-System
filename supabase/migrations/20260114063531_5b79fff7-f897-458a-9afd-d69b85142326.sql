-- Step 1: Update the Auto-registered device (78ff89ae7169a8ee) to be A30
-- This is the device that's actually receiving SMS messages
UPDATE android_devices 
SET 
  device_name = 'A30',
  sim1_provider = 'Somtel',
  sim2_provider = 'Amtel',
  provider_name = 'Somtel'
WHERE device_id = '78ff89ae7169a8ee';

-- Step 2: Archive the duplicate A30 devices that are not receiving SMS
-- Instead of deleting, we archive them to preserve history
UPDATE android_devices 
SET 
  is_active = false,
  archived_at = now(),
  device_name = device_name || ' (archived - duplicate)'
WHERE device_id IN ('b0b445fd81560431', 'a9fa665216ed8181')
AND device_id != '78ff89ae7169a8ee';