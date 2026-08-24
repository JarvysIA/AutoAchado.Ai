do $$
begin
  if exists (
    select 1
    from public.vertical_category_mappings
    where (
      (
        (scope_status = 'ALLOWED' and priority_tier in ('A', 'B', 'C'))
        or (scope_status in ('REVIEW', 'EXCLUDED', 'UNKNOWN') and priority_tier is null)
      ) is not true
      or (manual_override = (decision_source = 'MANUAL')) is not true
    )
  ) then
    raise exception using
      errcode = '23514',
      message = '0B3C1_INCOMPATIBLE_VERTICAL_CATEGORY_MAPPING_DATA';
  end if;
end
$$;

alter table public.vertical_category_mappings
  drop constraint vertical_category_mappings_priority_tier_check,
  drop constraint vertical_category_mappings_excluded_consistency_check,
  drop constraint vertical_category_mappings_manual_source_check;

alter table public.vertical_category_mappings
  alter column priority_tier drop not null;

alter table public.vertical_category_mappings
  add constraint vertical_category_mappings_priority_tier_check check (
    priority_tier is null or priority_tier in ('A', 'B', 'C')
  ),
  add constraint vertical_category_mappings_scope_priority_consistency_check check (
    (
      (scope_status = 'ALLOWED' and priority_tier in ('A', 'B', 'C'))
      or (scope_status in ('REVIEW', 'EXCLUDED', 'UNKNOWN') and priority_tier is null)
    ) is true
  ),
  add constraint vertical_category_mappings_manual_source_consistency_check check (
    (manual_override = (decision_source = 'MANUAL')) is true
  );
