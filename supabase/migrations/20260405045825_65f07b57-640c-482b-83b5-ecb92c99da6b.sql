
-- Drop old versions with different signatures
DROP FUNCTION IF EXISTS public.get_admin_date_range_breakdown(text, text, uuid);
DROP FUNCTION IF EXISTS public.get_admin_date_range_breakdown(timestamptz, timestamptz, uuid);

-- Recreate with correct timezone
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
STABLE SECURITY DEFINER
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

-- Also fix analytics summary to use local timezone
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_now TIMESTAMPTZ := now();
  v_today TIMESTAMPTZ := date_trunc('day', v_now AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu';
  v_week_ago TIMESTAMPTZ := v_today - interval '7 days';
  v_month_ago TIMESTAMPTZ := v_today - interval '30 days';
  v_year_ago TIMESTAMPTZ := v_today - interval '365 days';
BEGIN
  SELECT json_build_object(
    'total_orders', (SELECT count(*) FROM orders),
    'delivered_orders', (SELECT count(*) FROM orders WHERE delivery_status = 'delivered'),
    'pending_orders', (SELECT count(*) FROM orders WHERE delivery_status IN ('pending', 'queued', 'processing')),
    'failed_orders', (SELECT count(*) FROM orders WHERE delivery_status = 'failed'),
    'total_revenue', COALESCE((
      SELECT sum(o.selling_price) FROM orders o WHERE o.delivery_status = 'delivered'
    ), 0),
    'total_cost', COALESCE((
      SELECT sum(COALESCE(dp.cost_price, 0))
      FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      WHERE o.delivery_status = 'delivered'
    ), 0),
    'total_profit', COALESCE((
      SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0))
      FROM orders o
      LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      LEFT JOIN providers_config pc ON pc.id = o.provider_id
      WHERE o.delivery_status = 'delivered'
    ), 0),
    'today', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_today),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_today AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_today AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_today AND o.delivery_status = 'delivered'), 0)
    ),
    'week', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_week_ago AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_week_ago AND o.delivery_status = 'delivered'), 0)
    ),
    'month', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_month_ago AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_month_ago AND o.delivery_status = 'delivered'), 0)
    ),
    'year', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_year_ago),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_year_ago AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_year_ago AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_year_ago AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_year_ago AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_year_ago AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_year_ago AND o.delivery_status = 'delivered'), 0)
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Fix provider daily stats to use local timezone too
CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(provider_id uuid, provider_name text, evoucher_rate numeric, order_count bigint, revenue numeric, cost numeric, profit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Africa/Mogadishu';
  v_end TIMESTAMPTZ := ((p_date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'Africa/Mogadishu';
BEGIN
  RETURN QUERY
  SELECT
    o.provider_id,
    COALESCE(pc.provider_name, 'Unknown') AS provider_name,
    COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
    count(*)::bigint AS order_count,
    COALESCE(sum(o.selling_price), 0) AS revenue,
    COALESCE(sum(COALESCE(dp.cost_price, 0)), 0) AS cost,
    COALESCE(sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)), 0) AS profit
  FROM orders o
  LEFT JOIN data_packages_config dp ON dp.id = o.package_id
  LEFT JOIN providers_config pc ON pc.id = o.provider_id
  WHERE o.delivery_status = 'delivered'
    AND o.delivered_at >= v_start
    AND o.delivered_at < v_end
  GROUP BY o.provider_id, pc.provider_name, pc.evoucher_rate
  ORDER BY order_count DESC;
END;
$$;
