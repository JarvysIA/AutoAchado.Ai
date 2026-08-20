create extension if not exists pgcrypto with schema extensions;

create table public.automotive_categories (
  category_id text primary key check (category_id ~ '^MLB[0-9]+$'),
  parent_id text references public.automotive_categories(category_id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  path text[] not null default '{}'::text[],
  family_key text check (family_key is null or btrim(family_key) <> ''),
  commercial_family_key text check (commercial_family_key is null or btrim(commercial_family_key) <> ''),
  priority_tier text not null check (priority_tier in ('A', 'B', 'C', 'EXCLUDED')),
  scope_status text not null check (scope_status in ('ALLOWED', 'REVIEW', 'EXCLUDED', 'UNKNOWN')),
  is_leaf boolean not null default false,
  manual_override boolean,
  active boolean not null default true,
  config_version text not null check (btrim(config_version) <> ''),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automotive_categories_parent_idx on public.automotive_categories(parent_id);
create index automotive_categories_family_idx on public.automotive_categories(family_key);
create index automotive_categories_commercial_family_idx on public.automotive_categories(commercial_family_key);
create index automotive_categories_scope_leaf_idx on public.automotive_categories(scope_status, is_leaf);
create index automotive_categories_priority_idx on public.automotive_categories(priority_tier);

create table public.catalog_products (
  product_id text primary key check (product_id ~ '^MLB[0-9]+$'),
  category_id text references public.automotive_categories(category_id) on delete restrict,
  domain_id text,
  name text not null check (btrim(name) <> ''),
  family_name text,
  commercial_family_key text check (commercial_family_key is null or btrim(commercial_family_key) <> ''),
  status text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata_checked_at timestamptz,
  active boolean not null default true,
  config_version text not null check (btrim(config_version) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_products_category_idx on public.catalog_products(category_id);
create index catalog_products_commercial_family_idx on public.catalog_products(commercial_family_key);

create table public.seller_profiles (
  seller_id bigint primary key check (seller_id > 0),
  nickname text,
  level_id text,
  power_seller_status text,
  status text,
  transactions_completed bigint check (transactions_completed is null or transactions_completed >= 0),
  checked_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seller_profiles_expires_idx on public.seller_profiles(expires_at);
create index seller_profiles_level_idx on public.seller_profiles(level_id);

create table public.marketplace_offers (
  item_id text primary key check (item_id ~ '^MLB[0-9]+$'),
  product_id text not null references public.catalog_products(product_id) on delete restrict,
  seller_id bigint not null references public.seller_profiles(seller_id) on delete restrict,
  category_id text references public.automotive_categories(category_id) on delete restrict,
  title text,
  status text,
  price numeric(14, 2) check (price is null or price > 0),
  original_price numeric(14, 2) check (original_price is null or original_price > 0),
  currency_id text check (currency_id is null or currency_id ~ '^[A-Z]{3}$'),
  condition text,
  eligible boolean not null default false,
  eligibility_reason text,
  permalink text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_price is null or price is null or original_price >= price)
);
comment on column public.marketplace_offers.price is
  'Officially observed marketplace price. A future coupon_effective_price must not overwrite this value.';
create index marketplace_offers_product_idx on public.marketplace_offers(product_id, active);
create index marketplace_offers_seller_idx on public.marketplace_offers(seller_id, active);

create table public.scan_runs (
  run_id uuid primary key default gen_random_uuid(),
  scheduled_bucket timestamptz not null,
  job_type text not null check (btrim(job_type) <> ''),
  shard_key text not null check (btrim(shard_key) <> ''),
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED')),
  config_version text not null check (btrim(config_version) <> ''),
  started_at timestamptz,
  finished_at timestamptz,
  cursor jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor) = 'object'),
  request_count integer not null default 0 check (request_count >= 0),
  error_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(error_counts) = 'object'),
  rate_limited boolean not null default false,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_type, scheduled_bucket, shard_key),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);
create index scan_runs_status_bucket_idx on public.scan_runs(status, scheduled_bucket desc);

create table public.highlight_snapshots (
  highlight_snapshot_id bigint generated always as identity primary key,
  run_id uuid not null references public.scan_runs(run_id) on delete restrict,
  category_id text not null references public.automotive_categories(category_id) on delete restrict,
  product_id text not null check (product_id ~ '^MLB(U)?[0-9]+$'),
  observed_at timestamptz not null default now(),
  observed_bucket timestamptz not null,
  position smallint check (position is null or position between 1 and 20),
  type text not null check (type in ('PRODUCT', 'ITEM', 'USER_PRODUCT')),
  created_at timestamptz not null default now(),
  unique (observed_bucket, category_id, product_id)
);
create index highlight_snapshots_product_observed_idx on public.highlight_snapshots(product_id, observed_at desc);
create index highlight_snapshots_category_observed_idx on public.highlight_snapshots(category_id, observed_at desc);

create table public.price_snapshots (
  price_snapshot_id bigint generated always as identity primary key,
  run_id uuid not null references public.scan_runs(run_id) on delete restrict,
  product_id text not null references public.catalog_products(product_id) on delete restrict,
  item_id text references public.marketplace_offers(item_id) on delete restrict,
  seller_id bigint references public.seller_profiles(seller_id) on delete restrict,
  observed_at timestamptz not null default now(),
  observed_bucket timestamptz not null,
  best_eligible_price numeric(14, 2) check (best_eligible_price is null or best_eligible_price > 0),
  second_best_price numeric(14, 2) check (second_best_price is null or second_best_price > 0),
  eligible_price_median numeric(14, 2) check (eligible_price_median is null or eligible_price_median > 0),
  eligible_offer_count integer not null default 0 check (eligible_offer_count >= 0),
  original_price numeric(14, 2) check (original_price is null or original_price > 0),
  currency_id text check (currency_id is null or currency_id ~ '^[A-Z]{3}$'),
  condition text,
  highlight_position smallint check (highlight_position is null or highlight_position between 1 and 20),
  seller_level_id text,
  eligible boolean not null default false,
  anomaly_code text,
  selection_reason text,
  created_at timestamptz not null default now(),
  unique (observed_bucket, product_id),
  check (second_best_price is null or best_eligible_price is null or second_best_price >= best_eligible_price)
);
comment on column public.price_snapshots.best_eligible_price is
  'Historical market observation. Future coupon-effective prices belong to a separate layer.';
create index price_snapshots_product_observed_idx on public.price_snapshots(product_id, observed_at desc);
create index price_snapshots_item_observed_idx on public.price_snapshots(item_id, observed_at desc);

create table public.product_daily_stats (
  product_id text not null references public.catalog_products(product_id) on delete restrict,
  stat_date date not null,
  daily_best_eligible_price numeric(14, 2) check (daily_best_eligible_price is null or daily_best_eligible_price > 0),
  daily_high_price numeric(14, 2) check (daily_high_price is null or daily_high_price > 0),
  observation_count integer not null default 0 check (observation_count >= 0),
  eligible_offer_count integer not null default 0 check (eligible_offer_count >= 0),
  median_offer_price numeric(14, 2) check (median_offer_price is null or median_offer_price > 0),
  highlight_best_position smallint check (highlight_best_position is null or highlight_best_position between 1 and 20),
  highlight_presence boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, stat_date),
  check (daily_best_eligible_price is null or daily_high_price is null or daily_best_eligible_price <= daily_high_price)
);
create index product_daily_stats_date_idx on public.product_daily_stats(stat_date desc);

create table public.opportunity_candidates (
  opportunity_candidate_id uuid primary key default gen_random_uuid(),
  product_id text not null references public.catalog_products(product_id) on delete restrict,
  item_id text references public.marketplace_offers(item_id) on delete restrict,
  candidate_date date not null,
  current_price numeric(14, 2) not null check (current_price > 0),
  reference_price numeric(14, 2) check (reference_price is null or reference_price > 0),
  real_discount_percent numeric(7, 4),
  absolute_saving numeric(14, 2),
  historical_discount_score numeric(7, 4) not null default 0 check (historical_discount_score between 0 and 100),
  demand_score numeric(7, 4) not null default 0 check (demand_score between 0 and 100),
  sellability_score numeric(7, 4) not null default 0 check (sellability_score between 0 and 100),
  universal_appeal_score numeric(7, 4) not null default 0 check (universal_appeal_score between 0 and 100),
  seller_quality_score numeric(7, 4) not null default 0 check (seller_quality_score between 0 and 100),
  price_attractiveness_score numeric(7, 4) not null default 0 check (price_attractiveness_score between 0 and 100),
  history_confidence_score numeric(7, 4) not null default 0 check (history_confidence_score between 0 and 100),
  specificity_penalty numeric(7, 4) not null default 0 check (specificity_penalty between 0 and 100),
  final_score numeric(7, 4) not null default 0 check (final_score between 0 and 100),
  score_version text not null check (btrim(score_version) <> ''),
  config_version text not null check (btrim(config_version) <> ''),
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  gate_results jsonb not null default '{}'::jsonb check (jsonb_typeof(gate_results) = 'object'),
  shortlisted boolean not null default false,
  reviewed boolean not null default false,
  promotion_cooldown_until timestamptz,
  breakout_trigger boolean not null default false,
  breakout_reason text,
  recycle_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, candidate_date, score_version)
);
create index opportunity_candidates_ranking_idx on public.opportunity_candidates(candidate_date desc, shortlisted, final_score desc);
create index opportunity_candidates_cooldown_idx on public.opportunity_candidates(promotion_cooldown_until)
  where promotion_cooldown_until is not null;

alter table public.automotive_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.marketplace_offers enable row level security;
alter table public.scan_runs enable row level security;
alter table public.highlight_snapshots enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.product_daily_stats enable row level security;
alter table public.opportunity_candidates enable row level security;

revoke all on table public.automotive_categories, public.catalog_products, public.seller_profiles,
  public.marketplace_offers, public.scan_runs, public.highlight_snapshots, public.price_snapshots,
  public.product_daily_stats, public.opportunity_candidates from anon, authenticated;

grant select, insert, update, delete on table public.automotive_categories, public.catalog_products,
  public.seller_profiles, public.marketplace_offers, public.scan_runs, public.highlight_snapshots,
  public.price_snapshots, public.product_daily_stats, public.opportunity_candidates to service_role;
grant usage, select on sequence public.highlight_snapshots_highlight_snapshot_id_seq to service_role;
grant usage, select on sequence public.price_snapshots_price_snapshot_id_seq to service_role;
