-- Separate admission from historical monitoring. Existing observations are untouched.
create table public.commercial_candidate_queue (
 source_key text primary key,
 product_id text not null,
 type text not null check(type in ('PRODUCT','ITEM','USER_PRODUCT')),
 category_id text not null,
 snapshot jsonb not null,
 best_position integer not null,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null,
 next_check_at timestamptz not null default now(),
 attempts integer not null default 0,
 state text not null default 'PENDING' check(state in ('PENDING','RETRY','QUALIFIED','MONITORED','REJECTED')),
 reason text,
 evaluated_at timestamptz
);
create index commercial_candidate_due on public.commercial_candidate_queue(state,next_check_at,best_position);
alter table public.commercial_candidate_queue enable row level security;
revoke all on public.commercial_candidate_queue from public,anon,authenticated;
grant select,insert,update on public.commercial_candidate_queue to service_role;

create or replace function public.seed_commercial_watchlist() returns integer
language plpgsql security invoker set search_path=public as $$
declare inserted integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 with latest as (
  select distinct on(h.type,h.product_id) h.*,c.external_category_id
  from highlight_snapshots h join marketplace_categories c using(marketplace_category_id)
  where h.observed_at >= now()-interval '7 days'
  order by h.type,h.product_id,h.observed_at desc,h.position
 )
 insert into commercial_candidate_queue(source_key,product_id,type,category_id,snapshot,best_position,last_seen_at,state)
 select type||':'||product_id,product_id,type,external_category_id,
  jsonb_build_object('product_id',product_id,'type',type,'position',position,'priority_tier',priority_tier,'observed_at',observed_at),
  coalesce(position,20),observed_at,
  case when exists(select 1 from commercial_watchlist w where w.source_key=latest.type||':'||latest.product_id and w.monitor) then 'MONITORED'
   when exists(select 1 from commercial_watchlist w where w.source_key=latest.type||':'||latest.product_id) then 'REJECTED' else 'PENDING' end
 from latest
 on conflict(source_key) do update set last_seen_at=excluded.last_seen_at,
  best_position=excluded.best_position,snapshot=excluded.snapshot;
 get diagnostics inserted=row_count;
 return inserted;
end $$;

-- Automatic promotion is capacity-bounded and serialized.
create function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare promoted integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 with eligible as (
  select q.source_key,q.best_position,q.first_seen_at,
   row_number() over(partition by w.identity_key order by q.best_position,q.first_seen_at,q.source_key) as identity_slot
  from commercial_candidate_queue q
  join commercial_watchlist w using(source_key)
  where q.state='QUALIFIED' and not w.monitor
   and not exists(select 1 from commercial_feedback f where f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   and not exists(select 1 from commercial_watchlist active where active.monitor and active.identity_key=w.identity_key)
 ), selected as (
  select source_key from eligible where identity_slot=1 order by best_position,first_seen_at,source_key
  limit greatest(0,96-(select count(*)::integer from commercial_watchlist where monitor))
 ), updated as (
  update commercial_watchlist w set monitor=true from selected s where w.source_key=s.source_key returning w.source_key
 )
 update commercial_candidate_queue q set state='MONITORED',reason=null from updated u where q.source_key=u.source_key;
 get diagnostics promoted=row_count;
 return promoted;
end $$;
revoke all on function public.promote_commercial_candidates() from public,anon,authenticated;
grant execute on function public.promote_commercial_candidates() to service_role;

create function public.commercial_coverage() returns jsonb
language sql security invoker set search_path=public as $$
 select jsonb_build_object(
 'pending',(select count(*) from commercial_candidate_queue where state in ('PENDING','RETRY')),
 'evaluated',(select count(*) from commercial_candidate_queue where evaluated_at is not null),
 'waiting',(select count(*) from commercial_candidate_queue where state='QUALIFIED'),
 'monitored',(select count(*) from commercial_watchlist where monitor),
 'fresh',(select count(*) from commercial_watchlist where monitor and last_collected_at>=now()-interval '24 hours'),
 'comparable',(select count(*) from commercial_watchlist where monitor and preview->>'comparable'='true'),
 'discovered',(select count(*) from commercial_candidate_queue));
$$;
revoke all on function public.commercial_coverage() from public,anon,authenticated;
grant execute on function public.commercial_coverage() to service_role;
