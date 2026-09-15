-- Add columns to android_devices for archive and config
ALTER TABLE public.android_devices 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS device_config JSONB;

-- Create sim_balances table for persistent balance tracking
CREATE TABLE IF NOT EXISTS public.sim_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_id UUID NOT NULL REFERENCES public.android_devices(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sim_balances
ALTER TABLE public.sim_balances ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sim_balances
CREATE POLICY "Only admins can view sim balances"
ON public.sim_balances
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage sim balances"
ON public.sim_balances
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sim_balances_sim_id ON public.sim_balances(sim_id);

-- Create function to update sim balance timestamp
CREATE OR REPLACE FUNCTION public.update_sim_balance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_sim_balances_timestamp ON public.sim_balances;
CREATE TRIGGER update_sim_balances_timestamp
BEFORE UPDATE ON public.sim_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_sim_balance_timestamp();