-- Add sender_phone column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS sender_phone TEXT;

-- Create payment_receipts table for SMS processing
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  receiver_sim TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  sms_body TEXT,
  matched_order_id UUID REFERENCES orders(id),
  matching_strategy TEXT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_receipts_status ON payment_receipts(status);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_sender ON payment_receipts(sender_phone);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_matched ON payment_receipts(matched_order_id);

-- Enable RLS
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_receipts
CREATE POLICY "Only admins can view payment receipts"
ON payment_receipts FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage payment receipts"
ON payment_receipts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));