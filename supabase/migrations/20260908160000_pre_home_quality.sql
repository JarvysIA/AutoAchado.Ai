-- Preparation only: HOME and the other eight verticals remain disabled.
create table public.commercial_editorial_assessments (
 vertical_key text not null references public.commercial_verticals,
 source_key text not null references public.commercial_watchlist,
 identity_key text not null,
 family text not null,
 state text not null check(state in ('ELIGIBLE','REVIEW','EXCLUDE')),
 reason text not null,
 version text not null,
 possible_variant_key text,
 assessed_at timestamptz not null,
 preview_checked_at text,
 valid_until timestamptz,
 primary key(vertical_key,source_key)
);
create table public.commercial_cohort_changes (
 id bigint generated always as identity primary key,
 vertical_key text not null references public.commercial_verticals,
 removed_source text not null references public.commercial_watchlist,
 added_source text not null references public.commercial_watchlist,
 reason text not null,
 changed_at timestamptz not null default now()
);
create table public.commercial_health_samples (
 id bigint generated always as identity primary key,
 run_id uuid unique references public.commercial_collection_runs,
 sampled_at timestamptz not null default now(),
 vertical_key text not null references public.commercial_verticals,
 monitored integer not null,
 fresh integer not null,
 retrying integer not null,
 due integer not null
);
create index commercial_health_sample_time on public.commercial_health_samples(vertical_key,sampled_at);

-- These limits control admissions, not historical approval or daily publication quotas.
alter table public.commercial_verticals
 add column family_capacity integer not null default 25 check(family_capacity between 1 and 100),
 add column daily_replacement_limit integer not null default 5 check(daily_replacement_limit between 0 and 5),
 add column history_batch_size integer not null default 25 check(history_batch_size between 1 and 25),
 add column executor_ready boolean not null default false;
update public.commercial_verticals set executor_ready=true where vertical_key='AUTOMOTIVE';
-- Explicit barrier: an enabled flag alone must not route HOME into the legacy Automotive bridge.
alter table public.commercial_verticals add constraint enabled_executor_required check(not enabled or executor_ready);

create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare capacity integer; family_limit integer; replacement_limit integer; promoted integer:=0;
 candidate record; victim text; victim_reason text; family_count integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity,family_capacity,daily_replacement_limit into capacity,family_limit,replacement_limit
 from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled and executor_ready;
 if capacity is null then return 0; end if;
 update commercial_candidate_queue q set state=case when a.state='EXCLUDE' then 'REJECTED' else 'RETRY' end,
  reason='EDITORIAL_OR_FRESHNESS_RECHECK',next_check_at=now()
 from commercial_editorial_assessments a where a.source_key=q.source_key and a.vertical_key='AUTOMOTIVE'
  and q.state='QUALIFIED' and (a.state<>'ELIGIBLE' or a.valid_until<=now());
 for candidate in
  select q.source_key,w.identity_key,a.family from commercial_candidate_queue q
   join commercial_watchlist w using(source_key)
   join commercial_editorial_assessments a on a.source_key=w.source_key and a.vertical_key='AUTOMOTIVE'
  where q.state='QUALIFIED' and not w.monitor and a.state='ELIGIBLE'
   and a.identity_key=w.identity_key and a.version='automotive-pre-home-v1'
   and a.valid_until>now() and a.assessed_at>=now()-interval '24 hours'
   and a.preview_checked_at=w.preview->>'priceCheckedAt'
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   -- Retired candidates cannot immediately cycle back into a newly freed slot.
   and not exists(select 1 from commercial_cohort_changes c where c.removed_source=w.source_key)
  order by q.best_position,q.first_seen_at,q.source_key
 loop
  if exists(select 1 from commercial_vertical_memberships where vertical_key='AUTOMOTIVE'
    and identity_key=candidate.identity_key and monitor) then continue; end if;
  select count(*) into family_count from commercial_vertical_memberships m
   join commercial_editorial_assessments a on a.source_key=m.source_key and a.vertical_key=m.vertical_key
   where m.vertical_key='AUTOMOTIVE' and m.monitor and a.family=candidate.family;
  if family_count>=family_limit then continue; end if;
  victim:=null;
  if (select count(*) from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor)>=capacity then
   if (select count(*) from commercial_cohort_changes where vertical_key='AUTOMOTIVE'
     and changed_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')>=replacement_limit then continue; end if;
   select m.source_key,case when a.state='EXCLUDE' then 'EDITORIAL_EXCLUDE' else 'FAMILY_OVERFLOW' end
    into victim,victim_reason
   from commercial_vertical_memberships m
    join commercial_editorial_assessments a on a.vertical_key=m.vertical_key and a.source_key=m.source_key
   where m.vertical_key='AUTOMOTIVE' and m.monitor and a.family<>candidate.family
    and a.version='automotive-pre-home-v1' and a.assessed_at>=now()-interval '24 hours'
    and (a.state='EXCLUDE' or (select count(*) from commercial_vertical_memberships other
      join commercial_editorial_assessments oa on oa.vertical_key=other.vertical_key and oa.source_key=other.source_key
      where other.vertical_key='AUTOMOTIVE' and other.monitor and oa.family=a.family)>family_limit)
    and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key=m.vertical_key
      and f.identity_key=m.identity_key and f.action in ('INTERESTED','SHARED'))
    and not exists(select 1 from commercial_sent_products s where s.vertical_key=m.vertical_key
      and s.identity_key=m.identity_key and s.sent_at is not null)
   order by (a.state='EXCLUDE') desc,m.created_at desc,m.source_key limit 1;
   if victim is null then continue; end if;
   update commercial_watchlist set monitor=false where source_key=victim;
  end if;
  update commercial_watchlist set monitor=true where source_key=candidate.source_key;
  update commercial_candidate_queue set state='MONITORED',reason=null where source_key=candidate.source_key;
  if victim is not null then
   insert into commercial_cohort_changes(vertical_key,removed_source,added_source,reason)
    values('AUTOMOTIVE',victim,candidate.source_key,victim_reason);
  end if;
  promoted:=promoted+1;
 end loop;
 return promoted;
end $$;

create function public.record_commercial_health() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.kind='HISTORY' and new.finished_at is not null and old.finished_at is null then
  insert into commercial_health_samples(run_id,vertical_key,monitored,fresh,retrying,due)
   select new.id,'AUTOMOTIVE',count(*),count(*) filter(where last_valid_price_at between now()-interval '24 hours' and now()),
    count(*) filter(where evidence_failures>0),count(*) filter(where next_evidence_check<=now())
   from commercial_watchlist where monitor on conflict(run_id) do nothing;
 end if;
 return new;
end $$;
create trigger commercial_health_after_run after update on public.commercial_collection_runs
 for each row execute function public.record_commercial_health();
-- A present baseline, never a fabricated reconstruction of prior coverage.
insert into public.commercial_health_samples(vertical_key,monitored,fresh,retrying,due)
 select 'AUTOMOTIVE',count(*),count(*) filter(where last_valid_price_at between now()-interval '24 hours' and now()),
 count(*) filter(where evidence_failures>0),count(*) filter(where next_evidence_check<=now())
 from public.commercial_watchlist where monitor;

create function public.commercial_pre_home_readiness() returns jsonb
language sql security invoker set search_path=public as $$
 with samples as (
  select *,fresh::numeric/nullif(monitored,0) as ratio from commercial_health_samples
   where vertical_key='AUTOMOTIVE' and sampled_at>=now()-interval '7 days'
 ), points as (
  select sampled_at from samples union select now()-interval '7 days' union select now()
 ), gaps as (select sampled_at-lag(sampled_at) over(order by sampled_at) as gap from points),
 metrics as (
  select (select min(sampled_at) from commercial_health_samples where vertical_key='AUTOMOTIVE') as first_sample,
   (select count(*) from samples) as samples,
   (select min(coalesce(ratio,0)) from samples) as minimum_coverage,
   (select extract(epoch from max(gap))/3600 from gaps) as maximum_gap_hours
 ) select jsonb_build_object('first_sample',first_sample,'samples_7d',samples,
  'minimum_coverage',minimum_coverage,'maximum_gap_hours',maximum_gap_hours,
  'seven_day_coverage_passed',coalesce(first_sample<=now()-interval '7 days' and minimum_coverage>=0.95 and maximum_gap_hours<=2,false),
  'home_enabled',(select enabled from commercial_verticals where vertical_key='HOME'),
  'home_executor_ready',(select executor_ready from commercial_verticals where vertical_key='HOME')) from metrics;
$$;
alter table public.commercial_editorial_assessments enable row level security;
alter table public.commercial_cohort_changes enable row level security;
alter table public.commercial_health_samples enable row level security;
revoke all on public.commercial_editorial_assessments,public.commercial_cohort_changes,public.commercial_health_samples from public,anon,authenticated;
grant select,insert,update,delete on public.commercial_editorial_assessments,public.commercial_cohort_changes,public.commercial_health_samples to service_role;
grant usage,select on sequence public.commercial_cohort_changes_id_seq,public.commercial_health_samples_id_seq to service_role;
revoke all on function public.record_commercial_health(),public.commercial_pre_home_readiness() from public,anon,authenticated;
grant execute on function public.record_commercial_health(),public.commercial_pre_home_readiness() to service_role;
