-- First remove duplicates keeping the latest one
DELETE FROM offline_registrations a
USING offline_registrations b
WHERE a.sender_phone = b.sender_phone
  AND a.created_at < b.created_at;

-- Drop existing non-unique index
DROP INDEX IF EXISTS idx_offline_reg_sender;

-- Add unique constraint
ALTER TABLE offline_registrations ADD CONSTRAINT offline_registrations_sender_phone_key UNIQUE (sender_phone);