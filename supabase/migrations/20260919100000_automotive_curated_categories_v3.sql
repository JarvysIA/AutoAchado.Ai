-- User-reviewed broad-audience automotive accessories. Manual overrides survive frozen-registry resyncs.
-- family_key is left as classified; only scope and tier are curated here.
do $$ declare changed integer; begin
 update public.vertical_category_mappings m set scope_status='ALLOWED',priority_tier='B',
  classification_rule='curated-v3.reviewed',
  manual_override=true,decision_source='MANUAL',decision_reason='Reviewed broad-audience automotive accessories (interior, exterior, lighting, moto, phone); item evidence still required.',
  decided_at=now(),updated_at=now(),active=true
 from public.marketplace_categories c where c.marketplace_category_id=m.marketplace_category_id
  and m.vertical_key='AUTOMOTIVE' and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
  and c.active and c.is_leaf and c.external_category_id in ('MLB271108','MLB46692','MLB431858','MLB277952','MLB430923','MLB430913','MLB429491','MLB459455','MLB459471','MLB6170','MLB255106','MLB459195','MLB459150','MLB430581','MLB429029','MLB5759','MLB418074','MLB22204','MLB22879','MLB277590','MLB430631','MLB438313','MLB438314','MLB3930','MLB271558');
 get diagnostics changed=row_count;
 if changed<>25 then raise exception 'CURATED_V3_CATEGORY_SET_MISMATCH: %',changed; end if;
 if (select count(*) from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id)
  where m.vertical_key='AUTOMOTIVE' and m.active and c.active and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
   and m.scope_status='ALLOWED' and m.priority_tier in ('A','B'))<>180 then raise exception 'CURATED_V3_REGISTRY_COUNT_MISMATCH'; end if;
end $$;
