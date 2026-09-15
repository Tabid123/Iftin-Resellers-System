
-- 1. Analytics Summary RPC - returns one row with all key metrics
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_now TIMESTAMPTZ := now();
  v_today TIMESTAMPTZ := date_trunc('day', v_now);
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
      SELECT sum(o.selling_price)
      FROM orders o WHERE o.delivery_status = 'delivered'
    ), 0),
    'total_cost', COALESCE((
      SELECT sum(COALESCE(dp.cost_price, 0))
      FROM orders o
      LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      WHERE o.delivery_status = 'delivered'
    ), 0),
    'total_profit', COALESCE((
      SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0))
      FROM orders o
      LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      LEFT JOIN providers_config pc ON pc.id = o.provider_id
      WHERE o.delivery_status = 'delivered'
    ), 0),
    -- Today
    'today', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_today),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_today AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_today AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_today AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_today AND o.delivery_status = 'delivered'), 0)
    ),
    -- Week
    'week', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_week_ago AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_week_ago AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_week_ago AND o.delivery_status = 'delivered'), 0)
    ),
    -- Month
    'month', json_build_object(
      'orders', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago),
      'delivered', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'delivered'),
      'pending', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status IN ('pending', 'queued', 'processing')),
      'failed', (SELECT count(*) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'failed'),
      'revenue', COALESCE((SELECT sum(selling_price) FROM orders WHERE created_at >= v_month_ago AND delivery_status = 'delivered'), 0),
      'cost', COALESCE((SELECT sum(COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id WHERE o.created_at >= v_month_ago AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE((SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)) FROM orders o LEFT JOIN data_packages_config dp ON dp.id = o.package_id LEFT JOIN providers_config pc ON pc.id = o.provider_id WHERE o.created_at >= v_month_ago AND o.delivery_status = 'delivered'), 0)
    ),
    -- Year
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

-- 2. Date Range Breakdown RPC
CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_provider_id UUID DEFAULT NULL
)
RETURNS TABLE(
  day_date DATE,
  order_count BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  profit NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (o.delivered_at AT TIME ZONE 'UTC')::date AS day_date,
    count(*)::bigint AS order_count,
    COALESCE(sum(o.selling_price), 0) AS revenue,
    COALESCE(sum(COALESCE(dp.cost_price, 0)), 0) AS cost,
    COALESCE(sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0)), 0) AS profit
  FROM orders o
  LEFT JOIN data_packages_config dp ON dp.id = o.package_id
  LEFT JOIN providers_config pc ON pc.id = o.provider_id
  WHERE o.delivery_status = 'delivered'
    AND o.delivered_at >= p_start_date
    AND o.delivered_at <= p_end_date
    AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
  GROUP BY (o.delivered_at AT TIME ZONE 'UTC')::date
  ORDER BY day_date;
END;
$$;

-- 3. Transactions Summary RPC
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_provider_id UUID DEFAULT NULL,
  p_period TEXT DEFAULT 'all'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_now TIMESTAMPTZ := now();
  v_today TIMESTAMPTZ := date_trunc('day', v_now);
  v_yesterday_start TIMESTAMPTZ := v_today - interval '1 day';
  v_week_ago TIMESTAMPTZ := v_now - interval '7 days';
  v_month_start TIMESTAMPTZ := date_trunc('month', v_now);
  v_year_start TIMESTAMPTZ := date_trunc('year', v_now);
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ := v_now;
BEGIN
  -- Determine period boundaries
  IF p_period = 'today' THEN
    v_period_start := v_today;
  ELSIF p_period = 'yesterday' THEN
    v_period_start := v_yesterday_start;
    v_period_end := v_today;
  ELSIF p_period = 'week' THEN
    v_period_start := v_week_ago;
  ELSIF p_period = 'month' THEN
    v_period_start := v_month_start;
  ELSIF p_period = 'year' THEN
    v_period_start := v_year_start;
  ELSE
    v_period_start := NULL; -- all time
  END IF;

  SELECT json_build_object(
    'transactions_today', (
      SELECT count(*) FROM orders
      WHERE created_at >= v_today
        AND status != 'canceled' AND status != 'cancelled' AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ),
    'sales_today', COALESCE((
      SELECT sum(selling_price) FROM orders
      WHERE created_at >= v_today AND status = 'completed'
        AND status != 'canceled' AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ), 0),
    'sales_this_month', COALESCE((
      SELECT sum(selling_price) FROM orders
      WHERE created_at >= v_month_start AND status = 'completed'
        AND status != 'canceled' AND COALESCE(delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR provider_id = p_provider_id)
    ), 0),
    'total_profit', COALESCE((
      SELECT sum(o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0)) - COALESCE(dp.cost_price, 0))
      FROM orders o
      LEFT JOIN data_packages_config dp ON dp.id = o.package_id
      LEFT JOIN providers_config pc ON pc.id = o.provider_id
      WHERE o.status = 'completed'
        AND o.status != 'canceled' AND COALESCE(o.delivery_status, '') != 'cancelled'
        AND (p_provider_id IS NULL OR o.provider_id = p_provider_id)
        AND (v_period_start IS NULL OR (o.created_at >= v_period_start AND o.created_at <= v_period_end))
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

-- 4. Provider Daily Stats RPC
CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  provider_id UUID,
  provider_name TEXT,
  evoucher_rate NUMERIC,
  order_count BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  profit NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ := p_date::timestamptz;
  v_end TIMESTAMPTZ := (p_date + 1)::timestamptz;
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
