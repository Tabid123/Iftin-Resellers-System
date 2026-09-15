-- Step 1: Add sim_slot column to sim_balances
ALTER TABLE sim_balances ADD COLUMN sim_slot integer DEFAULT 1;

-- Step 2: Add sim_slot column to delivery_queue
ALTER TABLE delivery_queue ADD COLUMN sim_slot integer DEFAULT 1;