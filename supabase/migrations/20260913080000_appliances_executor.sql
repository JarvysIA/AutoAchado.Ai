-- Isolated APPLIANCES pilot: no writes to the legacy Automotive watchlist or its triggers.
create table public.appliances_candidates (
 source_key text primary key check(source_key ~ '^PRODUCT:MLB[0-9]+$'),
 product_id text not null unique check(product_id ~ '^MLB[0-9]+$'),
 identity_key text not null unique,
 category_id text not null, family text not null,
 preview jsonb not null default '{}', assessment jsonb not null default '{}',
 monitor boolean not null default false,
 feedback text check(feedback in ('INTERESTED','NOT_RELEVANT','RESET','SHARED')),
 score integer not null default 0,
 next_check timestamptz not null default now(), last_attempt timestamptz,
 created_at timestamptz not null default now()
);
create table public.appliances_observations (
 identity_key text not null, source_key text not null, observed_at timestamptz not null,
 variant_key text not null, price numeric, currency text not null, seller_id text, comparable boolean not null, trusted boolean not null,
 primary key(identity_key,source_key,observed_at)
);
create index on public.appliances_observations(identity_key,observed_at);
create table public.appliances_rank_observations (
 identity_key text not null, category_id text not null, observed_at timestamptz not null,
 position integer not null check(position between 1 and 20), primary key(identity_key,category_id,observed_at)
);
create table public.appliances_runs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('HISTORY','DISCOVERY')),
 started_at timestamptz not null default now(),finished_at timestamptz,
 status text not null default 'RUNNING',collected integer not null default 0,failed integer not null default 0
);
create table public.appliances_category_checks(category_id text primary key,checked_at timestamptz not null,status integer not null);
create table public.appliances_renewals(id bigint generated always as identity primary key,old_source text,new_source text not null,created_at timestamptz not null default now());

create function public.begin_appliances_run(run_kind text) returns uuid language plpgsql security invoker set search_path=public as $$
declare run_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('appliances-executor'));
 if run_kind not in ('HISTORY','DISCOVERY') then raise exception 'INVALID_KIND';end if;
 if not exists(select 1 from commercial_verticals where vertical_key='APPLIANCES' and enabled and executor_ready) then raise exception 'APPLIANCES_DISABLED';end if;
 if exists(select 1 from appliances_runs where status='RUNNING' and started_at>now()-interval '6 minutes') then return null;end if;
 update appliances_runs set status='EXPIRED',finished_at=now() where status='RUNNING';
 insert into appliances_runs(kind) values(run_kind) returning id into run_id;return run_id;
end $$;

create function public.appliances_capacity_guard() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('appliances-executor'));
 if new.monitor and (tg_op='INSERT' or not old.monitor) and (select count(*) from appliances_candidates where monitor)>=100 then raise exception 'APPLIANCES_CAPACITY';end if;
 return new;
end $$;
create trigger appliances_capacity before insert or update of monitor on public.appliances_candidates for each row execute function public.appliances_capacity_guard();

create function public.dispatch_appliances_collection(run_kind text default 'HISTORY') returns bigint language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 if not exists(select 1 from public.commercial_verticals where vertical_key='APPLIANCES' and enabled and executor_ready) then return null;end if;
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null then raise exception 'APPLIANCES_CRON_NOT_CONFIGURED';end if;
 select net.http_get(url:='https://autoachado-ai.vercel.app/api/commercial/appliances-run?kind='||case when run_kind='DISCOVERY' then 'DISCOVERY' else 'HISTORY' end,
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),timeout_milliseconds:=240000) into request_id;return request_id;
end $$;

alter table public.appliances_candidates enable row level security;
alter table public.appliances_observations enable row level security;
alter table public.appliances_rank_observations enable row level security;
alter table public.appliances_runs enable row level security;
alter table public.appliances_category_checks enable row level security;
alter table public.appliances_renewals enable row level security;
revoke all on public.appliances_candidates,public.appliances_observations,public.appliances_rank_observations,public.appliances_runs,public.appliances_category_checks,public.appliances_renewals from anon,authenticated;
grant all on public.appliances_candidates,public.appliances_observations,public.appliances_rank_observations,public.appliances_runs,public.appliances_category_checks,public.appliances_renewals to service_role;
grant usage,select on sequence public.appliances_renewals_id_seq to service_role;
revoke all on function public.begin_appliances_run(text),public.dispatch_appliances_collection(text),public.appliances_capacity_guard() from public,anon,authenticated;
grant execute on function public.begin_appliances_run(text),public.dispatch_appliances_collection(text),public.appliances_capacity_guard() to service_role;
-- Enable only after deployment verification; schedules are inert while APPLIANCES is disabled.
select cron.schedule('appliances-history-hourly','27 * * * *',$$select public.dispatch_appliances_collection('HISTORY')$$);
select cron.schedule('appliances-discovery-daily','47 7 * * *',$$select public.dispatch_appliances_collection('DISCOVERY')$$);

alter table public.appliances_candidates add column diversity_key text generated always as (case when category_id='MLB457530' then 'MLB1645' when category_id='MLB73068' then 'MLB4337' else category_id end) stored;
alter table public.appliances_renewals add column reason text not null default 'SCORE';
alter table public.appliances_candidates add column model_key text generated always as (coalesce(lower((preview->'appliance_specs'->>'brand')||':'||(preview->'appliance_specs'->>'model')),product_id)) stored;
create function public.rebalance_appliances_candidates(max_changes integer default 5) returns integer language plpgsql security invoker set search_path=public as $$
declare c record; victim text; changed integer:=0; swaps integer; slots integer; why text;
begin
 perform pg_advisory_xact_lock(hashtext('appliances-executor'));
 if max_changes<0 or max_changes>100 then raise exception 'INVALID_LIMIT';end if;
 if not exists(select 1 from commercial_verticals where vertical_key='APPLIANCES' and enabled and executor_ready) then raise exception 'APPLIANCES_DISABLED';end if;
 select least(monitor_capacity,100) into slots from commercial_verticals where vertical_key='APPLIANCES';
 select count(*) into swaps from appliances_renewals where old_source is not null and (created_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date;
 -- First represent useful types that have no slot, then the next-best of each type.
 for c in select h.* from appliances_candidates h
 where not monitor and assessment->>'eligible'='true' and feedback is distinct from 'NOT_RELEVANT'
 and (preview->>'priceCheckedAt')::timestamptz>now()-interval '24 hours'
 order by (select count(*) from appliances_candidates m where m.monitor and m.diversity_key=h.diversity_key) + row_number() over(partition by h.diversity_key order by h.score desc,h.source_key),score desc,source_key loop
  if (select count(*) from appliances_candidates where monitor and diversity_key=c.diversity_key)>=4 then continue;end if;
  if (select count(*) from appliances_candidates where monitor and model_key=c.model_key)>=2 then continue;end if;
  victim:=null;why:='ADMISSION';
  if (select count(*) from appliances_candidates where monitor)>=slots then
   if changed>=max_changes then exit;end if;
   -- Replace redundant types first, retaining products the operator marked interested.
   select h.source_key into victim from appliances_candidates h where h.monitor and h.feedback is distinct from 'INTERESTED'
   and (select count(*) from appliances_candidates m where m.monitor and m.diversity_key=h.diversity_key)>4
   and ((select count(*) from appliances_candidates m where m.monitor and m.family=c.family)<25 or h.family=c.family)
   order by h.score,h.source_key limit 1;
   why:='DIVERSITY';
   if victim is null then
    if swaps>=5 then continue;end if;
    select h.source_key into victim from appliances_candidates h where h.monitor and h.feedback is distinct from 'INTERESTED' and h.score<c.score-5
    and ((select count(*) from appliances_candidates m where m.monitor and m.family=c.family)<25 or h.family=c.family)
    order by h.score,h.source_key limit 1;
    why:='SCORE';
   end if;
   if victim is null then continue;end if;
  elsif (select count(*) from appliances_candidates where monitor and family=c.family)>=25 then continue;
  end if;
  if victim is not null then update appliances_candidates set monitor=false where source_key=victim;swaps:=swaps+1;end if;
  update appliances_candidates set monitor=true where source_key=c.source_key;
  insert into appliances_renewals(old_source,new_source,reason) values(victim,c.source_key,why);changed:=changed+1;
 end loop;return changed;
end $$;
create or replace function public.renew_appliances_candidates() returns integer language sql security invoker set search_path=public as $$
 select public.rebalance_appliances_candidates(5)
$$;
revoke all on function public.rebalance_appliances_candidates(integer) from public,anon,authenticated;
grant execute on function public.rebalance_appliances_candidates(integer) to service_role;

revoke all on function public.renew_appliances_candidates() from public,anon,authenticated;
grant execute on function public.renew_appliances_candidates() to service_role;
