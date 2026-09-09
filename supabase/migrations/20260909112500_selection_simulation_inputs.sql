-- Read-only, scoped and internally consistent inputs for the experimental simulator.
create function public.commercial_selection_inputs(reference_time timestamptz,history_start timestamptz) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare payload jsonb; snapshot_count bigint;
begin
 if reference_time is null or history_start is null or reference_time>now()+interval '1 minute'
  or history_start>reference_time or history_start<reference_time-interval '150 days' then
  raise exception 'SELECTION_INVALID_WINDOW';
 end if;
 select count(*) into snapshot_count from highlight_snapshots h join scan_runs r using(run_id)
  where r.vertical_key='AUTOMOTIVE' and h.observed_at between reference_time-interval '14 days' and reference_time;
 if snapshot_count>250000 or (select count(*) from commercial_watchlist)>10000
  or (select count(*) from commercial_observations where observed_at between history_start and reference_time)>200000 then
  raise exception 'SELECTION_INPUT_LIMIT';
 end if;
 with scoped_watches as (
  select w.source_key,w.identity_key,w.preview,w.monitor from commercial_watchlist w
  where exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE' and m.identity_key=w.identity_key)
 ), daily as (
  select h.type,h.product_id,h.marketplace_category_id,min(h.position) as position,max(h.observed_at) as observed_at
   from highlight_snapshots h join scan_runs r using(run_id)
   where r.vertical_key='AUTOMOTIVE' and h.observed_at between reference_time-interval '14 days' and reference_time
    and h.position between 1 and 20
   group by h.type,h.product_id,h.marketplace_category_id,(h.observed_at at time zone 'UTC')::date
 ) select jsonb_build_object(
  'snapshot_occurrences',snapshot_count,
  'snapshots',coalesce((select jsonb_agg(d) from daily d),'[]'::jsonb),
  'watches',coalesce((select jsonb_agg(w) from scoped_watches w),'[]'::jsonb),
  'memberships',coalesce((select jsonb_agg(m) from (select source_key,identity_key,monitor from commercial_vertical_memberships where vertical_key='AUTOMOTIVE')m),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(f) from (select identity_key,action from commercial_vertical_feedback where vertical_key='AUTOMOTIVE')f),'[]'::jsonb),
  'sent',coalesce((select jsonb_agg(s) from (select identity_key,sent_at from commercial_sent_products where vertical_key='AUTOMOTIVE' and sent_at is not null)s),'[]'::jsonb),
  'changes',coalesce((select jsonb_agg(c order by c.changed_at,c.id) from (select id,added_source,changed_at from commercial_cohort_changes where vertical_key='AUTOMOTIVE')c),'[]'::jsonb),
  'observations',coalesce((select jsonb_agg(o) from (select identity_key,observed_at,price,currency,seller_id,comparable,trusted,position
   from commercial_observations o where observed_at between history_start and reference_time
    and exists(select 1 from scoped_watches w where w.identity_key=o.identity_key))o),'[]'::jsonb)
 ) into payload;
 return payload;
end $$;
revoke all on function public.commercial_selection_inputs(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.commercial_selection_inputs(timestamptz,timestamptz) to service_role;
