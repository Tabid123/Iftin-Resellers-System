-- Add battery_level column to android_devices table
ALTER TABLE android_devices 
ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN android_devices.battery_level IS 'Device battery percentage (0-100), updated via ping';