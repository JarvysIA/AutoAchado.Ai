begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vertical_category_mappings'
      and column_name = 'priority_tier'
  ),
  'YES',
  'registry mapping priority tier is nullable'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.vertical_category_mappings'::regclass
      and conname in (
        'vertical_category_mappings_priority_tier_check',
        'vertical_category_mappings_scope_priority_consistency_check',
        'vertical_category_mappings_manual_source_consistency_check'
      )
  ),
  3,
  'registry mapping semantic constraints have stable names'
);

insert into public.marketplace_categories (
  marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
)
select
  format('20000000-0000-4000-8000-%s', lpad(value::text, 12, '0'))::uuid,
  'MERCADO_LIVRE',
  'MLB',
  format('SEM-%s', value),
  format('Semantic fixture %s', value),
  'db-test-v1'
from generate_series(1, 9) as value;

select lives_ok(
  format(
    $sql$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier, classification_version, decision_source)
    values ('AUTOMOTIVE', %L, %L, %L, 'db-test-v1', 'AUTO')$sql$,
    category_id, scope_status, priority_tier
  ),
  description
)
from (
  values
    ('20000000-0000-4000-8000-000000000001', 'ALLOWED', 'A', 'ALLOWED A is valid'),
    ('20000000-0000-4000-8000-000000000002', 'ALLOWED', 'B', 'ALLOWED B is valid'),
    ('20000000-0000-4000-8000-000000000003', 'ALLOWED', 'C', 'ALLOWED C is valid'),
    ('20000000-0000-4000-8000-000000000004', 'REVIEW', null, 'REVIEW without tier is valid'),
    ('20000000-0000-4000-8000-000000000005', 'EXCLUDED', null, 'EXCLUDED without tier is valid'),
    ('20000000-0000-4000-8000-000000000006', 'UNKNOWN', null, 'UNKNOWN without tier is valid')
) as valid_cases(category_id, scope_status, priority_tier, description);

select throws_ok(
  format(
    $sql$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier, classification_version, decision_source)
    values ('AUTOMOTIVE', '20000000-0000-4000-8000-000000000009', %L, %L, 'db-test-v1', 'AUTO')$sql$,
    scope_status, priority_tier
  ),
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_scope_priority_consistency_check"',
  description
)
from (
  values
    ('ALLOWED', null, 'ALLOWED without tier is rejected'),
    ('REVIEW', 'A', 'REVIEW A is rejected'),
    ('REVIEW', 'B', 'REVIEW B is rejected'),
    ('REVIEW', 'C', 'REVIEW C is rejected'),
    ('EXCLUDED', 'A', 'EXCLUDED A is rejected'),
    ('EXCLUDED', 'B', 'EXCLUDED B is rejected'),
    ('EXCLUDED', 'C', 'EXCLUDED C is rejected'),
    ('UNKNOWN', 'A', 'UNKNOWN A is rejected'),
    ('UNKNOWN', 'B', 'UNKNOWN B is rejected'),
    ('UNKNOWN', 'C', 'UNKNOWN C is rejected')
) as invalid_cases(scope_status, priority_tier, description);

select throws_ok(
  format(
    $sql$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier, classification_version, decision_source)
    values ('AUTOMOTIVE', '20000000-0000-4000-8000-000000000009', %L, 'EXCLUDED', 'db-test-v1', 'AUTO')$sql$,
    scope_status
  ),
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_priority_tier_check"',
  description
)
from (
  values
    ('ALLOWED', 'EXCLUDED is never an ALLOWED priority tier'),
    ('EXCLUDED', 'EXCLUDED is never an EXCLUDED-scope priority tier')
) as invalid_excluded_tier(scope_status, description);

select lives_ok(
  $$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier,
       classification_version, manual_override, decision_source)
    values (
      'AUTOMOTIVE', '20000000-0000-4000-8000-000000000007',
      'ALLOWED', 'A', 'db-test-v1', false, 'AUTO'
    )$$,
  'AUTO source with manual override false is valid'
);

select lives_ok(
  $$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier,
       classification_version, manual_override, decision_source, decided_at)
    values (
      'AUTOMOTIVE', '20000000-0000-4000-8000-000000000008',
      'REVIEW', null, 'db-test-v1', true, 'MANUAL', now()
    )$$,
  'MANUAL source with manual override true and decided_at is valid'
);

select throws_ok(
  $$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier,
       classification_version, manual_override, decision_source)
    values (
      'AUTOMOTIVE', '20000000-0000-4000-8000-000000000009',
      'ALLOWED', 'A', 'db-test-v1', true, 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_manual_source_consistency_check"',
  'AUTO with manual override true is rejected'
);

select throws_ok(
  $$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier,
       classification_version, manual_override, decision_source, decided_at)
    values (
      'AUTOMOTIVE', '20000000-0000-4000-8000-000000000009',
      'REVIEW', null, 'db-test-v1', false, 'MANUAL', now()
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_manual_source_consistency_check"',
  'MANUAL with manual override false is rejected'
);

select throws_ok(
  $$insert into public.vertical_category_mappings
      (vertical_key, marketplace_category_id, scope_status, priority_tier,
       classification_version, manual_override, decision_source)
    values (
      'AUTOMOTIVE', '20000000-0000-4000-8000-000000000009',
      'REVIEW', null, 'db-test-v1', true, 'MANUAL'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_manual_decided_at_check"',
  'MANUAL still requires decided_at'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'f'
      and conname in (
        'catalog_products_category_id_fkey',
        'marketplace_offers_category_id_fkey',
        'highlight_snapshots_category_id_fkey'
      )
      and confrelid = 'public.automotive_categories'::regclass
  ),
  3,
  'legacy product offer and highlight foreign keys remain on automotive_categories'
);

select ok(
  exists (select 1 from public.marketplaces where marketplace_key = 'MERCADO_LIVRE')
  and exists (select 1 from public.commerce_verticals where vertical_key = 'AUTOMOTIVE'),
  'registry marketplace and vertical seeds remain present'
);

select * from finish();
rollback;
