create or replace function public.delivery_queue_classify_clear_provider_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response text := lower(coalesce(new.provider_response, ''));
begin
  if new.status = 'completed'
     and v_response like '%unrecognized mobile number%' then
    new.status := 'failed';
    new.completed_at := null;
    new.error_message := coalesce(
      nullif(new.error_message, ''),
      'Provider rejected delivery: Unrecognized mobile number.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_delivery_queue_classify_clear_provider_failure on public.delivery_queue;
create trigger trg_delivery_queue_classify_clear_provider_failure
before update of status, provider_response on public.delivery_queue
for each row
execute function public.delivery_queue_classify_clear_provider_failure();
