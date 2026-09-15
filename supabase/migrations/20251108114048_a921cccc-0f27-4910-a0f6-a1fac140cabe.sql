-- Drop the existing foreign key constraint
ALTER TABLE delivery_queue 
DROP CONSTRAINT IF EXISTS delivery_queue_order_id_fkey;

-- Re-add the foreign key with CASCADE delete
ALTER TABLE delivery_queue
ADD CONSTRAINT delivery_queue_order_id_fkey 
FOREIGN KEY (order_id) 
REFERENCES orders(id) 
ON DELETE CASCADE;