-- Append-only evidence; no public browser access. Writes are server-side only.
create table public.commercial_watchlist (
  source_key text primary key,
  product_id text not null,
  type text not null check (type in ('PRODUCT','ITEM','USER_PRODUCT')),
  category_id text not null,
  snapshot jsonb not null,
  identity_key text not null,
  preview jsonb not null default '{}'::jsonb,
  last_collected_at timestamptz,
  monitor boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.commercial_observations (
  identity_key text not null,
  source_key text not null,
  observed_at timestamptz not null,
  observed_day date not null,
  price numeric check (price > 0),
  currency text not null,
  seller_id text,
  comparable boolean not null default false,
  trusted boolean not null default false,
  position integer check (position between 1 and 20),
  primary key (source_key, observed_at)
);
create index commercial_observations_identity_time on public.commercial_observations(identity_key, observed_at desc);
create table public.commercial_feedback (
  identity_key text primary key,
  action text not null check(action in ('SHARED','INTERESTED','NOT_RELEVANT','RESET')),
  updated_at timestamptz not null default now()
);
create table public.commercial_collection_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  collected integer not null default 0,
  failed integer not null default 0,
  status text not null default 'RUNNING' check(status in ('RUNNING','COMPLETED','PARTIAL','FAILED'))
);
alter table public.commercial_watchlist enable row level security;
alter table public.commercial_observations enable row level security;
alter table public.commercial_feedback enable row level security;
alter table public.commercial_collection_runs enable row level security;
revoke all on public.commercial_watchlist, public.commercial_observations, public.commercial_feedback, public.commercial_collection_runs from public, anon, authenticated;
grant select, insert, update on public.commercial_watchlist, public.commercial_observations, public.commercial_feedback, public.commercial_collection_runs to service_role;

-- Cohort of 48 monitored candidates, category-balanced rather than last 100 rows.
create function public.seed_commercial_watchlist() returns integer
language plpgsql security invoker set search_path = public as $$
declare inserted integer;
begin
  perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
  with latest as (
    select distinct on (h.type,h.product_id) h.*, c.external_category_id
    from public.highlight_snapshots h
    join public.marketplace_categories c using(marketplace_category_id)
    where h.observed_at >= now() - interval '7 days'
    order by h.type,h.product_id,h.observed_at desc,h.position
  ), balanced as (
    select *, row_number() over(partition by marketplace_category_id order by position nulls last,product_id) as category_slot
    from latest l where not exists(select 1 from public.commercial_watchlist w where w.source_key=l.type||':'||l.product_id)
  )
  insert into public.commercial_watchlist(source_key, product_id, type, category_id, snapshot, identity_key)
  select type||':'||product_id,product_id,type,external_category_id,
    jsonb_build_object('product_id',product_id,'type',type,'position',position,'priority_tier',priority_tier,'observed_at',observed_at),type||':'||product_id
  from balanced order by category_slot, position nulls last, product_id
  limit greatest(0,48-(select count(*)::integer from public.commercial_watchlist where monitor))
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create function public.begin_commercial_collection() returns uuid
language plpgsql security invoker set search_path = public as $$
declare run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('commercial-collector'));
  if exists(select 1 from commercial_collection_runs where status='RUNNING' and started_at > now()-interval '6 minutes') then return null; end if;
  update commercial_collection_runs set status='FAILED',finished_at=now() where status='RUNNING' and started_at <= now()-interval '6 minutes';
  insert into commercial_collection_runs default values returning id into run_id;
  return run_id;
end;
$$;
revoke all on function public.seed_commercial_watchlist(), public.begin_commercial_collection() from public, anon, authenticated;
grant execute on function public.seed_commercial_watchlist(), public.begin_commercial_collection() to service_role;
