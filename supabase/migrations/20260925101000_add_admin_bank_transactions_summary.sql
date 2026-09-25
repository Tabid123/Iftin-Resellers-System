create or replace function public.get_admin_bank_transactions_summary(
  p_start timestamptz default null,
  p_status text default null,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with tenant as (select public.effective_tenant_id() as id),
rows as (
  select b.match_status,b.tran_amt,b.dr_cr
  from public.bank_transactions b
  join tenant t on t.id=b.tenant_id
  where (p_start is null or b.created_at >= p_start)
    and (coalesce(p_status,'all')='all' or b.match_status=p_status)
    and (
      coalesce(trim(p_search),'')=''
      or coalesce(b.tran_no,'') ilike '%'||trim(p_search)||'%'
      or coalesce(b.customer_name,'') ilike '%'||trim(p_search)||'%'
      or coalesce(b.parsed_sender_phone,'') ilike '%'||trim(p_search)||'%'
      or coalesce(b.parsed_receiver_phone,'') ilike '%'||trim(p_search)||'%'
      or coalesce(b.narration,'') ilike '%'||trim(p_search)||'%'
    )
)
select jsonb_build_object(
  'total',count(*)::int,
  'matched',count(*) filter (where match_status in ('matched','manual_matched'))::int,
  'unmatched',count(*) filter (where match_status='unmatched')::int,
  'total_amount',coalesce(sum(tran_amt) filter (where dr_cr='cr' or dr_cr is null),0)
)
from rows;
$$;
revoke all on function public.get_admin_bank_transactions_summary(timestamptz,text,text) from public;
grant execute on function public.get_admin_bank_transactions_summary(timestamptz,text,text) to authenticated;
