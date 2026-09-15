ALTER TABLE payment_receipts 
  ADD COLUMN IF NOT EXISTS payment_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_hash 
  ON payment_receipts (payment_hash) 
  WHERE payment_hash IS NOT NULL;