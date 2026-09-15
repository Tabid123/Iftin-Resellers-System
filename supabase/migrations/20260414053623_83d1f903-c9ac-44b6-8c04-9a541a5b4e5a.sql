-- Drop the 2-minute time-based duplicate trigger on orders
DROP TRIGGER IF EXISTS trigger_silent_check ON public.orders;
DROP FUNCTION IF EXISTS public.stop_duplicates_silently();

-- Add unique index on payment_receipts.tx_id for duplicate SMS prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_unique_tx_id 
ON public.payment_receipts (tx_id) 
WHERE tx_id IS NOT NULL;