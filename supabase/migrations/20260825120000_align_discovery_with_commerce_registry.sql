alter table public.scan_runs
  add column contract_version text,
  add column adapter_version text,
  add column marketplace_key text
    references public.marketplaces(marketplace_key) on delete restrict,
  add column site_id text,
  add column vertical_key text
    references public.commerce_verticals(vertical_key) on delete restrict,
  add column run_mode text,
  add column registry_digest text;

alter table public.scan_runs
  add constraint scan_runs_contract_version_check
    check (contract_version is null or btrim(contract_version) <> ''),
  add constraint scan_runs_adapter_version_check
    check (adapter_version is null or btrim(adapter_version) <> ''),
  add constraint scan_runs_site_id_check
    check (site_id is null or btrim(site_id) <> ''),
  add constraint scan_runs_run_mode_check
    check (run_mode is null or run_mode in ('SMOKE', 'FULL_SWEEP')),
  add constraint scan_runs_registry_digest_check
    check (registry_digest is null or registry_digest ~ '^[0-9a-f]{64}$'),
  add constraint scan_runs_discovery_contract_check
    check (
      job_type <> 'COMMERCE_DISCOVERY'
      or (
        contract_version = 'commerce-discovery-run/v1'
        and adapter_version = 'meli-highlights-discovery/v1'
        and marketplace_key is not null
        and site_id is not null
        and vertical_key is not null
        and run_mode is not null
        and registry_digest is not null
      )
    );

create index scan_runs_discovery_context_idx
  on public.scan_runs(marketplace_key, site_id, vertical_key, scheduled_bucket desc)
  where job_type = 'COMMERCE_DISCOVERY';

alter table public.highlight_snapshots
  alter column category_id drop not null,
  add column marketplace_category_id uuid
    references public.marketplace_categories(marketplace_category_id) on delete restrict,
  add column source_contract text,
  add column priority_tier text;

alter table public.highlight_snapshots
  drop constraint highlight_snapshots_product_id_check,
  add constraint highlight_snapshots_external_id_by_type_check
    check (
      (type in ('PRODUCT', 'ITEM') and product_id ~ '^MLB[0-9]+$')
      or (type = 'USER_PRODUCT' and product_id ~ '^MLBU[0-9]+$')
    ),
  add constraint highlight_snapshots_category_reference_check
    check (category_id is not null or marketplace_category_id is not null),
  add constraint highlight_snapshots_source_contract_check
    check (source_contract is null or btrim(source_contract) <> ''),
  add constraint highlight_snapshots_priority_tier_check
    check (priority_tier is null or priority_tier in ('A', 'B')),
  add constraint highlight_snapshots_discovery_metadata_check
    check (
      marketplace_category_id is null
      or (
        source_contract = 'MELI_HIGHLIGHTS_CATEGORY_V1'
        and priority_tier is not null
      )
    ),
  add constraint highlight_snapshots_discovery_identity_key
    unique (run_id, marketplace_category_id, type, product_id);

create index highlight_snapshots_marketplace_category_observed_idx
  on public.highlight_snapshots(marketplace_category_id, observed_at desc)
  where marketplace_category_id is not null;

create index highlight_snapshots_run_identity_idx
  on public.highlight_snapshots(run_id, type, product_id);

comment on column public.highlight_snapshots.marketplace_category_id is
  'Canonical Commerce Registry provenance for discovery occurrences. Legacy rows may retain category_id instead.';

comment on constraint highlight_snapshots_discovery_identity_key on public.highlight_snapshots is
  'Same-run idempotency by canonical category, typed external identity and discovery run.';
