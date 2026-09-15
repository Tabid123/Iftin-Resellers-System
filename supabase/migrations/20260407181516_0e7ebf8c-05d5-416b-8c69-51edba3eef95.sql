CREATE OR REPLACE FUNCTION public.resolve_order_cost(
  p_order_cost numeric,
  p_package_id uuid,
  p_provider_id uuid,
  p_package_name text,
  p_data_amount text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(p_order_cost, 0),
    (
      SELECT dp.cost_price
      FROM public.data_packages_config dp
      WHERE dp.id = p_package_id
      LIMIT 1
    ),
    (
      SELECT dp.cost_price
      FROM public.data_packages_config dp
      WHERE dp.provider_id = p_provider_id
        AND lower(btrim(dp.package_name)) = lower(btrim(COALESCE(p_package_name, '')))
        AND lower(btrim(COALESCE(dp.data_amount, ''))) = lower(btrim(COALESCE(p_data_amount, '')))
      ORDER BY dp.updated_at DESC, dp.created_at DESC
      LIMIT 1
    ),
    0
  );
$function$;

CREATE OR REPLACE FUNCTION public.sync_order_cost_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.cost_price, 0) = 0 THEN
    NEW.cost_price := public.resolve_order_cost(
      NEW.cost_price,
      NEW.package_id,
      NEW.provider_id,
      NEW.package_name,
      NEW.data_amount
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_order_cost_price ON public.orders;
CREATE TRIGGER sync_order_cost_price
BEFORE INSERT OR UPDATE OF cost_price, package_id, provider_id, package_name, data_amount
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_cost_price();

UPDATE public.orders o
SET cost_price = resolved.effective_cost
FROM (
  SELECT id, public.resolve_order_cost(cost_price, package_id, provider_id, package_name, data_amount) AS effective_cost
  FROM public.orders
) resolved
WHERE o.id = resolved.id
  AND COALESCE(o.cost_price, 0) = 0
  AND resolved.effective_cost > 0;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary(
  p_period text DEFAULT 'today'::text,
  p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  WITH orders_with_cost AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON o.provider_id = pc.id
  )
  SELECT json_build_object(
    'total_revenue', COALESCE(SUM(selling_price) FILTER (WHERE delivery_status = 'delivered'), 0),
    'total_cost', COALESCE(SUM(effective_cost) FILTER (WHERE delivery_status = 'delivered'), 0),
    'total_profit', COALESCE(SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FILTER (WHERE delivery_status = 'delivered'), 0),
    'total_orders', COUNT(*) FILTER (WHERE delivery_status = 'delivered'),
    'delivered_orders', COUNT(*) FILTER (WHERE delivery_status = 'delivered'),
    'pending_orders', COUNT(*) FILTER (WHERE delivery_status = 'pending' OR delivery_status IS NULL),
    'failed_orders', COUNT(*) FILTER (WHERE delivery_status = 'failed'),
    'today', json_build_object(
      'revenue', COALESCE(SUM(selling_price) FILTER (WHERE created_at >= today_start AND delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(effective_cost) FILTER (WHERE created_at >= today_start AND delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FILTER (WHERE created_at >= today_start AND delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE created_at >= today_start AND delivery_status = 'delivered'),
      'delivered', COUNT(*) FILTER (WHERE created_at >= today_start AND delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE created_at >= today_start AND (delivery_status = 'pending' OR delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE created_at >= today_start AND delivery_status = 'failed')
    ),
    'week', json_build_object(
      'revenue', COALESCE(SUM(selling_price) FILTER (WHERE created_at >= week_start AND delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(effective_cost) FILTER (WHERE created_at >= week_start AND delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FILTER (WHERE created_at >= week_start AND delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE created_at >= week_start AND delivery_status = 'delivered'),
      'delivered', COUNT(*) FILTER (WHERE created_at >= week_start AND delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE created_at >= week_start AND (delivery_status = 'pending' OR delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE created_at >= week_start AND delivery_status = 'failed')
    ),
    'month', json_build_object(
      'revenue', COALESCE(SUM(selling_price) FILTER (WHERE created_at >= month_start AND delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(effective_cost) FILTER (WHERE created_at >= month_start AND delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FILTER (WHERE created_at >= month_start AND delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE created_at >= month_start AND delivery_status = 'delivered'),
      'delivered', COUNT(*) FILTER (WHERE created_at >= month_start AND delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE created_at >= month_start AND (delivery_status = 'pending' OR delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE created_at >= month_start AND delivery_status = 'failed')
    ),
    'year', json_build_object(
      'revenue', COALESCE(SUM(selling_price) FILTER (WHERE created_at >= year_start AND delivery_status = 'delivered'), 0),
      'cost', COALESCE(SUM(effective_cost) FILTER (WHERE created_at >= year_start AND delivery_status = 'delivered'), 0),
      'profit', COALESCE(SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FILTER (WHERE created_at >= year_start AND delivery_status = 'delivered'), 0),
      'orders', COUNT(*) FILTER (WHERE created_at >= year_start AND delivery_status = 'delivered'),
      'delivered', COUNT(*) FILTER (WHERE created_at >= year_start AND delivery_status = 'delivered'),
      'pending', COUNT(*) FILTER (WHERE created_at >= year_start AND (delivery_status = 'pending' OR delivery_status IS NULL)),
      'failed', COUNT(*) FILTER (WHERE created_at >= year_start AND delivery_status = 'failed')
    )
  ) INTO result
  FROM orders_with_cost;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH orders_with_cost AS (
    SELECT
      o.*,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost
    FROM public.orders o
  )
  SELECT json_agg(row_to_json(s))
  INTO result
  FROM (
    SELECT
      pc.id AS provider_id,
      pc.provider_name,
      pc.provider_logo,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      COUNT(owc.id) AS order_count,
      COALESCE(SUM(owc.selling_price), 0) AS revenue,
      COALESCE(SUM(owc.effective_cost), 0) AS cost,
      COALESCE(SUM((owc.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - owc.effective_cost), 0) AS profit
    FROM public.providers_config pc
    INNER JOIN orders_with_cost owc
      ON owc.provider_id = pc.id
     AND owc.delivery_status = 'delivered'
     AND owc.created_at >= p_date::timestamptz
     AND owc.created_at < (p_date + 1)::timestamptz
    WHERE pc.is_active = true
    GROUP BY pc.id, pc.provider_name, pc.provider_logo, pc.evoucher_rate, pc.display_order
    HAVING COUNT(owc.id) > 0
    ORDER BY pc.display_order
  ) s;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_provider_id text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH orders_with_cost AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON o.provider_id = pc.id
  )
  SELECT json_agg(row_to_json(d))
  INTO result
  FROM (
    SELECT
      date_trunc('day', owc.created_at)::date AS day_date,
      COUNT(*) AS order_count,
      COALESCE(SUM(owc.selling_price), 0) AS revenue,
      COALESCE(SUM(owc.effective_cost), 0) AS cost,
      COALESCE(SUM((owc.selling_price * (1 + owc.evoucher_rate)) - owc.effective_cost), 0) AS profit
    FROM orders_with_cost owc
    WHERE owc.created_at >= p_start_date
      AND owc.created_at <= p_end_date
      AND owc.delivery_status = 'delivered'
      AND (p_provider_id IS NULL OR owc.provider_id::text = p_provider_id)
    GROUP BY date_trunc('day', owc.created_at)::date
    ORDER BY day_date
  ) d;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH orders_with_cost AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON o.provider_id = pc.id
  )
  SELECT json_agg(row_to_json(d))
  INTO result
  FROM (
    SELECT
      date_trunc('day', owc.created_at)::date AS day_date,
      COUNT(*) AS order_count,
      COALESCE(SUM(owc.selling_price), 0) AS revenue,
      COALESCE(SUM(owc.effective_cost), 0) AS cost,
      COALESCE(SUM((owc.selling_price * (1 + owc.evoucher_rate)) - owc.effective_cost), 0) AS profit
    FROM orders_with_cost owc
    WHERE owc.created_at >= p_start_date
      AND owc.created_at <= p_end_date
      AND owc.delivery_status = 'delivered'
    GROUP BY date_trunc('day', owc.created_at)::date
    ORDER BY day_date
  ) d;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_period text DEFAULT 'today'::text,
  p_status text DEFAULT 'all'::text,
  p_provider_id text DEFAULT 'all'::text,
  p_search text DEFAULT ''::text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
  normalized_status text;
  normalized_provider text;
BEGIN
  normalized_status := lower(COALESCE(p_status, 'all'));
  normalized_provider := COALESCE(p_provider_id, 'all');

  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now());
    WHEN 'yesterday' THEN date_from := date_trunc('day', now()) - interval '1 day';
    WHEN 'week' THEN date_from := date_trunc('week', now());
    WHEN 'month' THEN date_from := date_trunc('month', now());
    WHEN 'year' THEN date_from := date_trunc('year', now());
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ;
  END CASE;

  WITH base_orders AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON o.provider_id = pc.id
    WHERE (normalized_provider = 'all' OR o.provider_id::text = normalized_provider)
      AND (
        normalized_status = 'all'
        OR (normalized_status IN ('completed', 'delivered') AND o.delivery_status = 'delivered')
        OR (normalized_status = 'pending' AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL OR o.status IN ('pending', 'queued', 'payment_confirmed')))
        OR (normalized_status = 'failed' AND o.delivery_status = 'failed')
        OR o.delivery_status = normalized_status
      )
      AND (
        p_search = ''
        OR o.customer_phone ILIKE '%' || p_search || '%'
        OR COALESCE(o.sender_phone, '') ILIKE '%' || p_search || '%'
        OR COALESCE(o.receiver_phone, '') ILIKE '%' || p_search || '%'
      )
  ),
  period_orders AS (
    SELECT *
    FROM base_orders
    WHERE created_at >= date_from
  )
  SELECT json_build_object(
    'transactions_today', COALESCE((SELECT COUNT(*) FROM base_orders WHERE created_at >= date_trunc('day', now()) AND delivery_status = 'delivered'), 0),
    'sales_today', COALESCE((SELECT SUM(selling_price) FROM base_orders WHERE created_at >= date_trunc('day', now()) AND delivery_status = 'delivered'), 0),
    'cost_today', COALESCE((SELECT SUM(effective_cost) FROM base_orders WHERE created_at >= date_trunc('day', now()) AND delivery_status = 'delivered'), 0),
    'sales_this_month', COALESCE((SELECT SUM(selling_price) FROM base_orders WHERE created_at >= date_trunc('month', now()) AND delivery_status = 'delivered'), 0),
    'cost_this_month', COALESCE((SELECT SUM(effective_cost) FROM base_orders WHERE created_at >= date_trunc('month', now()) AND delivery_status = 'delivered'), 0),
    'total_profit', COALESCE((SELECT SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FROM period_orders WHERE delivery_status = 'delivered'), 0),
    'totalSales', COALESCE((SELECT SUM(selling_price) FROM period_orders WHERE delivery_status = 'delivered'), 0),
    'totalCost', COALESCE((SELECT SUM(effective_cost) FROM period_orders WHERE delivery_status = 'delivered'), 0),
    'totalCount', COALESCE((SELECT COUNT(*) FROM period_orders WHERE delivery_status = 'delivered'), 0)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT ''::text,
  p_status text DEFAULT 'all'::text,
  p_period text DEFAULT 'today'::text,
  p_provider_id text DEFAULT 'all'::text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
  date_to TIMESTAMPTZ;
  query_offset INTEGER;
  normalized_status text;
  normalized_provider text;
BEGIN
  query_offset := p_page * p_page_size;
  normalized_status := lower(COALESCE(p_status, 'all'));
  normalized_provider := COALESCE(p_provider_id, 'all');

  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now()); date_to := now();
    WHEN 'yesterday' THEN date_from := date_trunc('day', now()) - interval '1 day'; date_to := date_trunc('day', now());
    WHEN 'week' THEN date_from := date_trunc('week', now()); date_to := now();
    WHEN 'month' THEN date_from := date_trunc('month', now()); date_to := now();
    WHEN 'year' THEN date_from := date_trunc('year', now()); date_to := now();
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ; date_to := now();
  END CASE;

  WITH filtered_orders AS (
    SELECT
      o.id,
      o.customer_phone,
      o.package_name,
      o.data_amount,
      o.selling_price,
      o.status,
      o.delivery_status,
      o.created_at,
      o.package_id,
      o.provider_id,
      public.resolve_order_cost(o.cost_price, o.package_id, o.provider_id, o.package_name, o.data_amount) AS effective_cost,
      COALESCE(pc.evoucher_rate, 0) AS evoucher_rate,
      o.sender_phone,
      o.receiver_phone,
      pc.provider_name
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON o.provider_id = pc.id
    WHERE o.created_at >= date_from
      AND o.created_at <= date_to
      AND (normalized_provider = 'all' OR o.provider_id::text = normalized_provider)
      AND (
        normalized_status = 'all'
        OR (normalized_status IN ('completed', 'delivered') AND o.delivery_status = 'delivered')
        OR (normalized_status = 'pending' AND (o.delivery_status = 'pending' OR o.delivery_status IS NULL OR o.status IN ('pending', 'queued', 'payment_confirmed')))
        OR (normalized_status = 'failed' AND o.delivery_status = 'failed')
        OR o.delivery_status = normalized_status
      )
      AND (
        p_search = ''
        OR o.customer_phone ILIKE '%' || p_search || '%'
        OR COALESCE(o.sender_phone, '') ILIKE '%' || p_search || '%'
        OR COALESCE(o.receiver_phone, '') ILIKE '%' || p_search || '%'
      )
  )
  SELECT json_build_object(
    'rows', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          id,
          customer_phone,
          package_name,
          data_amount,
          selling_price,
          status,
          delivery_status,
          created_at,
          package_id,
          provider_id,
          effective_cost AS cost_price,
          evoucher_rate,
          sender_phone,
          receiver_phone,
          provider_name
        FROM filtered_orders
        ORDER BY created_at DESC
        LIMIT p_page_size OFFSET query_offset
      ) t
    ), '[]'::json),
    'total_count', (SELECT COUNT(*) FROM filtered_orders),
    'total_sales', COALESCE((SELECT SUM(selling_price) FROM filtered_orders WHERE delivery_status = 'delivered'), 0),
    'total_cost', COALESCE((SELECT SUM(effective_cost) FROM filtered_orders WHERE delivery_status = 'delivered'), 0),
    'total_profit', COALESCE((SELECT SUM((selling_price * (1 + evoucher_rate)) - effective_cost) FROM filtered_orders WHERE delivery_status = 'delivered'), 0)
  ) INTO result;

  RETURN result;
END;
$function$;