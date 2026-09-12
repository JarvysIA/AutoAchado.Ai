-- Isolated HOME pilot: no writes to the legacy Automotive watchlist or its triggers.
create table public.home_candidates (
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
create table public.home_observations (
 identity_key text not null, source_key text not null, observed_at timestamptz not null,
 price numeric, currency text not null, seller_id text, comparable boolean not null, trusted boolean not null,
 primary key(identity_key,source_key,observed_at)
);
create index on public.home_observations(identity_key,observed_at);
create table public.home_rank_observations (
 identity_key text not null, category_id text not null, observed_at timestamptz not null,
 position integer not null check(position between 1 and 20), primary key(identity_key,category_id,observed_at)
);
create table public.home_runs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('HISTORY','DISCOVERY')),
 started_at timestamptz not null default now(),finished_at timestamptz,
 status text not null default 'RUNNING',collected integer not null default 0,failed integer not null default 0
);
create table public.home_category_checks(category_id text primary key,checked_at timestamptz not null,status integer not null);
create table public.home_renewals(id bigint generated always as identity primary key,old_source text,new_source text not null,created_at timestamptz not null default now());

create function public.begin_home_run(run_kind text) returns uuid language plpgsql security invoker set search_path=public as $$
declare run_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('home-executor'));
 if run_kind not in ('HISTORY','DISCOVERY') then raise exception 'INVALID_KIND';end if;
 if not exists(select 1 from commercial_verticals where vertical_key='HOME' and enabled and executor_ready) then raise exception 'HOME_DISABLED';end if;
 if exists(select 1 from home_runs where status='RUNNING' and started_at>now()-interval '6 minutes') then return null;end if;
 update home_runs set status='EXPIRED',finished_at=now() where status='RUNNING';
 insert into home_runs(kind) values(run_kind) returning id into run_id;return run_id;
end $$;

create function public.renew_home_candidates() returns integer language plpgsql security invoker set search_path=public as $$
declare c record;victim text;slots integer;changed integer:=0;swaps integer;
begin
 perform pg_advisory_xact_lock(hashtext('home-executor'));
 if not exists(select 1 from commercial_verticals where vertical_key='HOME' and enabled and executor_ready) then raise exception 'HOME_DISABLED';end if;
 select monitor_capacity into slots from commercial_verticals where vertical_key='HOME';
 select count(*) into swaps from home_renewals where old_source is not null and (created_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date;
 for c in select * from home_candidates where not monitor and assessment->>'eligible'='true' and feedback is distinct from 'NOT_RELEVANT'
  and (preview->>'priceCheckedAt')::timestamptz>now()-interval '24 hours' order by score desc,source_key loop
  if (select count(*) from home_candidates where monitor and family=c.family)>=25 then continue;end if;
  victim:=null;
  if (select count(*) from home_candidates where monitor)>=slots then
   if swaps>=5 then exit;end if;
   select source_key into victim from home_candidates where monitor and feedback is distinct from 'INTERESTED' and score<c.score-5 order by score,source_key limit 1;
   if victim is null then continue;end if;
   update home_candidates set monitor=false where source_key=victim;swaps:=swaps+1;
  end if;
  update home_candidates set monitor=true where source_key=c.source_key;
  insert into home_renewals(old_source,new_source) values(victim,c.source_key);changed:=changed+1;
 end loop;return changed;
end $$;

create function public.home_capacity_guard() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('home-executor'));
 if new.monitor and (tg_op='INSERT' or not old.monitor) and (select count(*) from home_candidates where monitor)>=100 then raise exception 'HOME_CAPACITY';end if;
 return new;
end $$;
create trigger home_capacity before insert or update of monitor on public.home_candidates for each row execute function public.home_capacity_guard();

create function public.dispatch_home_collection(run_kind text default 'HISTORY') returns bigint language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 if not exists(select 1 from public.commercial_verticals where vertical_key='HOME' and enabled and executor_ready) then return null;end if;
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null then raise exception 'HOME_CRON_NOT_CONFIGURED';end if;
 select net.http_get(url:='https://autoachado-ai.vercel.app/api/commercial/home-run?kind='||case when run_kind='DISCOVERY' then 'DISCOVERY' else 'HISTORY' end,
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),timeout_milliseconds:=240000) into request_id;return request_id;
end $$;

alter table public.home_candidates enable row level security;
alter table public.home_observations enable row level security;
alter table public.home_rank_observations enable row level security;
alter table public.home_runs enable row level security;
alter table public.home_category_checks enable row level security;
alter table public.home_renewals enable row level security;
revoke all on public.home_candidates,public.home_observations,public.home_rank_observations,public.home_runs,public.home_category_checks,public.home_renewals from anon,authenticated;
grant all on public.home_candidates,public.home_observations,public.home_rank_observations,public.home_runs,public.home_category_checks,public.home_renewals to service_role;
grant usage,select on sequence public.home_renewals_id_seq to service_role;
revoke all on function public.begin_home_run(text),public.renew_home_candidates(),public.dispatch_home_collection(text),public.home_capacity_guard() from public,anon,authenticated;
grant execute on function public.begin_home_run(text),public.renew_home_candidates(),public.dispatch_home_collection(text),public.home_capacity_guard() to service_role;
-- Enable only after deployment verification; schedules are inert while HOME is disabled.
select cron.schedule('home-history-hourly','17 * * * *',$$select public.dispatch_home_collection('HISTORY')$$);
select cron.schedule('home-discovery-daily','37 6 * * *',$$select public.dispatch_home_collection('DISCOVERY')$$);
