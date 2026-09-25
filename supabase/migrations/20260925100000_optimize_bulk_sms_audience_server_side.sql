create or replace function public.bulk_sms_recipient_count(p_target_type text default 'all')
returns integer
language sql
stable
security invoker
set search_path = public
as $$
with tenant as (select public.effective_tenant_id() as id),
phones as (
  select distinct right(regexp_replace(phone, '\D', '', 'g'), 9) as phone
  from (
    select o.customer_phone as phone
    from public.orders o join tenant t on t.id=o.tenant_id
    where coalesce(o.customer_phone,'') <> ''
    union all
    select v.phone_number
    from public.verified_phones v join tenant t on t.id=v.tenant_id
    where coalesce(v.phone_number,'') <> ''
  ) s
),
filtered as (
  select phone from phones
  where length(phone)=9
    and (
      coalesce(p_target_type,'all')='all'
      or (p_target_type='hormuud' and (phone like '61%' or phone like '77%'))
      or (p_target_type='somtel' and phone like '62%')
      or (p_target_type='somnet' and phone like '68%')
      or (p_target_type='amtel' and phone like '71%')
      or (p_target_type='somlink' and phone like '64%')
    )
)
select count(*)::int from filtered;
$$;

create or replace function public.create_bulk_sms_audience_campaign(
  p_message text,
  p_target_type text,
  p_device_id text,
  p_sim_slot integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.effective_tenant_id();
  v_campaign uuid;
  v_count integer;
begin
  if v_tenant is null then raise exception 'Tenant not resolved'; end if;
  if nullif(trim(p_message),'') is null then raise exception 'Message is required'; end if;
  if nullif(trim(p_device_id),'') is null then raise exception 'Device is required'; end if;
  if p_sim_slot not in (1,2) then raise exception 'Invalid SIM slot'; end if;
  if p_target_type not in ('all','hormuud','somtel','somnet','amtel','somlink') then raise exception 'Invalid target type'; end if;

  insert into public.bulk_sms_campaigns(tenant_id,message,target_type,total_recipients,status,device_id,sim_slot)
  values(v_tenant,trim(p_message),p_target_type,0,'sending',p_device_id,p_sim_slot)
  returning id into v_campaign;

  with phones as (
    select distinct right(regexp_replace(phone, '\D', '', 'g'), 9) as phone
    from (
      select o.customer_phone as phone from public.orders o
      where o.tenant_id=v_tenant and coalesce(o.customer_phone,'') <> ''
      union all
      select v.phone_number from public.verified_phones v
      where v.tenant_id=v_tenant and coalesce(v.phone_number,'') <> ''
    ) s
  ),
  filtered as (
    select phone from phones
    where length(phone)=9
      and (
        p_target_type='all'
        or (p_target_type='hormuud' and (phone like '61%' or phone like '77%'))
        or (p_target_type='somtel' and phone like '62%')
        or (p_target_type='somnet' and phone like '68%')
        or (p_target_type='amtel' and phone like '71%')
        or (p_target_type='somlink' and phone like '64%')
      )
  ),
  ins as (
    insert into public.bulk_sms_queue(tenant_id,campaign_id,phone_number,device_id,sim_slot,status)
    select v_tenant,v_campaign,phone,p_device_id,p_sim_slot,'pending'
    from filtered
    returning 1
  )
  select count(*)::int into v_count from ins;

  update public.bulk_sms_campaigns
  set total_recipients=v_count,status=case when v_count>0 then 'sending' else 'failed' end
  where id=v_campaign and tenant_id=v_tenant;

  return jsonb_build_object('campaign_id',v_campaign,'total_recipients',v_count);
end;
$$;

revoke all on function public.bulk_sms_recipient_count(text) from public;
grant execute on function public.bulk_sms_recipient_count(text) to authenticated;
revoke all on function public.create_bulk_sms_audience_campaign(text,text,text,integer) from public;
grant execute on function public.create_bulk_sms_audience_campaign(text,text,text,integer) to authenticated;
