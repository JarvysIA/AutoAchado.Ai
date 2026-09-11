-- User-reviewed automotive tool categories. Manual overrides survive frozen-registry resyncs.
do $$ declare changed integer; begin
 update public.vertical_category_mappings m set scope_status='ALLOWED',priority_tier='B',
  family_key='automotive_tools',classification_rule='tools-v2.reviewed',
  manual_override=true,decision_source='MANUAL',decision_reason='Reviewed automotive tools: useful maintenance and emergency products; item evidence still required.',
  decided_at=now(),updated_at=now(),active=true
 from public.marketplace_categories c where c.marketplace_category_id=m.marketplace_category_id
  and m.vertical_key='AUTOMOTIVE' and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
  and c.active and c.is_leaf and c.external_category_id in ('MLB115943','MLB115944','MLB115945','MLB437802','MLB437783','MLB437784','MLB459157','MLB459347','MLB459348','MLB271712','MLB455313');
 get diagnostics changed=row_count;
 if changed<>11 then raise exception 'TOOLS_CATEGORY_SET_MISMATCH: %',changed; end if;
 if (select count(*) from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id)
  where m.vertical_key='AUTOMOTIVE' and m.active and c.active and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
   and m.scope_status='ALLOWED' and m.priority_tier in ('A','B'))<>155 then raise exception 'TOOLS_REGISTRY_COUNT_MISMATCH'; end if;
end $$;
