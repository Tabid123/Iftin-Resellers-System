-- Enable REPLICA IDENTITY FULL for real-time updates on android_devices
ALTER TABLE android_devices REPLICA IDENTITY FULL;

-- Add table to realtime publication (may already exist)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE android_devices;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END $$;