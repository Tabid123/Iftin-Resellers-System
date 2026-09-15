-- Add is_manual column to orders table to track manually added deliveries
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_is_manual ON orders(is_manual);

-- Add comment for documentation
COMMENT ON COLUMN orders.is_manual IS 'Indicates if the order was manually added by admin for accounting purposes';