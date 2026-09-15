-- Drop the existing unique constraint that doesn't include sim_slot
DROP INDEX IF EXISTS idx_sim_balances_sim_type;

-- Create new unique constraint that includes sim_slot
CREATE UNIQUE INDEX idx_sim_balances_sim_slot_type ON sim_balances(sim_id, balance_type, sim_slot);

-- Create SIM 2 balance record for M31's Somnet SIM (E-Voucher only)
INSERT INTO sim_balances (sim_id, balance, balance_type, balance_source, sim_slot, notes)
VALUES ('d9b615e3-7ff6-4732-b240-b507c861406d', 0, 'evoucher', 'manual', 2, 'Somnet SIM 2 E-Voucher');