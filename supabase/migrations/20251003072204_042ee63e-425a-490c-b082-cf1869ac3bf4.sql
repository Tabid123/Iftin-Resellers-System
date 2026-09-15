-- Create user_roles table using existing app_role enum
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create providers configuration table
CREATE TABLE IF NOT EXISTS public.providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  provider_logo TEXT,
  is_active BOOLEAN DEFAULT true,
  api_endpoint TEXT,
  api_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.providers_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active providers" ON public.providers_config;
DROP POLICY IF EXISTS "Only admins can manage providers" ON public.providers_config;

CREATE POLICY "Anyone can view active providers"
ON public.providers_config
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Only admins can manage providers"
ON public.providers_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create data packages configuration table
CREATE TABLE IF NOT EXISTS public.data_packages_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.providers_config(id) ON DELETE CASCADE NOT NULL,
  package_name TEXT NOT NULL,
  data_amount TEXT NOT NULL,
  validity_days INTEGER NOT NULL,
  cost_price DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  profit_margin DECIMAL(5, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.data_packages_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active packages" ON public.data_packages_config;
DROP POLICY IF EXISTS "Only admins can manage packages" ON public.data_packages_config;

CREATE POLICY "Anyone can view active packages"
ON public.data_packages_config
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Only admins can manage packages"
ON public.data_packages_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create payment providers configuration table
CREATE TABLE IF NOT EXISTS public.payment_providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  provider_logo TEXT,
  commission_rate DECIMAL(5, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  api_credentials JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.payment_providers_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active payment providers" ON public.payment_providers_config;
DROP POLICY IF EXISTS "Only admins can manage payment providers" ON public.payment_providers_config;

CREATE POLICY "Anyone can view active payment providers"
ON public.payment_providers_config
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Only admins can manage payment providers"
ON public.payment_providers_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_providers_config_updated_at ON public.providers_config;
DROP TRIGGER IF EXISTS update_data_packages_config_updated_at ON public.data_packages_config;
DROP TRIGGER IF EXISTS update_payment_providers_config_updated_at ON public.payment_providers_config;

-- Add triggers for updated_at
CREATE TRIGGER update_providers_config_updated_at
BEFORE UPDATE ON public.providers_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_data_packages_config_updated_at
BEFORE UPDATE ON public.data_packages_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_providers_config_updated_at
BEFORE UPDATE ON public.payment_providers_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();