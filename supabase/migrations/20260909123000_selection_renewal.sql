-- Begin legacy tenure conservatively at activation; never invent earlier monitoring.
alter table public.commercial_vertical_memberships add column monitor_since timestamptz default now();
create function public.track_commercial_monitor_tenure() returns trigger
language plpgsql set search_path=public as $$
begin
 if not new.monitor then new.monitor_since=null;
 elsif tg_op='INSERT' then new.monitor_since=now();
 elsif not old.monitor then new.monitor_since=now();
 else new.monitor_since=old.monitor_since; end if;
 return new;
end $$;
create trigger commercial_monitor_tenure before insert or update on public.commercial_vertical_memberships
 for each row execute function public.track_commercial_monitor_tenure();

create table public.commercial_selection_assessments (
 identity_key text primary key, source_key text not null references public.commercial_watchlist,
 family text not null, score integer not null check(score between 0 and 100),
 demand_days integer not null check(demand_days between 0 and 15),eligible boolean not null,
 preview_checked_at text, assessed_at timestamptz not null,evidence jsonb not null
);
alter table public.commercial_selection_assessments enable row level security;
revoke all on public.commercial_selection_assessments from public,anon,authenticated;
grant select,insert,update,delete on public.commercial_selection_assessments to service_role;
alter table public.commercial_cohort_changes add column evidence jsonb;

create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare capacity integer; family_limit integer; replacement_limit integer; promoted integer:=0;
 candidate record; victim record; family_count integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity,family_capacity,daily_replacement_limit into capacity,family_limit,replacement_limit
 from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled and executor_ready;
 if capacity is null then return 0; end if;
 -- Protection writes are serialized with selection, including direct sent-state writes.
 lock table commercial_vertical_feedback,commercial_sent_products in share row exclusive mode;
 update commercial_candidate_queue q set state='RETRY',reason='SELECTION_FRESHNESS_RECHECK',next_check_at=now()
 from commercial_watchlist w where q.source_key=w.source_key and q.state='QUALIFIED' and not w.monitor
  and (w.preview->>'priceCheckedAt' is null or (w.preview->>'priceCheckedAt')::timestamptz<now()-interval '24 hours');
 for candidate in
  select s.*,w.preview from commercial_selection_assessments s
   join commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
   join commercial_candidate_queue q on q.source_key=w.source_key
   join commercial_editorial_assessments a on a.source_key=w.source_key and a.vertical_key='AUTOMOTIVE'
  where s.eligible and s.score>=60 and s.demand_days>=3 and not w.monitor and q.state='QUALIFIED'
   and s.assessed_at between now()-interval '15 minutes' and now()
   and s.preview_checked_at=w.preview->>'priceCheckedAt'
   and a.state='ELIGIBLE' and a.identity_key=w.identity_key and a.valid_until>now()
   and a.preview_checked_at=w.preview->>'priceCheckedAt' and a.family=s.family
   and w.preview->>'seller_id' is not null
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   and not exists(select 1 from commercial_cohort_changes c where c.removed_source=w.source_key)
  order by s.score desc,s.identity_key,s.source_key
 loop
  if exists(select 1 from commercial_vertical_memberships where vertical_key='AUTOMOTIVE'
    and identity_key=candidate.identity_key and monitor) then continue; end if;
  select count(*) into family_count from commercial_vertical_memberships m
   left join commercial_selection_assessments s using(identity_key)
   where m.vertical_key='AUTOMOTIVE' and m.monitor and coalesce(s.family,'avaliar')=candidate.family;
  select null::text as source_key,null::integer as score,null::text as family,null::jsonb as evidence into victim;
  if (select count(*) from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor)>=capacity then
   if candidate.demand_days<7 or (select count(*) from commercial_cohort_changes where vertical_key='AUTOMOTIVE'
     and changed_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')>=replacement_limit then continue; end if;
   select m.source_key,s.score,s.family,s.evidence into victim
    from commercial_vertical_memberships m join commercial_selection_assessments s using(identity_key)
    where m.vertical_key='AUTOMOTIVE' and m.monitor and m.monitor_since<=now()-interval '7 days'
     and s.assessed_at between now()-interval '15 minutes' and now() and candidate.score-s.score>=10
     and (family_count<family_limit or (family_count=family_limit and s.family=candidate.family))
     and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key=m.vertical_key
       and f.identity_key=m.identity_key and f.action in ('INTERESTED','SHARED'))
     and not exists(select 1 from commercial_sent_products p where p.vertical_key=m.vertical_key
       and p.identity_key=m.identity_key and p.sent_at is not null)
    order by s.score,m.source_key limit 1;
   if victim.source_key is null then continue; end if;
   update commercial_watchlist set monitor=false where source_key=victim.source_key;
  elsif family_count>=family_limit then continue;
  end if;
  insert into commercial_observations(identity_key,source_key,observed_at,observed_day,price,currency,seller_id,comparable,trusted,position)
   values(candidate.identity_key,candidate.source_key,(candidate.preview->>'priceCheckedAt')::timestamptz,
    ((candidate.preview->>'priceCheckedAt')::timestamptz at time zone 'UTC')::date,
    (candidate.preview->>'price')::numeric,'BRL',candidate.preview->>'seller_id',true,true,null)
   on conflict(source_key,observed_at) do nothing;
  update commercial_watchlist set monitor=true,next_evidence_check=now(),
   last_valid_price_at=(candidate.preview->>'priceCheckedAt')::timestamptz where source_key=candidate.source_key;
  update commercial_candidate_queue set state='MONITORED',reason=null where source_key=candidate.source_key;
  if victim.source_key is not null then
   insert into commercial_cohort_changes(vertical_key,removed_source,added_source,reason,evidence)
    values('AUTOMOTIVE',victim.source_key,candidate.source_key,'RECURRING_POTENTIAL_ADVANTAGE',
     jsonb_build_object('before',victim.evidence,'after',candidate.evidence,'advantage',candidate.score-victim.score));
  end if;
  promoted:=promoted+1;
 end loop;
 return promoted;
end $$;

create function public.refresh_commercial_selection(assessments jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
begin
 if jsonb_typeof(assessments)<>'array' or jsonb_array_length(assessments)>10000 then raise exception 'SELECTION_INVALID_GENERATION'; end if;
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 delete from commercial_selection_assessments;
 insert into commercial_selection_assessments
  select s.* from jsonb_populate_recordset(null::commercial_selection_assessments,assessments) s
  join commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
  where exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 return promote_commercial_candidates();
end $$;
revoke all on function public.refresh_commercial_selection(jsonb) from public,anon,authenticated;
grant execute on function public.refresh_commercial_selection(jsonb) to service_role;

-- Read-only, scoped and internally consistent inputs for the experimental simulator.
create or replace function public.commercial_selection_inputs(reference_time timestamptz,history_start timestamptz) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare payload jsonb; snapshot_count bigint;
begin
 if reference_time is null or history_start is null or reference_time>now()+interval '1 minute'
  or history_start>reference_time or history_start<reference_time-interval '150 days' then
  raise exception 'SELECTION_INVALID_WINDOW';
 end if;
 select count(*) into snapshot_count from highlight_snapshots h join scan_runs r using(run_id)
  where r.vertical_key='AUTOMOTIVE' and h.observed_at between reference_time-interval '14 days' and reference_time;
 if snapshot_count>250000 or (select count(*) from commercial_watchlist)>10000
  or (select count(*) from commercial_observations where observed_at between history_start and reference_time)>200000 then
  raise exception 'SELECTION_INPUT_LIMIT';
 end if;
 with scoped_watches as (
  select w.source_key,w.identity_key,w.preview,w.monitor from commercial_watchlist w
  where exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE' and m.identity_key=w.identity_key)
 ), daily as (
  select h.type,h.product_id,h.marketplace_category_id,min(h.position) as position,max(h.observed_at) as observed_at
   from highlight_snapshots h join scan_runs r using(run_id)
   where r.vertical_key='AUTOMOTIVE' and h.observed_at between reference_time-interval '14 days' and reference_time
    and h.position between 1 and 20
   group by h.type,h.product_id,h.marketplace_category_id,(h.observed_at at time zone 'UTC')::date
 ) select jsonb_build_object(
  'snapshot_occurrences',snapshot_count,
  'snapshots',coalesce((select jsonb_agg(d) from daily d),'[]'::jsonb),
  'watches',coalesce((select jsonb_agg(w) from scoped_watches w),'[]'::jsonb),
  'memberships',coalesce((select jsonb_agg(m) from (select source_key,identity_key,monitor,monitor_since from commercial_vertical_memberships where vertical_key='AUTOMOTIVE')m),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(f) from (select identity_key,action from commercial_vertical_feedback where vertical_key='AUTOMOTIVE')f),'[]'::jsonb),
  'sent',coalesce((select jsonb_agg(s) from (select identity_key,sent_at from commercial_sent_products where vertical_key='AUTOMOTIVE' and sent_at is not null)s),'[]'::jsonb),
  'changes',coalesce((select jsonb_agg(c order by c.changed_at,c.id) from (select id,added_source,changed_at from commercial_cohort_changes where vertical_key='AUTOMOTIVE')c),'[]'::jsonb),
  'observations',coalesce((select jsonb_agg(o) from (select identity_key,observed_at,price,currency,seller_id,comparable,trusted,position
   from commercial_observations o where observed_at between history_start and reference_time
    and exists(select 1 from scoped_watches w where w.identity_key=o.identity_key))o),'[]'::jsonb)
 ) into payload;
 return payload;
end $$;
revoke all on function public.commercial_selection_inputs(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.commercial_selection_inputs(timestamptz,timestamptz) to service_role;

