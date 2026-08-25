begin;

create extension if not exists pgtap with schema extensions;
select plan(87);

select ok(to_regprocedure('public.apply_commerce_registry_sync(jsonb)') is not null, 'atomic registry RPC exists');
select is((select prorettype from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), 'jsonb'::regtype::oid, 'RPC returns jsonb');
select is((select proargtypes::text from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), '3802', 'RPC accepts exactly one jsonb argument');
select ok((select prosecdef from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), 'RPC is SECURITY DEFINER');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), 'postgres', 'RPC owner is postgres');
select is((select provolatile::text from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), 'v', 'RPC is VOLATILE');
select is((select array_to_string(proconfig, ',') from pg_proc where oid='public.apply_commerce_registry_sync(jsonb)'::regprocedure), 'search_path=""', 'RPC pins an empty search_path');
select ok(not has_function_privilege('service_role','private.commerce_registry_input_rows(jsonb)','EXECUTE'), 'service_role cannot execute private parser');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) like '%pg_try_advisory_xact_lock%', 'RPC uses a try advisory transaction lock');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) not like '%EXECUTE format%', 'RPC contains no dynamic SQL');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) like '%node_name_map as materialized%', 'path validation materializes the node-name lookup map');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) like '%jsonb_object_agg%', 'path validation uses direct JSONB node-name lookups');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) not like '%where not exists (select 1 from public.vertical_category_mappings x%', 'mapping insert omits the redundant anti-join');
select ok(not has_function_privilege('public','public.apply_commerce_registry_sync(jsonb)','EXECUTE'), 'PUBLIC cannot execute RPC');
select ok(not has_function_privilege('anon','public.apply_commerce_registry_sync(jsonb)','EXECUTE'), 'anon cannot execute RPC');
select ok(not has_function_privilege('authenticated','public.apply_commerce_registry_sync(jsonb)','EXECUTE'), 'authenticated cannot execute RPC');
select ok(has_function_privilege('service_role','public.apply_commerce_registry_sync(jsonb)','EXECUTE'), 'service_role can execute RPC');
select ok(has_table_privilege('service_role','public.marketplace_categories','SELECT'), 'service_role can select categories');
select ok(has_table_privilege('service_role','public.vertical_category_mappings','SELECT'), 'service_role can select mappings');
select ok(not has_table_privilege('service_role','public.marketplace_categories','INSERT'), 'service_role cannot insert categories directly');
select ok(not has_table_privilege('service_role','public.marketplace_categories','UPDATE'), 'service_role cannot update categories directly');
select ok(not has_table_privilege('service_role','public.marketplace_categories','DELETE'), 'service_role cannot delete categories');
select ok(not has_table_privilege('service_role','public.vertical_category_mappings','INSERT'), 'service_role cannot insert mappings directly');
select ok(not has_table_privilege('service_role','public.vertical_category_mappings','UPDATE'), 'service_role cannot update mappings directly');
select ok(not has_table_privilege('service_role','public.vertical_category_mappings','DELETE'), 'service_role cannot delete mappings');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.marketplace_categories'::regclass,'public.vertical_category_mappings'::regclass)), 'RLS remains enabled');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('marketplace_categories','vertical_category_mappings')), 0, 'mutable registry tables have no public policies');
select ok(has_table_privilege('service_role','public.marketplaces','SELECT, INSERT, UPDATE'), 'marketplace seed grants are unchanged');
select ok(has_table_privilege('service_role','public.commerce_verticals','SELECT, INSERT, UPDATE'), 'vertical seed grants are unchanged');
select isnt(hashtextextended('autoachado:commerce-registry:MERCADO_LIVRE:MLB',0), hashtextextended('autoachado:commerce-registry:MERCADO_LIVRE:MLA',0), 'different sites use different lock keys');
select isnt(hashtextextended('autoachado:commerce-registry:MERCADO_LIVRE:MLB',0), hashtextextended('autoachado:commerce-registry:OTHER:MLB',0), 'different marketplaces use different lock keys');

create temporary table registry_payloads(name text primary key, payload jsonb) on commit drop;
insert into registry_payloads values ('base', $json$
{
  "context":{"contractVersion":"commerce-registry-apply/v1","marketplaceKey":"MERCADO_LIVRE","siteId":"TAP_ATOMIC","verticalKey":"AUTOMOTIVE","rootExternalCategoryId":"ROOT","sourceVersion":"source/v1","classificationVersion":"class/v1","configVersion":"config/v1","checkedAt":"2026-08-24T12:00:00Z","expectedCategoryCount":3,"expectedMappingCount":3,"expectedAutomaticEligibleCount":2},
  "rows":[
    {"externalCategoryId":"ROOT","parentExternalCategoryId":null,"name":"Root","pathExternalIds":["ROOT"],"pathNames":["Root"],"isLeaf":false,"scopeStatus":"REVIEW","priorityTier":null,"familyKey":null,"commercialFamilyKeyDefault":null,"classificationRule":"root","decisionReason":null},
    {"externalCategoryId":"PARENT","parentExternalCategoryId":"ROOT","name":"Parent","pathExternalIds":["ROOT","PARENT"],"pathNames":["Root","Parent"],"isLeaf":false,"scopeStatus":"ALLOWED","priorityTier":"B","familyKey":"maintenance","commercialFamilyKeyDefault":"maintenance","classificationRule":"parent","decisionReason":"test"},
    {"externalCategoryId":"CHILD","parentExternalCategoryId":"PARENT","name":"Child","pathExternalIds":["ROOT","PARENT","CHILD"],"pathNames":["Root","Parent","Child"],"isLeaf":true,"scopeStatus":"ALLOWED","priorityTier":"A","familyKey":"parts","commercialFamilyKeyDefault":"parts","classificationRule":"child","decisionReason":"test"}
  ]
}
$json$::jsonb);
insert into registry_payloads
select 'reduced', jsonb_set(jsonb_set(jsonb_set(payload,'{rows}',(payload->'rows') - 2),'{rows,1,isLeaf}','true'::jsonb),'{context,expectedCategoryCount}','2'::jsonb)
  || jsonb_build_object('context', jsonb_set(jsonb_set(payload->'context','{expectedCategoryCount}','2'::jsonb),'{expectedMappingCount}','2'::jsonb))
  from registry_payloads where name='base';
update registry_payloads set payload=jsonb_set(payload,'{context,expectedAutomaticEligibleCount}','1'::jsonb) where name='reduced';

grant select on registry_payloads to service_role;

select throws_ok($$select public.apply_commerce_registry_sync(null::jsonb)$$,'22023','REGISTRY_INVALID_PAYLOAD','null payload is rejected');
select throws_ok($$select public.apply_commerce_registry_sync('{}'::jsonb)$$,'22023','REGISTRY_INVALID_PAYLOAD','empty object is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{context,contractVersion}','"wrong"'))$$,'22023','REGISTRY_INVALID_PAYLOAD','wrong contract version is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,name}','" Child "'))$$,'22023','REGISTRY_INVALID_PAYLOAD','untrimmed row string is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows}','{}'))$$,'22023','REGISTRY_INVALID_PAYLOAD','non-array rows are rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set(jsonb_set(jsonb_set((select payload from registry_payloads where name='base'),'{rows}',((select payload->'rows' from registry_payloads where name='base') || (select payload->'rows'->0 from registry_payloads where name='base'))),'{context,expectedCategoryCount}','4'),'{context,expectedMappingCount}','4'))$$,'22023','REGISTRY_DUPLICATE_CATEGORY','duplicate category is rejected before DML');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{context,expectedCategoryCount}','9'))$$,'22023','REGISTRY_COUNT_MISMATCH','count mismatch is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{context,rootExternalCategoryId}','"MISSING"'))$$,'22023','REGISTRY_INVALID_PAYLOAD','missing root is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,parentExternalCategoryId}','"MISSING"'))$$,'23514','REGISTRY_PARENT_MISSING','missing parent is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,pathNames,2}','"Wrong"'))$$,'23514','REGISTRY_PATH_INVALID','invalid path is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,pathExternalIds}','["ROOT","MISSING","PARENT","CHILD"]'),'{rows,2,pathNames}','["Root","Missing","Parent","Child"]'))$$,'23514','REGISTRY_PATH_INVALID','unknown node inside path is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,pathExternalIds}','["ROOT","PARENT","PARENT","CHILD"]'),'{rows,2,pathNames}','["Root","Parent","Parent","Child"]'))$$,'23514','REGISTRY_PATH_INVALID','duplicate path ID is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,pathExternalIds,0}','"OTHER"'))$$,'23514','REGISTRY_PATH_INVALID','wrong path root is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,isLeaf}','false'))$$,'23514','REGISTRY_INVALID_PAYLOAD','invalid leaf flag is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{rows,2,scopeStatus}','"REVIEW"'))$$,'23514','REGISTRY_CLASSIFICATION_INVALID','invalid scope tier is rejected');
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{context,expectedAutomaticEligibleCount}','0'))$$,'22023','REGISTRY_COUNT_MISMATCH','automatic count mismatch is rejected');
select is((select count(*)::integer from public.marketplace_categories where site_id='TAP_ATOMIC'),0,'validation failures write no categories');

set local role service_role;
select lives_ok($$select public.apply_commerce_registry_sync((select payload from registry_payloads where name='base'))$$,'service_role can apply through RPC');
reset role;
delete from public.vertical_category_mappings where marketplace_category_id in (select marketplace_category_id from public.marketplace_categories where site_id='TAP_ATOMIC');
delete from public.marketplace_categories where site_id='TAP_ATOMIC';

create temporary table registry_results(name text primary key, result jsonb) on commit drop;
insert into registry_results select 'first',public.apply_commerce_registry_sync(payload) from registry_payloads where name='base';
select is((select result->>'contractVersion' from registry_results where name='first'),'commerce-registry-apply-result/v1','result contract is versioned');
select is((select (result#>>'{categories,inserted}')::integer from registry_results where name='first'),3,'first apply inserts all categories');
select is((select (result#>>'{mappings,inserted}')::integer from registry_results where name='first'),3,'first apply inserts all mappings');
select is((select (result#>>'{effective,activeMappings}')::integer from registry_results where name='first'),3,'first apply reports effective active mappings');
select ok((select child.parent_marketplace_category_id=parent.marketplace_category_id from public.marketplace_categories child join public.marketplace_categories parent on parent.site_id=child.site_id and parent.external_category_id='PARENT' where child.site_id='TAP_ATOMIC' and child.external_category_id='CHILD'),'parent external ID resolves to server UUID');
select ok((select bool_and(first_seen_at='2026-08-24T12:00:00Z' and last_seen_at='2026-08-24T12:00:00Z' and source_checked_at='2026-08-24T12:00:00Z') from public.marketplace_categories where site_id='TAP_ATOMIC'),'first factual timestamps use checkedAt');

create temporary table registry_timestamps as select marketplace_category_id,first_seen_at,last_seen_at,source_checked_at,updated_at from public.marketplace_categories where site_id='TAP_ATOMIC';
insert into registry_results select 'replay',public.apply_commerce_registry_sync(payload) from registry_payloads where name='base';
select is((select (result#>>'{categories,unchanged}')::integer from registry_results where name='replay'),3,'identical replay leaves categories unchanged');
select is((select (result#>>'{mappings,unchanged}')::integer from registry_results where name='replay'),3,'identical replay leaves mappings unchanged');
select ok(not exists(select 1 from public.marketplace_categories c join registry_timestamps t using(marketplace_category_id) where row(c.first_seen_at,c.last_seen_at,c.source_checked_at,c.updated_at) is distinct from row(t.first_seen_at,t.last_seen_at,t.source_checked_at,t.updated_at)),'identical replay preserves category timestamps');

insert into registry_results select 'checked',public.apply_commerce_registry_sync(jsonb_set(payload,'{context,checkedAt}','"2026-08-25T12:00:00Z"')) from registry_payloads where name='base';
select ok((select (result#>>'{categories,unchanged}')::integer=3 and (result#>>'{mappings,unchanged}')::integer=3 from registry_results where name='checked'),'checkedAt-only replay remains unchanged');
select ok(not exists(select 1 from public.marketplace_categories c join registry_timestamps t using(marketplace_category_id) where row(c.first_seen_at,c.last_seen_at,c.source_checked_at,c.updated_at) is distinct from row(t.first_seen_at,t.last_seen_at,t.source_checked_at,t.updated_at)),'checkedAt-only replay causes no timestamp churn');

insert into registry_results select 'source',public.apply_commerce_registry_sync(jsonb_set(jsonb_set(payload,'{context,sourceVersion}','"source/v2"'),'{context,checkedAt}','"2026-08-26T12:00:00Z"')) from registry_payloads where name='base';
select is((select (result#>>'{categories,updated}')::integer from registry_results where name='source'),3,'source version drift updates categories');
select is((select (result#>>'{mappings,unchanged}')::integer from registry_results where name='source'),3,'source version drift leaves mappings unchanged');
select ok((select bool_and(source_version='source/v2' and last_seen_at='2026-08-26T12:00:00Z') from public.marketplace_categories where site_id='TAP_ATOMIC'),'source drift updates factual version and timestamps');

insert into registry_results select 'classifier',public.apply_commerce_registry_sync(jsonb_set(jsonb_set(jsonb_set(payload,'{context,sourceVersion}','"source/v2"'),'{context,classificationVersion}','"class/v2"'),'{context,checkedAt}','"2026-08-27T12:00:00Z"')) from registry_payloads where name='base';
select is((select (result#>>'{categories,unchanged}')::integer from registry_results where name='classifier'),3,'classifier drift leaves categories unchanged');
select is((select (result#>>'{mappings,updated}')::integer from registry_results where name='classifier'),3,'classifier drift updates AUTO mappings');
select ok((select bool_and(classification_version='class/v2' and decided_at='2026-08-27T12:00:00Z') from public.vertical_category_mappings vm join public.marketplace_categories mc using(marketplace_category_id) where mc.site_id='TAP_ATOMIC'),'classifier drift advances AUTO decisions');

update public.vertical_category_mappings vm set scope_status='REVIEW',priority_tier=null,family_key='manual-family',commercial_family_key_default=null,
  classification_rule='manual-rule',classification_version='manual/v1',manual_override=true,decision_source='MANUAL',decision_reason='human',decided_at='2026-08-27T13:00:00Z'
from public.marketplace_categories mc where mc.marketplace_category_id=vm.marketplace_category_id and mc.site_id='TAP_ATOMIC' and mc.external_category_id='CHILD';
insert into registry_results select 'manual',public.apply_commerce_registry_sync(jsonb_set(jsonb_set(jsonb_set(payload,'{context,sourceVersion}','"source/v2"'),'{context,classificationVersion}','"class/v2"'),'{context,checkedAt}','"2026-08-28T12:00:00Z"')) from registry_payloads where name='base';
select is((select (result#>>'{mappings,manualOverrideSkipped}')::integer from registry_results where name='manual'),1,'active divergent manual decision is counted as skipped');
select ok((select scope_status='REVIEW' and priority_tier is null and family_key='manual-family' and classification_rule='manual-rule' and classification_version='manual/v1' and decision_source='MANUAL' and decision_reason='human' from public.vertical_category_mappings vm join public.marketplace_categories mc using(marketplace_category_id) where mc.site_id='TAP_ATOMIC' and mc.external_category_id='CHILD'),'manual commercial fields are preserved');
select is((select (result#>>'{effective,review}')::integer from registry_results where name='manual'),2,'effective counts reflect manual decision');

create temporary table child_identity as select marketplace_category_id from public.marketplace_categories where site_id='TAP_ATOMIC' and external_category_id='CHILD';
insert into registry_results select 'remove',public.apply_commerce_registry_sync(jsonb_set(jsonb_set(jsonb_set(payload,'{context,sourceVersion}','"source/v2"'),'{context,classificationVersion}','"class/v2"'),'{context,checkedAt}','"2026-08-29T12:00:00Z"')) from registry_payloads where name='reduced';
select is((select (result#>>'{mappings,inactivated}')::integer from registry_results where name='remove'),1,'missing controlled mapping is inactivated');
select ok((select active from public.marketplace_categories where site_id='TAP_ATOMIC' and external_category_id='CHILD'),'category absence does not inactivate factual category');
select ok((select not vm.active and vm.scope_status='REVIEW' and vm.classification_rule='manual-rule' from public.vertical_category_mappings vm join public.marketplace_categories mc using(marketplace_category_id) where mc.site_id='TAP_ATOMIC' and mc.external_category_id='CHILD'),'manual mapping inactivates without commercial changes');

insert into registry_results select 'return',public.apply_commerce_registry_sync(jsonb_set(jsonb_set(jsonb_set(payload,'{context,sourceVersion}','"source/v2"'),'{context,classificationVersion}','"class/v2"'),'{context,checkedAt}','"2026-08-30T12:00:00Z"')) from registry_payloads where name='base';
select is((select (result#>>'{mappings,reactivated}')::integer from registry_results where name='return'),1,'returning mapping is classified as reactivated');
select ok((select c.marketplace_category_id=i.marketplace_category_id from public.marketplace_categories c cross join child_identity i where c.site_id='TAP_ATOMIC' and c.external_category_id='CHILD'),'category UUID is stable across mapping absence and return');
select ok((select vm.active and vm.scope_status='REVIEW' and vm.classification_rule='manual-rule' from public.vertical_category_mappings vm join public.marketplace_categories mc using(marketplace_category_id) where mc.site_id='TAP_ATOMIC' and mc.external_category_id='CHILD'),'manual mapping reactivates without commercial changes');

insert into registry_payloads select 'moved', jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,
  '{context,sourceVersion}','"source/v2"'),'{context,classificationVersion}','"class/v2"'),'{context,checkedAt}','"2026-08-31T12:00:00Z"'),
  '{rows,1,isLeaf}','true'),'{rows,2,parentExternalCategoryId}','"ROOT"'),'{rows,2,pathExternalIds}','["ROOT","CHILD"]') from registry_payloads where name='base';
update registry_payloads set payload=jsonb_set(payload,'{rows,2,pathNames}','["Root","Child"]') where name='moved';
insert into registry_results select 'moved',public.apply_commerce_registry_sync(payload) from registry_payloads where name='moved';
select ok((select child.parent_marketplace_category_id=root.marketplace_category_id from public.marketplace_categories child join public.marketplace_categories root on root.site_id=child.site_id and root.external_category_id='ROOT' where child.site_id='TAP_ATOMIC' and child.external_category_id='CHILD'),'parent change resolves the new parent UUID');
select is((select (result#>>'{categories,updated}')::integer from registry_results where name='moved'),2,'parent/path/leaf change updates exactly affected categories');
create temporary table moved_timestamps as select marketplace_category_id,updated_at from public.marketplace_categories where site_id='TAP_ATOMIC';
select public.apply_commerce_registry_sync(payload) from registry_payloads where name='moved';
select ok(not exists(select 1 from public.marketplace_categories c join moved_timestamps t using(marketplace_category_id) where c.updated_at is distinct from t.updated_at),'parent replay causes no timestamp churn');

create function pg_temp.registry_fail_mapping() returns trigger language plpgsql as $$begin raise exception 'REGISTRY_TEST_DML_FAILURE'; end$$;
create trigger registry_test_fail before insert on public.vertical_category_mappings for each row execute function pg_temp.registry_fail_mapping();
select throws_ok($$select public.apply_commerce_registry_sync(jsonb_set((select payload from registry_payloads where name='base'),'{context,siteId}','"TAP_ROLLBACK"'))$$,'P0001','REGISTRY_TEST_DML_FAILURE','post-category DML failure rolls back the RPC statement');
drop trigger registry_test_fail on public.vertical_category_mappings;
select is((select count(*)::integer from public.marketplace_categories where site_id='TAP_ROLLBACK'),0,'failed mapping write leaves no partial categories');

select ok((select ((result#>>'{categories,inserted}')::integer+(result#>>'{categories,updated}')::integer+(result#>>'{categories,unchanged}')::integer+(result#>>'{categories,reactivated}')::integer)=(result#>>'{desired,categories}')::integer from registry_results where name='first'),'category accounting equals desired count');
select ok((select ((result#>>'{mappings,inserted}')::integer+(result#>>'{mappings,updated}')::integer+(result#>>'{mappings,unchanged}')::integer+(result#>>'{mappings,reactivated}')::integer+(result#>>'{mappings,manualOverrideSkipped}')::integer)=(result#>>'{desired,mappings}')::integer from registry_results where name='first'),'desired mapping accounting excludes inactivation');
select ok((select (result#>>'{desired,categories}')::integer=3 and (result#>>'{desired,mappings}')::integer=3 and (result#>>'{desired,automaticEligible}')::integer=2 from registry_results where name='first'),'desired counts echo validated payload');
select ok((select (result#>>'{effective,activeMappings}')::integer=(result#>>'{effective,allowed}')::integer+(result#>>'{effective,review}')::integer+(result#>>'{effective,excluded}')::integer+(result#>>'{effective,unknown}')::integer and (result#>>'{effective,allowed}')::integer=(result#>>'{effective,tierA}')::integer+(result#>>'{effective,tierB}')::integer+(result#>>'{effective,tierC}')::integer from registry_results where name='first'),'effective scope and tier totals reconcile');
select is((select count(*)::integer from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_name like '%registry%staging%'),0,'no persistent registry staging table exists');
select ok(pg_get_functiondef('public.apply_commerce_registry_sync(jsonb)'::regprocedure) !~* '\mdelete\M','RPC performs no DELETE DML');
select ok(not has_function_privilege('public','private.commerce_registry_input_rows(jsonb)','EXECUTE') and not has_function_privilege('anon','private.commerce_registry_input_rows(jsonb)','EXECUTE') and not has_function_privilege('authenticated','private.commerce_registry_input_rows(jsonb)','EXECUTE'),'private parser is not externally executable');

select * from finish();
rollback;
