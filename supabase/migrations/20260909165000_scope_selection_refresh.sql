-- PostgREST enables safeupdate: generation cleanup must explicitly target Automotive.
create or replace function public.refresh_commercial_selection(assessments jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
begin
 if jsonb_typeof(assessments)<>'array' or jsonb_array_length(assessments)>10000 then raise exception 'SELECTION_INVALID_GENERATION'; end if;
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 delete from commercial_selection_assessments s
  where exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 insert into commercial_selection_assessments
  select s.* from jsonb_populate_recordset(null::commercial_selection_assessments,assessments) s
  join commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
  where exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 return promote_commercial_candidates();
end $$;
