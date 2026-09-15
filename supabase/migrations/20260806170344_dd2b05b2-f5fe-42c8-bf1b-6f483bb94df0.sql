DROP FUNCTION IF EXISTS public.get_customer_order_history(text);
DROP FUNCTION IF EXISTS public.get_customer_order_history(text, uuid);

CREATE OR REPLACE FUNCTION public.get_customer_order_history(customer_phone_number TEXT, p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID, customer_phone TEXT, sender_phone TEXT, receiver_phone TEXT,
  package_name TEXT, data_amount TEXT, selling_price NUMERIC,
  status TEXT, delivery_status TEXT, delivery_notes TEXT,
  created_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, invoice_url TEXT,
  provider_name TEXT, provider_logo TEXT, validity_days TEXT,
  payment_source TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.customer_phone, o.sender_phone, o.receiver_phone,
    o.package_name, o.data_amount, o.selling_price,
    o.status, o.delivery_status, o.delivery_notes,
    o.created_at, o.delivered_at, o.invoice_url,
    pc.provider_name, pc.provider_logo,
    COALESCE(dp.validity_days, '30'),
    o.payment_source
  FROM orders o
  LEFT JOIN providers_config pc ON o.provider_id = pc.id
  LEFT JOIN data_packages_config dp ON o.package_id = dp.id
  WHERE (o.customer_phone = customer_phone_number OR o.sender_phone = customer_phone_number)
    AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
  ORDER BY o.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_order_history(text, uuid) TO anon, authenticated;