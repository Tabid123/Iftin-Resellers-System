-- Create orders table to track purchases
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  receiver_phone text NOT NULL,
  package_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  payment_provider_id uuid NOT NULL,
  package_name text NOT NULL,
  data_amount text NOT NULL,
  selling_price numeric NOT NULL,
  payment_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone can create orders (no auth required for public app)
CREATE POLICY "Anyone can create orders"
ON public.orders
FOR INSERT
WITH CHECK (true);

-- Only admins can view all orders
CREATE POLICY "Only admins can view orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update orders
CREATE POLICY "Only admins can update orders"
ON public.orders
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get most purchased packages (top 5)
CREATE OR REPLACE FUNCTION public.get_most_purchased_packages()
RETURNS TABLE(
  package_id uuid,
  package_name text,
  data_amount text,
  selling_price numeric,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  purchase_count bigint,
  connection_type_label text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    o.package_id,
    o.package_name,
    o.data_amount,
    o.selling_price,
    o.provider_id,
    p.provider_name,
    p.provider_logo,
    COUNT(o.id) as purchase_count,
    dp.connection_type_label
  FROM public.orders o
  JOIN public.providers_config p ON o.provider_id = p.id
  LEFT JOIN public.data_packages_config dp ON o.package_id = dp.id
  WHERE o.status = 'completed'
  GROUP BY o.package_id, o.package_name, o.data_amount, o.selling_price, o.provider_id, p.provider_name, p.provider_logo, dp.connection_type_label
  ORDER BY purchase_count DESC
  LIMIT 5;
$function$;