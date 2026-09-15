-- Add tx_id column to payment_receipts for true deduplication
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS tx_id TEXT UNIQUE;

-- Create index for faster tx_id lookups
CREATE INDEX IF NOT EXISTS idx_payment_receipts_tx_id ON payment_receipts(tx_id);

-- Add balance_type and balance_source to sim_balances
ALTER TABLE sim_balances 
ADD COLUMN IF NOT EXISTS balance_type TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE sim_balances 
ADD COLUMN IF NOT EXISTS balance_source TEXT DEFAULT 'manual';

-- Add constraint for valid balance types (evc_plus, evoucher, manual)
ALTER TABLE sim_balances 
ADD CONSTRAINT sim_balances_balance_type_check 
CHECK (balance_type IN ('evc_plus', 'evoucher', 'manual'));

-- Add constraint for valid balance sources (manual, sms, ussd)
ALTER TABLE sim_balances 
ADD CONSTRAINT sim_balances_balance_source_check 
CHECK (balance_source IN ('manual', 'sms', 'ussd'));

-- Create unique constraint for sim_id + balance_type combination
-- This allows one balance per type per SIM
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_balances_sim_type ON sim_balances(sim_id, balance_type);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sim_balances_type ON sim_balances(sim_id, balance_type);