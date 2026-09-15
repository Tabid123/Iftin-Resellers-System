-- Add foreign key constraints to orders table for proper JOINs
ALTER TABLE public.orders
ADD CONSTRAINT fk_orders_package_id 
FOREIGN KEY (package_id) REFERENCES public.data_packages_config(id);

ALTER TABLE public.orders
ADD CONSTRAINT fk_orders_provider_id 
FOREIGN KEY (provider_id) REFERENCES public.providers_config(id);