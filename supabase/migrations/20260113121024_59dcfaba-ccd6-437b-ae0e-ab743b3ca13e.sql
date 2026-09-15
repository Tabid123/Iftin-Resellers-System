-- Tirtir dhamaan dalabyadii hore (Clean slate for fresh start)

-- 1. Tirtir delivery queue (foreign key to orders)
DELETE FROM delivery_queue;

-- 2. Tirtir payment receipts (foreign key to orders)
DELETE FROM payment_receipts;

-- 3. Tirtir dhamaan orders
DELETE FROM orders;