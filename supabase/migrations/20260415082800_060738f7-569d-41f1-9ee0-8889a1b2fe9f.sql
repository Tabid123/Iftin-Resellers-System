-- Drop old time-based trigger functions with CASCADE to remove dependent triggers
DROP FUNCTION IF EXISTS public.filter_najax_double_fire() CASCADE;
DROP FUNCTION IF EXISTS public.filter_najax_double_fire_v2() CASCADE;
DROP FUNCTION IF EXISTS public.protect_iftin_from_duplicates() CASCADE;