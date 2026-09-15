-- Fix search_path security issue for update_sim_balance_timestamp function
CREATE OR REPLACE FUNCTION public.update_sim_balance_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$;