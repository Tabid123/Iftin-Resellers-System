-- Fix get_admin_provider_daily_stats: only count delivered orders
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
      COUNT(o.id) FILTER (WHERE o.delivery_status = 'delivered') as order_count,
      COALESCE(SUM(o.selling_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as revenue,
      COALESCE(SUM(o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as cost,
      COALESCE(SUM((o.selling_price * (1 + COALESCE(pc.evoucher_rate, 0))) - o.cost_price) FILTER (WHERE o.delivery_status = 'delivered'), 0) as profit
    FROM providers_config pc
    INNER JOIN orders o ON o.provider_id = pc.id
      AND o.created_at >= p_date::timestamptz
      AND o.created_at < (p_date + 1)::timestamptz
    WHERE pc.is_active = true
    GROUP BY pc.id, pc.provider_name, pc.provider_logo, pc.evoucher_rate
    HAVING COUNT(o.id) FILTER (WHERE o.delivery_status = 'delivered') > 0
    ORDER BY pc.display_order
  ) s;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;