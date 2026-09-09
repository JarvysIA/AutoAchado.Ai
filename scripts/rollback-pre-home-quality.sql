-- Emergency compatibility rollback. Preserve every observation, assessment and audit row.
-- Revert the application deployment too. This does not reconstruct historical membership changes.
BEGIN;
DROP TRIGGER IF EXISTS commercial_health_after_run ON public.commercial_collection_runs;
create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare promoted integer; capacity integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity into capacity from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled;
 if capacity is null then return 0; end if;
 with eligible as (
  select q.source_key,q.best_position,q.first_seen_at,
   row_number() over(partition by w.identity_key order by q.best_position,q.first_seen_at,q.source_key) as identity_slot
  from commercial_candidate_queue q join commercial_watchlist w using(source_key)
  where q.state='QUALIFIED' and not w.monitor
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   and not exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE'
    and m.monitor and m.identity_key=w.identity_key)
 ), selected as (
  select source_key from eligible where identity_slot=1 order by best_position,first_seen_at,source_key
  limit greatest(0,capacity-(select count(*)::integer from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor))
 ), updated as (
  update commercial_watchlist w set monitor=true from selected s where w.source_key=s.source_key returning w.source_key
 )
 update commercial_candidate_queue q set state='MONITORED',reason=null from updated u where q.source_key=u.source_key;
 get diagnostics promoted=row_count;
 return promoted;
end $$;


COMMIT;
