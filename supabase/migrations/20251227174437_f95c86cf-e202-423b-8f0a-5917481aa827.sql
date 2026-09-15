-- Enable REPLICA IDENTITY for real-time updates on android_devices
ALTER TABLE android_devices REPLICA IDENTITY FULL;

-- Add android_devices to realtime publication (ignore if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'android_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE android_devices;
  END IF;
END $$;

-- Copy balances from archived SIM to active SIM for M31 device
-- Only insert if not already exists to avoid duplicates
INSERT INTO sim_balances (sim_id, balance, balance_type, balance_source, notes)
SELECT 
  'd9b615e3-7ff6-4732-b240-b507c861406d'::uuid,
  balance,
  balance_type,
  balance_source,
  'Migrated from archived device'
FROM sim_balances
WHERE sim_id = '1d8ffd49-1b83-40b1-95bd-1236f46dfb34'::uuid
AND NOT EXISTS (
  SELECT 1 FROM sim_balances 
  WHERE sim_id = 'd9b615e3-7ff6-4732-b240-b507c861406d'::uuid
  AND balance_type = sim_balances.balance_type
);

-- Delete the archived duplicate device to prevent future conflicts
DELETE FROM android_devices 
WHERE id = '1d8ffd49-1b83-40b1-95bd-1236f46dfb34'::uuid
AND archived_at IS NOT NULL;