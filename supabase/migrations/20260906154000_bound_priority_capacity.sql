create function public.request_commercial_priority(candidate_key text,request_reason text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare active_already boolean; changed integer;
begin
 if request_reason not in ('NEW_QUALIFIED_CANDIDATE','OBSERVED_PRICE_DROP') then raise exception 'INVALID_PRIORITY_REASON'; end if;
 perform pg_advisory_xact_lock(hashtext('commercial-priority-capacity'));
 select priority_until>now() into active_already from commercial_watchlist where source_key=candidate_key and monitor;
 if not coalesce(active_already,false) and (select count(*) from commercial_watchlist where monitor and priority_until>now())>=6 then return false; end if;
 update commercial_watchlist set priority_until=now()+interval '8 hours',next_priority_check=now(),priority_reason=request_reason
 where source_key=candidate_key and monitor;
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.request_commercial_priority(text,text) from public,anon,authenticated;
grant execute on function public.request_commercial_priority(text,text) to service_role;

create or replace function public.activate_candidate_priority() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.state='MONITORED' and old.state='QUALIFIED' then
  perform request_commercial_priority(new.source_key,'NEW_QUALIFIED_CANDIDATE');
 end if;
 return new;
end $$;
-- Only the temporary fast lane is bounded; historical monitoring is preserved.
with excess as (
 select source_key,row_number() over(order by next_priority_check,source_key) as slot
 from commercial_watchlist where monitor and priority_until>now()
)
update commercial_watchlist w set priority_until=now()
from excess e where w.source_key=e.source_key and e.slot>6;
