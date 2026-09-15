-- Fix incorrect balance_type for non-Hormuud providers
-- Amtel and Somnet should use 'evoucher', not 'evc_plus'

-- A30 SIM 1 Somtel: Delete stale evc_plus record (balance is 0)
DELETE FROM sim_balances 
WHERE sim_id = '05f5c63b-cee9-4893-89b1-e3a4efc1a3de'
  AND sim_slot = 1 
  AND balance_type = 'evc_plus';

-- A30 SIM 2 Amtel: Change evc_plus to evoucher
UPDATE sim_balances 
SET balance_type = 'evoucher'
WHERE sim_id = '05f5c63b-cee9-4893-89b1-e3a4efc1a3de'
  AND sim_slot = 2 
  AND balance_type = 'evc_plus';

-- M31 SIM 2 Somnet: Change evc_plus to evoucher
UPDATE sim_balances 
SET balance_type = 'evoucher'
WHERE sim_id = 'd93ccb7b-0268-4104-91eb-41314266e9f2'
  AND sim_slot = 2 
  AND balance_type = 'evc_plus';