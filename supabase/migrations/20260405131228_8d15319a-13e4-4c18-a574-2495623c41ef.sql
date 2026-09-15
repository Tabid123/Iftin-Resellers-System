
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_provider_id uuid DEFAULT NULL,
  p_period text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu';
  v_month_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu';
  v_year_start TIMESTAMPTZ := date_trunc('year', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu';
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  IF p_period = 'today' THEN
    v_period_start := v_today_start;
    v_period_end := NULL;
  ELSIF p_period = 'yesterday' THEN
    v_period_start := v_today_start - interval '1 day';
    v_period_end := v_today_start;
  ELSIF p_period = 'week' THEN
    v_period_start := v_today_start - interval '6 days';
    v_period_end := NULL;
  ELSIF p_period = 'month' THEN
    v_period_start := v_month_start;
    v_period_end := NULL;
  ELSIF p_period = 'year' THEN
    v_period_start := v_year_start;
    v_period_end := NULL;
  ELSE
    v_period_start := NULL;
    v_period_end := NULL;
  END IF;

  SELECT json_build_object(
    'transactions_today', (
      SELECT count(*) FROM orders
      WHERE created_at >= v_today_start
        AND status != 'canceled' AND status != 'cancelled' AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ),
    'sales_today', COALESCE((
      SELECT sum(selling_price) FROM orders
      WHERE created_at >= v_today_start AND status = 'completed'
        AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ), 0),
    'sales_this_month', COALESCE((
      SELECT sum(selling_price) FROM orders
      WHERE created_at >= v_month_start AND status = 'completed'
        AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ), 0),
    'total_profit', COALESCE((
      SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0))
      FROM orders o
      LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      LEFT JOIN providers_config pc ON pc.id = o.provider_id
      WHERE o.status = 'completed'
        AND COALESCE(o.delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
        AND (v_period_start IS NULL OR o.created_at >= v_period_start)
        AND (v_period_end IS NULL OR o.created_at < v_period_end)
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;
