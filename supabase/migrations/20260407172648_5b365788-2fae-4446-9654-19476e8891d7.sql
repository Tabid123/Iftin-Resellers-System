
-- Fix get_admin_provider_daily_stats: only show providers with orders, only count delivered for financials
CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(s))
  INTO result
  FROM (
    SELECT pc.id as provider_id, pc.provider_name, pc.provider_logo, pc.evoucher_rate,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.selling_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as revenue,
      COALESCE(SUM(o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as cost,
      COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as profit
    FROM providers_config pc
    INNER JOIN orders o ON o.provider_id = pc.id
      AND o.created_at >= p_date::timestamptz
      AND o.created_at < (p_date + 1)::timestamptz
    WHERE pc.is_active = true
    GROUP BY pc.id, pc.provider_name, pc.provider_logo, pc.evoucher_rate
    HAVING COUNT(o.id) > 0
    ORDER BY pc.display_order
  ) s;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

-- Fix get_admin_analytics_summary: only count delivered orders for revenue/profit
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary(p_period text DEFAULT 'today'::text, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  today_start TIMESTAMPTZ;
  week_start TIMESTAMPTZ;
  month_start TIMESTAMPTZ;
  year_start TIMESTAMPTZ;
BEGIN
  today_start := date_trunc('day', now());
  week_start := date_trunc('week', now());
  month_start := date_trunc('month', now());
  year_start := date_trunc('year', now());

  SELECT json_build_object(
    'total_revenue', COALESCE(SUM(o.selling_price) FILTER (WHERE o.delivery_status = 'delivered'), 0),
    'total_cost', COALESCE(SUM(o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0),
    'total_profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0),
    'total_orders', COUNT(*),
    'delivered_orders', COUNT(*) FILTER (WHERE o.delivery_status = 'delivered'),
    'pending_orders', COUNT(*) FILTER (WHERE o.delivery_status = 'pending' OR o.delivery_status IS NULL),
    'failed_orders', COUNT(*) FILTER (WHERE o.delivery_status = 'failed'),
    'today', json_build_object(
      'revenue', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= today_start AND o.delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(o.cost_price) FILTER (WHERE o.created_at >= today_start AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.created_at >= today_start AND o.delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE o.created_at >= today_start),
      'delivered', COUNT(*) FILTER (WHERE o.created_at >= today_start AND o.delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE o.created_at >= today_start AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE o.created_at >= today_start AND o.delivery_status = 'failed')
    ),
    'week', json_build_object(
      'revenue', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= week_start AND o.delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(o.cost_price) FILTER (WHERE o.created_at >= week_start AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.created_at >= week_start AND o.delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE o.created_at >= week_start),
      'delivered', COUNT(*) FILTER (WHERE o.created_at >= week_start AND o.delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE o.created_at >= week_start AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE o.created_at >= week_start AND o.delivery_status = 'failed')
    ),
    'month', json_build_object(
      'revenue', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= month_start AND o.delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(o.cost_price) FILTER (WHERE o.created_at >= month_start AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.created_at >= month_start AND o.delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE o.created_at >= month_start),
      'delivered', COUNT(*) FILTER (WHERE o.created_at >= month_start AND o.delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE o.created_at >= month_start AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE o.created_at >= month_start AND o.delivery_status = 'failed')
    ),
    'year', json_build_object(
      'revenue', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= year_start AND o.delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(o.cost_price) FILTER (WHERE o.created_at >= year_start AND o.delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.created_at >= year_start AND o.delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE o.created_at >= year_start),
      'delivered', COUNT(*) FILTER (WHERE o.created_at >= year_start AND o.delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE o.created_at >= year_start AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE o.created_at >= year_start AND o.delivery_status = 'failed')
    )
  ) INTO result
  FROM orders o
  LEFT JOIN providers_config pc ON o.provider_id = pc.id;

  RETURN result;
END;
$function$;

-- Fix get_admin_transactions_summary: only count delivered for profit
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(p_period text DEFAULT 'today'::text, p_status text DEFAULT 'all'::text, p_provider_id text DEFAULT 'all'::text, p_search text DEFAULT ''::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
BEGIN
  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now());
    WHEN 'yesterday' THEN date_from := date_trunc('day', now()) - interval '1 day';
    WHEN 'week' THEN date_from := date_trunc('week', now());
    WHEN 'month' THEN date_from := date_trunc('month', now());
    WHEN 'year' THEN date_from := date_trunc('year', now());
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ;
  END CASE;

  SELECT json_build_object(
    'transactions_today', COUNT(*) FILTER (WHERE o.created_at >= date_trunc('day', now())),
    'sales_today', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= date_trunc('day', now()) AND o.delivery_status = 'delivered'), 0),
    'sales_this_month', COALESCE(SUM(o.selling_price) FILTER (WHERE o.created_at >= date_trunc('month', now()) AND o.delivery_status = 'delivered'), 0),
    'total_profit', COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0),
    'totalSales', COALESCE(SUM(o.selling_price) FILTER (WHERE o.delivery_status = 'delivered'), 0),
    'totalCount', COUNT(*)
  ) INTO result
  FROM orders o
  LEFT JOIN providers_config pc ON o.provider_id = pc.id
  WHERE o.created_at >= date_from
    AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
    AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
    AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%');

  RETURN result;
END;
$function$;

-- Fix get_admin_date_range_breakdown: only count delivered for financials
CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_provider_id text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(d))
  INTO result
  FROM (
    SELECT date_trunc('day', o.created_at)::date as day_date,
      COUNT(*) as order_count,
      COALESCE(SUM(o.selling_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as revenue,
      COALESCE(SUM(o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as cost,
      COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as profit
    FROM orders o
    LEFT JOIN providers_config pc ON o.provider_id = pc.id
    WHERE o.created_at >= p_start_date AND o.created_at <= p_end_date
      AND (p_provider_id IS NULL OR o.provider_id::text = p_provider_id)
    GROUP BY date_trunc('day', o.created_at)::date
    ORDER BY day_date
  ) d;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

-- Fix get_admin_transactions_paginated: only count delivered for profit totals
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_search text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_period text DEFAULT 'today'::text, p_provider_id text DEFAULT 'all'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
  date_to TIMESTAMPTZ;
  query_offset INTEGER;
BEGIN
  query_offset := p_page * p_page_size;
  
  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now()); date_to := now();
    WHEN 'yesterday' THEN date_from := date_trunc('day', now()) - interval '1 day'; date_to := date_trunc('day', now());
    WHEN 'week' THEN date_from := date_trunc('week', now()); date_to := now();
    WHEN 'month' THEN date_from := date_trunc('month', now()); date_to := now();
    WHEN 'year' THEN date_from := date_trunc('year', now()); date_to := now();
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ; date_to := now();
  END CASE;

  SELECT json_build_object(
    'rows', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT o.id, o.customer_phone, o.package_name, o.data_amount, o.selling_price,
          o.status, o.delivery_status, o.created_at, o.package_id, o.provider_id,
          o.cost_price, COALESCE(pc.evoucher_rate, 0) as evoucher_rate,
          o.sender_phone, o.receiver_phone, pc.provider_name
        FROM orders o
        LEFT JOIN providers_config pc ON o.provider_id = pc.id
        WHERE o.created_at >= date_from AND o.created_at <= date_to
          AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
          AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
          AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
        ORDER BY o.created_at DESC
        LIMIT p_page_size OFFSET query_offset
      ) t
    ), '[]'::json),
    'total_count', (
      SELECT COUNT(*)
      FROM orders o
      WHERE o.created_at >= date_from AND o.created_at <= date_to
        AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
        AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
        AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
    ),
    'total_sales', (
      SELECT COALESCE(SUM(o.selling_price), 0)
      FROM orders o
      WHERE o.created_at >= date_from AND o.created_at <= date_to
        AND o.delivery_status = 'delivered'
        AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
        AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
        AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
    ),
    'total_profit', (
      SELECT COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price), 0)
      FROM orders o
      LEFT JOIN providers_config pc ON o.provider_id = pc.id
      WHERE o.created_at >= date_from AND o.created_at <= date_to
        AND o.delivery_status = 'delivered'
        AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
        AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
        AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
    )
  ) INTO result;

  RETURN result;
END;
$function$;
