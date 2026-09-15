
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT '',
  p_status text DEFAULT 'all',
  p_provider_id text DEFAULT 'all',
  p_period text DEFAULT 'today',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now() AT TIME ZONE 'Africa/Mogadishu';
  v_start timestamptz;
  v_end timestamptz;
  v_result json;
  v_total_count bigint;
  v_total_sales numeric;
  v_total_profit numeric;
BEGIN
  -- Determine date range based on period
  IF p_period = 'today' THEN
    v_start := date_trunc('day', v_now)::timestamptz AT TIME ZONE 'Africa/Mogadishu';
    v_end := NULL;
  ELSIF p_period = 'yesterday' THEN
    v_start := (date_trunc('day', v_now) - interval '1 day')::timestamptz AT TIME ZONE 'Africa/Mogadishu';
    v_end := date_trunc('day', v_now)::timestamptz AT TIME ZONE 'Africa/Mogadishu';
  ELSIF p_period = 'week' THEN
    v_start := (v_now - interval '7 days')::timestamptz AT TIME ZONE 'Africa/Mogadishu';
    v_end := NULL;
  ELSIF p_period = 'month' THEN
    v_start := date_trunc('month', v_now)::timestamptz AT TIME ZONE 'Africa/Mogadishu';
    v_end := NULL;
  ELSIF p_period = 'year' THEN
    v_start := date_trunc('year', v_now)::timestamptz AT TIME ZONE 'Africa/Mogadishu';
    v_end := NULL;
  ELSE
    v_start := NULL;
    v_end := NULL;
  END IF;

  -- Get total count and aggregates
  SELECT 
    count(*),
    coalesce(sum(CASE WHEN o.status = 'completed' THEN o.selling_price ELSE 0 END), 0),
    coalesce(sum(CASE WHEN o.status = 'completed' THEN 
      (o.selling_price * (1 + coalesce(pc.evoucher_rate, 0))) - coalesce(dp.cost_price, 0)
    ELSE 0 END), 0)
  INTO v_total_count, v_total_sales, v_total_profit
  FROM orders o
  LEFT JOIN providers_config pc ON pc.id = o.provider_id
  LEFT JOIN data_packages_config dp ON dp.id = o.package_id
  WHERE o.status != 'canceled' 
    AND o.status != 'cancelled' 
    AND coalesce(o.delivery_status, '') != 'cancelled'
    AND (p_status = 'all' OR o.status = p_status)
    AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
    AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' 
         OR o.receiver_phone ILIKE '%' || p_search || '%'
         OR o.sender_phone ILIKE '%' || p_search || '%'
         OR o.id::text ILIKE '%' || p_search || '%')
    AND (v_start IS NULL OR o.created_at >= v_start)
    AND (v_end IS NULL OR o.created_at < v_end);

  -- Build result with paginated rows
  SELECT json_build_object(
    'total_count', v_total_count,
    'total_sales', v_total_sales,
    'total_profit', v_total_profit,
    'rows', coalesce((
      SELECT json_agg(row_data ORDER BY created_at DESC)
      FROM (
        SELECT json_build_object(
          'id', o.id,
          'customer_phone', o.customer_phone,
          'sender_phone', o.sender_phone,
          'receiver_phone', o.receiver_phone,
          'package_name', o.package_name,
          'data_amount', o.data_amount,
          'selling_price', o.selling_price,
          'status', o.status,
          'delivery_status', o.delivery_status,
          'created_at', o.created_at,
          'package_id', o.package_id,
          'provider_id', o.provider_id,
          'cost_price', coalesce(dp.cost_price, 0),
          'evoucher_rate', coalesce(pc.evoucher_rate, 0),
          'provider_name', coalesce(pc.provider_name, 'Unknown')
        ) as row_data,
        o.created_at
        FROM orders o
        LEFT JOIN providers_config pc ON pc.id = o.provider_id
        LEFT JOIN data_packages_config dp ON dp.id = o.package_id
        WHERE o.status != 'canceled' 
          AND o.status != 'cancelled' 
          AND coalesce(o.delivery_status, '') != 'cancelled'
          AND (p_status = 'all' OR o.status = p_status)
          AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
          AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%'
               OR o.receiver_phone ILIKE '%' || p_search || '%'
               OR o.sender_phone ILIKE '%' || p_search || '%'
               OR o.id::text ILIKE '%' || p_search || '%')
          AND (v_start IS NULL OR o.created_at >= v_start)
          AND (v_end IS NULL OR o.created_at < v_end)
        ORDER BY o.created_at DESC
        LIMIT p_limit
        OFFSET p_offset
      ) sub
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
