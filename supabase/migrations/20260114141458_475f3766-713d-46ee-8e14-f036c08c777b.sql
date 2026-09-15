-- Deactivate wrong devices (balance updates handled separately)
UPDATE android_devices 
SET is_active = false, archived_at = NOW()
WHERE id IN (
  'b7914682-92f0-4cab-b7d1-22feb5abdbdc',
  'b0a676b0-f39b-44f2-8c95-bbca116827da',
  'd9b615e3-7ff6-4732-b240-b507c861406d'
);

-- Update M31 Hormuud balances to latest values
UPDATE sim_balances 
SET balance = 1.11, last_updated = NOW(), notes = 'Updated to latest'
WHERE sim_id = '6c0e03b1-0db8-47d8-97b5-c3ceddd0689c'
AND balance_type = 'evc_plus'
AND sim_slot = 1;

UPDATE sim_balances 
SET balance = 57.11, last_updated = NOW(), notes = 'Updated to latest'
WHERE sim_id = '6c0e03b1-0db8-47d8-97b5-c3ceddd0689c'
AND balance_type = 'evoucher'
AND sim_slot = 1;