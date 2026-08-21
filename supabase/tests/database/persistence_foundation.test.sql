begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

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
  'all nine persistence tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'p'
      and connamespace = 'public'::regnamespace
      and conrelid in (
        'public.automotive_categories'::regclass, 'public.catalog_products'::regclass,
        'public.seller_profiles'::regclass, 'public.marketplace_offers'::regclass,
        'public.scan_runs'::regclass, 'public.highlight_snapshots'::regclass,
        'public.price_snapshots'::regclass, 'public.product_daily_stats'::regclass,
        'public.opportunity_candidates'::regclass
      )
  ),
  9,
  'every persistence table has a primary key'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'f'
      and connamespace = 'public'::regnamespace
      and conrelid in (
        'public.automotive_categories'::regclass, 'public.catalog_products'::regclass,
        'public.marketplace_offers'::regclass, 'public.highlight_snapshots'::regclass,
        'public.price_snapshots'::regclass, 'public.product_daily_stats'::regclass,
        'public.opportunity_candidates'::regclass
      )
  ),
  15,
  'all fifteen historical, identity and compatibility foreign keys exist'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'u'
      and connamespace = 'public'::regnamespace
      and conrelid in (
        'public.scan_runs'::regclass, 'public.highlight_snapshots'::regclass,
        'public.price_snapshots'::regclass, 'public.opportunity_candidates'::regclass
      )
  ),
  4,
  'scan, highlight, price and candidate natural identities are unique'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
  ),
  'RLS is enabled on every persistence table'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
      and has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'INSERT')
  ),
  'anon cannot insert into persistence tables'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
      and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'INSERT')
  ),
  'authenticated cannot insert into persistence tables'
);

select ok(
  (
    select bool_and(has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'SELECT, INSERT, UPDATE, DELETE'))
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
  ),
  'service_role has the required internal data privileges'
);

select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
  ),
  0,
  'no public-facing RLS policies exist'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
      and column_name ~* '(secret|token|cookie|credential|password)'
  ),
  0,
  'schema has no secret or credential columns'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('price_snapshots', 'product_daily_stats', 'opportunity_candidates')
      and column_name in (
        'price', 'original_price', 'best_eligible_price', 'second_best_price',
        'eligible_price_median', 'daily_best_eligible_price', 'daily_high_price',
        'median_offer_price', 'reference_price', 'current_price',
        'real_discount_percent', 'absolute_saving', 'historical_discount_score',
        'demand_score', 'sellability_score', 'seller_quality_score',
        'price_attractiveness_score', 'history_confidence_score', 'specificity_penalty',
        'universal_appeal_score', 'final_score'
      )
      and data_type <> 'numeric'
  ),
  'money and score columns use numeric semantics'
);

select is(
  (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'seller_profiles' and column_name = 'seller_id'),
  'bigint',
  'seller_id uses bigint'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'automotive_categories', 'catalog_products', 'seller_profiles',
        'marketplace_offers', 'scan_runs', 'highlight_snapshots',
        'price_snapshots', 'product_daily_stats', 'opportunity_candidates'
      )
      and column_name like '%\_at' escape '\'
      and data_type <> 'timestamp with time zone'
  ),
  'all instant columns use timestamptz'
);

select ok(
  (select data_type = 'date' from information_schema.columns where table_schema = 'public' and table_name = 'product_daily_stats' and column_name = 'stat_date')
  and
  (select data_type = 'date' from information_schema.columns where table_schema = 'public' and table_name = 'opportunity_candidates' and column_name = 'candidate_date'),
  'calendar fields use date'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.automotive_categories'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%priority_tier%EXCLUDED%'
  ),
  'category priority allowlist is constrained'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.automotive_categories'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%scope_status%UNKNOWN%'
  ),
  'category scope allowlist is constrained'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.scan_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%COMPLETED%FAILED%'
  ),
  'scan status allowlist is constrained'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.highlight_snapshots'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%position%20%'
  ),
  'highlight position is constrained to 1 through 20'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.price_snapshots'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%best_eligible_price%0%'
  ),
  'snapshot prices require positive values when present'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_daily_stats'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%eligible_offer_count%0%'
  ),
  'eligible offer count cannot be negative'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and column_name = 'commercial_family_key'
      and table_name in ('automotive_categories', 'catalog_products')
  ),
  2,
  'commercial family is independently represented on category and product'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunity_candidates'
      and column_name = 'universal_appeal_score' and data_type = 'numeric'
  ),
  'universal appeal has a separate numeric signal'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunity_candidates'
      and column_name in ('promotion_cooldown_until', 'breakout_trigger', 'breakout_reason', 'recycle_reason')
  ),
  4,
  'cooldown, breakout and recycle state is explicit'
);

select is(
  (
    select count(*)::integer from information_schema.tables
    where table_schema = 'public'
      and table_name in ('price_timeline', 'conversion_feedback', 'coupons', 'coupon_prices')
  ),
  0,
  'future timeline, conversion and coupon tables were not created'
);

insert into public.automotive_categories (
  category_id, name, is_leaf, priority_tier, scope_status, commercial_family_key, config_version
) values ('MLB2238', 'Pneus e Acessorios', true, 'A', 'ALLOWED', 'pneus', 'db-test-v1')
on conflict (category_id) do update set name = excluded.name;

insert into public.catalog_products (
  product_id, category_id, name, domain_id, commercial_family_key, config_version
) values ('MLB28145944', 'MLB2238', 'Produto de teste', 'MLB-TIRES', 'pneus', 'db-test-v1')
on conflict (product_id) do update set last_seen_at = now();

insert into public.seller_profiles (seller_id, nickname)
values (123456789, 'SELLER_TEST')
on conflict (seller_id) do update set checked_at = now();

insert into public.marketplace_offers (item_id, product_id, seller_id, category_id, title, price, original_price, currency_id)
values ('MLB4999999999', 'MLB28145944', 123456789, 'MLB2238', 'Oferta de teste', 100.00, 120.00, 'BRL')
on conflict (item_id) do update set last_seen_at = now();

insert into public.scan_runs (run_id, scheduled_bucket, job_type, shard_key, status, config_version)
values ('00000000-0000-4000-8000-000000000001', '2026-08-20 12:00:00+00', 'PRICE_SCAN', 'MLB2238', 'RUNNING', 'db-test-v1')
on conflict (job_type, scheduled_bucket, shard_key) do update set status = excluded.status;
insert into public.scan_runs (run_id, scheduled_bucket, job_type, shard_key, status, config_version)
values ('00000000-0000-4000-8000-000000000002', '2026-08-20 12:00:00+00', 'PRICE_SCAN', 'MLB2238', 'RUNNING', 'db-test-v1')
on conflict (job_type, scheduled_bucket, shard_key) do update set status = excluded.status;

select is(
  (select count(*)::integer from public.scan_runs where job_type = 'PRICE_SCAN' and scheduled_bucket = '2026-08-20 12:00:00+00' and shard_key = 'MLB2238'),
  1,
  'scan retries are idempotent by key'
);

insert into public.highlight_snapshots (run_id, category_id, product_id, observed_bucket, type, position)
values ('00000000-0000-4000-8000-000000000001', 'MLB2238', 'MLB28145944', '2026-08-20 12:00:00+00', 'PRODUCT', 1)
on conflict (observed_bucket, category_id, product_id) do update set position = excluded.position;
insert into public.highlight_snapshots (run_id, category_id, product_id, observed_bucket, type, position)
values ('00000000-0000-4000-8000-000000000001', 'MLB2238', 'MLB28145944', '2026-08-20 12:00:00+00', 'PRODUCT', 1)
on conflict (observed_bucket, category_id, product_id) do update set position = excluded.position;

select is(
  (select count(*)::integer from public.highlight_snapshots where run_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'highlight retries do not duplicate snapshots'
);

insert into public.price_snapshots (
  run_id, product_id, item_id, seller_id, observed_bucket, best_eligible_price,
  second_best_price, eligible_price_median, eligible_offer_count, original_price, currency_id, eligible
) values ('00000000-0000-4000-8000-000000000001', 'MLB28145944', 'MLB4999999999', 123456789,
  '2026-08-20 12:00:00+00', 100.00, 105.00, 102.50, 2, 120.00, 'BRL', true)
on conflict (observed_bucket, product_id) do update set best_eligible_price = excluded.best_eligible_price;
insert into public.price_snapshots (
  run_id, product_id, item_id, seller_id, observed_bucket, best_eligible_price,
  second_best_price, eligible_price_median, eligible_offer_count, original_price, currency_id, eligible
) values ('00000000-0000-4000-8000-000000000001', 'MLB28145944', 'MLB4999999999', 123456789,
  '2026-08-20 12:00:00+00', 100.00, 105.00, 102.50, 2, 120.00, 'BRL', true)
on conflict (observed_bucket, product_id) do update set best_eligible_price = excluded.best_eligible_price;

select is(
  (select count(*)::integer from public.price_snapshots where run_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'price retries do not duplicate snapshots'
);

insert into public.product_daily_stats (product_id, stat_date, eligible_offer_count, daily_best_eligible_price)
values ('MLB28145944', '2026-08-20', 1, 100.00)
on conflict (product_id, stat_date) do update set eligible_offer_count = excluded.eligible_offer_count;
insert into public.product_daily_stats (product_id, stat_date, eligible_offer_count, daily_best_eligible_price)
values ('MLB28145944', '2026-08-20', 1, 100.00)
on conflict (product_id, stat_date) do update set eligible_offer_count = excluded.eligible_offer_count;

select is(
  (select count(*)::integer from public.product_daily_stats where product_id = 'MLB28145944' and stat_date = '2026-08-20'),
  1,
  'daily stats retries retain one product/day row'
);

insert into public.opportunity_candidates (
  candidate_date, product_id, item_id, current_price, reference_price,
  universal_appeal_score, final_score, score_version, config_version, reason_codes, gate_results
) values (
  '2026-08-20', 'MLB28145944', 'MLB4999999999', 100.00, 120.00,
  75.00, 80.00, 'score-v1', 'db-test-v1', '["PRICE_OK"]', '{"seller": true}'
)
on conflict (product_id, candidate_date, score_version) do update set final_score = excluded.final_score;
insert into public.opportunity_candidates (
  candidate_date, product_id, item_id, current_price, reference_price,
  universal_appeal_score, final_score, score_version, config_version, reason_codes, gate_results
) values (
  '2026-08-20', 'MLB28145944', 'MLB4999999999', 100.00, 120.00,
  75.00, 80.00, 'score-v1', 'db-test-v1', '["PRICE_OK"]', '{"seller": true}'
)
on conflict (product_id, candidate_date, score_version) do update set final_score = excluded.final_score;

select is(
  (select count(*)::integer from public.opportunity_candidates where product_id = 'MLB28145944' and candidate_date = '2026-08-20'),
  1,
  'candidate retries retain one product/offer/day row'
);

update public.marketplace_offers set active = false where item_id = 'MLB4999999999';

select ok(
  (select not active from public.marketplace_offers where item_id = 'MLB4999999999')
  and (select count(*) = 1 from public.price_snapshots where item_id = 'MLB4999999999'),
  'soft-disable preserves historical price snapshots'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and connamespace = 'public'::regnamespace
      and confdeltype = 'c'
      and conrelid in (
        'public.automotive_categories'::regclass,
        'public.catalog_products'::regclass,
        'public.marketplace_offers'::regclass,
        'public.highlight_snapshots'::regclass,
        'public.price_snapshots'::regclass,
        'public.product_daily_stats'::regclass,
        'public.opportunity_candidates'::regclass
      )
  ),
  'foreign keys do not use destructive cascade deletes'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('price_snapshots', 'product_daily_stats', 'opportunity_candidates')
      and data_type in ('real', 'double precision')
  ),
  'financial tables contain no floating-point columns'
);

select ok(
  (select data_type = 'jsonb' from information_schema.columns where table_schema = 'public' and table_name = 'opportunity_candidates' and column_name = 'reason_codes')
  and
  (select data_type = 'jsonb' from information_schema.columns where table_schema = 'public' and table_name = 'opportunity_candidates' and column_name = 'gate_results'),
  'reason codes and gate results use evolvable jsonb structures'
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
  'future tables grant nothing automatically to Data API roles'
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
      and d.defaclobjtype = 'S'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ),
  'future sequences grant nothing automatically to Data API roles'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    left join pg_roles r on r.oid = a.grantee
    where d.defaclrole = 'postgres'::regrole
      and (n.nspname = 'public' or d.defaclnamespace = 0)
      and d.defaclobjtype = 'f'
      and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
  ),
  'future functions grant no automatic execute to PUBLIC or Data API roles'
);

create table public.default_acl_probe_table (id bigint primary key);
create sequence public.default_acl_probe_sequence;
create function public.default_acl_probe_function()
returns integer
language sql
immutable
as $$ select 1 $$;

select ok(
  not has_table_privilege('anon', 'public.default_acl_probe_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_table_privilege('authenticated', 'public.default_acl_probe_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_table_privilege('service_role', 'public.default_acl_probe_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'a synthetic future table inherits no Data API role privileges'
);

select ok(
  not has_sequence_privilege('anon', 'public.default_acl_probe_sequence', 'USAGE, SELECT, UPDATE')
  and not has_sequence_privilege('authenticated', 'public.default_acl_probe_sequence', 'USAGE, SELECT, UPDATE')
  and not has_sequence_privilege('service_role', 'public.default_acl_probe_sequence', 'USAGE, SELECT, UPDATE'),
  'a synthetic future sequence inherits no Data API role privileges'
);

select ok(
  not has_function_privilege('anon', 'public.default_acl_probe_function()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.default_acl_probe_function()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.default_acl_probe_function()', 'EXECUTE'),
  'a synthetic future function grants no execute to Data API roles'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.default_acl_probe_function()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'a synthetic future function grants no execute to PUBLIC'
);

select ok(
  has_sequence_privilege('service_role', 'public.highlight_snapshots_highlight_snapshot_id_seq', 'USAGE, SELECT')
  and has_sequence_privilege('service_role', 'public.price_snapshots_price_snapshot_id_seq', 'USAGE, SELECT'),
  'existing explicit service_role sequence grants remain intact'
);

select * from finish();
rollback;
