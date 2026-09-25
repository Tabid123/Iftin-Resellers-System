-- Enable Realtime Postgres Changes for the delivery agent.
-- RLS remains authoritative; the Android agent authenticates with its user JWT.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_queue'
  ) then
    alter publication supabase_realtime add table public.delivery_queue;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ussd_package_discoveries'
  ) then
    alter publication supabase_realtime add table public.ussd_package_discoveries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bulk_sms_queue'
  ) then
    alter publication supabase_realtime add table public.bulk_sms_queue;
  end if;
end $$;
