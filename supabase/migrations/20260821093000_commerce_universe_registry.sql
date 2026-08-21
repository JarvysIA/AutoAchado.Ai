create table public.marketplaces (
  marketplace_key text primary key check (btrim(marketplace_key) <> ''),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  config_version text not null check (btrim(config_version) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketplaces is
  'Canonical registry of external marketplaces supported by AutoAchado.AI.';

create table public.commerce_verticals (
  vertical_key text primary key check (btrim(vertical_key) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  active boolean not null default true,
  config_version text not null check (btrim(config_version) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (description is null or btrim(description) <> '')
);

comment on table public.commerce_verticals is
  'Canonical registry of AutoAchado.AI internal commerce verticals.';

create table public.marketplace_categories (
  marketplace_category_id uuid primary key default extensions.gen_random_uuid(),
  marketplace_key text not null
    references public.marketplaces(marketplace_key) on delete restrict,
  site_id text not null check (btrim(site_id) <> ''),
  external_category_id text not null check (btrim(external_category_id) <> ''),
  parent_marketplace_category_id uuid
    references public.marketplace_categories(marketplace_category_id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  path_external_ids text[] not null default '{}'::text[],
  path_names text[] not null default '{}'::text[],
  is_leaf boolean not null default false,
  active boolean not null default true,
  source_version text check (source_version is null or btrim(source_version) <> ''),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_checked_at timestamptz not null default now(),
  config_version text not null check (btrim(config_version) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_categories_external_identity_key
    unique (marketplace_key, site_id, external_category_id),
  constraint marketplace_categories_not_self_parent_check
    check (
      parent_marketplace_category_id is null
      or parent_marketplace_category_id <> marketplace_category_id
    )
);

comment on table public.marketplace_categories is
  'Canonical current-state representation of official external marketplace taxonomy nodes.';

create index marketplace_categories_parent_idx
  on public.marketplace_categories(parent_marketplace_category_id);
create index marketplace_categories_active_idx
  on public.marketplace_categories(marketplace_key, site_id, active);

create table public.vertical_category_mappings (
  vertical_key text not null
    references public.commerce_verticals(vertical_key) on delete restrict,
  marketplace_category_id uuid not null
    references public.marketplace_categories(marketplace_category_id) on delete restrict,
  scope_status text not null check (
    scope_status in ('ALLOWED', 'REVIEW', 'EXCLUDED', 'UNKNOWN')
  ),
  priority_tier text not null check (
    priority_tier in ('A', 'B', 'C', 'EXCLUDED')
  ),
  family_key text check (family_key is null or btrim(family_key) <> ''),
  commercial_family_key_default text check (
    commercial_family_key_default is null or btrim(commercial_family_key_default) <> ''
  ),
  classification_rule text check (
    classification_rule is null or btrim(classification_rule) <> ''
  ),
  classification_version text not null check (btrim(classification_version) <> ''),
  manual_override boolean not null default false,
  decision_source text not null check (decision_source in ('AUTO', 'MANUAL')),
  decision_reason text check (decision_reason is null or btrim(decision_reason) <> ''),
  decided_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (vertical_key, marketplace_category_id),
  constraint vertical_category_mappings_excluded_consistency_check check (
    (scope_status = 'EXCLUDED') = (priority_tier = 'EXCLUDED')
  ),
  constraint vertical_category_mappings_manual_source_check check (
    not manual_override or decision_source = 'MANUAL'
  ),
  constraint vertical_category_mappings_manual_decided_at_check check (
    decision_source <> 'MANUAL' or decided_at is not null
  )
);

comment on table public.vertical_category_mappings is
  'Canonical internal classification of an external category within an AutoAchado.AI commerce vertical.';

create index vertical_category_mappings_category_idx
  on public.vertical_category_mappings(marketplace_category_id);
create index vertical_category_mappings_discovery_idx
  on public.vertical_category_mappings(vertical_key, active, scope_status, priority_tier);

alter table public.automotive_categories
  add column marketplace_category_id uuid;

alter table public.automotive_categories
  add constraint automotive_categories_marketplace_category_id_fkey
  foreign key (marketplace_category_id)
  references public.marketplace_categories(marketplace_category_id)
  on delete restrict;

create unique index automotive_categories_marketplace_category_id_key
  on public.automotive_categories(marketplace_category_id)
  where marketplace_category_id is not null;

comment on column public.automotive_categories.marketplace_category_id is
  'Temporary compatibility link. External taxonomy is canonical in marketplace_categories and internal classification in vertical_category_mappings.';

alter table public.marketplaces enable row level security;
alter table public.commerce_verticals enable row level security;
alter table public.marketplace_categories enable row level security;
alter table public.vertical_category_mappings enable row level security;

revoke all privileges on table
  public.marketplaces,
  public.commerce_verticals,
  public.marketplace_categories,
  public.vertical_category_mappings
from public, anon, authenticated, service_role;

grant select, insert, update on table
  public.marketplaces,
  public.commerce_verticals,
  public.marketplace_categories,
  public.vertical_category_mappings
to service_role;

insert into public.marketplaces (
  marketplace_key,
  name,
  active,
  config_version
) values (
  'MERCADO_LIVRE',
  'Mercado Livre',
  true,
  'commerce-registry/v1'
)
on conflict (marketplace_key) do update
set name = excluded.name,
    active = excluded.active,
    config_version = excluded.config_version,
    updated_at = now();

insert into public.commerce_verticals (
  vertical_key,
  name,
  description,
  active,
  config_version
) values (
  'AUTOMOTIVE',
  'Automotivo',
  'Produtos automotivos, pecas, manutencao, conservacao, ferramentas, seguranca e acessorios.',
  true,
  'commerce-registry/v1'
)
on conflict (vertical_key) do update
set name = excluded.name,
    description = excluded.description,
    active = excluded.active,
    config_version = excluded.config_version,
    updated_at = now();
