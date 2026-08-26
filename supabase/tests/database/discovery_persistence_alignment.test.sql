begin;
select plan(20);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'scan_runs'
     and column_name in ('contract_version', 'adapter_version', 'marketplace_key', 'site_id', 'vertical_key', 'run_mode', 'registry_digest')),
  7,
  'scan_runs has the minimal discovery audit context'
);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'highlight_snapshots'
     and column_name in ('marketplace_category_id', 'source_contract', 'priority_tier')),
  3,
  'highlight snapshots has canonical discovery provenance'
);

select has_table('public', 'automotive_categories', 'legacy automotive categories is preserved');

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.highlight_snapshots'::regclass
    and conname = 'highlight_snapshots_category_id_fkey'
    and confrelid = 'public.automotive_categories'::regclass),
  'legacy highlight category foreign key remains available'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.highlight_snapshots'::regclass
    and conname = 'highlight_snapshots_marketplace_category_id_fkey'
    and confrelid = 'public.marketplace_categories'::regclass),
  'new discovery provenance references canonical marketplace categories'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.highlight_snapshots'::regclass
    and conname = 'highlight_snapshots_discovery_identity_key'
    and pg_get_constraintdef(oid) like '%run_id, marketplace_category_id, type, product_id%'),
  'same-run occurrence identity includes category and type'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.highlight_snapshots'::regclass
    and conname = 'highlight_snapshots_external_id_by_type_check'
    and pg_get_constraintdef(oid) like '%USER_PRODUCT%MLBU%'),
  'typed external identity is constrained'
);

select is(
  (select count(*)::integer from pg_class where oid in ('public.scan_runs'::regclass, 'public.highlight_snapshots'::regclass) and relrowsecurity),
  2,
  'RLS remains enabled on both persistence tables'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('scan_runs', 'highlight_snapshots')),
  0,
  'no public RLS policy was introduced'
);

insert into public.marketplace_categories (
  marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
) values
  ('30000000-0000-4000-8000-000000000001', 'MERCADO_LIVRE', 'MLB', 'MLB100', 'Categoria A', 'db-test-v1'),
  ('30000000-0000-4000-8000-000000000002', 'MERCADO_LIVRE', 'MLB', 'MLB200', 'Categoria B', 'db-test-v1');

insert into public.scan_runs (
  run_id, scheduled_bucket, job_type, shard_key, status, config_version, contract_version,
  adapter_version, marketplace_key, site_id, vertical_key, run_mode, registry_digest, started_at
) values (
  '40000000-0000-4000-8000-000000000001', '2026-08-25 12:00:00+00', 'COMMERCE_DISCOVERY',
  'AUTOMOTIVE:SMOKE', 'RUNNING', 'automotive-mlb-discovery/v1', 'commerce-discovery-run/v1',
  'meli-highlights-discovery/v1', 'MERCADO_LIVRE', 'MLB', 'AUTOMOTIVE', 'SMOKE', repeat('a', 64),
  '2026-08-25 12:00:00+00'
);

select is((select count(*)::integer from public.scan_runs where run_id = '40000000-0000-4000-8000-000000000001'), 1,
  'discovery run starts with its complete audit contract');

insert into public.highlight_snapshots (
  run_id, category_id, marketplace_category_id, product_id, observed_at, observed_bucket,
  position, type, source_contract, priority_tier
) values
  ('40000000-0000-4000-8000-000000000001', null, '30000000-0000-4000-8000-000000000001',
   'MLB123', '2026-08-25 12:00:01+00', '2026-08-25 12:00:01+00', 1, 'PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A'),
  ('40000000-0000-4000-8000-000000000001', null, '30000000-0000-4000-8000-000000000001',
   'MLB123', '2026-08-25 12:00:01+00', '2026-08-25 12:00:01+00', 2, 'ITEM', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A');

select is((select count(*)::integer from public.highlight_snapshots where run_id = '40000000-0000-4000-8000-000000000001' and product_id = 'MLB123'), 2,
  'PRODUCT and ITEM with the same raw ID coexist');

insert into public.highlight_snapshots (
  run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier
) values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'MLBU123', '2026-08-25 12:00:01+00', 'USER_PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A');

select is((select count(*)::integer from public.highlight_snapshots where type = 'USER_PRODUCT' and product_id = 'MLBU123'), 1,
  'USER_PRODUCT remains a distinct persisted occurrence type');

insert into public.highlight_snapshots (
  run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier
) values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'MLB123', '2026-08-25 12:00:01+00', 'PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A')
on conflict (run_id, marketplace_category_id, type, product_id) do nothing;

select is((select count(*)::integer from public.highlight_snapshots where run_id = '40000000-0000-4000-8000-000000000001'
  and marketplace_category_id = '30000000-0000-4000-8000-000000000001' and type = 'PRODUCT' and product_id = 'MLB123'), 1,
  'same-run occurrence replay is idempotent');

insert into public.highlight_snapshots (
  run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier
) values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
  'MLB123', '2026-08-25 12:00:01+00', 'PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'B');

select is((select count(*)::integer from public.highlight_snapshots where run_id = '40000000-0000-4000-8000-000000000001'
  and type = 'PRODUCT' and product_id = 'MLB123'), 2,
  'one PRODUCT preserves two category provenance rows');

insert into public.scan_runs (
  run_id, scheduled_bucket, job_type, shard_key, status, config_version, contract_version,
  adapter_version, marketplace_key, site_id, vertical_key, run_mode, registry_digest
) values ('40000000-0000-4000-8000-000000000002', '2026-08-26 12:00:00+00', 'COMMERCE_DISCOVERY',
  'AUTOMOTIVE:SMOKE', 'RUNNING', 'automotive-mlb-discovery/v1', 'commerce-discovery-run/v1',
  'meli-highlights-discovery/v1', 'MERCADO_LIVRE', 'MLB', 'AUTOMOTIVE', 'SMOKE', repeat('a', 64));

insert into public.highlight_snapshots (
  run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier
) values ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001',
  'MLB123', '2026-08-26 12:00:01+00', 'PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A');

select is((select count(*)::integer from public.highlight_snapshots where type = 'PRODUCT' and product_id = 'MLB123'), 3,
  'the same PRODUCT remains observable across discovery runs');

select throws_ok(
  $$insert into public.highlight_snapshots
      (run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier)
    values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000099',
      'MLB999', '2026-08-25 12:00:01+00', 'PRODUCT', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A')$$,
  '23503',
  'insert or update on table "highlight_snapshots" violates foreign key constraint "highlight_snapshots_marketplace_category_id_fkey"',
  'unknown canonical category is rejected by the database'
);

select throws_ok(
  $$insert into public.highlight_snapshots
      (run_id, marketplace_category_id, product_id, observed_bucket, type, source_contract, priority_tier)
    values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      'MLB999', '2026-08-25 12:00:01+00', 'UNKNOWN', 'MELI_HIGHLIGHTS_CATEGORY_V1', 'A')$$,
  '23514',
  'new row for relation "highlight_snapshots" violates check constraint "highlight_snapshots_external_id_by_type_check"',
  'unknown highlight type is rejected'
);

insert into public.automotive_categories (category_id, name, priority_tier, scope_status, config_version)
values ('MLB300', 'Legacy category', 'A', 'ALLOWED', 'db-test-v1');
insert into public.highlight_snapshots (run_id, category_id, product_id, observed_bucket, type)
values ('40000000-0000-4000-8000-000000000001', 'MLB300', 'MLB3000', '2026-08-25 12:00:02+00', 'PRODUCT');

select is((select count(*)::integer from public.highlight_snapshots where category_id = 'MLB300'), 1,
  'legacy highlight persistence remains compatible');

select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'highlight_snapshots'
  and indexname = 'highlight_snapshots_marketplace_category_observed_idx'),
  'canonical category lookup has a bounded index');

select hasnt_table('public', 'discovery_candidates', 'no candidate table was introduced');

select * from finish();
rollback;
