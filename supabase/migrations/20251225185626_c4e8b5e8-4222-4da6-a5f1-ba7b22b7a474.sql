-- Add E-Voucher balance for Hormuud SIM
INSERT INTO sim_balances (sim_id, balance_type, balance, balance_source, notes) 
VALUES ('bee25669-f19f-4483-9620-36229250feb0', 'evoucher', 0.20, 'manual', 'E-Voucher lacag la shubay');

-- Add both balances for Somnet SIM
INSERT INTO sim_balances (sim_id, balance_type, balance, balance_source) 
VALUES ('1d8ffd49-1b83-40b1-95bd-1236f46dfb34', 'evc_plus', 0, 'manual');

INSERT INTO sim_balances (sim_id, balance_type, balance, balance_source) 
VALUES ('1d8ffd49-1b83-40b1-95bd-1236f46dfb34', 'evoucher', 0, 'manual');