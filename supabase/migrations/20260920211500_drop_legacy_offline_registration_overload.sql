-- Remove legacy overload that makes PostgREST RPC resolution ambiguous.
drop function if exists public.storefront_save_offline_registration(text,text,uuid,text);
