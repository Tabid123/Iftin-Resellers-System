
CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date text,
  p_end_date text,
  p_provider_id uuid DEFAULT NULL
)
RETURNS TABLE(
  day_date date,
  order_count bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (o.delivered_at AT TIME ZONE 'Africa/Mogadishu')::date AS day_date,
    count(*)::bigint AS order_count,
    COALESCE(sum(o.selling_price), 0) AS revenue,
    COALESCE(sum(COALESCE(dp.cost_price, 0)), 0) AS cost,
    COALESCE(sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)), 0) AS profit
  FROM orders o
  LEFT JOIN data_packages_config dp ON dp.id = o.package_id
  LEFT JOIN providers_config pc ON pc.id = o.provider_id
  WHERE o.delivery_status = 'delivered'
    AND o.delivered_at >= p_start_date::timestamptz
    AND o.delivered_at <= p_end_date::timestamptz
    AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
  GROUP BY (o.delivered_at AT TIME ZONE 'Africa/Mogadishu')::date
  ORDER BY day_date;
END;
$$;
