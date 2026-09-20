-- Keep one PostgREST-callable storefront_save_offline_registration function.
-- The legacy 4-argument overload conflicts with the 6-argument function whose
-- package arguments are optional, causing PostgREST "best candidate function"
-- ambiguity for Offline Reg saves.
drop function if exists public.storefront_save_offline_registration(text,text,uuid,text);
