-- Create device_alerts table for tracking offline devices
CREATE TABLE public.device_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'offline',
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;

-- Only admins can view alerts
CREATE POLICY "Only admins can view device alerts"
ON public.device_alerts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can manage alerts
CREATE POLICY "Only admins can manage device alerts"
ON public.device_alerts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_device_alerts_device_id ON public.device_alerts(device_id);
CREATE INDEX idx_device_alerts_unacknowledged ON public.device_alerts(is_acknowledged) WHERE is_acknowledged = false;