-- Public-facing order history accessor for phone-verified customer flows
-- Uses SECURITY DEFINER to avoid direct table SELECT from the client.
CREATE OR REPLACE FUNCTION public.get_customer_order_history(customer_phone_number text)
RETURNS TABLE (
  id uuid,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  package_id uuid,
  package_name text,
  receiver_phone text,
  sender_phone text,
  customer_phone text,
  selling_price numeric,
  status text,
  delivery_status text,
  created_at timestamptz,
  invoice_url text,
  validity_days text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.provider_id,
    p.provider_name,
    p.provider_logo,
    o.package_id,
    o.package_name,
    o.receiver_phone,
    o.sender_phone,
    o.customer_phone,
    o.selling_price,
    o.status,
    COALESCE(o.delivery_status, o.status) AS delivery_status,
    o.created_at,
    o.invoice_url,
    dp.validity_days
  FROM public.orders o
  LEFT JOIN public.providers_config p ON p.id = o.provider_id
  LEFT JOIN public.data_packages_config dp ON dp.id = o.package_id
  WHERE o.customer_phone = customer_phone_number
     OR o.sender_phone = customer_phone_number
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_order_history(text) TO anon, authenticated;