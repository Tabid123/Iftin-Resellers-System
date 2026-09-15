-- Tallaabo 1: Tir device-ka A30 hore (is_active=false)
UPDATE android_devices 
SET is_active = false, 
    device_name = 'A30 (archived - old APK)'
WHERE id = '9ef7ba42-876d-44f3-ad0f-78b94bb3ffc7';

-- Tallaabo 2: Abuuro SIM 2 balance records ee device-ka cusub
INSERT INTO sim_balances (sim_id, balance, balance_type, balance_source, sim_slot, notes)
VALUES 
  ('6a719711-26d5-4ab4-a248-fefd249df910', 0, 'evc_plus', 'manual', 2, 'A30 SIM 2 Amtel Balance'),
  ('6a719711-26d5-4ab4-a248-fefd249df910', 0, 'evoucher', 'manual', 2, 'A30 SIM 2 Amtel E-Voucher');