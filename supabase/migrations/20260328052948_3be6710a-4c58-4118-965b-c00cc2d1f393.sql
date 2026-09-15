
-- Create package_delivery_rules table
CREATE TABLE public.package_delivery_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id UUID NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  target_package_id UUID NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  delivery_count INTEGER NOT NULL DEFAULT 1,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  execution_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add scheduled_at to delivery_queue
ALTER TABLE public.delivery_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT now();

-- Enable RLS
ALTER TABLE public.package_delivery_rules ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can manage
CREATE POLICY "Only admins can manage delivery rules"
  ON public.package_delivery_rules FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can view delivery rules"
  ON public.package_delivery_rules FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
