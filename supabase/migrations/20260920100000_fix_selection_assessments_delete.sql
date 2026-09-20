-- safeupdate (loaded for PostgREST sessions) rejects DELETE without WHERE (SQLSTATE 21000).
-- Same scope as refresh_commercial_selection: only automotive members' assessments are replaced.
create or replace function public.replace_automotive_selection_assessments(p_assessments jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare stored integer;
begin
 if jsonb_typeof(p_assessments)<>'array' or jsonb_array_length(p_assessments)>10000 then
  raise exception 'SELECTION_INVALID_GENERATION'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtext('commercial-watchlist-seed'));
 delete from public.commercial_selection_assessments s
  where exists(select 1 from public.commercial_vertical_memberships m
   where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 insert into public.commercial_selection_assessments
  select s.* from jsonb_populate_recordset(null::public.commercial_selection_assessments,p_assessments) s
  join public.commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
  where exists(select 1 from public.commercial_vertical_memberships m
   where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 get diagnostics stored=row_count;
 return stored;
end $$;
revoke all on function public.replace_automotive_selection_assessments(jsonb) from public,anon,authenticated;
grant execute on function public.replace_automotive_selection_assessments(jsonb) to service_role;
