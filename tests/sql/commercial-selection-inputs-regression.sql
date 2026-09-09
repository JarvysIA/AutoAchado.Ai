-- Execute inside BEGIN/ROLLBACK together with the unapplied function migration.
do $$
declare before_count bigint; payload jsonb; actual_count bigint;
begin
 select count(*) into before_count from commercial_observations;
 payload:=commercial_selection_inputs(now(),now()-interval '30 days');
 select count(*) into actual_count from highlight_snapshots h join scan_runs r using(run_id)
  where r.vertical_key='AUTOMOTIVE' and h.observed_at between now()-interval '14 days' and now();
 if (payload->>'snapshot_occurrences')::bigint<>actual_count then raise exception 'Discovery count mismatch'; end if;
 if jsonb_typeof(payload->'snapshots')<>'array' or jsonb_typeof(payload->'observations')<>'array' then raise exception 'Incomplete inputs'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'snapshots') r group by r->>'type',r->>'product_id',r->>'marketplace_category_id',((r->>'observed_at')::timestamptz at time zone 'UTC')::date having count(*)>1) then raise exception 'Duplicate daily signal'; end if;
 if before_count<>(select count(*) from commercial_observations) then raise exception 'Read changed data'; end if;
 if has_function_privilege('anon','commercial_selection_inputs(timestamptz,timestamptz)','EXECUTE') or has_function_privilege('authenticated','commercial_selection_inputs(timestamptz,timestamptz)','EXECUTE') then raise exception 'Public evidence access'; end if;
 begin
  perform commercial_selection_inputs(now()+interval '1 day',now());
  raise exception 'Future window accepted';
 exception when raise_exception then if sqlerrm<>'SELECTION_INVALID_WINDOW' then raise; end if;
 end;
end $$;
