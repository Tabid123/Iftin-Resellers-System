-- Add sim_password column to delivery_instructions table
ALTER TABLE public.delivery_instructions 
ADD COLUMN IF NOT EXISTS sim_password text;

-- Add delivery_status column to orders table for tracking
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending';

-- Add delivered_at timestamp to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;

-- Add delivery_notes to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_notes text;

-- Create index for faster delivery status queries
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON public.orders(delivery_status);

COMMENT ON COLUMN public.delivery_instructions.sim_password IS 'SIM password for USSD code execution';
COMMENT ON COLUMN public.orders.delivery_status IS 'Status of delivery: pending, sent, completed, failed';
COMMENT ON COLUMN public.orders.delivered_at IS 'Timestamp when the order was delivered';
COMMENT ON COLUMN public.orders.delivery_notes IS 'Notes about the delivery';