-- Keep tenant-id-bearing *212* discovery RPCs backend-only.
-- Supabase role grants can survive REVOKE FROM PUBLIC when anon/authenticated
-- were granted EXECUTE directly, so revoke those roles explicitly.

REVOKE EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_package_discovery(uuid,uuid)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid,uuid)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text)
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text)
  TO service_role;
