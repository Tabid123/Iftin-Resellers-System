-- Ku dar package_id column cusub delivery_instructions table-ka
ALTER TABLE delivery_instructions 
ADD COLUMN package_id uuid REFERENCES data_packages_config(id);

-- Index u samee si ay u shaqayso si dhakhso ah
CREATE INDEX idx_delivery_instructions_package_id 
ON delivery_instructions(package_id);