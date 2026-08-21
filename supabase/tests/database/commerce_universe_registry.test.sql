begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
  ),
  4,
  'all four commerce universe registry tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'p'
      and conrelid in (
        'public.marketplaces'::regclass,
        'public.commerce_verticals'::regclass,
        'public.marketplace_categories'::regclass,
        'public.vertical_category_mappings'::regclass
      )
  ),
  4,
  'every registry table has a primary key'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'f'
      and conname in (
        'marketplace_categories_marketplace_key_fkey',
        'marketplace_categories_parent_marketplace_category_id_fkey',
        'vertical_category_mappings_vertical_key_fkey',
        'vertical_category_mappings_marketplace_category_id_fkey',
        'automotive_categories_marketplace_category_id_fkey'
      )
  ),
  5,
  'registry and compatibility foreign keys exist'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketplace_categories'::regclass
      and conname = 'marketplace_categories_external_identity_key'
      and contype = 'u'
  ),
  'external category identity has a composite unique constraint'
);

select ok(
  (
    select column_default like '%gen_random_uuid%'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_categories'
      and column_name = 'marketplace_category_id'
  ),
  'marketplace category UUID is generated with the existing pgcrypto strategy'
);

select ok(
  (
    select is_nullable = 'NO' and column_default = '''{}''::text[]'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_categories'
      and column_name = 'path_external_ids'
  ) and (
    select is_nullable = 'NO' and column_default = '''{}''::text[]'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_categories'
      and column_name = 'path_names'
  ),
  'external category paths are non-null text arrays with empty defaults'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
  ),
  'RLS is enabled on every registry table'
);

select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
  ),
  0,
  'registry tables have no public-facing RLS policies'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and has_table_privilege('public', format('%I.%I', t.table_schema, t.table_name),
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  ),
  'PUBLIC has no registry table privileges'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name),
        'SELECT, INSERT, UPDATE, DELETE')
  ),
  'anon has no registry table privileges'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name),
        'SELECT, INSERT, UPDATE, DELETE')
  ),
  'authenticated has no registry table privileges'
);

select ok(
  (
    select bool_and(has_table_privilege(
      'service_role', format('%I.%I', t.table_schema, t.table_name), 'SELECT, INSERT, UPDATE'
    ))
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
  ),
  'service_role has only the required registry write operations'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'DELETE')
  ),
  'service_role has no registry DELETE privilege'
);

select is(
  (
    select count(*)::integer
    from information_schema.sequences
    where sequence_schema = 'public'
      and sequence_name like any (array[
        'marketplaces%', 'commerce_verticals%',
        'marketplace_categories%', 'vertical_category_mappings%'
      ])
  ),
  0,
  'registry UUID identities create no sequences'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    left join pg_roles r on r.oid = a.grantee
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ),
  'deny-by-default table privileges remain intact'
);

select is(
  (select count(*)::integer from public.marketplaces),
  1,
  'exactly one marketplace seed exists'
);

select ok(
  exists (
    select 1 from public.marketplaces
    where marketplace_key = 'MERCADO_LIVRE'
      and name = 'Mercado Livre'
      and active
      and config_version = 'commerce-registry/v1'
  ),
  'the only marketplace seed is Mercado Livre'
);

select ok(
  not exists (
    select 1 from public.marketplaces
    where marketplace_key in ('SHOPEE', 'AMAZON', 'MAGALU', 'KABUM')
  ),
  'no future marketplace placeholder was seeded'
);

select is(
  (select count(*)::integer from public.commerce_verticals),
  1,
  'exactly one commerce vertical seed exists'
);

select ok(
  exists (
    select 1 from public.commerce_verticals
    where vertical_key = 'AUTOMOTIVE'
      and name = 'Automotivo'
      and active
      and config_version = 'commerce-registry/v1'
  ),
  'the only commerce vertical seed is automotive'
);

select ok(
  not exists (
    select 1 from public.commerce_verticals
    where vertical_key in (
      'HOME', 'APPLIANCES', 'FASHION', 'BEAUTY', 'ELECTRONICS',
      'KIDS', 'GAMES', 'SPORTS_FITNESS', 'PET', 'PETS', 'TOOLS'
    )
  ),
  'no future vertical placeholder was seeded'
);

select is(
  (select count(*)::integer from public.marketplace_categories),
  0,
  'no external category was seeded'
);

select is(
  (select count(*)::integer from public.vertical_category_mappings),
  0,
  'no category classification was seeded'
);

select ok(
  (
    select data_type = 'uuid' and is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automotive_categories'
      and column_name = 'marketplace_category_id'
  ),
  'automotive compatibility link is a nullable UUID'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automotive_categories'
      and column_name in (
        'category_id', 'parent_id', 'name', 'path', 'family_key',
        'commercial_family_key', 'priority_tier', 'scope_status',
        'is_leaf', 'manual_override', 'active', 'config_version',
        'checked_at', 'created_at', 'updated_at'
      )
  ),
  15,
  'all legacy automotive category columns are preserved'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.automotive_categories'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (category_id)'
  ),
  'automotive category primary key is unchanged'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.automotive_categories'::regclass
      and conname = 'automotive_categories_marketplace_category_id_fkey'
      and confrelid = 'public.marketplace_categories'::regclass
  ),
  'automotive compatibility link references the canonical external category'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'automotive_categories'
      and indexname = 'automotive_categories_marketplace_category_id_key'
      and indexdef like '%UNIQUE%WHERE (marketplace_category_id IS NOT NULL)%'
  ),
  'automotive compatibility link is unique when present'
);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
  ),
  9,
  'all nine existing persistence tables remain present'
);

select ok(
  not exists (
    select 1 from pg_constraint
    where contype = 'f'
      and conrelid in (
        'public.marketplace_categories'::regclass,
        'public.vertical_category_mappings'::regclass,
        'public.automotive_categories'::regclass
      )
      and confdeltype = 'c'
  ),
  'registry and compatibility foreign keys never cascade deletes'
);

select is(
  (
    select count(*)::integer from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'marketplace_categories_parent_idx',
        'marketplace_categories_active_idx',
        'vertical_category_mappings_category_idx',
        'vertical_category_mappings_discovery_idx'
      )
  ),
  4,
  'only the four intentional registry lookup indexes exist'
);

insert into public.marketplace_categories (
  marketplace_category_id, marketplace_key, site_id, external_category_id,
  name, config_version
) values (
  '10000000-0000-4000-8000-000000000001', 'MERCADO_LIVRE', 'MLB',
  'EXT-1', 'Fixture root', 'db-test-v1'
);

select throws_ok(
  $$insert into public.marketplace_categories (
      marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
    ) values (
      '10000000-0000-4000-8000-000000000099', 'MERCADO_LIVRE', 'MLB',
      'EXT-1', 'Duplicate fixture', 'db-test-v1'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "marketplace_categories_external_identity_key"',
  'same marketplace, site and external category identity is rejected'
);

select lives_ok(
  $$insert into public.marketplace_categories (
      marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
    ) values (
      '10000000-0000-4000-8000-000000000002', 'MERCADO_LIVRE', 'MLA',
      'EXT-1', 'Different site fixture', 'db-test-v1'
    )$$,
  'the same external category ID is allowed in a different site'
);

insert into public.marketplaces (marketplace_key, name, config_version)
values ('TEST_MARKETPLACE', 'Transactional test marketplace', 'db-test-v1');

select lives_ok(
  $$insert into public.marketplace_categories (
      marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
    ) values (
      '10000000-0000-4000-8000-000000000003', 'TEST_MARKETPLACE', 'MLB',
      'EXT-1', 'Different marketplace fixture', 'db-test-v1'
    )$$,
  'the same site and external category ID is allowed in another marketplace'
);

select throws_ok(
  $$update public.marketplace_categories
       set parent_marketplace_category_id = marketplace_category_id
     where marketplace_category_id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'new row for relation "marketplace_categories" violates check constraint "marketplace_categories_not_self_parent_check"',
  'an external category cannot be its own parent'
);

select throws_ok(
  $$insert into public.marketplace_categories (
      marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
    ) values (
      '10000000-0000-4000-8000-000000000004', 'MERCADO_LIVRE', ' ',
      'EXT-BLANK', 'Blank site fixture', 'db-test-v1'
    )$$,
  '23514',
  'new row for relation "marketplace_categories" violates check constraint "marketplace_categories_site_id_check"',
  'blank external identity components are rejected'
);

insert into public.commerce_verticals (vertical_key, name, config_version)
values ('TEST_VERTICAL', 'Transactional test vertical', 'db-test-v1');

select lives_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000001',
      'ALLOWED', 'A', 'db-test-v1', 'AUTO'
    )$$,
  'an external category can map to the automotive vertical'
);

select lives_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'TEST_VERTICAL', '10000000-0000-4000-8000-000000000001',
      'REVIEW', 'C', 'db-test-v1', 'AUTO'
    )$$,
  'the same external category can map to a second vertical'
);

select is(
  (
    select count(*)::integer from public.vertical_category_mappings
    where marketplace_category_id = '10000000-0000-4000-8000-000000000001'
  ),
  2,
  'vertical mapping identity supports many-to-many classification'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'INVALID', 'A', 'db-test-v1', 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_scope_status_check"',
  'scope status is allowlisted'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'ALLOWED', 'D', 'db-test-v1', 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_priority_tier_check"',
  'priority tier is allowlisted'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'ALLOWED', 'A', 'db-test-v1', 'ROBOT'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_decision_source_check"',
  'decision source is allowlisted'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'EXCLUDED', 'A', 'db-test-v1', 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_excluded_consistency_check"',
  'excluded scope cannot use an active discovery tier'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'ALLOWED', 'EXCLUDED', 'db-test-v1', 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_excluded_consistency_check"',
  'excluded tier cannot use an active scope'
);

select lives_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000002',
      'EXCLUDED', 'EXCLUDED', 'db-test-v1', 'AUTO'
    )$$,
  'excluded scope and tier are accepted together'
);

insert into public.marketplace_categories (
  marketplace_category_id, marketplace_key, site_id, external_category_id, name, config_version
) values
  ('10000000-0000-4000-8000-000000000005', 'MERCADO_LIVRE', 'MLB', 'EXT-5', 'Fixture five', 'db-test-v1'),
  ('10000000-0000-4000-8000-000000000006', 'MERCADO_LIVRE', 'MLB', 'EXT-6', 'Fixture six', 'db-test-v1'),
  ('10000000-0000-4000-8000-000000000007', 'MERCADO_LIVRE', 'MLB', 'EXT-7', 'Fixture seven', 'db-test-v1'),
  ('10000000-0000-4000-8000-000000000008', 'MERCADO_LIVRE', 'MLB', 'EXT-8', 'Fixture eight', 'db-test-v1');

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, manual_override, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000005',
      'ALLOWED', 'A', 'db-test-v1', true, 'AUTO'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_manual_source_check"',
  'manual override cannot have an automatic decision source'
);

select throws_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, manual_override, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000006',
      'ALLOWED', 'A', 'db-test-v1', true, 'MANUAL'
    )$$,
  '23514',
  'new row for relation "vertical_category_mappings" violates check constraint "vertical_category_mappings_manual_decided_at_check"',
  'manual decisions require a decision timestamp'
);

select lives_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, manual_override, decision_source, decided_at
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000007',
      'ALLOWED', 'A', 'db-test-v1', true, 'MANUAL', now()
    )$$,
  'a timestamped manual override is accepted'
);

select lives_ok(
  $$insert into public.vertical_category_mappings (
      vertical_key, marketplace_category_id, scope_status, priority_tier,
      classification_version, manual_override, decision_source
    ) values (
      'AUTOMOTIVE', '10000000-0000-4000-8000-000000000008',
      'REVIEW', 'C', 'db-test-v1', false, 'AUTO'
    )$$,
  'an automatic non-override classification is accepted'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vertical_category_mappings'
      and column_name in ('family_key', 'commercial_family_key_default')
  ),
  2,
  'technical and default commercial families are distinct fields'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vertical_category_mappings'
      and column_name in ('classification_rule', 'classification_version', 'decision_reason')
  ),
  3,
  'classification audit metadata is explicit'
);

select ok(
  not exists (
    select 1 from pg_trigger t
    where t.tgrelid in (
      'public.marketplace_categories'::regclass,
      'public.vertical_category_mappings'::regclass,
      'public.automotive_categories'::regclass
    )
      and not t.tgisinternal
  ),
  'no bidirectional projection trigger was created'
);

select ok(
  obj_description('public.marketplace_categories'::regclass, 'pg_class') like 'Canonical current-state%'
  and obj_description('public.vertical_category_mappings'::regclass, 'pg_class') like 'Canonical internal classification%'
  and col_description('public.automotive_categories'::regclass, (
    select ordinal_position::integer from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automotive_categories'
      and column_name = 'marketplace_category_id'
  )) like 'Temporary compatibility link%',
  'canonical sources and temporary compatibility are documented in schema comments'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and column_name ~* '(secret|token|cookie|credential|password)'
  ),
  0,
  'registry schema has no credential-bearing columns'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'marketplaces', 'commerce_verticals',
        'marketplace_categories', 'vertical_category_mappings'
      )
      and column_name like '%\_at' escape '\'
      and data_type <> 'timestamp with time zone'
  ),
  'all registry instant fields use timestamptz'
);

select * from finish();
rollback;
