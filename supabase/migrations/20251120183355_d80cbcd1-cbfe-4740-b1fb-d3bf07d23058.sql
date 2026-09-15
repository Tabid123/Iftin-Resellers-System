-- Add index on receiver_phone for faster queries
-- This will speed up fetching order history for each phone number
CREATE INDEX IF NOT EXISTS idx_orders_receiver_phone ON public.orders(receiver_phone);

-- Add index on customer_phone as well for admin queries
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);

-- Add index on created_at for date-based queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Composite index for receiver_phone + created_at for optimal performance
CREATE INDEX IF NOT EXISTS idx_orders_receiver_created ON public.orders(receiver_phone, created_at DESC);

-- Add comment explaining the structure
COMMENT ON COLUMN public.orders.receiver_phone IS 'The phone number that receives the internet package - used for per-number history';
COMMENT ON COLUMN public.orders.customer_phone IS 'The phone number of the customer who made the purchase - may differ from receiver';