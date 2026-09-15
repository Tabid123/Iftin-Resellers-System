-- Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Set replica identity to full to get all column data in realtime updates
ALTER TABLE orders REPLICA IDENTITY FULL;

-- Create delivery_instructions table to store provider-specific delivery codes
CREATE TABLE IF NOT EXISTS public.delivery_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers_config(id) ON DELETE CASCADE,
  instruction_template TEXT NOT NULL,
  code_template TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(provider_id)
);

-- Enable RLS
ALTER TABLE public.delivery_instructions ENABLE ROW LEVEL SECURITY;

-- Only admins can view delivery instructions
CREATE POLICY "Only admins can view delivery instructions"
ON public.delivery_instructions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can manage delivery instructions
CREATE POLICY "Only admins can manage delivery instructions"
ON public.delivery_instructions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_delivery_instructions_updated_at
BEFORE UPDATE ON public.delivery_instructions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();