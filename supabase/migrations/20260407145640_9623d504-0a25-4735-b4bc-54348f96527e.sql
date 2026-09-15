
-- Fix category deletion: delivery_instructions
ALTER TABLE delivery_instructions DROP CONSTRAINT IF EXISTS delivery_instructions_category_id_fkey;
ALTER TABLE delivery_instructions ADD CONSTRAINT delivery_instructions_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES package_categories(id) ON DELETE SET NULL;

-- Fix category deletion: data_packages_config
ALTER TABLE data_packages_config DROP CONSTRAINT IF EXISTS data_packages_config_category_id_fkey;
ALTER TABLE data_packages_config ADD CONSTRAINT data_packages_config_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES package_categories(id) ON DELETE SET NULL;

-- Fix category deletion: package_categories -> providers_config
ALTER TABLE package_categories DROP CONSTRAINT IF EXISTS package_categories_provider_id_fkey;
ALTER TABLE package_categories ADD CONSTRAINT package_categories_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE CASCADE;

-- Fix provider deletion: data_packages_config -> providers_config
ALTER TABLE data_packages_config DROP CONSTRAINT IF EXISTS data_packages_config_provider_id_fkey;
ALTER TABLE data_packages_config ADD CONSTRAINT data_packages_config_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE CASCADE;

-- Fix provider deletion: delivery_instructions -> providers_config
ALTER TABLE delivery_instructions DROP CONSTRAINT IF EXISTS delivery_instructions_provider_id_fkey;
ALTER TABLE delivery_instructions ADD CONSTRAINT delivery_instructions_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE SET NULL;

-- Fix provider deletion: orders -> providers_config
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_provider_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE SET NULL;

-- Fix provider deletion: customer_discounts -> providers_config
ALTER TABLE customer_discounts DROP CONSTRAINT IF EXISTS customer_discounts_provider_id_fkey;
ALTER TABLE customer_discounts ADD CONSTRAINT customer_discounts_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE CASCADE;

-- Fix provider deletion: pending_online_payments -> providers_config
ALTER TABLE pending_online_payments DROP CONSTRAINT IF EXISTS pending_online_payments_provider_id_fkey;
ALTER TABLE pending_online_payments ADD CONSTRAINT pending_online_payments_provider_id_fkey 
  FOREIGN KEY (provider_id) REFERENCES providers_config(id) ON DELETE SET NULL;

-- Fix order deletion: delivery_instructions -> orders
ALTER TABLE delivery_instructions DROP CONSTRAINT IF EXISTS delivery_instructions_order_id_fkey;
ALTER TABLE delivery_instructions ADD CONSTRAINT delivery_instructions_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Fix order deletion: delivery_queue -> orders
ALTER TABLE delivery_queue DROP CONSTRAINT IF EXISTS delivery_queue_order_id_fkey;
ALTER TABLE delivery_queue ADD CONSTRAINT delivery_queue_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Fix order deletion: payment_receipts -> orders
ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_matched_order_id_fkey;
ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipts_matched_order_id_fkey 
  FOREIGN KEY (matched_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Fix payment provider deletion: orders -> payment_providers_config
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_id_fkey 
  FOREIGN KEY (payment_provider_id) REFERENCES payment_providers_config(id) ON DELETE SET NULL;
