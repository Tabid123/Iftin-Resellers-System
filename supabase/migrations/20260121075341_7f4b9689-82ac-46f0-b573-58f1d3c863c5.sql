-- Delete stale $907 evoucher record for M31 Somnet SIM 2
DELETE FROM sim_balances 
WHERE sim_id = 'd93ccb7b-0268-4104-91eb-41314266e9f2'
  AND sim_slot = 2 
  AND balance_type = 'evoucher'
  AND balance = 907;