-- Add sim2_number column for the second SIM number
ALTER TABLE android_devices 
ADD COLUMN sim2_number text;

-- Update M31 device with the Somnet number (SIM 2)
-- The original sim_number was the Somnet number: 627102525
UPDATE android_devices 
SET sim2_number = '627102525'
WHERE device_id = 'd9ae55a4ef326228' 
AND archived_at IS NULL;