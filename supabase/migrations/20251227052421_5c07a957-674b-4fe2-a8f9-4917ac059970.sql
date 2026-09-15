-- Remove unique constraint on device_id to allow multiple SIMs per device
ALTER TABLE android_devices DROP CONSTRAINT IF EXISTS android_devices_device_id_key;

-- Now update Somnet SIM to have same device_id as Hormuud SIM
UPDATE android_devices 
SET device_id = 'manual-1766559781138'
WHERE id = '1d8ffd49-1b83-40b1-95bd-1236f46dfb34';