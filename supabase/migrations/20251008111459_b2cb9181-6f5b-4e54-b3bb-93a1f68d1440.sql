-- Fix the search_path security warning for existing functions
-- This prevents potential SQL injection attacks

-- Update has_role function to set search_path explicitly
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- Update handle_new_user function to set search_path explicitly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  user_count INTEGER;
BEGIN
  -- Hubi inta user ah ee jira
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- Haddii user-kan uu yahay kan ugu horreeya, admin ka dhig
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
  END IF;
  
  RETURN NEW;
END;
$function$;