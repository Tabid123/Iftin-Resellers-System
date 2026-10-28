-- Regression test against a database at the schema version BEFORE this migration.
-- Run with: psql "$TEST_DATABASE_URL" -f tests/delivery-processing-timeout.sql
-- All fixtures, schema changes and maintenance are rolled back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '25s';
-- No live phone, payment, package configuration, or external API is used.
create temporary table delivery_timeout_fixtures (name text primary key, id uuid);
do $$
declare
  ta uuid := gen_random_uuid();
  tb uuid := gen_random_uuid();
  oid uuid;
  qid uuid;
  scenario text;
begin
  insert into public.tenants(id,slug,name,status) values
    (ta,'timeout-test-'||ta,'Timeout test A','active'),
    (tb,'timeout-test-'||tb,'Timeout test B','active');
  insert into delivery_timeout_fixtures values ('tenant_a',ta),('tenant_b',tb);
  insert into public.android_devices(device_id,device_name,sim_number,provider_name,tenant_id,sim1_provider,sim2_provider,sim2_number,last_ping_at)
  values ('timeout-device-'||ta,'Timeout test','620000001','Somtel',ta,'Somtel','Hormuud','610000001',now()),
         ('timeout-device-'||tb,'Timeout test','620000002','Somtel',tb,'Somtel',null,null,now());
  foreach scenario in array array['undispatched','dispatched','fresh','pending','other_tenant','delivered','cancelled'] loop
    oid := gen_random_uuid(); qid := gen_random_uuid();
    insert into delivery_timeout_fixtures values (scenario||'_order',oid),(scenario||'_queue',qid);
    insert into public.orders(id,tenant_id,customer_phone,receiver_phone,package_name,selling_price,status,delivery_status)
    values (oid,case when scenario='other_tenant' then tb else ta end,'620000001','620000001','Timeout test',0,'paid',
      case when scenario='delivered' then 'delivered' when scenario='cancelled' then 'cancelled' else 'queued' end);
    insert into public.delivery_queue(id,tenant_id,order_id,receiver_phone,provider_name,ussd_code,status,android_device_id,sim_slot,created_at,last_attempt_at,dispatched_at)
    values(qid,case when scenario='other_tenant' then tb else ta end,oid,'620000001',
      case when scenario='fresh' then 'hormuud' else 'somtel' end,'*000#',
      case when scenario in ('pending','cancelled') then 'pending' else 'processing' end,
      case when scenario in ('pending','cancelled') then null else 'timeout-device-'||case when scenario='other_tenant' then tb else ta end end,
      case when scenario='fresh' then 2 else 1 end,
      now()-interval '1 day',
      case when scenario='fresh' then now()-interval '20 seconds' else now()-interval '91 seconds' end,
      case when scenario='dispatched' then now()-interval '91 seconds' else null end);
  end loop;
end $$;

\ir ../supabase/migrations/20261028143530_enforce_delivery_processing_90s_all_tenants.sql

do $$
declare
  ta uuid := (select id from delivery_timeout_fixtures where name='tenant_a');
  result jsonb;
  qid uuid;
  oid uuid;
  before_lease timestamptz;
begin
  if exists(select 1 from public.delivery_queue q join delivery_timeout_fixtures f on f.id=q.id
    where f.name in ('undispatched_queue','dispatched_queue','other_tenant_queue') and q.status<>'verification_required') then
    raise exception '90-second watchdog failed for a tenant or missing dispatch marker';
  end if;
  if not exists(select 1 from public.delivery_queue q join delivery_timeout_fixtures f on f.id=q.id
    where f.name='fresh_queue' and q.status='processing') then
    raise exception 'Fresh processing lease expired based on old queue age';
  end if;
  if exists(select 1 from public.delivery_queue q join delivery_timeout_fixtures f on f.id=q.id
    where f.name in ('delivered_queue','cancelled_queue') and q.status<>'cancelled') then
    raise exception 'Terminal order queue was not closed';
  end if;
  if not exists(select 1 from public.tenant_sim_routes(ta)
    where device_id='timeout-device-'||ta and sim_slot=1 and available) then
    raise exception 'Timed-out SIM not released';
  end if;
  result := public.claim_next_delivery('timeout-device-'||ta,array['somtel']);
  if result->>'id' is distinct from (select id::text from delivery_timeout_fixtures where name='pending_queue') then
    raise exception 'Next legitimate pending delivery not claimed: %',result;
  end if;
  qid := (result->>'id')::uuid;
  select processing_started_at into before_lease from public.delivery_queue where id=qid;
  perform private.expire_delivery_processing(ta);
  if not exists(select 1 from public.delivery_queue where id=qid and status='processing') then
    raise exception 'Old pending queue expired immediately after its first claim';
  end if;
  update public.delivery_queue set last_attempt_at=now(),processing_started_at=now()+interval '1 hour' where id=qid;
  if (select processing_started_at from public.delivery_queue where id=qid) is distinct from before_lease then
    raise exception 'Heartbeat/metadata update extended a processing lease';
  end if;
  -- Late carrier result retains the original queue identity and does not resend.
  update public.delivery_queue set status='completed',provider_response='Successful transfer to 620000001',completed_at=now()
  where id=(select id from delivery_timeout_fixtures where name='undispatched_queue');
  if not exists(select 1 from public.delivery_queue q join delivery_timeout_fixtures f on f.id=q.id
    where f.name='undispatched_queue' and q.status='completed') then
    raise exception 'Late result could not reconcile a timed-out delivery';
  end if;
  -- Manual finalization must close a claimed delivery immediately.
  select order_id into oid from public.delivery_queue where id=qid;
  update public.orders set delivery_status='delivered',delivered_at=now(),delivery_notes='Manually verified - test' where id=oid;
  if (select status from public.delivery_queue where id=qid)<>'cancelled' then
    raise exception 'Manual Delivered left a processing lock';
  end if;
  update public.delivery_queue set status='processing' where id=qid;
  if (select status from public.delivery_queue where id=qid)<>'cancelled' then
    raise exception 'Late worker update reopened final order';
  end if;
  update public.orders set status='cancelled',delivery_status='cancelled'
  where id=(select id from delivery_timeout_fixtures where name='fresh_order');
  if exists(select 1 from public.delivery_queue q join delivery_timeout_fixtures f on f.id=q.id
    where f.name='fresh_queue' and q.status<>'cancelled') then
    raise exception 'Cancel did not free a processing SIM';
  end if;
  if has_function_privilege('anon','public.expire_delivery_processing(uuid)','execute')
    or has_function_privilege('authenticated','public.expire_delivery_processing(uuid)','execute')
    or has_function_privilege('anon','private.expire_delivery_processing(uuid)','execute') then
    raise exception 'Cross-tenant maintenance exposed to a public client';
  end if;
end $$;
select 'PASS: expiration, both tenants, missing dispatch, fresh claim, SIM release, next claim, immutable lease, late result, finalization, permissions' as result;

rollback;
