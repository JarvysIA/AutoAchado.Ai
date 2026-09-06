alter table public.commercial_watchlist add column priority_until timestamptz,
 add column next_priority_check timestamptz,
 add column priority_reason text;
alter table public.commercial_collection_runs add column kind text not null default 'HISTORY',
 add column explored integer not null default 0,
 add column exploration_failed integer not null default 0;
create index commercial_priority_due on public.commercial_watchlist(next_priority_check) where monitor;

-- Newly qualified products receive a short trial in the priority queue.
create function public.activate_candidate_priority() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.state='MONITORED' and old.state='QUALIFIED' then
  update commercial_watchlist set priority_until=now()+interval '8 hours',next_priority_check=now(),priority_reason='NEW_QUALIFIED_CANDIDATE'
   where source_key=new.source_key and monitor;
 end if;
 return new;
end $$;
create trigger commercial_candidate_priority after update on public.commercial_candidate_queue
 for each row execute function public.activate_candidate_priority();
revoke all on function public.activate_candidate_priority() from public,anon,authenticated;

create or replace function public.commercial_coverage() returns jsonb
language sql security invoker set search_path=public as $$
 select jsonb_build_object(
 'pending',(select count(*) from commercial_candidate_queue where state in ('PENDING','RETRY')),
 'evaluated',(select count(*) from commercial_candidate_queue where evaluated_at is not null),
 'waiting',(select count(*) from commercial_candidate_queue where state='QUALIFIED'),
 'monitored',(select count(*) from commercial_watchlist where monitor),
 'fresh',(select count(*) from commercial_watchlist where monitor and last_collected_at>=now()-interval '24 hours'),
 'comparable',(select count(*) from commercial_watchlist where monitor and preview->>'comparable'='true'),
 'discovered',(select count(*) from commercial_candidate_queue),
 'categories_failed',(select count(*) from discovery_category_progress where status='FAILED'),
 'categories_without_ranking',(select count(*) from discovery_category_progress where status='NO_RANKING'),
 'priority_active',(select count(*) from commercial_watchlist where monitor and priority_until>now()),
 'last_priority',(select jsonb_build_object('started_at',started_at,'status',status,'collected',collected,'failed',failed)
  from commercial_collection_runs where kind='PRIORITY' order by started_at desc limit 1));
$$;
