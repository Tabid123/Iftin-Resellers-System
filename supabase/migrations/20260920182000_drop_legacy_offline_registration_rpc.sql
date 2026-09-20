-- Remove legacy overloaded RPC. Supabase/PostgREST does not support overloaded
-- functions reliably for RPC dispatch; keep only the package-aware six-argument version.
drop function if exists public.storefront_save_offline_registration(text,text,uuid,text);
