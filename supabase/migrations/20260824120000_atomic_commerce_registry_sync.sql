create function private.commerce_registry_input_rows(p_rows jsonb)
returns table (
  external_category_id text,
  parent_external_category_id text,
  name text,
  path_external_ids text[],
  path_names text[],
  is_leaf boolean,
  scope_status text,
  priority_tier text,
  family_key text,
  commercial_family_key_default text,
  classification_rule text,
  decision_reason text
)
language sql immutable strict set search_path = ''
as $function$
  select
    value ->> 'externalCategoryId',
    case when value -> 'parentExternalCategoryId' = 'null'::jsonb then null else value ->> 'parentExternalCategoryId' end,
    value ->> 'name',
    array(select x from pg_catalog.jsonb_array_elements_text(value -> 'pathExternalIds') with ordinality p(x,n) order by n),
    array(select x from pg_catalog.jsonb_array_elements_text(value -> 'pathNames') with ordinality p(x,n) order by n),
    (value ->> 'isLeaf')::boolean,
    value ->> 'scopeStatus',
    case when value -> 'priorityTier' = 'null'::jsonb then null else value ->> 'priorityTier' end,
    case when value -> 'familyKey' = 'null'::jsonb then null else value ->> 'familyKey' end,
    case when value -> 'commercialFamilyKeyDefault' = 'null'::jsonb then null else value ->> 'commercialFamilyKeyDefault' end,
    value ->> 'classificationRule',
    case when value -> 'decisionReason' = 'null'::jsonb then null else value ->> 'decisionReason' end
  from pg_catalog.jsonb_array_elements(p_rows) with ordinality input(value, position)
  order by position
$function$;

alter function private.commerce_registry_input_rows(jsonb) owner to postgres;
revoke all on function private.commerce_registry_input_rows(jsonb) from public, anon, authenticated, service_role;

create function public.apply_commerce_registry_sync(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
#variable_conflict use_variable
declare
  c jsonb;
  r jsonb;
  marketplace_key text;
  site_id text;
  vertical_key text;
  root_id text;
  source_version text;
  classification_version text;
  config_version text;
  checked_at timestamptz;
  expected_categories integer;
  expected_mappings integer;
  expected_automatic integer;
  category_inserted integer := 0;
  category_updated integer := 0;
  category_unchanged integer := 0;
  category_reactivated integer := 0;
  mapping_inserted integer := 0;
  mapping_updated integer := 0;
  mapping_unchanged integer := 0;
  mapping_reactivated integer := 0;
  mapping_inactivated integer := 0;
  manual_skipped integer := 0;
  effective_active integer := 0;
  effective_allowed integer := 0;
  effective_review integer := 0;
  effective_excluded integer := 0;
  effective_unknown integer := 0;
  effective_a integer := 0;
  effective_b integer := 0;
  effective_c integer := 0;
begin
  -- Pure payload validation precedes locking and all DML.
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ? 'context') or not (p_payload ? 'rows')
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> 2 then
    raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD';
  end if;
  c := p_payload -> 'context';
  r := p_payload -> 'rows';
  if pg_catalog.jsonb_typeof(c) <> 'object' or pg_catalog.jsonb_typeof(r) <> 'array'
    or c ->> 'contractVersion' is distinct from 'commerce-registry-apply/v1' then
    raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(array['contractVersion','marketplaceKey','siteId','verticalKey',
      'rootExternalCategoryId','sourceVersion','classificationVersion','configVersion','checkedAt']) key
    where pg_catalog.jsonb_typeof(c -> key) <> 'string' or pg_catalog.btrim(c ->> key) = ''
      or (c ->> key) is distinct from pg_catalog.btrim(c ->> key)
  ) then raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD'; end if;
  if exists (
    select 1 from pg_catalog.unnest(array['expectedCategoryCount','expectedMappingCount','expectedAutomaticEligibleCount']) key
    where pg_catalog.jsonb_typeof(c -> key) <> 'number'
      or (c ->> key) !~ '^(0|[1-9][0-9]*)$' or (c ->> key)::numeric > 2147483647
  ) then raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD'; end if;

  marketplace_key := c ->> 'marketplaceKey';
  site_id := c ->> 'siteId';
  vertical_key := c ->> 'verticalKey';
  root_id := c ->> 'rootExternalCategoryId';
  source_version := c ->> 'sourceVersion';
  classification_version := c ->> 'classificationVersion';
  config_version := c ->> 'configVersion';
  expected_categories := (c ->> 'expectedCategoryCount')::integer;
  expected_mappings := (c ->> 'expectedMappingCount')::integer;
  expected_automatic := (c ->> 'expectedAutomaticEligibleCount')::integer;
  begin checked_at := (c ->> 'checkedAt')::timestamptz;
  exception when others then raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD'; end;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(r) input(value)
    where pg_catalog.jsonb_typeof(value) <> 'object'
      or not (value ?& array['externalCategoryId','parentExternalCategoryId','name','pathExternalIds','pathNames',
        'isLeaf','scopeStatus','priorityTier','familyKey','commercialFamilyKeyDefault','classificationRule','decisionReason'])
      or pg_catalog.jsonb_typeof(value -> 'externalCategoryId') <> 'string' or pg_catalog.btrim(value ->> 'externalCategoryId') = ''
      or (value ->> 'externalCategoryId') is distinct from pg_catalog.btrim(value ->> 'externalCategoryId')
      or not (value -> 'parentExternalCategoryId' = 'null'::jsonb or
        (pg_catalog.jsonb_typeof(value -> 'parentExternalCategoryId') = 'string' and pg_catalog.btrim(value ->> 'parentExternalCategoryId') <> ''
          and (value ->> 'parentExternalCategoryId') = pg_catalog.btrim(value ->> 'parentExternalCategoryId')))
      or pg_catalog.jsonb_typeof(value -> 'name') <> 'string' or pg_catalog.btrim(value ->> 'name') = ''
      or (value ->> 'name') is distinct from pg_catalog.btrim(value ->> 'name')
      or pg_catalog.jsonb_typeof(value -> 'pathExternalIds') <> 'array'
      or pg_catalog.jsonb_typeof(value -> 'pathNames') <> 'array'
      or pg_catalog.jsonb_typeof(value -> 'isLeaf') <> 'boolean'
      or pg_catalog.jsonb_typeof(value -> 'scopeStatus') <> 'string'
      or not (value -> 'priorityTier' = 'null'::jsonb or pg_catalog.jsonb_typeof(value -> 'priorityTier') = 'string')
      or not (value -> 'familyKey' = 'null'::jsonb or
        (pg_catalog.jsonb_typeof(value -> 'familyKey') = 'string' and pg_catalog.btrim(value ->> 'familyKey') <> ''
          and (value ->> 'familyKey') = pg_catalog.btrim(value ->> 'familyKey')))
      or not (value -> 'commercialFamilyKeyDefault' = 'null'::jsonb or
        (pg_catalog.jsonb_typeof(value -> 'commercialFamilyKeyDefault') = 'string' and pg_catalog.btrim(value ->> 'commercialFamilyKeyDefault') <> ''
          and (value ->> 'commercialFamilyKeyDefault') = pg_catalog.btrim(value ->> 'commercialFamilyKeyDefault')))
      or pg_catalog.jsonb_typeof(value -> 'classificationRule') <> 'string' or pg_catalog.btrim(value ->> 'classificationRule') = ''
      or (value ->> 'classificationRule') is distinct from pg_catalog.btrim(value ->> 'classificationRule')
      or not (value -> 'decisionReason' = 'null'::jsonb or
        (pg_catalog.jsonb_typeof(value -> 'decisionReason') = 'string' and pg_catalog.btrim(value ->> 'decisionReason') <> ''
          and (value ->> 'decisionReason') = pg_catalog.btrim(value ->> 'decisionReason')))
  ) then raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(r) input(value),
      lateral pg_catalog.jsonb_array_elements(value -> 'pathExternalIds') path(value)
    where pg_catalog.jsonb_typeof(path.value) <> 'string' or pg_catalog.btrim(path.value #>> '{}') = ''
      or (path.value #>> '{}') is distinct from pg_catalog.btrim(path.value #>> '{}')
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(r) input(value),
      lateral pg_catalog.jsonb_array_elements(value -> 'pathNames') path(value)
    where pg_catalog.jsonb_typeof(path.value) <> 'string' or pg_catalog.btrim(path.value #>> '{}') = ''
      or (path.value #>> '{}') is distinct from pg_catalog.btrim(path.value #>> '{}')
  ) then raise exception using errcode='22023', message='REGISTRY_PATH_INVALID'; end if;

  if pg_catalog.jsonb_array_length(r) <> expected_categories
    or pg_catalog.jsonb_array_length(r) <> expected_mappings or expected_categories <> expected_mappings then
    raise exception using errcode='22023', message='REGISTRY_COUNT_MISMATCH';
  end if;
  if exists (select 1 from private.commerce_registry_input_rows(r) group by external_category_id having pg_catalog.count(*) > 1) then
    raise exception using errcode='22023', message='REGISTRY_DUPLICATE_CATEGORY';
  end if;
  if exists (
    select 1 from private.commerce_registry_input_rows(r) x
    where not ((scope_status='ALLOWED' and priority_tier in ('A','B','C'))
      or (scope_status in ('REVIEW','EXCLUDED','UNKNOWN') and priority_tier is null))
  ) then raise exception using errcode='23514', message='REGISTRY_CLASSIFICATION_INVALID'; end if;
  if (select pg_catalog.count(*)::integer from private.commerce_registry_input_rows(r)
      where scope_status='ALLOWED' and priority_tier in ('A','B')) <> expected_automatic then
    raise exception using errcode='22023', message='REGISTRY_COUNT_MISMATCH';
  end if;

  if (select pg_catalog.count(*) from private.commerce_registry_input_rows(r) x
      where external_category_id=root_id and parent_external_category_id is null
        and pg_catalog.cardinality(path_external_ids)=1 and path_external_ids[1]=external_category_id
        and pg_catalog.cardinality(path_names)=1 and path_names[1]=name) <> 1 then
    raise exception using errcode='22023', message='REGISTRY_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from private.commerce_registry_input_rows(r) x
    where (external_category_id<>root_id and (parent_external_category_id is null
      or not exists (select 1 from private.commerce_registry_input_rows(r) p where p.external_category_id=x.parent_external_category_id)
      or pg_catalog.cardinality(path_external_ids)<2
      or path_external_ids[pg_catalog.cardinality(path_external_ids)-1] is distinct from parent_external_category_id))
      or (external_category_id=root_id and parent_external_category_id is not null)
  ) then raise exception using errcode='23514', message='REGISTRY_PARENT_MISSING'; end if;
  if exists (
    select 1 from private.commerce_registry_input_rows(r) x
    where pg_catalog.cardinality(path_external_ids)=0 or pg_catalog.cardinality(path_names)=0
      or pg_catalog.cardinality(path_external_ids)<>pg_catalog.cardinality(path_names)
      or path_external_ids[1] is distinct from root_id
      or path_external_ids[pg_catalog.cardinality(path_external_ids)] is distinct from external_category_id
      or path_names[pg_catalog.cardinality(path_names)] is distinct from name
      or pg_catalog.cardinality(path_external_ids)<>(select pg_catalog.count(distinct id) from pg_catalog.unnest(path_external_ids) id)
      or exists (
        select 1 from pg_catalog.generate_subscripts(path_external_ids,1) path(position)
        left join private.commerce_registry_input_rows(r) node
          on node.external_category_id=path_external_ids[path.position]
        where node.external_category_id is null or node.name is distinct from path_names[path.position])
  ) then raise exception using errcode='23514', message='REGISTRY_PATH_INVALID'; end if;
  if exists (
    select 1 from private.commerce_registry_input_rows(r) x
    where is_leaf is distinct from not exists (
      select 1 from private.commerce_registry_input_rows(r) child where child.parent_external_category_id=x.external_category_id)
  ) then raise exception using errcode='23514', message='REGISTRY_INVALID_PAYLOAD'; end if;

  -- One non-blocking transaction lock for all verticals sharing marketplace/site facts.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'autoachado:commerce-registry:'||marketplace_key||':'||site_id,0)) then
    raise exception using errcode='55P03', message='REGISTRY_SYNC_LOCKED';
  end if;
  if not exists (select 1 from public.marketplaces m where m.marketplace_key=marketplace_key and m.active) then
    raise exception using errcode='22023', message='REGISTRY_MARKETPLACE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.commerce_verticals v where v.vertical_key=vertical_key and v.active) then
    raise exception using errcode='22023', message='REGISTRY_VERTICAL_NOT_FOUND';
  end if;

  perform mc.marketplace_category_id from public.marketplace_categories mc
  where mc.marketplace_key=marketplace_key and mc.site_id=site_id
    and (root_id=any(mc.path_external_ids) or exists (
      select 1 from private.commerce_registry_input_rows(r) d where d.external_category_id=mc.external_category_id))
  for update;
  perform vm.marketplace_category_id from public.vertical_category_mappings vm
  join public.marketplace_categories mc on mc.marketplace_category_id=vm.marketplace_category_id
  where vm.vertical_key=vertical_key and mc.marketplace_key=marketplace_key and mc.site_id=site_id
    and (root_id=any(mc.path_external_ids) or exists (
      select 1 from private.commerce_registry_input_rows(r) d where d.external_category_id=mc.external_category_id))
  for update of vm;

  -- Classify every desired category from its locked pre-state.
  select
    pg_catalog.count(*) filter(where cur.marketplace_category_id is null)::integer,
    pg_catalog.count(*) filter(where cur.marketplace_category_id is not null and not cur.active)::integer,
    pg_catalog.count(*) filter(where cur.marketplace_category_id is not null and cur.active and (
      cur.name is distinct from d.name or cur.path_external_ids is distinct from d.path_external_ids
      or cur.path_names is distinct from d.path_names or cur.is_leaf is distinct from d.is_leaf
      or cur.source_version is distinct from source_version or cur.config_version is distinct from config_version
      or par.external_category_id is distinct from d.parent_external_category_id))::integer,
    pg_catalog.count(*) filter(where cur.marketplace_category_id is not null and cur.active and not (
      cur.name is distinct from d.name or cur.path_external_ids is distinct from d.path_external_ids
      or cur.path_names is distinct from d.path_names or cur.is_leaf is distinct from d.is_leaf
      or cur.source_version is distinct from source_version or cur.config_version is distinct from config_version
      or par.external_category_id is distinct from d.parent_external_category_id))::integer
  into category_inserted,category_reactivated,category_updated,category_unchanged
  from private.commerce_registry_input_rows(r) d
  left join public.marketplace_categories cur on cur.marketplace_key=marketplace_key and cur.site_id=site_id
    and cur.external_category_id=d.external_category_id
  left join public.marketplace_categories par on par.marketplace_category_id=cur.parent_marketplace_category_id;

  select
    pg_catalog.count(*) filter(where vm.marketplace_category_id is null)::integer,
    pg_catalog.count(*) filter(where vm.marketplace_category_id is not null and not vm.active)::integer,
    pg_catalog.count(*) filter(where vm.marketplace_category_id is not null and vm.active and vm.manual_override and (
      vm.scope_status is distinct from d.scope_status or vm.priority_tier is distinct from d.priority_tier
      or vm.family_key is distinct from d.family_key or vm.commercial_family_key_default is distinct from d.commercial_family_key_default
      or vm.classification_rule is distinct from d.classification_rule or vm.classification_version is distinct from classification_version
      or vm.decision_reason is distinct from d.decision_reason))::integer,
    pg_catalog.count(*) filter(where vm.marketplace_category_id is not null and vm.active and not vm.manual_override and (
      vm.scope_status is distinct from d.scope_status or vm.priority_tier is distinct from d.priority_tier
      or vm.family_key is distinct from d.family_key or vm.commercial_family_key_default is distinct from d.commercial_family_key_default
      or vm.classification_rule is distinct from d.classification_rule or vm.classification_version is distinct from classification_version
      or vm.decision_reason is distinct from d.decision_reason))::integer,
    pg_catalog.count(*) filter(where vm.marketplace_category_id is not null and vm.active and not (
      vm.scope_status is distinct from d.scope_status or vm.priority_tier is distinct from d.priority_tier
      or vm.family_key is distinct from d.family_key or vm.commercial_family_key_default is distinct from d.commercial_family_key_default
      or vm.classification_rule is distinct from d.classification_rule or vm.classification_version is distinct from classification_version
      or vm.decision_reason is distinct from d.decision_reason))::integer
  into mapping_inserted,mapping_reactivated,manual_skipped,mapping_updated,mapping_unchanged
  from private.commerce_registry_input_rows(r) d
  left join public.marketplace_categories mc on mc.marketplace_key=marketplace_key and mc.site_id=site_id
    and mc.external_category_id=d.external_category_id
  left join public.vertical_category_mappings vm on vm.vertical_key=vertical_key
    and vm.marketplace_category_id=mc.marketplace_category_id;

  select pg_catalog.count(*)::integer into mapping_inactivated
  from public.vertical_category_mappings vm join public.marketplace_categories mc
    on mc.marketplace_category_id=vm.marketplace_category_id
  where vm.vertical_key=vertical_key and vm.active and mc.marketplace_key=marketplace_key and mc.site_id=site_id
    and root_id=any(mc.path_external_ids) and not exists (
      select 1 from private.commerce_registry_input_rows(r) d where d.external_category_id=mc.external_category_id);

  -- Category facts are inserted without parents, then conditionally updated and linked.
  insert into public.marketplace_categories(
    marketplace_key,site_id,external_category_id,parent_marketplace_category_id,name,path_external_ids,path_names,
    is_leaf,active,source_version,first_seen_at,last_seen_at,source_checked_at,config_version)
  select marketplace_key,site_id,d.external_category_id,null,d.name,d.path_external_ids,d.path_names,d.is_leaf,
    true,source_version,checked_at,checked_at,checked_at,config_version
  from private.commerce_registry_input_rows(r) d
  on conflict on constraint marketplace_categories_external_identity_key do nothing;

  update public.marketplace_categories mc set
    name=d.name,path_external_ids=d.path_external_ids,path_names=d.path_names,is_leaf=d.is_leaf,active=true,
    source_version=source_version,last_seen_at=checked_at,source_checked_at=checked_at,
    config_version=config_version,updated_at=checked_at
  from private.commerce_registry_input_rows(r) d
  where mc.marketplace_key=marketplace_key and mc.site_id=site_id and mc.external_category_id=d.external_category_id
    and (mc.name is distinct from d.name or mc.path_external_ids is distinct from d.path_external_ids
      or mc.path_names is distinct from d.path_names or mc.is_leaf is distinct from d.is_leaf
      or mc.active is distinct from true or mc.source_version is distinct from source_version
      or mc.config_version is distinct from config_version);

  if exists (
    select 1 from private.commerce_registry_input_rows(r) d
    left join public.marketplace_categories p on p.marketplace_key=marketplace_key and p.site_id=site_id
      and p.external_category_id=d.parent_external_category_id
    where d.parent_external_category_id is not null and p.marketplace_category_id is null
  ) then raise exception using errcode='23503', message='REGISTRY_PARENT_MISSING'; end if;

  update public.marketplace_categories mc set parent_marketplace_category_id=p.marketplace_category_id,
    last_seen_at=checked_at,source_checked_at=checked_at,updated_at=checked_at
  from private.commerce_registry_input_rows(r) d
  left join public.marketplace_categories p on p.marketplace_key=marketplace_key and p.site_id=site_id
    and p.external_category_id=d.parent_external_category_id
  where mc.marketplace_key=marketplace_key and mc.site_id=site_id and mc.external_category_id=d.external_category_id
    and mc.parent_marketplace_category_id is distinct from p.marketplace_category_id;

  -- Mapping phases preserve every manual commercial field while still applying active state.
  insert into public.vertical_category_mappings(
    vertical_key,marketplace_category_id,scope_status,priority_tier,family_key,commercial_family_key_default,
    classification_rule,classification_version,manual_override,decision_source,decision_reason,decided_at,active)
  select vertical_key,mc.marketplace_category_id,d.scope_status,d.priority_tier,d.family_key,d.commercial_family_key_default,
    d.classification_rule,classification_version,false,'AUTO',d.decision_reason,checked_at,true
  from private.commerce_registry_input_rows(r) d join public.marketplace_categories mc
    on mc.marketplace_key=marketplace_key and mc.site_id=site_id and mc.external_category_id=d.external_category_id
  where not exists (select 1 from public.vertical_category_mappings x
    where x.vertical_key=vertical_key and x.marketplace_category_id=mc.marketplace_category_id)
  on conflict on constraint vertical_category_mappings_pkey do nothing;

  update public.vertical_category_mappings vm set active=true,updated_at=checked_at
  from public.marketplace_categories mc join private.commerce_registry_input_rows(r) d
    on d.external_category_id=mc.external_category_id
  where vm.vertical_key=vertical_key and vm.marketplace_category_id=mc.marketplace_category_id
    and mc.marketplace_key=marketplace_key and mc.site_id=site_id and not vm.active;

  update public.vertical_category_mappings vm set
    scope_status=d.scope_status,priority_tier=d.priority_tier,family_key=d.family_key,
    commercial_family_key_default=d.commercial_family_key_default,classification_rule=d.classification_rule,
    classification_version=classification_version,decision_source='AUTO',decision_reason=d.decision_reason,
    decided_at=checked_at,updated_at=checked_at
  from public.marketplace_categories mc join private.commerce_registry_input_rows(r) d
    on d.external_category_id=mc.external_category_id
  where vm.vertical_key=vertical_key and vm.marketplace_category_id=mc.marketplace_category_id
    and mc.marketplace_key=marketplace_key and mc.site_id=site_id and not vm.manual_override
    and (vm.scope_status is distinct from d.scope_status or vm.priority_tier is distinct from d.priority_tier
      or vm.family_key is distinct from d.family_key or vm.commercial_family_key_default is distinct from d.commercial_family_key_default
      or vm.classification_rule is distinct from d.classification_rule or vm.classification_version is distinct from classification_version
      or vm.decision_reason is distinct from d.decision_reason);

  update public.vertical_category_mappings vm set active=false,updated_at=checked_at
  from public.marketplace_categories mc
  where vm.vertical_key=vertical_key and vm.marketplace_category_id=mc.marketplace_category_id and vm.active
    and mc.marketplace_key=marketplace_key and mc.site_id=site_id and root_id=any(mc.path_external_ids)
    and not exists (select 1 from private.commerce_registry_input_rows(r) d where d.external_category_id=mc.external_category_id);

  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter(where vm.scope_status='ALLOWED')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='REVIEW')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='EXCLUDED')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='UNKNOWN')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='ALLOWED' and vm.priority_tier='A')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='ALLOWED' and vm.priority_tier='B')::integer,
    pg_catalog.count(*) filter(where vm.scope_status='ALLOWED' and vm.priority_tier='C')::integer
  into effective_active,effective_allowed,effective_review,effective_excluded,effective_unknown,
    effective_a,effective_b,effective_c
  from public.vertical_category_mappings vm join public.marketplace_categories mc
    on mc.marketplace_category_id=vm.marketplace_category_id
  where vm.vertical_key=vertical_key and vm.active and mc.marketplace_key=marketplace_key and mc.site_id=site_id
    and root_id=any(mc.path_external_ids);

  return pg_catalog.jsonb_build_object(
    'contractVersion','commerce-registry-apply-result/v1','marketplaceKey',marketplace_key,'siteId',site_id,
    'verticalKey',vertical_key,'rootExternalCategoryId',root_id,'sourceVersion',source_version,
    'classificationVersion',classification_version,
    'categories',pg_catalog.jsonb_build_object('inserted',category_inserted,'updated',category_updated,
      'unchanged',category_unchanged,'reactivated',category_reactivated),
    'mappings',pg_catalog.jsonb_build_object('inserted',mapping_inserted,'updated',mapping_updated,
      'unchanged',mapping_unchanged,'reactivated',mapping_reactivated,'inactivated',mapping_inactivated,
      'manualOverrideSkipped',manual_skipped),
    'desired',pg_catalog.jsonb_build_object('categories',expected_categories,'mappings',expected_mappings,
      'automaticEligible',expected_automatic),
    'effective',pg_catalog.jsonb_build_object('activeMappings',effective_active,'allowed',effective_allowed,
      'review',effective_review,'excluded',effective_excluded,'unknown',effective_unknown,'tierA',effective_a,
      'tierB',effective_b,'tierC',effective_c,'automaticEligible',effective_a+effective_b));
end
$function$;

alter function public.apply_commerce_registry_sync(jsonb) owner to postgres;
revoke execute on function public.apply_commerce_registry_sync(jsonb) from public, anon, authenticated;
grant execute on function public.apply_commerce_registry_sync(jsonb) to service_role;

revoke insert, update on table public.marketplace_categories, public.vertical_category_mappings from service_role;

comment on function public.apply_commerce_registry_sync(jsonb) is
  'Atomically applies a versioned commerce registry payload with marketplace/site serialization and manual-decision protection.';
