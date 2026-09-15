-- Create discount codes table
CREATE TABLE public.discount_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  usage_limit INTEGER,
  times_used INTEGER DEFAULT 0,
  applicable_to TEXT CHECK (applicable_to IN ('all', 'provider', 'package')),
  provider_id UUID REFERENCES public.providers_config(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create customer discounts table
CREATE TABLE public.customer_discounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  applicable_to TEXT CHECK (applicable_to IN ('all', 'provider', 'package')),
  provider_id UUID REFERENCES public.providers_config(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create package profit overrides table
CREATE TABLE public.package_profit_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE UNIQUE,
  custom_profit_margin NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_profit_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for discount_codes
CREATE POLICY "Anyone can view active discount codes"
ON public.discount_codes FOR SELECT
USING (is_active = true);

CREATE POLICY "Only admins can manage discount codes"
ON public.discount_codes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for customer_discounts
CREATE POLICY "Only admins can view customer discounts"
ON public.customer_discounts FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage customer discounts"
ON public.customer_discounts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for package_profit_overrides
CREATE POLICY "Only admins can view profit overrides"
ON public.package_profit_overrides FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage profit overrides"
ON public.package_profit_overrides FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add indexes for better performance
CREATE INDEX idx_discount_codes_code ON public.discount_codes(code);
CREATE INDEX idx_customer_discounts_phone ON public.customer_discounts(customer_phone);
CREATE INDEX idx_package_profit_overrides_package ON public.package_profit_overrides(package_id);

-- Create trigger for updated_at
CREATE TRIGGER update_discount_codes_updated_at
  BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_discounts_updated_at
  BEFORE UPDATE ON public.customer_discounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_package_profit_overrides_updated_at
  BEFORE UPDATE ON public.package_profit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();