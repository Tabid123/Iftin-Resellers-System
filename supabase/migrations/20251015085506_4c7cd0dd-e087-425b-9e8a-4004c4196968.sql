-- Create delivery queue table
CREATE TABLE IF NOT EXISTS public.delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) NOT NULL,
  provider_name text NOT NULL,
  ussd_code text NOT NULL,
  receiver_phone text NOT NULL,
  package_code text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts int DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  android_device_id text
);

-- Create android devices table
CREATE TABLE IF NOT EXISTS public.android_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL,
  device_id text UNIQUE NOT NULL,
  provider_name text NOT NULL,
  sim_number text NOT NULL,
  is_active boolean DEFAULT true,
  last_ping_at timestamptz,
  total_deliveries int DEFAULT 0,
  failed_deliveries int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_queue_status ON public.delivery_queue(status);
CREATE INDEX IF NOT EXISTS idx_delivery_queue_order_id ON public.delivery_queue(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_queue_provider ON public.delivery_queue(provider_name);
CREATE INDEX IF NOT EXISTS idx_android_devices_device_id ON public.android_devices(device_id);

-- Enable RLS
ALTER TABLE public.delivery_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.android_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for delivery_queue
CREATE POLICY "Only admins can view delivery queue"
  ON public.delivery_queue
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage delivery queue"
  ON public.delivery_queue
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for android_devices
CREATE POLICY "Only admins can view android devices"
  ON public.android_devices
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage android devices"
  ON public.android_devices
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add ussd_code column to data_packages_config
ALTER TABLE public.data_packages_config 
ADD COLUMN IF NOT EXISTS ussd_code text;

-- Add sample USSD codes for testing (update with real codes later)
UPDATE public.data_packages_config 
SET ussd_code = '*545*1#' 
WHERE provider_id IN (
  SELECT id FROM public.providers_config WHERE provider_name ILIKE '%hormuud%'
);

UPDATE public.data_packages_config 
SET ussd_code = '*808*1#' 
WHERE provider_id IN (
  SELECT id FROM public.providers_config WHERE provider_name ILIKE '%somnet%'
);