
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_package_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES data_packages_config(id) ON DELETE SET NULL;

ALTER TABLE featured_packages DROP CONSTRAINT IF EXISTS featured_packages_package_id_fkey;
ALTER TABLE featured_packages ADD CONSTRAINT featured_packages_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES data_packages_config(id) ON DELETE CASCADE;

ALTER TABLE delivery_instructions DROP CONSTRAINT IF EXISTS delivery_instructions_package_id_fkey;
ALTER TABLE delivery_instructions ADD CONSTRAINT delivery_instructions_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES data_packages_config(id) ON DELETE SET NULL;

ALTER TABLE package_delivery_rules DROP CONSTRAINT IF EXISTS package_delivery_rules_source_package_id_fkey;
ALTER TABLE package_delivery_rules ADD CONSTRAINT package_delivery_rules_source_package_id_fkey 
  FOREIGN KEY (source_package_id) REFERENCES data_packages_config(id) ON DELETE CASCADE;

ALTER TABLE package_delivery_rules DROP CONSTRAINT IF EXISTS package_delivery_rules_target_package_id_fkey;
ALTER TABLE package_delivery_rules ADD CONSTRAINT package_delivery_rules_target_package_id_fkey 
  FOREIGN KEY (target_package_id) REFERENCES data_packages_config(id) ON DELETE CASCADE;

ALTER TABLE customer_discounts DROP CONSTRAINT IF EXISTS customer_discounts_package_id_fkey;
ALTER TABLE customer_discounts ADD CONSTRAINT customer_discounts_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES data_packages_config(id) ON DELETE CASCADE;

ALTER TABLE pending_online_payments DROP CONSTRAINT IF EXISTS pending_online_payments_package_id_fkey;
ALTER TABLE pending_online_payments ADD CONSTRAINT pending_online_payments_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES data_packages_config(id) ON DELETE SET NULL;
